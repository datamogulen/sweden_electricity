# Spec: El i Sverige över tid — kalenderrelief (webb + STL)

Datafysikalisering av svensk el (förbrukning, produktion, spotpris) som
kalenderrelief av fjärrvärmetypen (artikeln §4.4), webbtvilling med strikt
WYSIWYG STL-export. Skriven i designgrammatikens termer
(`~/Development/datafysikalisering-designflode/`). Koder F/O/D nedan är
projektinterna etiketter med artikelns begrepp som kanon.

Status: spec v1, 2026-08-09. D-besluten är beställarens att riva upp —
revisioner dokumenteras i `SPEC_REVISIONS.md`, originalen försvaras inte.

**OBS 2026-08-10:** fem revisioner har genomförts efter beställarens första
granskning (D2 negativa priser → klipp + tvilling; årsskåror; undersida med
QR/källtext/bakgrundsdel; upplösningsval D6; data till idag med daglig
uppdatering). Texten nedan är ORIGINALSPECEN — läs den tillsammans med
[SPEC_REVISIONS.md](SPEC_REVISIONS.md).

---

## 0. Fråga-först: vad varje mått svarar på

| Mått | Enhet (verklig, ej fejkad) | Frågan måttet besvarar |
|---|---|---|
| Elförbrukning | MW (medeleffekt per timme) | När på dygnet, veckan och året använder Sverige/elområdet mest el? |
| Elproduktion | MW (medeleffekt per timme) | När produceras elen — och hur skiljer sig produktionens rytm från förbrukningens? |
| Spotpris | öre/kWh (dagen-före-pris, nominellt) | När är elen dyr respektive billig — och hur ofta, och när, är priset extremt eller negativt? |

Paren är del av designen: förbrukning↔produktion (attribution, D13),
förbrukning↔spotpris (multiplikationen bakom kostnad), elområde↔elområde
(volymnormerad formjämförelse, O2).

## 1. Familj före form — invarianter

Artefakten ska vara kommensurabel med:

1. **Fjärrvärmeparet BRF Nyboda 1 2024** (förlagan) — samma XY-layout.
2. **Andra år av sig själv** — samma mm-skalor alla år; två utskrifter
   från olika år ställs bredvid varandra och jämförs direkt.
3. **Andra elområden** — samma skala gör att SE1+SE2+SE3+SE4 volymmässigt
   summerar till Sverigemodellen (O2-stapling i vikt/volym).
4. **Förbrukning mot produktion** — samma mm/MW-skala för båda.

**Frusna XY-invarianter (ärvda från förlagan, ändras aldrig):**

| Parameter | Värde |
|---|---|
| Stapel (timme) | 1,0 × 1,0 mm |
| Dygnsblock | 24 mm + 1 mm mellanrum |
| Veckorad (djup) | 1,0 mm |
| Databredd | 7×24 + 6×1 = 174 mm |
| Front-apron (titel + veckodagar) | 12 mm (band 0–6 titel, 6–12 veckodagar) |
| Höger-apron (år + veckonummer) | 18 mm |
| Basplatta | 1,2 mm |
| Text | DejaVu Sans Bold, upphöjd 1,0 mm (0,2 mm inbäddad), separat enfärgs-STL |

**Deklarerade Z-skalor per mått (familjeinvarianter, D5):**

| Mått | Skala | Typiskt utfall |
|---|---|---|
| Förbrukning | **2 mm = 1 GW** (0,002 mm/MW) | Sverige 16–54 mm; SE3 ~32 mm max |
| Produktion | **2 mm = 1 GW** (samma som förbrukning) | Sverige upp till ~64 mm |
| Spotpris | **1 mm = 10 öre/kWh** | medel 4–14 mm; toppar 2022: 85 mm; 2009–10: 146 mm (se D3) |

Avsteg från skalorna (zoom för små elområden, volymnormering) är tillåtna
endast som **deklarerade lägen**: faktorn graveras i titelbandet och står i
följesedeln.

## 2. Grammatikkategorisering

**Form: F3, temporal foldning (kalenderrelief).** Timserie foldad till
vecka×timme-matris: X = timme i veckan (7 dygnsblock à 24 staplar),
Y (djup) = vecka, Z = mätvärdet. Radled visar veckans sociala rytm,
kolumnled årstidernas naturliga rytm — elen är precis superpositionen av
de två (D9). F1/F4 bortvalda: frågan är rytmisk, inte rumslig; elområdes-
dimensionen hanteras som familj (O2), inte karta.

**Operatorer:**
- **O2 (kommensurabla familjer)** — kärnoperatorn: fasta skalor över år,
  elområden och måttparet förbrukning/produktion; volymnormering som
  deklarerat specialläge (formjämförelse oberoende av enhet, förlagans
  energi/kostnad-mekanism).
- **O3 (utbytbara moduler)**: år, elområde, mått och pristak är utbytbara
  konfigurationer av samma form; taket är den fysiska cap-modulens digitala
  motsvarighet.
- **O4 (fysisk-digital koppling)**: webbtvilling med strikt WYSIWYG-export —
  samma solidbygge driver skärmvyn och STL:en; tak och normering repeteras
  i tvillingen innan de fryses i plast (rehearse-then-freeze).
- **O1 (fysiska referenser)**: används inte i v1 (ingen referenshylsa);
  medelnivå per år är kandidat till syskonversion — dokumenterat bortval.
- **O5**: ej tillämplig (ingen naturlig enhetsreferens). Dokumenterat.

**Layoutbeslut utöver förlagan — flerårsläge:** rader läggs kronologiskt
med **tiden växande mot betraktaren**: januari år X+1 hamnar direkt framför
december år X ("rygg mot rygg", sömlös tid). Inom ett år ligger därmed v52
närmast fronten och v1 längst bak — **omvänt mot förlagan**, som hade v1
främst men bara ett år. Priset för sömlösheten är riktningsbytet;
höger-apronens vecko- och årsetiketter gör riktningen självdokumenterande.
(D-beslut, öppet för revision.)

**Veckodefinition:** ISO-veckor (mån–sön), radantal 52 eller 53 per ISO-år;
årsgräns = veckogräns, så varje rad är alltid en hel vecka och flerårsstaplar
är exakta. Ett "år" i systemet = ISO-år (kan innehålla enstaka dagar från
grannkalenderår; deklareras i följesedeln).

## 3. Beslutsdimensioner D1–D13

- **D1 Lagersemantik:** en datafärg + en textfärg (2 filament). Ingen
  färgkodning av värden i v1 — formen är budskapet, som i förlagan.
  Produktion per kraftslag som färglager = dokumenterat framtida syskon.
- **D2 Nollnivå och negativa värden:** nollplanet = apronens ovansida.
  För mått utan negativa värden ligger nollplanet på basplattan (1,2 mm)
  precis som förlagan. När urvalet innehåller negativa spotpriser höjs
  hela apron-/nollplanet med en sockel som rymmer det (kapade) minimivärdet,
  avrundad uppåt till hel mm; negativa timmar blir **gropar** i sockeln.
  Sockelhöjden graveras i titelbandet ("0 = +7 MM"). Ingen klippning —
  klippning är avvisad som ohederlig i korpusen.
- **D3 Extremvärden och tak:** default **inget tak** (ärligt). UI:t har ett
  takreglage (öre/kWh) med hint när urvalets max > 400 öre ("toppar blir
  sköra 1 mm²-pelare — överväg tak"). Aktivt tak ger platå + gravyr
  "TAK 300 ÖRE" i titelbandet och rad i följesedeln. Golv-tak för negativa
  priser: −100 öre (under det kapas mot sockelbotten, deklareras). 2009/2010
  års 1 400-örestoppar är just fallet där taket behövs; utan tak vägrar
  bygget inte, men varnar.
- **D4 Normalisering:** absoluta MW respektive öre/kWh är huvudläsningen
  (deklarerad). Volymnormering är den enda normeringen i v1: valfri
  referensserie (annat mått/elområde/samma år), faktorn k = V_ref/V_egen
  appliceras på höjder, graveras "NORM ×k" och deklareras med parets
  byteshandel: absolut läsbarhet offras för formjämförelse (förlagans
  energi/kostnad-regel). Per capita/BNP: dokumenterade framtida syskon.
- **D5 Kommensurabilitet:** skalorna i §1 gäller alla exporter och graveras
  inte (de är familjens tysta konstant) men står i följesedel + Om-panel
  med exakta tal. Varje avsteg (zoom ×N för litet elområde, normering)
  graveras på objektet självt.
- **D6 Upplösning/läsbarhet/printbarhet:** timupplösning är formens poäng;
  1 mm² staplar är förlagans beprövade val. Saknade timmar (DST-vår,
  dataluckor, ofullständiga kantveckor) renderas på nollplanet och
  deklareras med antal i följesedeln; höstens dubbeltimme medelvärdesbildas
  (deklarerat). Textgolv: versalhöjd ≥ 2,2 mm hård spärr, ≥ 2,6 mm
  föredraget, radavstånd 1,45 × versalhöjd — byggspärr som vägrar, inte
  krymper.
- **D7 Aggregeringsnivå:** nation och elområde (SE1–SE4). Hela Sverige är
  huvudvyn. Elområde är samma form, samma skalor. Sverige = summan av
  områdena (förbrukning/produktion) respektive förbrukningsviktat medel
  (spotpris, se Datahederlighet).
- **D8 Materialbudget:** en färgväxling per lager-z räcker (texten är enda
  andra färgen och ligger i ett smalt z-band) — stående utskrift, få byten.
  Sockeln (D2) är död volym och hålls minimal (följer urvalets minimum, inte
  ett fast värde) — läxan från Europa-panelernas 9→3 mm.
- **D9 Periodicitet:** vecka×timme korsar social och naturlig rytm — det är
  formens hela argument (artikeln §4.4). Årsfoldning bortvald: elens
  veckorytm är halva budskapet.
- **D10 Självförklaring:** objektet bär titel (mått, omfång, år, ev. tak/
  norm/sockel), veckodagar, år och valbara veckonummer (default v1/v26/v52)
  — element-identifiering i alla lägen (petrol-läxan). Djup förklaring bor
  i tvillingen och följesedeln. Ingen QR i v1 (dokumenterat bortval:
  förlagan har ingen; kandidat för undersidan i revision).
- **D11 Upplevd storlek:** höjd bär datat men volym uppfattas — ett år med
  dubbelt medelpris ser mer än dubbelt "tyngre" ut. Motmedel: skalorna i
  följesedeln, jämförelse sida-vid-sida är familjens läsart. Volymnormerade
  par jämför form, inte mängd — deklareras alltid.
- **D12 Kuratering:** alla hela ISO-år i datat är exporterbara (ingen
  körsbärsplockning); default-urval = senaste hela året. Teckningsytan
  sätter praktisk gräns ~4 år per utskrift (bäddjup); UI varnar, delning
  per år är dokumenterad framtida funktion.
- **D13 Attribution:** produktion bokförs där den produceras, förbrukning
  där den förbrukas — parning av de två per elområde ÄR systemets
  attributionsläsning (SE1/SE2 producerar, SE3/SE4 förbrukar). Sveriges
  "spotpris" är en konstruktion (viktat medel) och deklareras som sådan.

## 4. Datakällor och datahederlighet

| Data | Källa (lokal) | Täckning (hela ISO-år) | Verifierat |
|---|---|---|---|
| Spotpris SE1–SE4, öre/kWh, timvis | `hedin.it_backup/public_html/spotpriser_data/spotprices.sqlite` (SN1–SN4) | **2008–2025** | Svensk lokaltid (23 rader 2024-03-31 ✓); SE3-medel 2022 = 137,9 öre ≈ publikt ~138 ✓ |
| Förbrukning SE1–SE4, MW, timvis | ENTSO-E-cache `entsoe/cache/consumption_*.json` (UTC) | **2015–2025** | Nationellt 8,1–26,7 GW, < 2 nulltimmar/år ✓ |
| Produktion SE1–SE4, MW, timvis | samma cache, `generation_*.json`, summa över kraftslag B01–B20 | **2022–2025** | Före ~nov 2021 rapporterades bara vindkraft (B19) per område → åren 2015–2021 **erbjuds inte** (hellre inget än fel) |

Deklarationer som följer med systemet:
- Sveriges spotpris = förbrukningsviktat medel av SE1–SE4 (timvikter från
  ENTSO-E-lasten) för 2015+; aritmetiskt medel 2008–2014 (vikter saknas),
  deklarerat. Före 2011-11-01 var Sverige ett elområde (serierna nära
  identiska).
- Spotpriserna är nominella öre/kWh utan skatt, moms, påslag och nätavgift.
- ENTSO-E-lasten underskattar SCB:s totala elanvändning något (mätpunktsskillnad);
  referenskontroll i pipelinen: nationell årssumma inom 120–160 TWh
  (förbrukning) resp. 130–180 TWh (produktion), annars vägrar bygget.
- Källtrappa: detta är harmoniserad databas (ENTSO-E/Nord Pool via mgrey),
  inte nationell källa (SvK/SCB) — dokumenterat i Om-panelen.

## 5. Arkitektur (steg 3 i designflödet)

- `pipeline/build_data.py` — Python. Läser sqlite + ENTSO-E-cache,
  konverterar UTC→Europe/Stockholm, foldar till ISO-vecka×168-timmar,
  validerar mot referensvärden (vägrar vid brott), skriver
  `site/data/{matt}_{ar}.json` (plattarray per zon, null = saknad timme)
  + `site/data/index.json` (tillgängliga år per mått).
- `pipeline/extract_glyphs.py` — DejaVu Sans Bold → `site/glyphs.json`
  (konturer, hål via nästningsdjup/containment — inte orientering; extra
  spårning 0,03 em).
- `site/index.html` + `site/app.js` — vanilla JS + Three.js r128 (cdnjs),
  egen orbit (fri polarvinkel). Ljus varm beige UI (#F7F2E6), aldrig mörk.
  Geometrikärnan i `/*STL-CORE-BEGIN*/…END*/`-block: **samma kod bygger
  Three-vyn och binär STL** (WYSIWYG som arkitektur).
- Solidbygge: hela plattan (bas + aproner/sockel + staplar/gropar) som
  **en konform heightfield-solid** över ett tensorproduktsrutnät
  (cell-per-cell-toppar, väggar endast där grannhöjd skiljer, en
  segmentering per rutnätslinje) — vattentät by construction, ingen CSG,
  inga T-korsningar. Text som egna vattentäta glyfsolider (earcut inlinad,
  en polygon med hål åt gången), 0,2 mm inbäddade i apronen (medvetet
  överlapp — exakt tangering är det farliga fallet).
- Export: ZIP (egen writer, verifierad med `unzip -t`) med modell-STL,
  text-STL (samma koordinatsystem), `FOLJESEDEL.txt` med exportens HELA
  tillstånd: mått, omfång, år, skalor, tak, sockel, normering, saknade
  timmar, källor, vilken fil som innehåller vad, "importera ALLA filer".
- Deploy: hedin.it med `Cache-Control: no-cache, must-revalidate` för HTML
  från dag ett.

## 6. Verifiering (steg 4) och Definition of Done

Automatiska kontroller (Node-test kör produktionskodens STL-CORE-block,
inte en kopia):

1. Varje solid vattentät (varje riktad kant har exakt en motpartner) och
   volym > 0 — testat även mot känt-dåligt indata (spärren ska bevisas
   avfyra).
2. Referensvärden: stickprov ur STL-höjder mot källdatabasens värden
   (± 0,5 %); årssummor inom deklarerade intervall.
3. Textgolv: varje satt blocks versalhöjd ≥ 2,2 mm, spärr som vägrar;
   tabellen över samtliga block skrivs i byggloggen.
4. Volymnormering: normerat pars totalvolym = referensens ± 0,5 %.
5. Flerårskontinuitet: sista raden år X och första raden år X+1 är
   grannar utan lucka; radantal = summan av årens ISO-veckor.
6. ZIP genom riktig `unzip -t`.

Kanal 2 och 3 (foto av utskrift; beställarens ögon) planeras in:
**räkna med rättelserundor efter "färdigt"; invändningarna är designdata.**

Definition of Done v1:
- [ ] Pipeline bygger alla års-JSON utan varningar; validering grön.
- [ ] Webbtvilling: mått × omfång (SE, SE1–SE4) × år (en eller flera,
      rygg-mot-rygg) × tak × normering; allt exporterbart.
- [ ] STL-export vattentät, i deklarerade skalor, med text-STL och
      följesedel; Node-testet grönt inkl. känt-dåligt-test.
- [ ] Om-panel med alla deklarationer och grammatikkategoriseringen.
- [ ] README med deploy, pipeline-körning och denna kategorisering.
- [ ] Beställaren har granskat tvillingen på skärm (steg 4, kanal 3).
