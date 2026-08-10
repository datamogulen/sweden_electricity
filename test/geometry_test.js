#!/usr/bin/env node
/* Geometritest — kör produktionskodens STL-CORE-block (extraherat ur
   site/app.js, INTE en kopia) mot riktig källdata. SPEC.md §6 + revisioner.
   Kör: node test/geometry_test.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const appSrc = fs.readFileSync(path.join(ROOT, "site", "app.js"), "utf8");
const m = appSrc.match(/\/\*STL-CORE-BEGIN\*\/([\s\S]*?)\/\*STL-CORE-END\*\//);
if (!m) { console.error("FAIL: STL-CORE-block saknas i app.js"); process.exit(1); }
const ctx = { console, Math, Map, Set, Array, Infinity, NaN, Date,
  TextEncoder, DataView, ArrayBuffer, Uint8Array, Uint32Array };
vm.createContext(ctx);
vm.runInContext(m[1], ctx, { filename: "STL-CORE" });
const C = ctx;

const glyphs = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "glyphs.json"), "utf8"));
const qr = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "qr.json"), "utf8"));
const dataDir = path.join(ROOT, "site", "data");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));

let failures = 0, checks = 0;
function ok(cond, name, extra) {
  checks++;
  if (cond) console.log(`  ok   ${name}${extra ? " — " + extra : ""}`);
  else { failures++; console.error(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}

const UNDER_LINES = ["SVERIGE — SPOTPRIS 2024", "SKALA 1 MM = 10 ÖRE/KWH",
                     "KÄLLA: NORD POOL / ENTSO-E", "HEDIN.IT/EL3D"];

function buildCase(name, cfgOver, files, zone) {
  const yearsData = files.map(f => ({ isoYear: f.isoYear, weeks: f.weeks, values: f.zones[zone] }));
  const cfg = Object.assign({
    yearsData, zoom: 1, normFactor: 1, cap: null, floor: null, underT: 0.6,
    years: yearsData.map(y => ({ isoYear: y.isoYear, weeks: y.weeks })),
    weekLabels: [1, 26, 52],
    title: name.toUpperCase().slice(0, 40),
    underLines: UNDER_LINES,
  }, cfgOver);
  const plate = C.buildPlate(cfg);
  const text = C.buildTextSolid(cfg, glyphs, plate);
  const under = C.buildUnderside(cfg, glyphs, qr, plate);
  return { cfg, plate, text, under };
}

console.log("1. Vattentäthet + volym, riktiga konfigurationer (inkl. undersida)");
const price24 = load("price_2024.json");
const price22 = load("price_2022.json");
const price23 = load("price_2023.json");
const cons23 = load("consumption_2023.json");
const cons15 = load("consumption_2015.json");
const prod22 = load("production_2022.json");

const cases = [
  ["SPOTPRIS SE 2024", { scalePerUnit: 0.1, floor: 0 }, [price24], "SE"],
  ["SPOTPRIS SE3 2022-2024 TAK 300", { scalePerUnit: 0.1, cap: 300, floor: 0 },
    [price22, price23, price24], "SE3"],
  ["FÖRBRUKNING SE 2023", { scalePerUnit: 0.002 }, [cons23], "SE"],
  ["FÖRBRUKNING SE1 2015 ZOOM 5", { scalePerUnit: 0.002, zoom: 5 }, [cons15], "SE1"],
  ["PRODUKTION SE 2022", { scalePerUnit: 0.002 }, [prod22], "SE"],
];

const built = {};
for (const [name, over, files, zone] of cases) {
  const b = buildCase(name, over, files, zone);
  built[name] = b;
  for (const [solid, tris] of [["modell", b.plate.tris], ["text", b.text.tris],
                               ["under-botten", b.under.bgTris], ["under-tryck", b.under.inkTris]]) {
    const r = C.checkSolid(tris);
    ok(r.watertight && r.volumeMM3 > 0, `${name}: ${solid}`,
      `${tris.length / 9} tris, oparade ${r.badEdges}, vol ${(r.volumeMM3/1000).toFixed(1)} cm³`);
  }
  for (const blk of b.text.report) {
    if (!blk.skipped) ok(blk.capMM >= 2.2, `${name}: textgolv "${blk.name}"`, `${blk.capMM} mm`);
  }
  for (const blk of b.under.report) {
    if (!blk.skipped && blk.capMM) ok(blk.capMM >= 2.2, `${name}: undersida "${blk.name}"`, `${blk.capMM} mm`);
  }
}

console.log("2. D2 rev 1: negativa klipps till 0; tvilling bär beloppen");
{
  const { plate, cfg } = built["SPOTPRIS SE 2024"];
  ok(plate.plinth === 0, "ingen sockel", `${plate.plinth} mm`);
  const negs = price24.zones.SE.filter(v => v !== null && v < 0);
  ok(plate.stats.floored === negs.length, "antal klippta = antal negativa",
    `${plate.stats.floored} = ${negs.length}`);
  const minH = Math.min(...plate.heightsRows.flat().filter(v => v !== null));
  ok(minH >= 0, "ingen höjd under nollplanet", `min ${minH.toFixed(3)} mm`);
  // tvilling
  const twinData = cfg.yearsData.map(yd => ({ isoYear: yd.isoYear, weeks: yd.weeks,
    values: yd.values.map(v => v === null ? null : (v < 0 ? Math.min(-v, 100) : 0)) }));
  const twin = C.buildPlate({ ...cfg, yearsData: twinData, cap: null, floor: null,
                              underT: 0, normFactor: 1 });
  const rt = C.checkSolid(twin.tris);
  ok(rt.watertight && rt.volumeMM3 > 0, "tvilling vattentät", `${rt.badEdges} oparade`);
  const expTwinVol = negs.reduce((s, v) => s + Math.min(-v, 100) * 0.1, 0);
  ok(Math.abs(twin.stats.volumePosMM3 - expTwinVol) <= expTwinVol * 0.005,
    "tvillingens volym = summa |negativa| × skala",
    `${twin.stats.volumePosMM3.toFixed(1)} ≈ ${expTwinVol.toFixed(1)} mm³`);
}

console.log("3. Referensvärden + flerår med årsskåror");
{
  const { plate } = built["SPOTPRIS SE 2024"];
  for (const [w, d, h] of [[26, 2, 12], [52, 5, 3], [10, 4, 17]]) {
    const v = price24.zones.SE[(w - 1) * 168 + d * 24 + h];
    if (v === null) continue;
    const expected = Math.max(0, v) * 0.1;
    const got = plate.heightsRows[w - 1][d * 24 + h];
    ok(Math.abs(got - expected) <= Math.abs(expected) * 0.005 + 1e-9,
      `v${w} dag${d} kl${h}`, `${v} öre, STL ${got.toFixed(3)} mm`);
  }
  const multi = built["SPOTPRIS SE3 2022-2024 TAK 300"];
  const wsum = [price22, price23, price24].reduce((s, f) => s + f.weeks, 0);
  ok(multi.plate.nRows === wsum + 2, "radantal = veckor + 2 årsskåror",
    `${multi.plate.nRows} = ${wsum}+2`);
  ok(Math.abs(multi.plate.depthMM - (12 + wsum + 2)) < 1e-9, "djup inkl. skåror",
    `${multi.plate.depthMM} mm`);
  const meta = multi.plate.rowsMeta;
  ok(meta[price22.weeks].gap === true && meta[price22.weeks + 1 + price23.weeks].gap === true,
    "skårorna ligger mellan årsblocken");
  ok(meta.filter(r => r.gap).length === 2, "exakt 2 skåror för 3 år");
}

console.log("4. Volymnormering (± 0,5 %)");
{
  const se1 = { isoYear: 2023, weeks: cons23.weeks, values: cons23.zones.SE1 };
  const se2 = { isoYear: 2023, weeks: cons23.weeks, values: cons23.zones.SE2 };
  const v1 = C.seriesVolume([se1], 0.002, null, null);
  const v2 = C.seriesVolume([se2], 0.002, null, null);
  const k = v2 / v1;
  const norm = buildCase("SE1 NORM", { scalePerUnit: 0.002, normFactor: k }, [cons23], "SE1");
  ok(Math.abs(norm.plate.stats.volumePosMM3 - v2) <= v2 * 0.005,
    "SE1 normerad mot SE2: volym lika", `k=${k.toFixed(3)}`);
}

console.log("5. Upplösning/utjämning (transformSeries)");
{
  // syntetiskt: 1 vecka, timme t har värde t
  const syn = [{ isoYear: 2024, weeks: 1, values: Array.from({length: 168}, (_, i) => i) }];
  const day = C.transformSeries(syn, "day")[0].values;
  ok(Math.abs(day[0] - 11.5) < 1e-9 && Math.abs(day[47] - 35.5) < 1e-9,
    "dygnsmedel rätt", `dag0=${day[0]}, dag1 tim23=${day[47]}`);
  const wk = C.transformSeries(syn, "week")[0].values;
  ok(Math.abs(wk[100] - 83.5) < 1e-9, "veckomedel rätt", `${wk[100]}`);
  const ma3 = C.transformSeries(syn, "ma", 3)[0].values;
  ok(Math.abs(ma3[10] - 10) < 1e-9 && Math.abs(ma3[0] - 0.5) < 1e-9,
    "glidande medel 3 h (centrerat, kantklippt)", `ma[10]=${ma3[10]}, ma[0]=${ma3[0]}`);
  // null bevaras
  const syn2 = [{ isoYear: 2024, weeks: 1,
    values: Array.from({length: 168}, (_, i) => i === 5 ? null : i) }];
  const day2 = C.transformSeries(syn2, "day")[0].values;
  ok(day2[5] === null, "saknad timme förblir saknad i dygnsmedel");
  const exp0 = (0+1+2+3+4+6+7+8+9+10+11+12+13+14+15+16+17+18+19+20+21+22+23) / 23;
  ok(Math.abs(day2[0] - exp0) < 1e-9, "dygnsmedel exkluderar null ur medlet", `${day2[0].toFixed(3)}`);
  // månadsmedel på riktiga data: alla celler i samma månad har samma värde
  const mon = C.transformSeries(
    [{ isoYear: 2023, weeks: cons23.weeks, values: cons23.zones.SE }], "month")[0].values;
  ok(Math.abs(mon[2 * 168] - mon[3 * 168 + 50]) < 1e-9,
    "månadsmedel konstant inom månaden (v3 vs v4, jan 2023)");
}

console.log("6. Undersidan: QR avkodbar ur trianglarna, spegling konsekvent");
{
  const { under } = built["SPOTPRIS SE 2024"];
  const { x0, y0, module, size } = under.qr;
  const T = 0.6;
  // rekonstruera matrisen ur trycket: topplock (z=T) vid modulcentrum
  const darkTops = new Set();
  const tri = under.inkTris;
  for (let t = 0; t < tri.length; t += 9) {
    if (tri[t+2] === T && tri[t+5] === T && tri[t+8] === T) {
      const cx = (tri[t] + tri[t+3] + tri[t+6]) / 3;
      const cy = (tri[t+1] + tri[t+4] + tri[t+7]) / 3;
      const i = Math.floor((cx - x0) / module), j = Math.floor((cy - y0) / module);
      if (i >= 0 && i < size && j >= 0 && j < size) darkTops.add(i + "," + j);
    }
  }
  let match = 0, total = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = size - 1 - c, j = size - 1 - r; // samma mappning som bygget
      total++;
      if ((qr.matrix[r][c] === 1) === darkTops.has(i + "," + j)) match++;
    }
  }
  ok(match === total, "QR-matris återläst ur triangelsoliden", `${match}/${total} moduler`);
  ok(module >= 1.25, "QR-modulgolv 1,25 mm", `${module} mm`);
  // känt-dåligt: samma återläsning mot en förvanskad matris ska INTE matcha
  let bad = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const i = size - 1 - c, j = size - 1 - r;
    if (((qr.matrix[r][c] === 1) !== darkTops.has(i + "," + j)) === false) bad++;
  }
  const flipped = qr.matrix.map(row => row.map(v => 1 - v));
  let matchFlipped = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const i = size - 1 - c, j = size - 1 - r;
    if ((flipped[r][c] === 1) === darkTops.has(i + "," + j)) matchFlipped++;
  }
  ok(matchFlipped < total, "återläsningen avfyrar mot inverterad matris (känt-dåligt)",
    `${matchFlipped}/${total}`);
}

console.log("7. Spärrar bevisas avfyra");
{
  const good = built["FÖRBRUKNING SE 2023"].plate.tris.slice(0, 9 * 100);
  const bad = good.slice(); bad[3] += 0.123;
  ok(!C.checkSolid(bad).watertight, "checkSolid underkänner knäckt kant");
  ok(!C.checkSolid([0,0,0, 1,0,0, 0,1,0]).watertight, "öppen yta underkänns");
  let threw = false;
  try { C.placeTextBlock([], glyphs, "TEST", 1.5, 0, 0, 0, 1, [], "spärrtest"); }
  catch (e) { threw = /BYGGSPÄRR/.test(String(e)); }
  ok(threw, "versalhöjd 1,5 mm vägras");
  threw = false;
  try { C.layoutLine(glyphs, "☃", 4); } catch (e) { threw = true; }
  ok(threw, "okänt tecken vägras");
  // överlång titel ska VÄGRAS, inte krympas under golvet eller svämma över
  threw = false;
  try {
    const b = built["FÖRBRUKNING SE 2023"];
    C.buildTextSolid({ ...b.cfg, title: "X".repeat(300) }, glyphs, b.plate);
  } catch (e) { threw = /BYGGSPÄRR/.test(String(e)); }
  ok(threw, "överlång titel vägras med BYGGSPÄRR");
  threw = false;
  try {
    const b = built["FÖRBRUKNING SE 2023"];
    C.buildUnderside({ ...b.cfg, underLines: ["Y".repeat(400)] }, glyphs, qr, b.plate);
  } catch (e) { threw = /BYGGSPÄRR/.test(String(e)); }
  ok(threw, "överlång undersidesrad vägras med BYGGSPÄRR");
}

console.log("8. Glyfsanity: analytisk volym (hål överlever)");
{
  for (const s of ["O8", "OO", "Mån", "v26 2024"]) {
    const line = C.layoutLine(glyphs, s, 4.0);
    let area = 0;
    for (const c of line.contours) {
      let a = 0;
      for (let i = 0; i < c.pts.length; i++) {
        const p = c.pts[i], q = c.pts[(i + 1) % c.pts.length];
        a += p[0] * q[1] - q[0] * p[1];
      }
      area += a / 2;
    }
    const t = [];
    C.placeTextBlock(t, glyphs, s, 4.0, 0, 0, 0, 1.2, [], "glyftest");
    const r = C.checkSolid(t);
    const expected = area * 1.2;
    ok(r.watertight && Math.abs(r.volumeMM3 - expected) <= expected * 0.01,
      `"${s}" vattentät + volym = area × höjd`,
      `${r.volumeMM3.toFixed(2)} ≈ ${expected.toFixed(2)} mm³`);
  }
}

console.log("9. Binär STL + zip genom riktig unzip -t");
{
  const os = require("os");
  const cp = require("child_process");
  const b = built["SPOTPRIS SE 2024"];
  const buf = C.trisToBinarySTL(b.plate.tris, "test");
  const n = b.plate.tris.length / 9;
  ok(buf.byteLength === 84 + n * 50 && new DataView(buf).getUint32(80, true) === n,
    "binär STL korrekt", `${n} trianglar`);
  const zip = C.makeZip([
    { name: "m.stl", data: buf },
    { name: "t.stl", data: C.trisToBinarySTL(b.text.tris, "t") },
    { name: "ub.stl", data: C.trisToBinarySTL(b.under.bgTris, "ub") },
    { name: "ut.stl", data: C.trisToBinarySTL(b.under.inkTris, "ut") },
    { name: "FOLJESEDEL.txt", data: "test åäö" },
  ]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "elstl-"));
  const zpath = path.join(tmp, "export.zip");
  fs.writeFileSync(zpath, Buffer.from(zip));
  let out = "", code = 0;
  try { out = cp.execSync(`unzip -t ${JSON.stringify(zpath)}`, { encoding: "utf8" }); }
  catch (e) { code = e.status; }
  ok(code === 0 && /No errors detected/.test(out), "unzip -t utan fel");
  const badz = Buffer.from(zip); badz[40] ^= 0xff;
  const bpath = path.join(tmp, "bad.zip");
  fs.writeFileSync(bpath, badz);
  let badFailed = false;
  try { cp.execSync(`unzip -t ${JSON.stringify(bpath)}`, { stdio: "pipe" }); }
  catch (e) { badFailed = true; }
  ok(badFailed, "korrupt zip underkänns");
}

console.log(`\n${checks} kontroller, ${failures} fel`);
process.exit(failures ? 1 : 0);
