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

import os

HERE = Path(__file__).resolve().parent
# EL3D_OUT: på servern skrivs JSON direkt till public_html/el3d/data
OUT = Path(os.environ.get("EL3D_OUT", HERE.parent / "site" / "data"))
DB = HERE.parent / "data_src" / "spotprices.sqlite"
CACHE = HERE.parent / "data_src" / "entsoe" / "cache"
TZ = ZoneInfo("Europe/Stockholm")

ZONES = ["SE1", "SE2", "SE3", "SE4"]
COUNTRIES = ["FI", "DELU", "FR"]               # revision 7: landsjämförelser
ZONE_LABELS = {"SE": "Sverige", "SE1": "SE1", "SE2": "SE2", "SE3": "SE3",
               "SE4": "SE4", "FI": "Finland", "DELU": "Tyskland (DE–LU)",
               "FR": "Frankrike"}
CUR_ISO_YEAR = date.today().isocalendar()[0]   # pågående år tas med som partiellt
PRICE_YEARS = range(2008, CUR_ISO_YEAR + 1)    # hela ISO-år med spotpris
CONS_YEARS = range(2015, CUR_ISO_YEAR + 1)     # hela ISO-år med förbrukning
PROD_YEARS = range(2015, CUR_ISO_YEAR + 1)     # SE komplett 2022+, FI/FR 2015+,
                                               # DELU 2019+ (zoneYears styr urvalet)
FX = None                                      # SEK/EUR månadsmedel (laddas i main)

# rimlighetsintervall för hela år, TWh (byggspärr)
TWH_RANGES = {
    ("consumption", "SE"): (120, 160), ("production", "SE"): (130, 180),
    ("consumption", "FI"): (60, 95),   ("production", "FI"): (55, 95),
    ("consumption", "DELU"): (400, 560), ("production", "DELU"): (350, 620),
    ("consumption", "FR"): (380, 560), ("production", "FR"): (400, 600),
}


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


def _merge_hours(out, zone, hours, values, per_psr, to_ore=False):
    """UTC-timmar → {lokal 'YYYY-MM-DDTHH': [värden]}; ev. EUR/MWh → öre/kWh."""
    for i, hu in enumerate(hours):
        if per_psr:
            vs = [a[i] for a in values.values() if a[i] is not None]
            v = sum(vs) if vs else None
        else:
            v = values[i]
        if v is None:
            continue
        dt = datetime.fromisoformat(hu.replace("Z", "+00:00")).astimezone(TZ)
        if to_ore:
            fx = FX.get(dt.strftime("%Y-%m"))
            if fx is None:
                continue
            v = v * fx / 10.0            # EUR/MWh × SEK/EUR ÷ 10 = öre/kWh
        out.setdefault(zone, {}).setdefault(dt.strftime("%Y-%m-%dT%H"), []).append(v)


def load_entsoe(prefix: str, per_psr: bool, zones):
    out = {z: {} for z in zones}
    for d in iter_cache(prefix):
        for z in zones:
            zdata = d["zones"].get(z)
            if zdata is not None:
                _merge_hours(out, z, d["hours_utc"], zdata, per_psr)
    return out


def load_countries():
    """countries_*.json → priser (öre/kWh), last och produktion för länderna.
    FI/DELU-priser+last ligger i ordinarie cache; FR + all produktion här."""
    prices = {z: {} for z in COUNTRIES}
    cons = {"FR": {}}
    gen = {z: {} for z in COUNTRIES}
    for d in iter_cache("prices"):
        for z in ["FI", "DELU"]:
            zdata = d["zones"].get(z)
            if zdata is not None:
                _merge_hours(prices, z, d["hours_utc"], zdata, False, to_ore=True)
    for d in iter_cache("countries"):
        hours = d["hours_utc"]
        if d["prices"].get("FR"):
            _merge_hours(prices, "FR", hours, d["prices"]["FR"], False, to_ore=True)
        if d["cons"].get("FR"):
            _merge_hours(cons, "FR", hours, d["cons"]["FR"], False)
        for z in COUNTRIES:
            zgen = d["gen"].get(z)
            if zgen:
                _merge_hours(gen, z, hours, zgen, True)
    return prices, cons, gen


def fold_entsoe(data, years, decimals=0):
    """Foldar {zon: {lokaltimme: [värden]}} till plattarrayer per ISO-år.
    Ger SE = summa av SE1–SE4 när alla fyra zonerna finns i datat."""
    zones = list(data.keys())
    has_se = all(z in data for z in ZONES)
    rnd = (lambda v: round(v, decimals)) if decimals else (lambda v: round(v))
    files = {}
    for y in years:
        zs = {z: new_series(y) for z in zones + (["SE"] if has_se else [])}
        start, end = iso_year_start(y), iso_year_start(y + 1)
        d = start
        while d < end:
            for h in range(24):
                dt = datetime(d.year, d.month, d.day, h)
                idx = slot_of(dt, y)
                if idx is None:
                    continue
                key = dt.strftime("%Y-%m-%dT%H")
                tot, all_ok = 0.0, has_se
                for z in zones:
                    vs = data[z].get(key)
                    if not vs:
                        if z in ZONES:
                            all_ok = False
                        continue
                    v = sum(vs) / len(vs)  # höstens dubbeltimme medelvärdesbildas
                    zs[z][idx] = rnd(v)
                    if z in ZONES:
                        tot += v
                if has_se and all_ok:
                    zs["SE"][idx] = rnd(tot)
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


def coverage(series):
    return sum(1 for v in series if v is not None) / len(series)


def screen_outliers(files, measure):
    """Outlier-screening av förbrukning (revision 8): värden > 2,5× medianen
    för samma timme ±7 dygn sätts som saknade och listas i rapporten.
    Verifierat mot kända ENTSO-E-fel (SE1/SE2 2018-04-16, 2018-09-11,
    2019-01-15, 2019-06-03, 2022-02-10, 2026-03-28: zonallokeringen skramlad,
    SE2 ×4 i timmar). Priser screenas INTE (extremer är verkliga, D3);
    produktion screenas inte (vind varierar legitimt flerfaldigt)."""
    import statistics
    report = []
    for y, zs in sorted(files.items()):
        zones = [z for z in zs if z != "SE"]
        killed_slots = set()
        for z in zones:
            s = zs[z]
            n = len(s)
            for i, v in enumerate(s):
                if v is None or v <= 0:
                    continue
                ref = [s[j] for k in range(-7, 8) if k
                       for j in [i + k * 24] if 0 <= j < n and s[j] is not None]
                if len(ref) >= 8:
                    med = statistics.median(ref)
                    if med > 0 and v > 2.5 * med:
                        start = iso_year_start(y)
                        d = start + timedelta(days=i // 24)
                        report.append(f"{measure} {z} {d} kl {i % 24:02d}: "
                                      f"{v} MW (median ±7 dygn: {med:.0f})")
                        s[i] = None
                        killed_slots.add(i)
        # SE-summan är kontaminerad i samma timmar
        if "SE" in zs:
            for i in killed_slots:
                zs["SE"][i] = None
    return report


def zone_years(files, min_cov=0.9):
    """{zon: [år med ≥ min_cov täckning]} — pågående år: > 500 datatimmar."""
    zy = {}
    for y, zs in sorted(files.items()):
        for z, s in zs.items():
            n = sum(1 for v in s if v is not None)
            ok = (n > 500) if y == CUR_ISO_YEAR else (n / len(s) >= min_cov)
            if ok:
                zy.setdefault(z, []).append(y)
    return zy


def validate(price_files, cons_files, prod_files):
    for name, files in [("förbrukning", cons_files), ("produktion", prod_files)]:
        m = "consumption" if name == "förbrukning" else "production"
        for y, zs in files.items():
            if y == CUR_ISO_YEAR:
                continue                 # pågående år valideras inte mot årssummor
            for z in ["SE"] + COUNTRIES:
                if z not in zs or coverage(zs[z]) < 0.9:
                    continue             # zonår utan täckning erbjuds inte (zoneYears)
                lo, hi = TWH_RANGES[(m, z)]
                t = twh(zs[z])
                if not (lo <= t <= hi):
                    refuse(f"{name} {y} {z}: {t:.1f} TWh utanför {lo}–{hi}")
    # ländernas prisårsmedel rimliga (öre/kWh efter FX)
    for y, zs in price_files.items():
        if y == CUR_ISO_YEAR:
            continue
        for z in COUNTRIES:
            if z not in zs or coverage(zs[z]) < 0.9:
                continue
            vals = [v for v in zs[z] if v is not None]
            m = sum(vals) / len(vals)
            if not (-50 <= m <= 500):
                refuse(f"spotpris {y} {z}: årsmedel {m:.1f} öre/kWh orimligt")
    se3 = [v for v in price_files[2022]["SE3"] if v is not None]
    m = sum(se3) / len(se3)
    if abs(m - 137.9) > 0.7:
        refuse(f"SE3-medel 2022 = {m:.1f}, väntat 137,9 ± 0,7")
    # pågående år: kräver data fram till minst 3 dygn före idag (spärr mot
    # tyst stannad uppdatering)
    for name, files in [("spotpris", price_files), ("förbrukning", cons_files),
                        ("produktion", prod_files)]:
        zs = files.get(CUR_ISO_YEAR)
        if zs is None:
            continue
        last = last_data_date(zs["SE"], CUR_ISO_YEAR)
        if last is None or (date.today() - last).days > 3:
            refuse(f"{name} {CUR_ISO_YEAR}: data slutar {last} (> 3 dygn gammalt)")
    # täckning: ERBJUDNA zonår ska ha < 3 % saknade timmar. Zonår under
    # 90 % täckning erbjuds inte alls (zone_years) och kontrolleras inte —
    # t.ex. DELU före budzonens födelse eller SE-produktion före 2022.
    for name, files in [("spotpris", price_files), ("förbrukning", cons_files),
                        ("produktion", prod_files)]:
        zy = zone_years(files)
        for y, zs in files.items():
            if y == CUR_ISO_YEAR:
                continue
            for z, s in zs.items():
                if y not in zy.get(z, []):
                    continue
                miss = sum(1 for v in s if v is None)
                if miss / len(s) > 0.03 and not (name != "spotpris" and y == 2015):
                    refuse(f"{name} {y} {z}: {miss} saknade timmar (> 3 %)")
    print("Validering: OK")


def last_data_date(series, iso_year):
    """Sista dygn med data i en plattarray för ett ISO-år."""
    last = None
    start = iso_year_start(iso_year)
    for i, v in enumerate(series):
        if v is not None:
            last = i
    if last is None:
        return None
    return start + timedelta(days=last // 24)


# ---------------------------------------------------------------- skrivning
def write_files(measure, unit, files):
    years = []
    for y, zs in sorted(files.items()):
        obj = {
            "measure": measure,
            "unit": unit,
            "isoYear": y,
            "weeks": iso_weeks_in_year(y),
            "partial": y == CUR_ISO_YEAR,
            "dataThrough": (last_data_date(zs["SE"], y).isoformat()
                            if y == CUR_ISO_YEAR and last_data_date(zs["SE"], y) else None),
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
    global FX
    OUT.mkdir(parents=True, exist_ok=True)
    FX = json.load(open(HERE.parent / "data_src" / "fx_eursek.json"))["months"]
    print("Läser ENTSO-E förbrukning (SE-zoner + FI + DELU) …")
    cons = load_entsoe("consumption", per_psr=False, zones=ZONES + ["FI", "DELU"])
    print("Läser ENTSO-E produktion (SE-zoner) …")
    prod = load_entsoe("generation", per_psr=True, zones=ZONES)
    print("Läser landsdata (FR + produktion FI/DELU/FR, EUR→öre via ECB) …")
    prices_c, cons_fr, gen_c = load_countries()
    cons["FR"] = cons_fr["FR"]
    for z, d in gen_c.items():
        prod[z] = d
    print("Läser spotpriser (SE, sqlite) …")
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
    price_c_files = fold_entsoe(prices_c, CONS_YEARS, decimals=2)
    for y, zs in price_c_files.items():
        if y in price_files:
            for z, s in zs.items():
                price_files[y][z] = s
    cons_files = fold_entsoe(cons, CONS_YEARS)
    outliers = screen_outliers(cons_files, "förbrukning")
    rp = HERE.parent / "data_src" / "outlier_report.txt"
    rp.write_text("\n".join(outliers) + "\n" if outliers else "inga\n")
    print(f"Outlier-screening: {len(outliers)} timmar nollade (→ {rp.name})")
    prod_files = fold_entsoe(prod, PROD_YEARS)
    # Sveriges produktion före 2022 var bara vindkraft i ENTSO-E (full täckning
    # men fel totaler) — nollas hårt så zonåren utesluter den (SPEC §4)
    for y, zs in prod_files.items():
        if y < 2022:
            for z in ["SE"] + ZONES:
                if z in zs:
                    zs[z] = [None] * len(zs[z])

    validate(price_files, cons_files, prod_files)

    print("Skriver JSON …")
    index = {
        "measures": {
            "consumption": {
                "label": "Elförbrukning", "unit": "MW",
                "years": write_files("consumption", "MW", cons_files),
                "zoneYears": zone_years(cons_files),
                "scalePerUnit": 0.002, "scaleLabel": "2 mm = 1 GW",
            },
            "production": {
                "label": "Elproduktion", "unit": "MW",
                "years": write_files("production", "MW", prod_files),
                "zoneYears": zone_years(prod_files),
                "scalePerUnit": 0.002, "scaleLabel": "2 mm = 1 GW",
            },
            "price": {
                "label": "Spotpris", "unit": "öre/kWh",
                "years": write_files("price", "öre/kWh", price_files),
                "zoneYears": zone_years(price_files),
                "scalePerUnit": 0.1, "scaleLabel": "1 mm = 10 öre/kWh",
            },
        },
        "zones": ["SE"] + ZONES + COUNTRIES,
        "zoneLabels": ZONE_LABELS,
        "partialYear": CUR_ISO_YEAR,
        "declarations": {
            "SE_price": "Sveriges spotpris = förbrukningsviktat medel av SE1–SE4 "
                        "(timvikter ur ENTSO-E-lasten) fr.o.m. 2015; aritmetiskt "
                        "medel 2008–2014. Före 2011-11-01 var Sverige ett elområde.",
            "time": "Svensk lokaltid; DST-vårens timme saknas, höstens dubbeltimme "
                    "är medelvärdesbildad (spotpris: första timmen).",
            "weeks": "ISO-veckor (mån–sön); ett år = ISO-år.",
            "sources": "Spotpris Sverige: Nord Pool via mgrey.se/espot (öre/kWh, "
                       "dagskurs). Länder (FI, DE–LU, FR): ENTSO-E dagen-före i "
                       "EUR/MWh × ECB:s månadsmedelkurs SEK/EUR. Förbrukning/"
                       "produktion: ENTSO-E Transparency; produktion = summa av "
                       "kraftslag (SE komplett 2022+, FI/FR 2015+, DE–LU 2019+ — "
                       "budzonen DE-LU fanns inte före okt 2018).",
            "outliers": "Förbrukningsdata screenas automatiskt: värden över "
                        "2,5× medianen för samma timme ±7 dygn sätts som saknade "
                        "(kända ENTSO-E-fel där SE1/SE2 flerfaldigas i timmar; "
                        "lista i data_src/outlier_report.txt). Priser screenas "
                        "inte — pristoppar är verkliga.",
            "countries": "Ländernas priser i öre/kWh (svensk valuta) för "
                         "kommensurabilitet; KPI-justering använder svensk KPI "
                         "även för länderna (svenskt penningvärde, deklarerat). "
                         "Totalpris hushåll: Sverige ur SCB EN0301, länderna ur "
                         "Eurostat nrg_pc_204 (samma förbrukningsband; DE–LU "
                         "använder tyska konsumentpriser).",
        },
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
    print(f"Klart: {OUT}")


if __name__ == "__main__":
    main()
