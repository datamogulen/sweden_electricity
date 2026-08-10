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

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "site" / "data" / "scb.json"
DATA = HERE.parent / "site" / "data"
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


def spot_halfyear_means():
    """Nationellt (viktat) spotmedel per halvår ur redan byggda price_*.json."""
    means = {}
    for f in sorted(DATA.glob("price_*.json")):
        d = json.loads(f.read_text())
        y = d["isoYear"]
        # dag-index → kalenderdatum: ISO-årets måndag i vecka 1
        jan4 = date(y, 1, 4)
        from datetime import timedelta
        start = jan4 - timedelta(days=jan4.isocalendar()[2] - 1)
        se = d["zones"]["SE"]
        for i, v in enumerate(se):
            if v is None:
                continue
            dd = start + timedelta(days=i // 24)
            key = f"{dd.year}H{1 if dd.month <= 6 else 2}"
            s = means.setdefault(key, [0.0, 0])
            s[0] += v
            s[1] += 1
    return {k: v[0] / v[1] for k, v in means.items() if v[1] > 1000}


def main():
    print("Hämtar KPI (2020=100) …")
    kpi = fetch_kpi()
    print(f"  {min(kpi['months'])} → {kpi['ref']} ({len(kpi['months'])} månader)")
    print("Hämtar SCB elpriskomponenter (halvår, hushåll) …")
    elhus = fetch_elhus()
    print(f"  {min(elhus)} → {max(elhus)} ({len(elhus)} halvår)")
    spot = spot_halfyear_means()

    halvar = {}
    for tid, cats in sorted(elhus.items()):
        sm = spot.get(tid)
        halvar[tid] = {}
        for cat, comp in cats.items():
            if "handel" not in comp or "nat" not in comp or "skatt" not in comp:
                continue
            entry = {
                "paslag": round(comp["handel"] - sm, 2) if sm is not None else None,
                "nat": comp["nat"], "skatt": comp["skatt"],
                "scbHandel": comp["handel"], "scbTotal": comp.get("total"),
            }
            halvar[tid][cat] = entry
    # spärr: modellens totalpris ska träffa SCB:s inom 2 öre där båda finns
    worst = 0.0
    for tid, cats in halvar.items():
        sm = spot.get(tid)
        if sm is None:
            continue
        for cat, e in cats.items():
            if e["paslag"] is None or e.get("scbTotal") is None:
                continue
            model = (sm + e["paslag"] + e["nat"] + e["skatt"]) * 1.25
            diff = abs(model - e["scbTotal"])
            worst = max(worst, diff)
            if diff > 2.0:
                raise SystemExit(f"BYGGSPÄRR: modell mot SCB-totalpris {tid} {cat}: "
                                 f"{model:.1f} vs {e['scbTotal']:.1f} öre/kWh (> 2 öre) — "
                                 "momsantagandet eller komponenterna stämmer inte")
    print(f"  Modellkontroll: max avvikelse mot SCB:s totalpris {worst:.2f} öre/kWh")

    OUT.write_text(json.dumps({
        "kpi": kpi,
        "halvar": halvar,
        "categories": CATS,
        "momsFactor": 1.25,
        "model": "timpris = (spot + påslag + nät + elskatt) × 1,25; påslag = "
                 "SCB handelspris − nationellt spotmedel samma halvår",
        "source": "SCB PR0101 KPI2020M + EN0301 SSDHalvarElHus",
        "fetched": date.today().isoformat(),
    }, ensure_ascii=False, separators=(",", ":")))
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
