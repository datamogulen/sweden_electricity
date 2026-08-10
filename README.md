# El i Sverige över tid — kalenderrelief (webb + STL)

Datafysikalisering av svensk el som **kalenderrelief** (fjärrvärmetypen ur
TEI'27-artikelns §4.4): varje stapel en timme (1 mm), varje dygnsblock 24 mm,
varje rad en ISO-vecka. Tre mått — **elförbrukning**, **elproduktion**,
**spotpris** — för hela Sverige och per elområde SE1–SE4, ett eller flera år
rygg mot rygg. Webbtvilling med strikt WYSIWYG STL-export.

Designen följer designflödet i `~/Development/datafysikalisering-designflode/`.
Full spec med grammatikkategorisering: **[SPEC.md](SPEC.md)**. Revisioner av
D-beslut dokumenteras i `SPEC_REVISIONS.md` (skapas vid första revisionen).

## Köra lokalt

```bash
cd site && python -m http.server 8742
# öppna http://localhost:8742
```

(`file://` fungerar inte — appen hämtar data med fetch.)

## Data och daglig uppdatering

Källorna ligger projektlokalt i `data_src/` (utanför git; seedade från
hedin.it-backupen): `spotprices.sqlite` (SN1–SN4, svensk lokaltid, öre/kWh)
och ENTSO-E-cachen (UTC, MW). Täckning: spotpris ISO-2008 → idag,
förbrukning 2015 → idag, produktion 2022 → idag (före ~nov 2021
rapporterade ENTSO-E bara vindkraft per elområde, så de åren erbjuds inte).
Pågående ISO-år byggs som partiellt (`partial` + `dataThrough`).

```bash
./pipeline/update_daily.sh           # mgrey + ENTSO-E + länder + FX + ombyggda års-JSON
./pipeline/update_daily.sh --deploy  # …och spegla site/data → hedin.it/el3d (lftp)
# cron: 5 14 * * * cd ~/Development/sweden_electricity && ./pipeline/update_daily.sh --deploy >> data_src/update.log 2>&1
```

Delsteg: `update_spot.py` (mgrey.se/espot — Vattenfalls gamla API är dött,
403), `fetch_cache.py` (ENTSO-E, token i `data_src/entsoe_token.txt` — får
ALDRIG committas), `build_data.py` (foldning + validering; **vägrar** vid
brott: årssummor i TWh, SE3-medel 2022, täckning, data äldre än 3 dygn för
pågående år). Engångssteg: `extract_glyphs.py` (font). QR-koden genereras i körtid av
appen (payload = exportens konfiguration) och verifieras i Node-testet
genom riktig cv2-avkodning (`test/decode_qr.py`).

## Test

```bash
node test/geometry_test.js
```

Extraherar `/*STL-CORE-BEGIN*/…END*/`-blocket ur `site/app.js` (produktions-
koden, inte en kopia) och kör 99 kontroller: vattentäthet (varje riktad kant
exakt en motpartner) + volym > 0 för modell- och textsolider i riktiga
konfigurationer, stickprov STL-höjd mot källdata, flerårskontinuitet,
volymnormering ±0,5 %, textgolv 2,2 mm, analytisk glyfvolym (fångar
"vattentät men fylld"), binär STL, zip genom riktig `unzip -t` — samt
kända-dåliga indata som bevisar att varje spärr avfyrar.

## Arkitektur

- `site/app.js` — geometrikärnan i STL-CORE-blocket (höjdfält med
  zip-väggar, glyfprismor med earcut, binär STL, vattentäthetskontroll,
  zip-writer) + app (Three.js-vy, UI, följesedel). Samma solidbygge driver
  vyn och exporten.
- `site/index.html` — UI (ljus varm beige, inga mörka bakgrunder).
- `site/glyphs.json` — DejaVu Sans Bold-konturer; hål och föräldrar klassade
  geometriskt (nästningsdjup/containment) i pipeline.
- `site/data/` — per-års-JSON + `index.json` med deklarationer.

## Export

Zip med fyra STL-filer i samma koordinatsystem (importera ALLA, auto-arrange
av): `*_modell.stl` (datafärg), `*_text.stl` (toppkontrast), 
`*_under_botten.stl` (ljust bakgrundsskikt 0–0,6 mm över hela undersidan),
`*_under_tryck.stl` (mörk QR + speglad källtext) — plus
`*_negativ_modell.stl` (tvillingen) när urvalet har negativa priser, och
`FOLJESEDEL.txt` med exportens hela tillstånd. Exporten vägrar om någon
solid inte är vattentät eller text hamnar under 2,2 mm versalhöjd.
Undersidans QR bär **exakt den exporterade vyn**:
`HTTPS://HEDIN.IT/R/EL3D/<KOD>` där koden är exportens konfiguration
(t.ex. `SFI.22-24.D.C300` = spotpris Finland 2022–2024, dygnsmedel,
tak 300) — samma kod som sidans #hash och den delbara länken. Typisk
export = QR v2 (25×25 moduler à 1,4 mm); bygget vägrar bortom v5 eller om
symbolen inte ryms. Redirecten går via sajtens centrala tabell
`r/index.php` (sökvägsform, konfigurationen vidarebefordras som #fragment;
versioneras i hedin_cleanup-repot med `r/.htaccess`). Appen deployas på
`hedin.it/el3d/` — den läsbara undersidestexten pekar dit direkt.

## Deklarerade skalor (familjeinvarianter)

| Mått | Skala |
|---|---|
| Förbrukning/produktion | 2 mm = 1 GW |
| Spotpris | 1 mm = 10 öre/kWh |
| Bredd/djup | 1 mm = 1 timme; 1 mm = 1 vecka |

Avsteg (zoom, volymnormering, pristak, sockel) graveras på objektet.

## Deploy (hedin.it)

**Live på <https://hedin.it/el3d/>** (2026-08-10). Metod: lftp-spegling över
SFTP (shell avstängt på kontot), nyckel `~/.ssh/hedin_deploy`:

```bash
lftp -e "set sftp:connect-program 'ssh -a -x -i ~/.ssh/hedin_deploy -o IdentitiesOnly=yes -o BatchMode=yes'; \
  open sftp://bjornh:@hedin.it:22; mirror -R site public_html/el3d; bye"
```

`site/.htaccess` sätter `Cache-Control: no-cache, must-revalidate` för
html/js/json (G13-läxan). QR-redirecten `r/EL3D[/KOD]` ligger i den centrala
`r/`-tabellen (deployas från hedin_cleanup-repot). Daglig datauppdatering:
cronraden ovan med `--deploy`. Efter appändringar: full spegling + uppdatera
backup-spegeln i `~/Development/hedin.it_backup/public_html/el3d/`.
