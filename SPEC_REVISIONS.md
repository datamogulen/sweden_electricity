# Spec-revisioner — El i Sverige över tid

Designflödets förväntan (artikelns fynd 2): flera av specens frusna
representationsbeslut rivs upp mot skärm, munstycke och beställare.
Revisionerna dokumenteras här i stället för att originalen försvaras.
Ursprunglig spec: [SPEC.md](SPEC.md). Ursprungsversionen av systemet är
taggad `v1-ursprunglig` i git.

## Revision 1 — D2: negativa priser (2026-08-10, beställarens granskning)

**Original:** nollplanet höjs med en sockel när urvalet innehåller negativa
spotpriser; negativa timmar blir gropar i sockeln.

**Utfall vid granskning:** groparna syntes inte på skärmen, och sockeln
kostade filament över hela plattan (död volym — D8-läxan originalet
citerade träffade dess eget beslut).

**Nytt beslut:** negativa priser **klipps till 0** i huvudmodellen —
deklarerat och räknat i följesedel och readout — och redovisas i en
**negativ-tvilling**: samma layout och skalor, enbart beloppen |öre/kWh| av
de negativa timmarna, utan texter/undersida, egen STL i exporten (tak 100
öre för belopp, deklarerat). Klippning utan redovisning avvisades i
korpusen som ohederlig; klippning MED tvilling flyttar informationen till
ett eget objekt i stället för att gömma den. Paret är en O2-komposition.

## Revision 2 — layout: årsskåror (2026-08-10, beställarens granskning)

**Original:** årsblock direkt rygg mot rygg utan markering; årtal på höger
apron enda ledtråden, tvetydigt vilken sida av etiketten som var "året".

**Nytt beslut:** 1 mm **skåra på nollplansnivå** mellan årsblocken — samma
formspråk som dygnsskårorna i X-led. Årtalsetiketten sitter vid sitt blocks
framkant (nyaste veckan).

## Revision 3 — D10: undersida med QR och källtext (2026-08-10)

**Original:** ingen QR (dokumenterat bortval med hänvisning till förlagan).

**Nytt beslut (beställarens begäran):** undersidan bär QR
(`HTTPS://HEDIN.IT/EL3D`, v1, 21×21, 1,4 mm/modul — golv 1,25) och speglad
källtext som **flush tvåfärgstryck** i skiktet 0–0,6 mm: en ljus
bakgrundsdel över HELA undersidan + en mörk tryckdel, så kontrasten är
oberoende av stapelfärgen (beställarens poäng: blå staplar gör både vitt
och svart oläsbart utan eget bottenskikt). Färg, inte djup (praxis §2.4).
QR-matrisen genereras i pipeline och verifieras genom riktig avkodning
(cv2) + återläsning ur de exporterade trianglarna i Node-testet.
Modellens botten höjdes 0 → 0,6 mm för skiktet.

## Revision 4 — D6: upplösning som synligt val (2026-08-10)

**Tillägg (beställarens begäran):** valbar utjämning — glidande medel
(centrerat, valbart antal timmar) samt dygns-/vecko-/månadsmedel.
Aggregeringen slätar timtopparna (artikelns D6-exempel) och graveras
därför på objektet (GLID 24 H, DYGNSMEDEL, …); appliceras även på
normeringsreferensen och tvillingen. Saknade timmar förblir saknade.

## Revision 6 — granskningsrunda 2 (2026-08-10, beställarens begäran)

1. **Undersidans layout är djupberoende:** modeller djupare än breda (långa
   tidsserier) lägger källtexten över hela bredden och QR-koden under
   textblocket, nära fronten; breda modeller behåller sida-vid-sida.
2. **Negativa värden digitalt som nedåtstaplar:** webbtvillingen visar
   negativa timmar hängande under plattan (där fungerar det); utskriften
   behåller klippning + tvilling. Avsteget från strikt WYSIWYG är medvetet
   och deklarerat: nedåtstaplarna ÄR tvillingens innehåll, visat på plats.
3. **Tvillingen kan speglas för limning:** x-speglad export som efter
   vändning runt långsidan hamnar i register — varje negativ timme exakt
   under sin cell i huvudmodellen.
4. **Årtalet mitt i året:** graveras intill mittersta veckoetiketten
   (ovanför v26) i stället för vid blockets framkant — ingen tvekan om
   vilket block årtalet tillhör.
5. **Nytt mått: spotkostnad** = spotpris × förbrukning per timme, summerat
   per elområde (zonens pris × zonens last), MSEK/h, skala 1 mm = 2 MSEK/h.
   Fjärrvärmeparets multiplikationsläsning för elsystemet.
6. **Nytt mått: totalpris hushåll (modell)** = (spot + påslag + nät +
   elskatt) × 1,25 moms per timme; påslaget kalibreras per halvår mot SCB:s
   hushållspriser (EN0301, per förbrukarkategori DA–DE). Modellen träffar
   SCB:s halvårstotaler inom 0,1 öre (byggspärr vid > 2 öre). Brasklappar
   deklarerade i Om-panel och följesedel: rikssnitt, fasta avgifter
   utslagna, spotens timprofil, zonens spot + nationella komponenter,
   extrapolerade halvår räknas.
7. **Fasta priser som default (D4):** alla prismått KPI-justeras till
   senaste månad (SCB skuggindex 2020=100, per timmes kalendermånad);
   urkryssbart till löpande priser. Läget graveras (FASTA/LÖPANDE PRISER).

## Revision 5 — data till idag + daglig uppdatering (2026-08-10)

**Original:** frysta lokala källor (t.o.m. feb 2026).

**Nytt beslut:** projektlokala datalager (`data_src/`, utanför git) som
uppdateras: spotpriser via mgrey.se/espot (Vattenfalls API konstaterat
dött: 403), förbrukning/produktion via ENTSO-E (`fetch_cache.py`,
beställarens egen hämtare). Pågående ISO-år byggs som partiellt
(`partial` + `dataThrough`), valideras mot "data högst 3 dygn gammalt",
och återstående veckor ligger på nollplanet — modellen "går till idag".
