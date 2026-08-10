#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_fx.py — ECB:s månadsmedelkurs SEK/EUR → data_src/fx_eursek.json.
Används för att räkna om ländernas dagen-före-priser (EUR/MWh) till öre/kWh:
öre/kWh = EUR/MWh × SEK/EUR ÷ 10. Deklaration: Sverige använder mgreys
dagskurs, länderna ECB:s månadsmedel — samma underliggande pris, olika
kursupplösning (dokumenterat).
"""
import csv
import io
import json
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data_src" / "fx_eursek.json"
URL = ("https://data-api.ecb.europa.eu/service/data/EXR/M.SEK.EUR.SP00.A"
       "?format=csvdata&startPeriod=2014-01")


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "sweden-electricity/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        text = r.read().decode("utf-8")
    months = {}
    for row in csv.DictReader(io.StringIO(text)):
        months[row["TIME_PERIOD"]] = float(row["OBS_VALUE"])
    if len(months) < 100:
        raise SystemExit(f"BYGGSPÄRR: bara {len(months)} FX-månader — orimligt")
    OUT.write_text(json.dumps({"unit": "SEK per EUR, månadsmedel (ECB)",
                               "months": months}, separators=(",", ":")))
    print(f"FX: {min(months)} → {max(months)} ({len(months)} mån) → {OUT}")


if __name__ == "__main__":
    main()
