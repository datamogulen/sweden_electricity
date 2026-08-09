#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_data.py — datapipeline för "El i Sverige över tid" (se SPEC.md §5).

Läser:
  - spotpriser (öre/kWh, svensk lokaltid) ur spotprices.sqlite (areor SN1–SN4)
  - förbrukning/produktion (MW, UTC) ur ENTSO-E-cachen (JSON per månad)

Skriver:
  - site/data/{matt}_{isoår}.json   (plattarray per zon: veckor*168 värden, null=saknad)
  - site/data/index.json            (tillgängliga år per mått + deklarationer)

Validering (vägrar vid brott — byggspärr, ingen tyst degradering):
  - nationell årsförbrukning 120–160 TWh, årsproduktion 130–180 TWh
  - SE3 spotprismedel 2022 = 137,9 ± 0,7 öre/kWh (referens mot publikt ~138)
  - varje serie: > 97 % täckning för hela ISO-år (utom deklarerade kantveckor)
"""
import json
import math
import sqlite3
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "site" / "data"
DB = Path.home() / "Development/hedin.it_backup/public_html/spotpriser_data/spotprices.sqlite"
CACHE = Path.home() / "Development/hedin.it_backup/public_html/entsoe/cache"
TZ = ZoneInfo("Europe/Stockholm")

ZONES = ["SE1", "SE2", "SE3", "SE4"]
PRICE_YEARS = range(2008, 2026)        # hela ISO-år med spotpris
CONS_YEARS = range(2015, 2026)         # hela ISO-år med förbrukning
PROD_YEARS = range(2022, 2026)         # per-kraftslag komplett först 2022 (SPEC §4)


def iso_weeks_in_year(y: int) -> int:
    # ISO-år har 53 veckor om 28 dec ligger i vecka 53
    return date(y, 12, 28).isocalendar()[1]


def iso_year_start(y: int) -> date:
    # måndag i ISO-vecka 1 = måndagen i veckan som innehåller 4 jan
    jan4 = date(y, 1, 4)
    return jan4 - timedelta(days=jan4.isocalendar()[2] - 1)


def slot_of(dt_local: datetime, iso_year: int) -> int | None:
    """Index i plattarrayen för en lokal timme, eller None om fel ISO-år."""
    iy, iw, iwd = dt_local.isocalendar()
    if iy != iso_year:
        return None
    return (iw - 1) * 168 + (iwd - 1) * 24 + dt_local.hour


def new_series(iso_year: int):
    return [None] * (iso_weeks_in_year(iso_year) * 168)


# ---------------------------------------------------------------- spotpriser
def load_prices():
    """{zon: {lokal naive-datetime-sträng -> öre/kWh}} — ts är redan svensk lokaltid."""
    con = sqlite3.connect(DB)
    out = {z: {} for z in ZONES}
    for i, z in enumerate(ZONES, start=1):
        for ts, v in con.execute(
            "SELECT ts, value FROM prices WHERE area=? ORDER BY ts", (f"SN{i}",)
        ):
            out[z][ts] = v
    con.close()
    return out


def fold_prices(prices, weights_by_hour):
    """Per ISO-år: zonserier + nationellt (förbrukningsviktat) medel."""
    files = {}
    for y in PRICE_YEARS:
        zs = {z: new_series(y) for z in ZONES + ["SE"]}
        missing = {z: 0 for z in ZONES + ["SE"]}
        start = iso_year_start(y)
        end = iso_year_start(y + 1)
        d = start
        while d < end:
            for h in range(24):
                dt = datetime(d.year, d.month, d.day, h)
                idx = slot_of(dt, y)
                if idx is None:
                    continue
                key = dt.strftime("%Y-%m-%dT%H:00:00")
                vals = [prices[z].get(key) for z in ZONES]
                for z, v in zip(ZONES, vals):
                    if v is not None:
                        zs[z][idx] = round(v, 2)
                if all(v is not None for v in vals):
                    w = weights_by_hour.get(key)
                    if w and sum(w) > 0:
                        zs["SE"][idx] = round(
                            sum(v * wi for v, wi in zip(vals, w)) / sum(w), 2
                        )
                    else:
                        zs["SE"][idx] = round(sum(vals) / 4, 2)
            d += timedelta(days=1)
        files[y] = zs
    return files


# ------------------------------------------------------- ENTSO-E (UTC-json)
def iter_cache(prefix: str):
    for f in sorted(CACHE.glob(f"{prefix}_*.json")):
        yield json.load(open(f))


def load_entsoe(prefix: str, per_psr: bool):
    """{zon: {lokal 'YYYY-MM-DDTHH': [värden]}} — lista pga höstens dubbeltimme."""
    out = {z: {} for z in ZONES}
    for d in iter_cache(prefix):
        hours = d["hours_utc"]
        for z in ZONES:
            zdata = d["zones"].get(z)
            if zdata is None:
                continue
            for i, hu in enumerate(hours):
                if per_psr:
                    vs = [a[i] for a in zdata.values() if a[i] is not None]
                    v = sum(vs) if vs else None
                else:
                    v = zdata[i]
                if v is None:
                    continue
                dt = datetime.fromisoformat(hu.replace("Z", "+00:00")).astimezone(TZ)
                key = dt.strftime("%Y-%m-%dT%H")
                out[z].setdefault(key, []).append(v)
    return out


def fold_entsoe(data, years):
    files = {}
    for y in years:
        zs = {z: new_series(y) for z in ZONES + ["SE"]}
        start, end = iso_year_start(y), iso_year_start(y + 1)
        d = start
        while d < end:
            for h in range(24):
                dt = datetime(d.year, d.month, d.day, h)
                idx = slot_of(dt, y)
                if idx is None:
                    continue
                key = dt.strftime("%Y-%m-%dT%H")
                tot, all_ok = 0.0, True
                for z in ZONES:
                    vs = data[z].get(key)
                    if not vs:
                        all_ok = False
                        continue
                    v = sum(vs) / len(vs)  # höstens dubbeltimme medelvärdesbildas
                    zs[z][idx] = round(v)
                    tot += v
                if all_ok:
                    zs["SE"][idx] = round(tot)
            d += timedelta(days=1)
        files[y] = zs
    return files


# ------------------------------------------------------------- validering
class BuildRefusal(SystemExit):
    pass


def refuse(msg):
    raise BuildRefusal(f"BYGGSPÄRR: {msg}")


def twh(series):
    return sum(v for v in series if v is not None) / 1e6


def validate(price_files, cons_files, prod_files):
    for y, zs in cons_files.items():
        t = twh(zs["SE"])
        if not (120 <= t <= 160):
            refuse(f"förbrukning {y}: {t:.1f} TWh utanför 120–160")
    for y, zs in prod_files.items():
        t = twh(zs["SE"])
        if not (130 <= t <= 180):
            refuse(f"produktion {y}: {t:.1f} TWh utanför 130–180")
    se3 = [v for v in price_files[2022]["SE3"] if v is not None]
    m = sum(se3) / len(se3)
    if abs(m - 137.9) > 0.7:
        refuse(f"SE3-medel 2022 = {m:.1f}, väntat 137,9 ± 0,7")
    # täckning: hela år ska ha < 3 % saknade timmar (kantveckor undantagna nedan)
    for name, files in [("spotpris", price_files), ("förbrukning", cons_files),
                        ("produktion", prod_files)]:
        for y, zs in files.items():
            for z, s in zs.items():
                miss = sum(1 for v in s if v is None)
                if miss / len(s) > 0.03 and not (name != "spotpris" and y == 2015):
                    refuse(f"{name} {y} {z}: {miss} saknade timmar (> 3 %)")
    print("Validering: OK")


# ---------------------------------------------------------------- skrivning
def write_files(measure, unit, files):
    years = []
    for y, zs in sorted(files.items()):
        obj = {
            "measure": measure,
            "unit": unit,
            "isoYear": y,
            "weeks": iso_weeks_in_year(y),
            "missing": {z: sum(1 for v in s if v is None) for z, s in zs.items()},
            "zones": zs,
        }
        p = OUT / f"{measure}_{y}.json"
        p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
        years.append(y)
        print(f"  {p.name}  ({p.stat().st_size//1024} kB, "
              f"saknade SE: {obj['missing']['SE']})")
    return years


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print("Läser ENTSO-E förbrukning …")
    cons = load_entsoe("consumption", per_psr=False)
    print("Läser ENTSO-E produktion …")
    prod = load_entsoe("generation", per_psr=True)
    print("Läser spotpriser …")
    prices = load_prices()

    weights = {}  # lokal timnyckel -> [SE1..SE4]-förbrukning, för viktat prismedel
    keys = set()
    for z in ZONES:
        keys.update(cons[z].keys())
    for k in keys:
        w = []
        for z in ZONES:
            vs = cons[z].get(k)
            if not vs:
                w = None
                break
            w.append(sum(vs) / len(vs))
        if w:
            weights[k + ":00:00"] = w

    print("Foldar till ISO-vecka × timme …")
    price_files = fold_prices(prices, weights)
    cons_files = fold_entsoe(cons, CONS_YEARS)
    prod_files = fold_entsoe(prod, PROD_YEARS)

    validate(price_files, cons_files, prod_files)

    print("Skriver JSON …")
    index = {
        "measures": {
            "consumption": {
                "label": "Elförbrukning", "unit": "MW",
                "years": write_files("consumption", "MW", cons_files),
                "scalePerUnit": 0.002, "scaleLabel": "2 mm = 1 GW",
            },
            "production": {
                "label": "Elproduktion", "unit": "MW",
                "years": write_files("production", "MW", prod_files),
                "scalePerUnit": 0.002, "scaleLabel": "2 mm = 1 GW",
            },
            "price": {
                "label": "Spotpris", "unit": "öre/kWh",
                "years": write_files("price", "öre/kWh", price_files),
                "scalePerUnit": 0.1, "scaleLabel": "1 mm = 10 öre/kWh",
            },
        },
        "zones": ["SE"] + ZONES,
        "declarations": {
            "SE_price": "Sveriges spotpris = förbrukningsviktat medel av SE1–SE4 "
                        "(timvikter ur ENTSO-E-lasten) fr.o.m. 2015; aritmetiskt "
                        "medel 2008–2014. Före 2011-11-01 var Sverige ett elområde.",
            "time": "Svensk lokaltid; DST-vårens timme saknas, höstens dubbeltimme "
                    "är medelvärdesbildad (spotpris: första timmen).",
            "weeks": "ISO-veckor (mån–sön); ett år = ISO-år.",
            "sources": "Spotpris: Nord Pool via mgrey.se/espot (lokal databas). "
                       "Förbrukning/produktion: ENTSO-E Transparency (lokal cache); "
                       "produktion = summa av kraftslag, komplett per elområde "
                       "först 2022.",
        },
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
    print(f"Klart: {OUT}")


if __name__ == "__main__":
    main()
