#!/usr/bin/env node
/* Geometritest — kör produktionskodens STL-CORE-block (extraherat ur
   site/app.js, INTE en kopia) mot riktig källdata. SPEC.md §6.
   Kör: node test/geometry_test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const appSrc = fs.readFileSync(path.join(ROOT, "site", "app.js"), "utf8");
const m = appSrc.match(/\/\*STL-CORE-BEGIN\*\/([\s\S]*?)\/\*STL-CORE-END\*\//);
if (!m) { console.error("FAIL: STL-CORE-block saknas i app.js"); process.exit(1); }
const ctx = { console, Math, Map, Set, Array, Infinity, NaN };
vm.createContext(ctx);
vm.runInContext(m[1], ctx, { filename: "STL-CORE" });
const C = ctx; // buildPlate, buildTextSolid, checkSolid, m.m.

const glyphs = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "glyphs.json"), "utf8"));
const dataDir = path.join(ROOT, "site", "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));

let failures = 0, checks = 0;
function ok(cond, name, extra) {
  checks++;
  if (cond) console.log(`  ok   ${name}${extra ? " — " + extra : ""}`);
  else { failures++; console.error(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

function buildCase(name, cfgOver, files, zone) {
  const yearsData = files.map(f => ({ isoYear: f.isoYear, weeks: f.weeks, values: f.zones[zone] }));
  const cfg = Object.assign({
    yearsData, zoom: 1, normFactor: 1, cap: null, floor: null,
    years: yearsData.map(y => ({ isoYear: y.isoYear, weeks: y.weeks })),
    weekLabels: [1, 26, 52],
    title: name.toUpperCase(),
  }, cfgOver);
  const plate = C.buildPlate(cfg);
  const text = C.buildTextSolid(cfg, glyphs, plate);
  return { cfg, plate, text };
}

console.log("1. Vattentäthet + volym, riktiga konfigurationer");
const price24 = load("price_2024.json");
const price22 = load("price_2022.json");
const price23 = load("price_2023.json");
const cons23 = load("consumption_2023.json");
const cons15 = load("consumption_2015.json"); // ofullständig kantvecka (74 null)
const prod22 = load("production_2022.json");

const cases = [
  ["SPOTPRIS SE 2024 (negativa priser ger sockel)", { scalePerUnit: 0.1, floor: -100 },
    [price24], "SE"],
  ["SPOTPRIS SE3 2022–2024 (flerår, tak 300)", { scalePerUnit: 0.1, cap: 300, floor: -100 },
    [price22, price23, price24], "SE3"],
  ["FÖRBRUKNING SE 2023", { scalePerUnit: 0.002 }, [cons23], "SE"],
  ["FÖRBRUKNING SE1 2015 (saknade timmar i kantvecka)", { scalePerUnit: 0.002, zoom: 5 },
    [cons15], "SE1"],
  ["PRODUKTION SE 2022", { scalePerUnit: 0.002 }, [prod22], "SE"],
];

const built = {};
for (const [name, over, files, zone] of cases) {
  const { cfg, plate, text } = buildCase(name, over, files, zone);
  built[name] = { cfg, plate, text };
  const cp = C.checkSolid(plate.tris);
  ok(cp.watertight && cp.volumeMM3 > 0, `${name}: modellsolid`,
    `${plate.tris.length / 9} tris, volym ${(cp.volumeMM3 / 1000).toFixed(1)} cm³, ` +
    `oparade kanter ${cp.badEdges}`);
  const ct = C.checkSolid(text.tris);
  ok(ct.watertight && ct.volumeMM3 > 0, `${name}: textsolid`,
    `${text.tris.length / 9} tris, oparade kanter ${ct.badEdges}`);
  for (const b of text.report) {
    if (!b.skipped) ok(b.capMM >= 2.2, `${name}: textgolv "${b.name}"`, `${b.capMM} mm`);
  }
}

console.log("2. Referensvärden: stickprov STL-höjd mot källdata (± 0,5 %)");
{
  const { cfg, plate } = built["SPOTPRIS SE 2024 (negativa priser ger sockel)"];
  // stickprov: ons v26 kl 12 och lör v52 kl 03
  const samples = [[26, 2, 12], [52, 5, 3], [1, 0, 0], [10, 4, 17]];
  for (const [w, d, h] of samples) {
    const v = price24.zones.SE[(w - 1) * 168 + d * 24 + h];
    if (v === null) continue;
    const expected = v * 0.1;
    const got = plate.heightsRows[w - 1][d * 24 + h];
    ok(Math.abs(got - expected) <= Math.abs(expected) * 0.005 + 1e-9,
      `v${w} dag${d} kl${h}`, `källa ${v} öre → ${expected.toFixed(3)} mm, STL ${got.toFixed(3)} mm`);
  }
  ok(plate.plinth > 0, "sockel finns (2024 har negativa priser)", `${plate.plinth} mm`);
  const minVal = Math.min(...price24.zones.SE.filter(v => v !== null));
  ok(plate.plinth === Math.ceil(-minVal * 0.1), "sockelhöjd = ceil(|min|·skala)",
    `min ${minVal} öre → ${plate.plinth} mm`);
}

console.log("3. Flerårskontinuitet (rygg mot rygg)");
{
  const { cfg, plate } = built["SPOTPRIS SE3 2022–2024 (flerår, tak 300)"];
  const wsum = [price22, price23, price24].reduce((s, f) => s + f.weeks, 0);
  ok(plate.nRows === wsum, "radantal = summa ISO-veckor", `${plate.nRows} = ${wsum}`);
  ok(Math.abs(plate.depthMM - (12 + wsum)) < 1e-9, "djup = apron + veckor·1 mm",
    `${plate.depthMM} mm`);
}

console.log("4. Volymnormering (± 0,5 %)");
{
  const se1 = { isoYear: 2023, weeks: cons23.weeks, values: cons23.zones.SE1 };
  const se2 = { isoYear: 2023, weeks: cons23.weeks, values: cons23.zones.SE2 };
  const v1 = C.seriesVolume([se1], 0.002, null, null);
  const v2 = C.seriesVolume([se2], 0.002, null, null);
  const k = v2 / v1;
  const norm = buildCase("SE1 NORM", { scalePerUnit: 0.002, normFactor: k }, [cons23], "SE1");
  const vNorm = norm.plate.stats.volumePosMM3;
  ok(Math.abs(vNorm - v2) <= v2 * 0.005, "SE1 normerad mot SE2: volym lika",
    `${(vNorm / 1000).toFixed(1)} ≈ ${(v2 / 1000).toFixed(1)} cm³ (k=${k.toFixed(3)})`);
  const cp = C.checkSolid(norm.plate.tris);
  ok(cp.watertight, "normerad solid vattentät", `${cp.badEdges} oparade`);
}

console.log("5. Kända-dåliga indata: spärrarna ska BEVISAS avfyra");
{
  // 5a. trasig triangel → checkSolid ska underkänna
  const good = built["FÖRBRUKNING SE 2023"].plate.tris.slice(0, 9 * 100);
  const bad = good.slice();
  bad[3] += 0.123; // knäck en kant
  const r = C.checkSolid(bad);
  ok(!r.watertight, "checkSolid underkänner knäckt kant", `${r.badEdges} oparade`);
  // 5b. spegelvänd triangel (fel volymtecken globalt)
  const one = [0,0,0, 1,0,0, 0,1,0];
  ok(!C.checkSolid(one).watertight, "öppen yta underkänns");
  // 5c. textgolv: 1,5 mm versal ska VÄGRAS
  let threw = false;
  try {
    const t = [];
    // placeTextBlock är intern — gå via buildTextSolid med fejkad låg apron?
    // Direkt: layoutLine + spärrfunktion via buildTextSolid går inte att tvinga
    // under golvet utifrån; testa spärren direkt:
    C.placeTextBlock(t, glyphs, "TEST", 1.5, 0, 0, 0, 1, [], "spärrtest");
  } catch (e) { threw = /BYGGSPÄRR/.test(String(e)); }
  ok(threw, "versalhöjd 1,5 mm vägras med BYGGSPÄRR");
  // 5d. tecken utanför fonten ska vägras
  threw = false;
  try { C.layoutLine(glyphs, "☃", 4); } catch (e) { threw = true; }
  ok(threw, "okänt tecken vägras");
}

console.log("6. Binär STL: storlek + återläst triangelantal");
{
  const { plate } = built["PRODUKTION SE 2022"];
  const buf = C.trisToBinarySTL(plate.tris, "test");
  const n = plate.tris.length / 9;
  ok(buf.byteLength === 84 + n * 50, "byte-längd korrekt", `${buf.byteLength} B`);
  const dv = new DataView(buf);
  ok(dv.getUint32(80, true) === n, "triangelantal i header", String(n));
}

console.log("7. Glyfsanity: hål överlever hela vägen till mesh (analytisk volym)");
{
  // Volym via divergenssatsen ska matcha polygonarea × höjd (shoelace,
  // hål negativa via sin CW-orientering) — fångar 'vattentät men fylld'-felet.
  for (const s of ["O8", "OO", "Mån", "v26 2024", "8880"]) {
    const line = C.layoutLine(glyphs, s, 4.0);
    let area = 0;
    for (const c of line.contours) {
      let a = 0;
      const p = c.pts;
      for (let i = 0; i < p.length; i++) {
        const q = p[(i + 1) % p.length];
        a += p[i][0] * q[1] - q[0] * p[i][1];
      }
      area += a / 2; // yttre CCW > 0, hål CW < 0
    }
    const zTest = [];
    C.placeTextBlock(zTest, glyphs, s, 4.0, 0, 0, 0, 1.2, [], "glyftest");
    const r = C.checkSolid(zTest);
    const expected = area * 1.2;
    ok(r.watertight, `"${s}" vattentät`, `${r.badEdges} oparade`);
    ok(Math.abs(r.volumeMM3 - expected) <= expected * 0.01,
      `"${s}" volym = area × höjd`,
      `${r.volumeMM3.toFixed(2)} ≈ ${expected.toFixed(2)} mm³`);
  }
}

console.log(`\n${checks} kontroller, ${failures} fel`);
process.exit(failures ? 1 : 0);
