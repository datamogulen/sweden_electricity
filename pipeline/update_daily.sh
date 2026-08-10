#!/bin/bash
# Daglig datauppdatering: spotpriser (mgrey) + ENTSO-E (senaste 2 månaderna)
# + ombyggda års-JSON. Körs från projektroten. Avbryter på första fel —
# byggspärrarna i build_data.py vägrar hellre än skriver dåliga data.
#
# Cron (lokalt, kl 14:05 — dagen-efter-priser publiceras ~13):
#   5 14 * * * cd ~/Development/sweden_electricity && ./pipeline/update_daily.sh >> data_src/update.log 2>&1
# På hedin.it efter deploy: samma rad med serverns sökväg.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PY:-/Library/Frameworks/Python.framework/Versions/3.12/bin/python3}

echo "=== $(date '+%Y-%m-%d %H:%M') uppdatering börjar ==="
"$PY" pipeline/update_spot.py
"$PY" pipeline/fetch_cache.py --token-dir data_src --cache-dir data_src/entsoe \
      --mode update --recent-months 2 --sleep 0.3
"$PY" pipeline/build_data.py
"$PY" pipeline/fetch_scb.py   # KPI + elpriskomponenter (läser price_*.json → sist)
echo "=== klar ==="
