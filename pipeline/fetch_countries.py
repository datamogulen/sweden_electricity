#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_countries.py — kompletterar ENTSO-E-cachen för landsjämförelser
(revision 7): Frankrikes priser + last, och produktion per kraftslag för
FI, DE-LU och FR. Skriver countries_YYYY-MM.json bredvid den befintliga
cachen (rör inte Björns originalfiler). Månader som redan är hämtade
hoppas över (resumebart).

Tyskland: budzonen DE-LU finns först från 2018-10 (dessförinnan DE-AT-LU);
Tyskland erbjuds därför från 2019 — deklarerat i SPEC_REVISIONS.
Återanvänder parsers ur fetch_cache.py (Björns beprövade kod).
"""
import json
import os
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_cache import (  # noqa: E402
    request_xml, parse_timeseries_points, parse_generation_by_psr,
    points_to_hourly_hold_mean, hourly_keys, month_start_utc,
    month_end_excl_utc, to_entsoe_period, read_token, WANTED_PSR,
)

HERE = Path(__file__).resolve().parent
DATA_SRC = HERE.parent / "data_src"
CACHE = DATA_SRC / "entsoe" / "cache"
TOKEN = read_token(str(DATA_SRC / "entsoe_token.txt"))

ZONE_IDS = {
    "FI": "10YFI-1--------U",
    "DELU": "10Y1001A1001A82H",
    "FR": "10YFR-RTE------C",
}
GEN_FROM = {"FI": (2015, 1), "FR": (2015, 1), "DELU": (2018, 10)}
SLEEP = 0.3


def month_iter(y0, m0, y1, m1):
    y, m = y0, m0
    while (y, m) <= (y1, m1):
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def fetch_month(y, m):
    ym = f"{y}-{m:02d}"
    out_path = CACHE / f"countries_{ym}.json"
    if out_path.exists():
        return False
    start = month_start_utc(y, m)
    end = month_end_excl_utc(y, m)
    hours = hourly_keys(start, end)
    obj = {"hours_utc": hours, "prices": {}, "cons": {}, "gen": {}}

    # Frankrike: pris + last (FI/DELU finns redan i ordinarie cache)
    for doc, key in [("A44", "prices"), ("A65", "cons")]:
        try:
            params = {"documentType": doc,
                      "periodStart": to_entsoe_period(start),
                      "periodEnd": to_entsoe_period(end)}
            if doc == "A44":
                params.update({"processType": "A01", "in_Domain": ZONE_IDS["FR"],
                               "out_Domain": ZONE_IDS["FR"]})
            else:
                params.update({"processType": "A16",
                               "outBiddingZone_Domain": ZONE_IDS["FR"]})
            pts = parse_timeseries_points(request_xml(TOKEN, params))
            obj[key]["FR"] = points_to_hourly_hold_mean(pts, start, end)
        except Exception as e:
            obj[key]["FR"] = [None] * len(hours)
            print(f"[{ym}] FR {key}: MISS ({str(e)[:80]})")
        time.sleep(SLEEP)

    # produktion per kraftslag
    for z, (gy, gm) in GEN_FROM.items():
        if (y, m) < (gy, gm):
            continue
        try:
            xml = request_xml(TOKEN, {
                "documentType": "A75", "processType": "A16",
                "in_Domain": ZONE_IDS[z], "out_Domain": ZONE_IDS[z],
                "periodStart": to_entsoe_period(start),
                "periodEnd": to_entsoe_period(end)})
            by_psr = parse_generation_by_psr(xml)
            obj["gen"][z] = {psr: points_to_hourly_hold_mean(by_psr.get(psr, []), start, end)
                             for psr in WANTED_PSR}
            npts = sum(1 for a in obj["gen"][z].values() for v in a if v is not None)
            print(f"[{ym}] GEN {z}: {len(by_psr)} kraftslag, {npts} värden")
        except Exception as e:
            obj["gen"][z] = {}
            print(f"[{ym}] GEN {z}: MISS ({str(e)[:80]})")
        time.sleep(SLEEP)

    tmp = str(out_path) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f)
    os.replace(tmp, out_path)
    return True


def main():
    today = date.today()
    # innevarande + föregående månad hämtas alltid om (annars stelnar de
    # halvfyllda — samma läxa som fetch_cache --mode update)
    fresh = {(today.year, today.month)}
    pm_y, pm_m = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
    fresh.add((pm_y, pm_m))
    for (fy, fm) in fresh:
        p = CACHE / f"countries_{fy}-{fm:02d}.json"
        if p.exists():
            p.unlink()
    n = 0
    for y, m in month_iter(2015, 1, today.year, today.month):
        if fetch_month(y, m):
            n += 1
    print(f"Klart: {n} nya månader")


if __name__ == "__main__":
    main()
