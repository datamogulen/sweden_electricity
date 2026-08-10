#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
update_daily_server.py — daglig datauppdatering PÅ hedin.it (panel-cron;
SSH-shell är avstängt men cronjobb kör Python utmärkt — bevisat av den
gamla entsoe-cronen). Ren Python, ingen bash.

Serverlayout:
  ~/el3d/pipeline/*.py       (dessa skript)
  ~/el3d/data_src/           (sqlite, ENTSO-E-cache, FX — UTANFÖR public_html)
  ~/public_html/el3d/data/   (byggda JSON — skrivs direkt via EL3D_OUT)

Cronrad (cPanel):
  5 14 * * * cd $HOME/el3d && python3 pipeline/update_daily_server.py >> update.log 2>&1

Avbryter på första fel — byggspärrarna vägrar hellre än skriver dåliga data.
"""
import os
import subprocess
import sys
import urllib.request
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("EL3D_OUT",
                          Path.home() / "public_html" / "el3d" / "data"))


def run(desc, args, env_extra=None):
    print(f"--- {desc}", flush=True)
    env = dict(os.environ)
    env["EL3D_OUT"] = str(OUT)
    if env_extra:
        env.update(env_extra)
    r = subprocess.run([sys.executable] + args, cwd=ROOT, env=env)
    if r.returncode != 0:
        print(f"AVBRYTER: {desc} gav exit {r.returncode}", flush=True)
        sys.exit(r.returncode)


def main():
    print(f"=== {datetime.now():%Y-%m-%d %H:%M} uppdatering börjar "
          f"(ut: {OUT}) ===", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    run("spotpriser (mgrey)", ["pipeline/update_spot.py"])
    run("ENTSO-E SE-zoner (senaste 2 mån)",
        ["pipeline/fetch_cache.py", "--token-dir", "data_src",
         "--cache-dir", "data_src/entsoe", "--mode", "update",
         "--recent-months", "2", "--sleep", "0.3"])
    run("länder (FR + produktion FI/DELU/FR)", ["pipeline/fetch_countries.py"])
    run("valutakurs (ECB)", ["pipeline/fetch_fx.py"])
    run("bygg års-JSON (validering + outlier-screening)", ["pipeline/build_data.py"])
    run("SCB/Eurostat (KPI + priskomponenter)", ["pipeline/fetch_scb.py"])

    # slutkontroll: liveindex ska vara byggt idag
    with urllib.request.urlopen("https://hedin.it/el3d/data/index.json",
                                timeout=30) as r:
        body = r.read().decode("utf-8")
    stamp = date.today().isoformat()
    if f'"built": "{stamp}' not in body and f'"built":"{stamp}' not in body:
        print("VARNING: index.json på live saknar dagens byggstämpel", flush=True)
        sys.exit(1)
    print("=== klar — liveindex byggt idag ===", flush=True)


if __name__ == "__main__":
    main()
