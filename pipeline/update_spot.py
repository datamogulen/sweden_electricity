#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
update_spot.py — fyller på data_src/spotprices.sqlite med spotpriser från
mgrey.se/espot (samma källa som byggde databasen; Vattenfalls API är dött,
403 sedan 2026). En förfrågan per dygn, alla fyra områden i samma svar.

Enhet: öre/kWh (verifierat mot befintliga sqlite-värden 2026-02-03; ±0,3 %
mot gamla rader pga växelkurs/kvartsmedel — samma underliggande dagen-före-pris).
Tidsstämplar: svensk lokaltid, som i databasen. Vid DST-höst skrivs första
timvärdet (PK area+ts ger samma beteende som historiken).

Körs dagligen (cron) eller för hand: python pipeline/update_spot.py [--days-back N]
"""
import argparse
import json
import sqlite3
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data_src" / "spotprices.sqlite"
API = "https://mgrey.se/espot?format=json&date={d}"
AREAS = {"SE1": "SN1", "SE2": "SN2", "SE3": "SN3", "SE4": "SN4"}


def fetch_day(d: date):
    req = urllib.request.Request(API.format(d=d.isoformat()),
                                 headers={"User-Agent": "sweden-electricity-relief/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        obj = json.loads(r.read().decode("utf-8"))
    rows = []
    for se, sn in AREAS.items():
        hours = obj.get(se) or []
        for h in hours:
            hh = h.get("hour")
            v = h.get("price_sek")
            if hh is None or v is None:
                continue
            ts = f"{d.isoformat()}T{int(hh):02d}:00:00"
            rows.append((sn, ts, float(v), "öre/kWh"))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days-back", type=int, default=3,
                    help="hämta även N dagar bakåt från senaste (default 3, tål luckor)")
    ap.add_argument("--sleep", type=float, default=0.3)
    args = ap.parse_args()

    con = sqlite3.connect(DB)
    (last_ts,) = con.execute("SELECT MAX(ts) FROM prices WHERE area='SN3'").fetchone()
    start = datetime.fromisoformat(last_ts).date() - timedelta(days=args.days_back)
    end = date.today() + timedelta(days=1)  # morgondagens priser publiceras ~13
    d = start
    total = 0
    while d <= end:
        try:
            rows = fetch_day(d)
        except Exception as e:
            if d >= date.today():
                print(f"{d}: inget svar ({e}) — ok nära idag")
                d += timedelta(days=1)
                continue
            print(f"AVBRYTER: {d}: {e}", file=sys.stderr)
            sys.exit(1)
        if rows:
            # rimlighetsspärr: öre/kWh i intervallet -500..3000, >= 20 rader/dygn
            vals = [r[2] for r in rows]
            if len(rows) < 80 or min(vals) < -500 or max(vals) > 3000:
                print(f"AVBRYTER: {d}: orimliga data ({len(rows)} rader, "
                      f"min {min(vals)}, max {max(vals)})", file=sys.stderr)
                sys.exit(1)
            con.executemany(
                "INSERT OR IGNORE INTO prices(area, ts, value, unit) VALUES (?,?,?,?)", rows)
            con.commit()
            total += len(rows)
        d += timedelta(days=1)
        time.sleep(args.sleep)
    (new_last,) = con.execute("SELECT MAX(ts) FROM prices WHERE area='SN3'").fetchone()
    print(f"Klart: {total} rader upserted; senaste ts nu {new_last}")
    con.close()


if __name__ == "__main__":
    main()
