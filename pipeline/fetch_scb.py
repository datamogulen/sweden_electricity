#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_scb.py — hämtar från SCB:s API och skriver site/data/scb.json:

1. KPI (KPI2020M, 2020=100, 1980M01→senaste) — för "fasta priser".
2. Hushållens elpriskomponenter (SSDHalvarElHus, 2014H2→senaste):
   handelspris, nätpris, elskatt, moms, totalpris (öre/kWh) per
   förbrukarkategori (kWh-klasser DA–DE).
3. Beräknar påslag per halvår och kategori: SCB:s handelspris minus
   spotprisets halvårssnitt (nationellt viktat, ur site/data/price_*.json)
   — så att modellen  timpris = (spot + påslag + nät + skatt) × 1,25
   per konstruktion träffar SCB:s handelspris i halvårssnitt.

BRASKLAPPAR (deklareras även i appens Om-panel):
- SCB-komponenterna är rikssnitt i öre/kWh (fasta avgifter utslagna på
  förbrukningen); zonmodellen använder zonens spot + nationella komponenter.
- Halvår utan SCB-data (t.ex. innevarande) återanvänder senast kända
  komponenter — markeras med "extrapolated": true.
- Momsen modelleras som konstant 25 % (stämmer hela perioden).
"""
import json
import urllib.request
from datetime import date
from pathlib import Path

import os

HERE = Path(__file__).resolve().parent
# EL3D_OUT: på servern läses/skrivs public_html/el3d/data direkt
DATA = Path(os.environ.get("EL3D_OUT", HERE.parent / "site" / "data"))
OUT = DATA / "scb.json"
API = "https://api.scb.se/OV0104/v1/doris/sv/ssd/START"

KPI_TABLE = f"{API}/PR/PR0101/PR0101A/KPI2020M"
ELHUS_TABLE = f"{API}/EN/EN0301/EN0301A/SSDHalvarElHus"
CATS = {"DA": "mindre än 1 000 kWh/år", "DB": "1 000–2 499 kWh/år",
        "DC": "2 500–4 999 kWh/år", "DD": "5 000–14 999 kWh/år",
        "DE": "15 000 kWh/år eller mer (villa med elvärme)"}
CONTENTS = {"000006WO": "handel", "000006WP": "nat", "0000070Q": "skatt",
            "000006WR": "moms", "000006WS": "total"}


def post(url, query):
    req = urllib.request.Request(url, data=json.dumps(query).encode(),
                                 headers={"Content-Type": "application/json",
                                          "User-Agent": "sweden-electricity-relief/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8-sig"))


def fetch_kpi():
    q = {"query": [
        {"code": "ContentsCode", "selection": {"filter": "item", "values": ["00000807"]}},
        {"code": "Tid", "selection": {"filter": "all", "values": ["*"]}},
    ], "response": {"format": "json"}}
    d = post(KPI_TABLE, q)
    months = {}
    for row in d["data"]:
        t = row["key"][-1]              # "2020M06"
        v = row["values"][0]
        if v in ("..", "."):
            continue
        months[t.replace("M", "-")] = float(v)
    ref = max(months)
    return {"base": "2020=100 (skuggindex, hela serien)", "ref": ref, "months": months}


def fetch_elhus():
    q = {"query": [], "response": {"format": "json"}}
    d = post(ELHUS_TABLE, q)
    # kolumnordningen beskriver nyckel- och måttkolumner
    keycols = [c["code"] for c in d["columns"] if c["type"] != "c"]
    valcols = [c["code"] for c in d["columns"] if c["type"] == "c"]
    ci = {c: i for i, c in enumerate(keycols)}
    out = {}
    for row in d["data"]:
        cat = row["key"][ci["Kategorikwh"]]
        tid = row["key"][ci["Tid"]]
        for code, v in zip(valcols, row["values"]):
            if v in ("..", "."):
                continue
            out.setdefault(tid, {}).setdefault(cat, {})[CONTENTS.get(code, code)] = float(v)
    return out


SPOT_ZONES = ["SE", "FI", "DELU", "FR"]


def spot_halfyear_means():
    """Spotmedel per zon och halvår ur redan byggda price_*.json (öre/kWh)."""
    means = {z: {} for z in SPOT_ZONES}
    from datetime import timedelta
    for f in sorted(DATA.glob("price_*.json")):
        d = json.loads(f.read_text())
        y = d["isoYear"]
        jan4 = date(y, 1, 4)
        start = jan4 - timedelta(days=jan4.isocalendar()[2] - 1)
        for z in SPOT_ZONES:
            s = d["zones"].get(z)
            if not s:
                continue
            for i, v in enumerate(s):
                if v is None:
                    continue
                dd = start + timedelta(days=i // 24)
                key = f"{dd.year}H{1 if dd.month <= 6 else 2}"
                acc = means[z].setdefault(key, [0.0, 0])
                acc[0] += v
                acc[1] += 1
    return {z: {k: v[0] / v[1] for k, v in m.items() if v[1] > 1000}
            for z, m in means.items()}


# ----------------------------------------------------- Eurostat (länderna)
EUROSTAT_URL = ("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/"
                "data/nrg_pc_204?format=JSON&unit=KWH&currency=EUR"
                "&geo=FI&geo=DE&geo=FR")
BAND_MAP = {"KWH_LT1000": "DA", "KWH1000-2499": "DB", "KWH2500-4999": "DC",
            "KWH5000-14999": "DD", "KWH_GE15000": "DE"}
GEO_MAP = {"FI": "FI", "DELU": "DE", "FR": "FR"}   # DELU: tyska konsumentpriser


def fetch_eurostat():
    """{geo: {'2023H2': {band: {'xtax':…, 'xvat':…, 'itax':…}}}} i EUR/kWh."""
    req = urllib.request.Request(EUROSTAT_URL,
                                 headers={"User-Agent": "sweden-electricity/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read().decode("utf-8"))
    ids = d["id"]
    sizes = d["size"]
    cats = {dim: d["dimension"][dim]["category"]["index"] for dim in ids}
    inv = {dim: {i: code for code, i in cats[dim].items()} for dim in ids}
    out = {}
    for flat_str, val in d["value"].items():
        flat = int(flat_str)
        idx = {}
        rem = flat
        for dim, size in zip(reversed(ids), reversed(sizes)):
            idx[dim] = rem % size
            rem //= size
        band = BAND_MAP.get(inv["nrg_cons"][idx["nrg_cons"]])
        if band is None:
            continue
        geo = inv["geo"][idx["geo"]]
        tax = {"X_TAX": "xtax", "X_VAT": "xvat", "I_TAX": "itax"}[inv["tax"][idx["tax"]]]
        tid = inv["time"][idx["time"]].replace("-S", "H")
        out.setdefault(geo, {}).setdefault(tid, {}).setdefault(band, {})[tax] = val
    return out


def fx_halfyear_means():
    fx = json.loads((HERE.parent / "data_src" / "fx_eursek.json").read_text())["months"]
    acc = {}
    for m, v in fx.items():
        y, mm = m.split("-")
        key = f"{y}H{1 if int(mm) <= 6 else 2}"
        a = acc.setdefault(key, [0.0, 0])
        a[0] += v
        a[1] += 1
    return {k: v[0] / v[1] for k, v in acc.items()}


def main():
    print("Hämtar KPI (2020=100) …")
    kpi = fetch_kpi()
    print(f"  {min(kpi['months'])} → {kpi['ref']} ({len(kpi['months'])} månader)")
    print("Hämtar SCB elpriskomponenter (halvår, hushåll) …")
    elhus = fetch_elhus()
    print(f"  {min(elhus)} → {max(elhus)} ({len(elhus)} halvår)")
    spot = spot_halfyear_means()

    halvar = {}
    se_spot = spot["SE"]
    for tid, cats in sorted(elhus.items()):
        sm = se_spot.get(tid)
        halvar[tid] = {}
        for cat, comp in cats.items():
            if "handel" not in comp or "nat" not in comp or "skatt" not in comp:
                continue
            entry = {
                "paslag": round(comp["handel"] - sm, 2) if sm is not None else None,
                "fasta": round(comp["nat"] + comp["skatt"], 2),
                "moms": 1.25,
                "nat": comp["nat"], "skatt": comp["skatt"],
                "scbHandel": comp["handel"], "scbTotal": comp.get("total"),
            }
            halvar[tid][cat] = entry
    # spärr: modellens totalpris ska träffa SCB:s inom 2 öre där båda finns
    worst = 0.0
    for tid, cats in halvar.items():
        sm = se_spot.get(tid)
        if sm is None:
            continue
        for cat, e in cats.items():
            if e["paslag"] is None or e.get("scbTotal") is None:
                continue
            model = (sm + e["paslag"] + e["fasta"]) * e["moms"]
            diff = abs(model - e["scbTotal"])
            worst = max(worst, diff)
            if diff > 2.0:
                raise SystemExit(f"BYGGSPÄRR: modell mot SCB-totalpris {tid} {cat}: "
                                 f"{model:.1f} vs {e['scbTotal']:.1f} öre/kWh (> 2 öre) — "
                                 "momsantagandet eller komponenterna stämmer inte")
    print(f"  Modellkontroll (SE): max avvikelse mot SCB:s totalpris {worst:.2f} öre/kWh")

    # länderna: Eurostat-komponenter kalibrerade mot respektive lands spot
    print("Hämtar Eurostat nrg_pc_204 (FI, DE, FR) …")
    es = fetch_eurostat()
    fxh = fx_halfyear_means()
    halvarC = {}
    worst_c = 0.0
    for zone, geo in GEO_MAP.items():
        zdata = es.get(geo, {})
        zspot = spot.get(zone, {})
        halvarC[zone] = {}
        for tid, bands in sorted(zdata.items()):
            fx = fxh.get(tid)
            sm = zspot.get(tid)
            if fx is None:
                continue
            halvarC[zone][tid] = {}
            for band, p in bands.items():
                if not all(k in p for k in ("xtax", "xvat", "itax")) or p["xvat"] <= 0:
                    continue
                ore = lambda eur: eur * fx * 100.0
                moms = p["itax"] / p["xvat"]
                fasta = ore(p["xvat"] - p["xtax"])
                paslag = round(ore(p["xtax"]) - sm, 2) if sm is not None else None
                entry = {"paslag": paslag, "fasta": round(fasta, 2),
                         "moms": round(moms, 4), "esTotalOre": round(ore(p["itax"]), 2)}
                halvarC[zone][tid][band] = entry
                if paslag is not None:
                    model = (sm + paslag + fasta) * moms
                    diff = abs(model - ore(p["itax"]))
                    worst_c = max(worst_c, diff)
                    if diff > 2.0:
                        raise SystemExit(f"BYGGSPÄRR: {zone} {tid} {band}: modell "
                                         f"{model:.1f} vs Eurostat {ore(p['itax']):.1f} öre")
        n = sum(len(v) for v in halvarC[zone].values())
        print(f"  {zone} (geo {geo}): {len(halvarC[zone])} halvår, {n} poster")
    print(f"  Modellkontroll (länder): max avvikelse {worst_c:.2f} öre/kWh")

    OUT.write_text(json.dumps({
        "kpi": kpi,
        "halvar": halvar,
        "halvarC": halvarC,
        "categories": CATS,
        "momsFactor": 1.25,
        "model": "timpris = (spot + påslag + fasta komponenter) × momsfaktor; "
                 "påslaget kalibreras per halvår mot SCB (Sverige) resp. "
                 "Eurostat nrg_pc_204 (FI/DE/FR, EUR→öre via ECB-halvårskurs). "
                 "DELU använder tyska konsumentpriser.",
        "source": "SCB PR0101 KPI2020M + EN0301 SSDHalvarElHus + "
                  "Eurostat nrg_pc_204",
        "fetched": date.today().isoformat(),
    }, ensure_ascii=False, separators=(",", ":")))
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
