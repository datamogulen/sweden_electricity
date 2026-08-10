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

## Revision 5 — data till idag + daglig uppdatering (2026-08-10)

**Original:** frysta lokala källor (t.o.m. feb 2026).

**Nytt beslut:** projektlokala datalager (`data_src/`, utanför git) som
uppdateras: spotpriser via mgrey.se/espot (Vattenfalls API konstaterat
dött: 403), förbrukning/produktion via ENTSO-E (`fetch_cache.py`,
beställarens egen hämtare). Pågående ISO-år byggs som partiellt
(`partial` + `dataThrough`), valideras mot "data högst 3 dygn gammalt",
och återstående veckor ligger på nollplanet — modellen "går till idag".
