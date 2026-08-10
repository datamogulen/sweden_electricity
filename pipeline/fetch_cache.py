#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import json
import time
import argparse
import calendar
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
import requests
import xml.etree.ElementTree as ET

ENTSOE_ENDPOINT = "https://web-api.tp.entsoe.eu/api"

ZONES = {
    "SE1": "10Y1001A1001A44P",
    "SE2": "10Y1001A1001A45N",
    "SE3": "10Y1001A1001A46L",
    "SE4": "10Y1001A1001A47J",
    "DK1": "10YDK-1--------W",
    "DK2": "10YDK-2--------M",
    "NO1": "10YNO-1--------2",
    "FI":  "10YFI-1--------U",
    "PL":  "10YPL-AREA-----S",
    "LT":  "10YLT-1001A0008Q",
    "DELU":"10Y1001A1001A82H",
}

EXTERNAL_BORDERS = [
    {"name":"SE4–DK2", "se":"SE4", "foreign":"DK2"},
    {"name":"SE3–DK1", "se":"SE3", "foreign":"DK1"},
    {"name":"SE3–NO1", "se":"SE3", "foreign":"NO1"},
    {"name":"SE1–FI",  "se":"SE1", "foreign":"FI"},
    {"name":"SE4–PL",  "se":"SE4", "foreign":"PL"},
    {"name":"SE4–LT",  "se":"SE4", "foreign":"LT"},
    {"name":"SE4–DE-LU","se":"SE4","foreign":"DELU"},
]

INTERNAL_BORDERS = [
    {"name":"SE1–SE2", "a":"SE1", "b":"SE2"},
    {"name":"SE2–SE3", "a":"SE2", "b":"SE3"},
    {"name":"SE3–SE4", "a":"SE3", "b":"SE4"},
]

WANTED_PSR = sorted({
    "B14",
    "B01","B17","B02","B04","B05","B06","B08","B20","B03","B07",
    "B12","B11","B10",
    "B16",
    "B19","B18",
})

def read_token(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        tok = f.read().strip()
    if not tok:
        raise RuntimeError("entsoe_token.txt is empty")
    return tok

def ensure_cache_dir(base_dir: str) -> str:
    cache_dir = os.path.join(base_dir, "cache")
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir

def write_json(path: str, obj: dict):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, path)

def month_start_utc(year: int, month: int) -> datetime:
    return datetime(year, month, 1, 0, 0, tzinfo=timezone.utc)

def month_end_excl_utc(year: int, month: int) -> datetime:
    last_day = calendar.monthrange(year, month)[1]
    return datetime(year, month, last_day, 23, 0, tzinfo=timezone.utc) + timedelta(hours=1)

def ym_of(dt: datetime) -> str:
    return f"{dt.year:04d}-{dt.month:02d}"

def iter_months_inclusive(start_ym: str, end_ym: str):
    sy, sm = map(int, start_ym.split("-"))
    ey, em = map(int, end_ym.split("-"))
    y, m = sy, sm
    while (y < ey) or (y == ey and m <= em):
        yield y, m
        m += 1
        if m == 13:
            m = 1
            y += 1

def to_entsoe_period(dt: datetime) -> str:
    return dt.strftime("%Y%m%d%H00")

def request_xml(token: str, params: dict, retries: int = 4, sleep_s: float = 1.0) -> str:
    params = dict(params)
    params["securityToken"] = token
    url = ENTSOE_ENDPOINT + "?" + urlencode(params)
    last_err = None
    for i in range(retries):
        try:
            r = requests.get(url, timeout=60)
            txt = r.text
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}: {txt[:300]}")
            s = txt.lstrip()
            if not s.startswith("<"):
                raise RuntimeError(f"Non-XML response start: {s[:200]}")
            return txt
        except Exception as e:
            last_err = e
            time.sleep(sleep_s * (i + 1))
    raise RuntimeError(f"Failed after retries: {last_err}")

def strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag

def parse_timeseries_points(xml_text: str):
    root = ET.fromstring(xml_text)
    out = []
    for ts in root.iter():
        if strip_ns(ts.tag) != "TimeSeries":
            continue
        for period in ts:
            if strip_ns(period.tag) != "Period":
                continue
            start = None
            res = None
            for child in period:
                ln = strip_ns(child.tag)
                if ln == "timeInterval":
                    for cc in child:
                        if strip_ns(cc.tag) == "start":
                            start = cc.text.strip()
                elif ln == "resolution":
                    res = child.text.strip() if child.text else None
            if not start:
                continue
            start_dt = datetime.fromisoformat(start.replace("Z", "+00:00")).astimezone(timezone.utc)

            step_min = 60
            if res and res.startswith("PT") and res.endswith("M"):
                try:
                    step_min = int(res[2:-1])
                except:
                    step_min = 60

            for p in period:
                if strip_ns(p.tag) != "Point":
                    continue
                pos = None
                val = None
                for cc in p:
                    ln = strip_ns(cc.tag)
                    if ln == "position":
                        try:
                            pos = int(cc.text.strip())
                        except:
                            pos = None
                    elif ln in ("quantity", "price.amount"):
                        try:
                            val = float(cc.text.strip())
                        except:
                            val = None
                if pos is None or val is None:
                    continue
                t = start_dt + timedelta(minutes=(pos - 1) * step_min)
                out.append((t, val, step_min))
    out.sort(key=lambda x: x[0])
    return out

def parse_generation_by_psr(xml_text: str):
    root = ET.fromstring(xml_text)
    out = {}
    for ts in root.iter():
        if strip_ns(ts.tag) != "TimeSeries":
            continue
        psr_type = None
        for child in ts:
            if strip_ns(child.tag) == "MktPSRType":
                for cc in child:
                    if strip_ns(cc.tag) == "psrType":
                        psr_type = cc.text.strip() if cc.text else None
        if not psr_type:
            continue
        out.setdefault(psr_type, [])
        for period in ts:
            if strip_ns(period.tag) != "Period":
                continue
            start = None
            res = None
            for child in period:
                ln = strip_ns(child.tag)
                if ln == "timeInterval":
                    for cc in child:
                        if strip_ns(cc.tag) == "start":
                            start = cc.text.strip()
                elif ln == "resolution":
                    res = child.text.strip() if child.text else None
            if not start:
                continue
            start_dt = datetime.fromisoformat(start.replace("Z", "+00:00")).astimezone(timezone.utc)
            step_min = 60
            if res and res.startswith("PT") and res.endswith("M"):
                try:
                    step_min = int(res[2:-1])
                except:
                    step_min = 60

            for p in period:
                if strip_ns(p.tag) != "Point":
                    continue
                pos = None
                qty = None
                for cc in p:
                    ln = strip_ns(cc.tag)
                    if ln == "position":
                        try:
                            pos = int(cc.text.strip())
                        except:
                            pos = None
                    elif ln == "quantity":
                        try:
                            qty = float(cc.text.strip())
                        except:
                            qty = None
                if pos is None or qty is None:
                    continue
                t = start_dt + timedelta(minutes=(pos - 1) * step_min)
                out[psr_type].append((t, qty, step_min))
    for k in out:
        out[k].sort(key=lambda x: x[0])
    return out

def hourly_keys(start_utc: datetime, end_utc_excl: datetime):
    keys = []
    t = start_utc
    while t < end_utc_excl:
        keys.append(t.strftime("%Y-%m-%dT%H:00:00Z"))
        t += timedelta(hours=1)
    return keys

def points_to_hourly_hold_mean(points, start_utc: datetime, end_utc_excl: datetime):
    H = int((end_utc_excl - start_utc).total_seconds() // 3600)
    if not points:
        return [None] * H

    intervals = []
    for i, (t, v, step_min) in enumerate(points):
        if i + 1 < len(points) and points[i+1][0] > t:
            t2 = points[i+1][0]
        else:
            t2 = t + timedelta(minutes=int(step_min) if step_min else 60)
        if t2 > t:
            intervals.append((t, t2, v))

    sumv = [0.0] * H
    summ = [0.0] * H

    for (a, b, v) in intervals:
        if b <= start_utc or a >= end_utc_excl:
            continue
        a = max(a, start_utc)
        b = min(b, end_utc_excl)

        cur = a
        while cur < b:
            hour_start = cur.replace(minute=0, second=0, microsecond=0)
            hour_end = hour_start + timedelta(hours=1)
            seg_end = min(b, hour_end)
            minutes = (seg_end - cur).total_seconds() / 60.0
            idx = int((hour_start - start_utc).total_seconds() // 3600)
            if 0 <= idx < H and minutes > 0:
                sumv[idx] += v * minutes
                summ[idx] += minutes
            cur = seg_end

    out = []
    for i in range(H):
        out.append(sumv[i] / summ[i] if summ[i] > 0 else None)
    return out

def cache_paths(cache_dir: str, ym: str):
    return {
        "prices": os.path.join(cache_dir, f"prices_{ym}.json"),
        "consumption": os.path.join(cache_dir, f"consumption_{ym}.json"),
        "generation": os.path.join(cache_dir, f"generation_{ym}.json"),
        "flows": os.path.join(cache_dir, f"flows_{ym}.json"),
        "internal_flows": os.path.join(cache_dir, f"internal_flows_{ym}.json"),
    }

def month_is_complete(cache_dir: str, ym: str, require_consumption: bool) -> bool:
    p = cache_paths(cache_dir, ym)
    keys = ["prices", "generation", "flows", "internal_flows"]
    if require_consumption:
        keys.append("consumption")
    return all(os.path.exists(p[k]) for k in keys)

def fetch_month(token: str, base_dir: str, year: int, month: int, sleep_between_calls: float = 0.2, fetch_consumption: bool = False):
    start = month_start_utc(year, month)
    end_excl = month_end_excl_utc(year, month)
    hours = hourly_keys(start, end_excl)
    ym = f"{year}-{month:02d}"
    cache_dir = ensure_cache_dir(base_dir)

    def pause():
        if sleep_between_calls > 0:
            time.sleep(sleep_between_calls)

    zones_needed = set(["SE1","SE2","SE3","SE4"])
    for b in EXTERNAL_BORDERS:
        zones_needed.add(b["foreign"])

    prices = {"hours_utc": hours, "zones": {}}
    for z in sorted(zones_needed):
        xml = request_xml(token, {
            "documentType":"A44",
            "processType":"A01",
            "in_Domain": ZONES[z],
            "out_Domain": ZONES[z],
            "periodStart": to_entsoe_period(start),
            "periodEnd": to_entsoe_period(end_excl),
        })
        pts = parse_timeseries_points(xml)
        prices["zones"][z] = points_to_hourly_hold_mean(pts, start, end_excl)
        print(f"[{ym}] PRICE {z}: points={len(pts)}")
        pause()
    write_json(os.path.join(cache_dir, f"prices_{ym}.json"), prices)

    # Optional: Actual Total Load (consumption) per bidding zone.
    # Used for volume-weighted comparisons in the UI.
    #
    # IMPORTANT: For documentType A65, ENTSO-E expects outBiddingZone_Domain
    # (not in_Domain/out_Domain). Sending the wrong parameter names yields HTTP 400.
    if fetch_consumption:
        cons = {"hours_utc": hours, "zones": {}}
        for z in sorted(zones_needed):
            try:
                xml = request_xml(token, {
                    "documentType": "A65",             # System total load / Actual Total Load
                    "processType": "A16",              # Realised
                    "outBiddingZone_Domain": ZONES[z],
                    "periodStart": to_entsoe_period(start),
                    "periodEnd": to_entsoe_period(end_excl),
                })
                pts = parse_timeseries_points(xml)
                cons["zones"][z] = points_to_hourly_hold_mean(pts, start, end_excl)
                print(f"[{ym}] CONS {z}: points={len(pts)}")
            except Exception as e:
                # Do not fail the entire month if consumption is missing for a zone.
                cons["zones"][z] = [None] * len(hours)
                print(f"[{ym}] CONS {z}: ERROR {e}")
            pause()
        write_json(os.path.join(cache_dir, f"consumption_{ym}.json"), cons)

    gen = {"hours_utc": hours, "zones": {"SE1":{}, "SE2":{}, "SE3":{}, "SE4":{}}}
    for z in ["SE1","SE2","SE3","SE4"]:
        xml = request_xml(token, {
            "documentType":"A75",
            "processType":"A16",
            "in_Domain": ZONES[z],
            "out_Domain": ZONES[z],
            "periodStart": to_entsoe_period(start),
            "periodEnd": to_entsoe_period(end_excl),
        })
        by_psr = parse_generation_by_psr(xml)
        print(f"[{ym}] GEN {z}: psr_in_xml={len(by_psr)} sample={','.join(sorted(by_psr.keys())[:12])}")
        for psr in WANTED_PSR:
            pts = by_psr.get(psr, [])
            gen["zones"][z][psr] = points_to_hourly_hold_mean(pts, start, end_excl)
            pause()
    write_json(os.path.join(cache_dir, f"generation_{ym}.json"), gen)

    flows = {"hours_utc": hours, "borders": {}}
    for b in EXTERNAL_BORDERS:
        se, fo = b["se"], b["foreign"]
        xml = request_xml(token, {
            "documentType":"A11",
            "out_Domain": ZONES[se],
            "in_Domain":  ZONES[fo],
            "periodStart": to_entsoe_period(start),
            "periodEnd": to_entsoe_period(end_excl),
        })
        pts = parse_timeseries_points(xml)
        flows["borders"][b["name"]] = {"mw": points_to_hourly_hold_mean(pts, start, end_excl)}
        print(f"[{ym}] FLOW {b['name']}: points={len(pts)}")
        pause()
    write_json(os.path.join(cache_dir, f"flows_{ym}.json"), flows)

    internal = {"hours_utc": hours, "borders": {}}
    for b in INTERNAL_BORDERS:
        a, c = b["a"], b["b"]
        xml_ac = request_xml(token, {
            "documentType":"A11",
            "out_Domain": ZONES[a],
            "in_Domain":  ZONES[c],
            "periodStart": to_entsoe_period(start),
            "periodEnd": to_entsoe_period(end_excl),
        })
        pause()
        xml_ca = request_xml(token, {
            "documentType":"A11",
            "out_Domain": ZONES[c],
            "in_Domain":  ZONES[a],
            "periodStart": to_entsoe_period(start),
            "periodEnd": to_entsoe_period(end_excl),
        })
        pts1 = parse_timeseries_points(xml_ac)
        pts2 = parse_timeseries_points(xml_ca)
        arr1 = points_to_hourly_hold_mean(pts1, start, end_excl)
        arr2 = points_to_hourly_hold_mean(pts2, start, end_excl)
        net = []
        for i in range(len(arr1)):
            v1, v2 = arr1[i], arr2[i]
            if v1 is None and v2 is None:
                net.append(None)
            elif v1 is None:
                net.append(-v2)
            elif v2 is None:
                net.append(v1)
            else:
                net.append(v1 - v2)
        internal["borders"][b["name"]] = {"mw": net}
        print(f"[{ym}] INT {b['name']} {a}->{c} points={len(pts1)} ; {c}->{a} points={len(pts2)}")
        pause()
    write_json(os.path.join(cache_dir, f"internal_flows_{ym}.json"), internal)

    return ym

def write_manifest(base_dir: str):
    cache_dir = ensure_cache_dir(base_dir)
    months = []
    for fn in os.listdir(cache_dir):
        if fn.startswith("prices_") and fn.endswith(".json"):
            ym = fn[len("prices_"):-len(".json")]
            months.append(ym)
    months = sorted(set(months))

    cons_months = []
    for fn in os.listdir(cache_dir):
        if fn.startswith("consumption_") and fn.endswith(".json"):
            ym = fn[len("consumption_"):-len(".json")]
            cons_months.append(ym)
    cons_months = sorted(set(cons_months))

    manifest = {
        "schema_version": 1,
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "months": months,
        "files": {
            "prices": [f"cache/prices_{m}.json" for m in months],
            "consumption": [f"cache/consumption_{m}.json" for m in cons_months],
            "generation": [f"cache/generation_{m}.json" for m in months],
            "flows": [f"cache/flows_{m}.json" for m in months],
            "internal_flows": [f"cache/internal_flows_{m}.json" for m in months],
        }
    }
    write_json(os.path.join(cache_dir, "manifest.json"), manifest)

def current_ym_utc() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.year:04d}-{now.month:02d}"

def prev_month_ym(ym: str) -> str:
    y, m = map(int, ym.split("-"))
    m -= 1
    if m == 0:
        m = 12
        y -= 1
    return f"{y:04d}-{m:02d}"

def last_n_months(n: int):
    out = []
    ym = current_ym_utc()
    for _ in range(n):
        out.append(ym)
        ym = prev_month_ym(ym)
    return sorted(out)

def main():
    ap = argparse.ArgumentParser()

    # SECURITY: keep entsoe_token.txt outside any web-accessible directory.
    ap.add_argument(
        "--token-dir",
        default="../..",
        help="Directory containing entsoe_token.txt (should NOT be web-accessible)",
    )
    ap.add_argument(
        "--cache-dir",
        default=".",
        help="Base directory where cache/ and manifest.json will be written",
    )

    ap.add_argument("--sleep", type=float, default=0.2, help="Sleep seconds between API calls")

    # Consumption (Actual Total Load) is enabled by default because it is used by the
    # price comparison UI for volume-weighted averages.
    # Use --no-consumption if you want a faster/leaner run.
    g = ap.add_mutually_exclusive_group()
    g.add_argument(
        "--consumption",
        dest="consumption",
        action="store_true",
        help="Fetch Actual Total Load per zone and write consumption_YYYY-MM.json (default)",
    )
    g.add_argument(
        "--no-consumption",
        dest="consumption",
        action="store_false",
        help="Do not fetch consumption_YYYY-MM.json",
    )
    ap.set_defaults(consumption=True)

    # 'full' is accepted as an alias for 'backfill' (older instructions used 'full').
    ap.add_argument(
        "--mode",
        choices=["backfill", "update", "full"],
        required=True,
        help="backfill/full: fetch missing months in range. update: refresh last N months.",
    )
    ap.add_argument("--start-month", help="YYYY-MM (inclusive) for backfill")
    ap.add_argument("--end-month", help="YYYY-MM (inclusive) for backfill")
    ap.add_argument("--since", default="2015-01", help="Convenience for backfill: start month (default 2015-01)")
    ap.add_argument(
        "--recent-months",
        type=int,
        default=2,
        help="update mode: how many last months to refresh (default 2)",
    )

    args = ap.parse_args()

    token_dir = os.path.abspath(args.token_dir)
    cache_base_dir = os.path.abspath(args.cache_dir)

    token_path = os.path.join(token_dir, "entsoe_token.txt")
    token = read_token(token_path)

    cache_dir = ensure_cache_dir(cache_base_dir)
    fetched = []

    mode = args.mode
    if mode == "full":
        mode = "backfill"

    if mode == "update":
        months = last_n_months(args.recent_months)
        for ym in months:
            y, m = map(int, ym.split("-"))
            print(f"=== Update {ym} (force refresh) ===")
            fetched.append(fetch_month(token, cache_base_dir, y, m, sleep_between_calls=args.sleep, fetch_consumption=args.consumption))
    else:
        start_month = args.start_month or args.since
        end_month = args.end_month or current_ym_utc()
        for (y, m) in iter_months_inclusive(start_month, end_month):
            ym = f"{y}-{m:02d}"
            if month_is_complete(cache_dir, ym, require_consumption=args.consumption):
                print(f"=== Skip {ym} (already cached) ===")
                continue
            print(f"=== Backfill {ym} ===")
            fetched.append(fetch_month(token, cache_base_dir, y, m, sleep_between_calls=args.sleep, fetch_consumption=args.consumption))

    write_manifest(cache_base_dir)
    print("Done. Updated cache/manifest.json")
    if fetched:
        print("Fetched:", ", ".join(fetched))
if __name__ == "__main__":
    main()