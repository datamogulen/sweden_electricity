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

## Pipeline (körs om när källdata uppdaterats)

```bash
python pipeline/build_data.py      # sqlite + ENTSO-E-cache → site/data/*.json
python pipeline/extract_glyphs.py  # DejaVu Sans Bold → site/glyphs.json
```

Källor (lokala, se SPEC §4): `spotprices.sqlite` (SN1–SN4, svensk lokaltid,
ISO-år 2008–2025) och ENTSO-E-cachen (UTC; förbrukning 2015–2025, produktion
2022–2025 — före ~nov 2021 rapporterades bara vindkraft per elområde, så de
åren erbjuds inte). Pipelinen **vägrar** vid brott mot referensintervallen
(årssummor i TWh, SE3-medel 2022, täckning).

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

Zip med `*_modell.stl` (datafärg) + `*_text.stl` (kontrastfärg, samma
koordinatsystem — importera BÅDA, auto-arrange av) + `FOLJESEDEL.txt` med
exportens hela tillstånd. Exporten vägrar om soliderna inte är vattentäta
eller text hamnar under 2,2 mm versalhöjd.

## Deklarerade skalor (familjeinvarianter)

| Mått | Skala |
|---|---|
| Förbrukning/produktion | 2 mm = 1 GW |
| Spotpris | 1 mm = 10 öre/kWh |
| Bredd/djup | 1 mm = 1 timme; 1 mm = 1 vecka |

Avsteg (zoom, volymnormering, pristak, sockel) graveras på objektet.

## Deploy (hedin.it)

Inte deployad ännu. När det sker: `site/` → hedin.it med `.htaccess`
`Cache-Control: no-cache, must-revalidate` för HTML från dag ett;
verifiera live med `curl`; uppdatera backup-spegel.
