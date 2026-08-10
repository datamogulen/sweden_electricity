/* El i Sverige över tid — kalenderrelief (webb + STL). Se SPEC.md.
   Geometrikärnan ligger i STL-CORE-blocket nedan och körs OFÖRÄNDRAD av
   Node-testet (test/geometry_test.js). Samma solidbygge driver Three-vyn
   och STL-exporten (WYSIWYG som arkitektur). */
"use strict";

/*STL-CORE-BEGIN*/
// ---------------------------------------------------------------- konstanter
// Familjeinvarianter (SPEC.md §1) — ärvda från fjärrvärmeförlagan. Ändras aldrig.
const BAR_W = 1.0;            // mm per timme
const DAY_GAP = 1.0;          // mm mellan dygnsblock
const DAY_BLOCK = 24 * BAR_W; // 24 mm
const DATA_W = 7 * DAY_BLOCK + 6 * DAY_GAP; // 174 mm
const RIGHT_APRON = 18.0;
const FRONT_APRON = 12.0;     // 0–6 titelband, 6–12 veckodagsband
const ROW_D = 1.0;            // mm per veckorad
const BASE = 1.2;             // basplatta
const TEXT_EMBED = 0.2;       // text inbäddad i apron (överlapp, ej tangering)
const TEXT_PROUD = 1.0;       // text ovanför apronytan
const CAP_FLOOR = 2.2;        // versalhöjdsgolv, hård spärr
const CAP_PREF = 2.6;         // föredraget golv
const PRICE_FLOOR = -100;     // öre/kWh, golv-tak för negativa priser (deklareras)

// ------------------------------------------------------------ hjälpgeometri
function pushTri(tris, a, b, c) { tris.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]); }
function pushQuad(tris, a, b, c, d) { pushTri(tris,a,b,c); pushTri(tris,a,c,d); }

// ---------------------------------------------------- höjdfält → vattentät solid
// Portföljens cellPrism-konstruktion (praxis §3.2/§6.3): en segmentering per
// vertikal hörnlinje, och varje vägg zippar mellan sina TVÅ ändlinjers
// brytpunkter (aldrig unionen på båda sidor — läxa B7/B8). Vattentät by
// construction, ingen CSG.
function zipQuadStrip(tris, A, B, flip) {
  // A och B: punktkolumner (stigande z) med samma första/sista z-nivå
  let i = 0, j = 0;
  const emit = (a, b, c) => flip ? pushTri(tris, a, c, b) : pushTri(tris, a, b, c);
  while (i < A.length - 1 || j < B.length - 1) {
    let useA;
    if (i >= A.length - 1) useA = false;
    else if (j >= B.length - 1) useA = true;
    else useA = A[i + 1][2] <= B[j + 1][2];
    if (useA) { emit(A[i], B[j], A[i + 1]); i++; }
    else { emit(A[i], B[j], B[j + 1]); j++; }
  }
}

// H[j][i] = topphöjd, eller null = cellen saknas (hål rakt igenom).
// zBot = gemensam bottennivå (0.6 för modell med undersidesskikt, 0 annars).
function heightfieldSolid(xs, ys, H, zBot) {
  const zb = zBot || 0;
  const nx = xs.length - 1, ny = ys.length - 1;
  const tris = [];
  const hAt = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny) ? null : H[j][i];

  // brytpunkter per hörnlinje (ci, cj) = höjderna hos de ≤4 angränsande cellerna
  function breakpoints(ci, cj, lo, hi) {
    const bs = [];
    for (const h of [hAt(ci - 1, cj - 1), hAt(ci, cj - 1), hAt(ci - 1, cj), hAt(ci, cj)]) {
      if (h !== null && h > lo && h < hi && !bs.includes(h)) bs.push(h);
    }
    return bs.sort((a, b) => a - b);
  }
  function chain(x, y, ci, cj, lo, hi) {
    const zs = [lo, ...breakpoints(ci, cj, lo, hi), hi];
    return zs.map(z => [x, y, z]);
  }

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const h = H[j][i];
      if (h === null) continue;
      const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
      // topp (normal +z) och botten (normal −z)
      pushQuad(tris, [x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]);
      pushQuad(tris, [x0, y0, zb], [x0, y1, zb], [x1, y1, zb], [x1, y0, zb]);
    }
  }
  // väggar längs vertikala linjer x = xs[i], mellan cellerna (i−1,j) och (i,j)
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j < ny; j++) {
      const hL = hAt(i - 1, j), hR = hAt(i, j);
      if (hL === null && hR === null) continue;
      const lo = (hL === null || hR === null) ? zb : Math.min(hL, hR);
      const hi = (hL === null || hR === null) ? (hL === null ? hR : hL) : Math.max(hL, hR);
      if (hi <= lo) continue;
      const outwardPlusX = (hL === null ? -Infinity : hL) > (hR === null ? -Infinity : hR);
      const A = chain(xs[i], ys[j], i, j, lo, hi);       // sida y0
      const B = chain(xs[i], ys[j + 1], i, j + 1, lo, hi); // sida y1
      zipQuadStrip(tris, A, B, !outwardPlusX);
    }
  }
  // väggar längs horisontella linjer y = ys[j], mellan cellerna (i,j−1) och (i,j)
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i < nx; i++) {
      const hF = hAt(i, j - 1), hB = hAt(i, j);
      if (hF === null && hB === null) continue;
      const lo = (hF === null || hB === null) ? zb : Math.min(hF, hB);
      const hi = (hF === null || hB === null) ? (hF === null ? hB : hF) : Math.max(hF, hB);
      if (hi <= lo) continue;
      const outwardPlusY = (hF === null ? -Infinity : hF) > (hB === null ? -Infinity : hB);
      const A = chain(xs[i], ys[j], i, j, lo, hi);         // sida x0
      const B = chain(xs[i + 1], ys[j], i + 1, j, lo, hi); // sida x1
      zipQuadStrip(tris, A, B, outwardPlusY);
    }
  }
  return tris;
}

// ------------------------------------------------ upplösning/utjämning (D6)
// Transformerar timserien FÖRE foldningen. Saknade timmar förblir saknade
// (deklarerat). 'ma' = centrerat glidande medel över N timmar, kronologiskt
// över hela urvalet (även över årsgränser). 'day'/'week'/'month' = medel per
// dygn/ISO-vecka/kalendermånad, utlagt på gruppens alla timceller.
function transformSeries(yearsData, mode, maWindow) {
  if (!mode || mode === "hour") return yearsData;
  const flat = [];
  for (const yd of yearsData) {
    for (let i = 0; i < yd.weeks * 168; i++) {
      const v = yd.values[i];
      flat.push(v === undefined ? null : v);
    }
  }
  const n = flat.length;
  const out = new Array(n).fill(null);
  if (mode === "ma") {
    const w = Math.max(2, Math.round(maWindow || 24));
    const back = Math.floor((w - 1) / 2), fwd = w - 1 - back;
    // prefixsummor över icke-null för O(n)
    const ps = new Array(n + 1).fill(0), pc = new Array(n + 1).fill(0);
    for (let i = 0; i < n; i++) {
      ps[i + 1] = ps[i] + (flat[i] === null ? 0 : flat[i]);
      pc[i + 1] = pc[i] + (flat[i] === null ? 0 : 1);
    }
    for (let i = 0; i < n; i++) {
      if (flat[i] === null) continue;
      const a = Math.max(0, i - back), b = Math.min(n - 1, i + fwd);
      const cnt = pc[b + 1] - pc[a];
      if (cnt > 0) out[i] = (ps[b + 1] - ps[a]) / cnt;
    }
  } else {
    // gruppnyckel per index
    const keys = new Array(n);
    let off = 0;
    for (const yd of yearsData) {
      const start = isoWeek1Monday(yd.isoYear);
      for (let w = 0; w < yd.weeks; w++) {
        for (let t = 0; t < 168; t++) {
          const i = off + w * 168 + t;
          if (mode === "week") keys[i] = `${yd.isoYear}w${w}`;
          else if (mode === "day") keys[i] = `${yd.isoYear}w${w}d${Math.floor(t / 24)}`;
          else { // month: kalendermånad från ISO-årets måndag i vecka 1
            const d = new Date(start);
            d.setUTCDate(d.getUTCDate() + w * 7 + Math.floor(t / 24));
            keys[i] = d.toISOString().slice(0, 7);
          }
        }
      }
      off += yd.weeks * 168;
    }
    const sums = new Map();
    for (let i = 0; i < n; i++) {
      if (flat[i] === null) continue;
      const k = keys[i];
      const s = sums.get(k) || [0, 0];
      s[0] += flat[i]; s[1]++;
      sums.set(k, s);
    }
    for (let i = 0; i < n; i++) {
      if (flat[i] === null) continue;
      const s = sums.get(keys[i]);
      out[i] = s[0] / s[1];
    }
  }
  const res = [];
  let off2 = 0;
  for (const yd of yearsData) {
    res.push({ isoYear: yd.isoYear, weeks: yd.weeks,
               values: out.slice(off2, off2 + yd.weeks * 168) });
    off2 += yd.weeks * 168;
  }
  return res;
}

function isoWeek1Monday(isoYear) {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const wd = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - wd);
  return jan4;
}

// --------------------------------------------------------- modellkonfiguration
// cfg = { yearsData: [{isoYear, weeks, values}], scalePerUnit, zoom, normFactor,
//         cap (enhet|null), floor (enhet|null) }
// values: plattarray veckor*168, null = saknad timme.
// Returnerar { heights, nRows, plinth, stats } — ren beräkning, testbar separat.
function computeHeights(cfg) {
  const rows = [];   // kronologiskt: rows[c][hourOfWeek] = mm över nollplanet | null
  let missing = 0, capped = 0, floored = 0;
  let min = Infinity, max = -Infinity, sumPos = 0;
  const k = (cfg.normFactor || 1) * (cfg.zoom || 1);
  for (const yd of cfg.yearsData) {
    for (let w = 0; w < yd.weeks; w++) {
      const row = new Array(168).fill(null);
      for (let t = 0; t < 168; t++) {
        let v = yd.values[w * 168 + t];
        if (v === null || v === undefined) { missing++; row[t] = null; continue; }
        if (cfg.cap !== null && cfg.cap !== undefined && v > cfg.cap) { v = cfg.cap; capped++; }
        if (cfg.floor !== null && cfg.floor !== undefined && v < cfg.floor) { v = cfg.floor; floored++; }
        const h = v * cfg.scalePerUnit * k;
        row[t] = h;
        if (h < min) min = h;
        if (h > max) max = h;
        if (h > 0) sumPos += h;
      }
      rows.push(row);
    }
  }
  const plinth = min < 0 ? Math.ceil(-min) : 0; // sockel så gropbotten ≥ basplattan
  return { rows, nRows: rows.length, plinth, stats: {
    missing, capped, floored, minMM: min === Infinity ? 0 : min,
    maxMM: max === -Infinity ? 0 : max, volumePosMM3: sumPos * BAR_W * ROW_D } };
}

// Volym (positiv del) för en serie vid familjeskala — för volymnormering.
function seriesVolume(yearsData, scalePerUnit, cap, floor) {
  const c = computeHeights({ yearsData, scalePerUnit, zoom: 1, normFactor: 1, cap, floor });
  return c.stats.volumePosMM3;
}

// ------------------------------------------------------------- plattsoliden
// Radlista (kronologisk): veckorader per år + 1 mm skåra (YEAR_GAP-rad på
// nollplanet) mellan årsblocken — årsskiftena läses som dygnsskårorna.
function buildRowsMeta(years) {
  const rows = [];
  years.forEach((y, yi) => {
    if (yi > 0) rows.push({ gap: true });
    for (let w = 0; w < y.weeks; w++) rows.push({ yi, w });
  });
  return rows;
}

function buildPlate(cfg) {
  const ch = computeHeights(cfg);
  const zP = BASE + ch.plinth;              // nollplanet = apronens ovansida
  const rowsMeta = buildRowsMeta(cfg.years);
  const M = rowsMeta.length;
  const zBot = cfg.underT || 0;             // 0.6 när undersidesskikt används
  // kronologiskt radindex c ligger på y = FRONT_APRON + (M−1−c)·ROW_D:
  // nyaste raden främst; januari år X+1 direkt framför december år X.
  const weekStart = [];                     // kumulativ startvecka per år
  { let acc = 0; for (const y of cfg.years) { weekStart.push(acc); acc += y.weeks; } }

  const xs = [];
  for (let d = 0; d < 7; d++) for (let h = 0; h <= 24; h++) xs.push(d * 25 + h);
  xs.push(DATA_W + RIGHT_APRON);
  const ys = [0, 6, 12];
  for (let i = 1; i <= M; i++) ys.push(FRONT_APRON + i * ROW_D);
  const nx = xs.length - 1, ny = ys.length - 1;

  const H = [];
  for (let j = 0; j < ny; j++) {
    const rowH = new Array(nx);
    const meta = j >= 2 ? rowsMeta[M - 1 - (j - 2)] : null; // främsta raden = sista
    for (let i = 0; i < nx; i++) {
      const x0 = xs[i];
      let h = zP; // aproner, skåror, dygnsmellanrum, saknade timmar: nollplanet
      if (meta && !meta.gap && x0 < DATA_W) {
        const d = Math.floor(x0 / 25), hh = x0 - d * 25;
        if (hh < 24) {
          const c = weekStart[meta.yi] + meta.w;
          const v = ch.rows[c][d * 24 + hh];    // dygnsblock d = ISO-veckodag d
          if (v !== null) h = Math.max(zP + v, Math.max(BASE, zBot + 0.4));
        }
      }
      rowH[i] = h;
    }
    H.push(rowH);
  }
  const tris = heightfieldSolid(xs, ys, H, zBot);
  return { tris, zP, nRows: M, rowsMeta, weekStart, plinth: ch.plinth,
           stats: ch.stats, zBot,
           widthMM: DATA_W + RIGHT_APRON, depthMM: FRONT_APRON + M * ROW_D,
           heightsRows: ch.rows };
}

// ------------------------------------------------------------------- earcut
// Inlinad earcut 2.2.4 (Mapbox, ISC-licens), oförändrad algoritm i kompakt form.
function earcut(data, holeIndices, dim) {
  dim = dim || 2;
  const hasHoles = holeIndices && holeIndices.length;
  const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
  let outerNode = linkedList(data, 0, outerLen, dim, true);
  const triangles = [];
  if (!outerNode || outerNode.next === outerNode.prev) return triangles;
  let minX, minY, maxX, maxY, x, y, invSize;
  if (hasHoles) outerNode = eliminateHoles(data, holeIndices, outerNode, dim);
  if (data.length > 80 * dim) {
    minX = maxX = data[0]; minY = maxY = data[1];
    for (let i = dim; i < outerLen; i += dim) {
      x = data[i]; y = data[i + 1];
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    invSize = Math.max(maxX - minX, maxY - minY);
    invSize = invSize !== 0 ? 32767 / invSize : 0;
  }
  earcutLinked(outerNode, triangles, dim, minX, minY, invSize, 0);
  return triangles;

  function linkedList(data, start, end, dim, clockwise) {
    let i, last;
    if (clockwise === (signedArea(data, start, end, dim) > 0)) {
      for (i = start; i < end; i += dim) last = insertNode(i, data[i], data[i + 1], last);
    } else {
      for (i = end - dim; i >= start; i -= dim) last = insertNode(i, data[i], data[i + 1], last);
    }
    if (last && equals(last, last.next)) { removeNode(last); last = last.next; }
    return last;
  }
  function filterPoints(start, end) {
    if (!start) return start;
    if (!end) end = start;
    let p = start, again;
    do {
      again = false;
      if (!p.steiner && (equals(p, p.next) || area(p.prev, p, p.next) === 0)) {
        removeNode(p); p = end = p.prev;
        if (p === p.next) break;
        again = true;
      } else p = p.next;
    } while (again || p !== end);
    return end;
  }
  function earcutLinked(ear, triangles, dim, minX, minY, invSize, pass) {
    if (!ear) return;
    if (!pass && invSize) indexCurve(ear, minX, minY, invSize);
    let stop = ear, prev, next;
    while (ear.prev !== ear.next) {
      prev = ear.prev; next = ear.next;
      if (invSize ? isEarHashed(ear, minX, minY, invSize) : isEar(ear)) {
        triangles.push(prev.i / dim | 0, ear.i / dim | 0, next.i / dim | 0);
        removeNode(ear);
        ear = next.next; stop = next.next;
        continue;
      }
      ear = next;
      if (ear === stop) {
        if (!pass) earcutLinked(filterPoints(ear), triangles, dim, minX, minY, invSize, 1);
        else if (pass === 1) {
          ear = cureLocalIntersections(filterPoints(ear), triangles, dim);
          earcutLinked(ear, triangles, dim, minX, minY, invSize, 2);
        } else if (pass === 2) splitEarcut(ear, triangles, dim, minX, minY, invSize);
        break;
      }
    }
  }
  function isEar(ear) {
    const a = ear.prev, b = ear, c = ear.next;
    if (area(a, b, c) >= 0) return false;
    const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
    const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy),
          x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);
    let p = c.next;
    while (p !== a) {
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 &&
          pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) &&
          area(p.prev, p, p.next) >= 0) return false;
      p = p.next;
    }
    return true;
  }
  function isEarHashed(ear, minX, minY, invSize) {
    const a = ear.prev, b = ear, c = ear.next;
    if (area(a, b, c) >= 0) return false;
    const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
    const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy),
          x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);
    const minZ = zOrder(x0, y0, minX, minY, invSize),
          maxZ = zOrder(x1, y1, minX, minY, invSize);
    let p = ear.prevZ, n = ear.nextZ;
    while (p && p.z >= minZ && n && n.z <= maxZ) {
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
          pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
      p = p.prevZ;
      if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
          pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
      n = n.nextZ;
    }
    while (p && p.z >= minZ) {
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && p !== a && p !== c &&
          pointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y) && area(p.prev, p, p.next) >= 0) return false;
      p = p.prevZ;
    }
    while (n && n.z <= maxZ) {
      if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1 && n !== a && n !== c &&
          pointInTriangle(ax, ay, bx, by, cx, cy, n.x, n.y) && area(n.prev, n, n.next) >= 0) return false;
      n = n.nextZ;
    }
    return true;
  }
  function cureLocalIntersections(start, triangles, dim) {
    let p = start;
    do {
      const a = p.prev, b = p.next.next;
      if (!equals(a, b) && intersects(a, p, p.next, b) && locallyInside(a, b) && locallyInside(b, a)) {
        triangles.push(a.i / dim | 0, p.i / dim | 0, b.i / dim | 0);
        removeNode(p); removeNode(p.next);
        p = start = b;
      }
      p = p.next;
    } while (p !== start);
    return filterPoints(p);
  }
  function splitEarcut(start, triangles, dim, minX, minY, invSize) {
    let a = start;
    do {
      let b = a.next.next;
      while (b !== a.prev) {
        if (a.i !== b.i && isValidDiagonal(a, b)) {
          let c = splitPolygon(a, b);
          a = filterPoints(a, a.next);
          c = filterPoints(c, c.next);
          earcutLinked(a, triangles, dim, minX, minY, invSize, 0);
          earcutLinked(c, triangles, dim, minX, minY, invSize, 0);
          return;
        }
        b = b.next;
      }
      a = a.next;
    } while (a !== start);
  }
  function eliminateHoles(data, holeIndices, outerNode, dim) {
    const queue = [];
    for (let i = 0, len = holeIndices.length; i < len; i++) {
      const start = holeIndices[i] * dim;
      const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
      const list = linkedList(data, start, end, dim, false);
      if (list === list.next) list.steiner = true;
      queue.push(getLeftmost(list));
    }
    queue.sort((a, b) => a.x - b.x);
    for (let i = 0; i < queue.length; i++) {
      outerNode = eliminateHole(queue[i], outerNode);
    }
    return outerNode;
  }
  function eliminateHole(hole, outerNode) {
    const bridge = findHoleBridge(hole, outerNode);
    if (!bridge) return outerNode;
    const bridgeReverse = splitPolygon(bridge, hole);
    filterPoints(bridgeReverse, bridgeReverse.next);
    return filterPoints(bridge, bridge.next);
  }
  function findHoleBridge(hole, outerNode) {
    let p = outerNode, qx = -Infinity, m;
    const hx = hole.x, hy = hole.y;
    do {
      if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
        const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
        if (x <= hx && x > qx) {
          qx = x;
          m = p.x < p.next.x ? p : p.next;
          if (x === hx) return m;
        }
      }
      p = p.next;
    } while (p !== outerNode);
    if (!m) return null;
    const stop = m, mx = m.x, my = m.y;
    let tanMin = Infinity, tan;
    p = m;
    do {
      if (hx >= p.x && p.x >= mx && hx !== p.x &&
          pointInTriangle(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
        tan = Math.abs(hy - p.y) / (hx - p.x);
        if (locallyInside(p, hole) &&
            (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && sectorContainsSector(m, p)))))) {
          m = p; tanMin = tan;
        }
      }
      p = p.next;
    } while (p !== stop);
    return m;
  }
  function sectorContainsSector(m, p) {
    return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
  }
  function indexCurve(start, minX, minY, invSize) {
    let p = start;
    do {
      if (p.z === 0) p.z = zOrder(p.x, p.y, minX, minY, invSize);
      p.prevZ = p.prev; p.nextZ = p.next;
      p = p.next;
    } while (p !== start);
    p.prevZ.nextZ = null; p.prevZ = null;
    sortLinked(p);
  }
  function sortLinked(list) {
    let numMerges, inSize = 1;
    do {
      let p = list, e, tail = null; list = null; numMerges = 0;
      while (p) {
        numMerges++;
        let q = p, pSize = 0;
        for (let i = 0; i < inSize; i++) { pSize++; q = q.nextZ; if (!q) break; }
        let qSize = inSize;
        while (pSize > 0 || (qSize > 0 && q)) {
          if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) { e = p; p = p.nextZ; pSize--; }
          else { e = q; q = q.nextZ; qSize--; }
          if (tail) tail.nextZ = e; else list = e;
          e.prevZ = tail; tail = e;
        }
        p = q;
      }
      tail.nextZ = null;
      inSize *= 2;
    } while (numMerges > 1);
    return list;
  }
  function zOrder(x, y, minX, minY, invSize) {
    x = (x - minX) * invSize | 0; y = (y - minY) * invSize | 0;
    x = (x | (x << 8)) & 0x00FF00FF; x = (x | (x << 4)) & 0x0F0F0F0F;
    x = (x | (x << 2)) & 0x33333333; x = (x | (x << 1)) & 0x55555555;
    y = (y | (y << 8)) & 0x00FF00FF; y = (y | (y << 4)) & 0x0F0F0F0F;
    y = (y | (y << 2)) & 0x33333333; y = (y | (y << 1)) & 0x55555555;
    return x | (y << 1);
  }
  function getLeftmost(start) {
    let p = start, leftmost = start;
    do {
      if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
      p = p.next;
    } while (p !== start);
    return leftmost;
  }
  function pointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
    return (cx - px) * (ay - py) >= (ax - px) * (cy - py) &&
           (ax - px) * (by - py) >= (bx - px) * (ay - py) &&
           (bx - px) * (cy - py) >= (cx - px) * (by - py);
  }
  function isValidDiagonal(a, b) {
    return a.next.i !== b.i && a.prev.i !== b.i && !intersectsPolygon(a, b) &&
           (locallyInside(a, b) && locallyInside(b, a) && middleInside(a, b) &&
            (area(a.prev, a, b.prev) || area(a, b.prev, b)) ||
            equals(a, b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0);
  }
  function area(p, q, r) { return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y); }
  function equals(p1, p2) { return p1.x === p2.x && p1.y === p2.y; }
  function intersects(p1, q1, p2, q2) {
    const o1 = Math.sign(area(p1, q1, p2)), o2 = Math.sign(area(p1, q1, q2)),
          o3 = Math.sign(area(p2, q2, p1)), o4 = Math.sign(area(p2, q2, q1));
    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;
    return false;
  }
  function onSegment(p, q, r) {
    return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
           q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  }
  function intersectsPolygon(a, b) {
    let p = a;
    do {
      if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i &&
          intersects(p, p.next, a, b)) return true;
      p = p.next;
    } while (p !== a);
    return false;
  }
  function locallyInside(a, b) {
    return area(a.prev, a, a.next) < 0 ?
      area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
      area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
  }
  function middleInside(a, b) {
    let p = a, inside = false;
    const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
    do {
      if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
          (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) inside = !inside;
      p = p.next;
    } while (p !== a);
    return inside;
  }
  function splitPolygon(a, b) {
    const a2 = new Node(a.i, a.x, a.y), b2 = new Node(b.i, b.x, b.y),
          an = a.next, bp = b.prev;
    a.next = b; b.prev = a;
    a2.next = an; an.prev = a2;
    b2.next = a2; a2.prev = b2;
    bp.next = b2; b2.prev = bp;
    return b2;
  }
  function insertNode(i, x, y, last) {
    const p = new Node(i, x, y);
    if (!last) { p.prev = p; p.next = p; }
    else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; }
    return p;
  }
  function removeNode(p) {
    p.next.prev = p.prev; p.prev.next = p.next;
    if (p.prevZ) p.prevZ.nextZ = p.nextZ;
    if (p.nextZ) p.nextZ.prevZ = p.prevZ;
  }
  function Node(i, x, y) {
    this.i = i; this.x = x; this.y = y;
    this.prev = null; this.next = null;
    this.z = 0; this.prevZ = null; this.nextZ = null;
    this.steiner = false;
  }
  function signedArea(data, start, end, dim) {
    let sum = 0;
    for (let i = start, j = end - dim; i < end; i += dim) {
      sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
      j = i;
    }
    return sum;
  }
}

// ------------------------------------------------------------------ textsolider
// Glyfer = egna vattentäta prismor: earcut-lock topp/botten + väggar längs
// varje ring. Yttre ringar CCW, hål CW (klassade via nästningsdjup i pipeline).
function glyphSolid(tris, contours, z0, z1) {
  const outers = contours.filter(c => !c.hole);
  for (const outer of outers) {
    const holes = contours.filter(c => c.hole && c.parent === outer.idx);
    const coords = [];
    const holeIdx = [];
    for (const p of outer.pts) coords.push(p[0], p[1]);
    for (const h of holes) {
      holeIdx.push(coords.length / 2);
      for (const p of h.pts) coords.push(p[0], p[1]);
    }
    const idx = earcut(coords, holeIdx.length ? holeIdx : null, 2);
    for (let t = 0; t < idx.length; t += 3) {
      const a = [coords[idx[t]*2], coords[idx[t]*2+1]],
            b = [coords[idx[t+1]*2], coords[idx[t+1]*2+1]],
            c = [coords[idx[t+2]*2], coords[idx[t+2]*2+1]];
      // earcut följer ytterringens riktning (CCW) → topp +z; botten speglas
      pushTri(tris, [a[0],a[1],z1], [b[0],b[1],z1], [c[0],c[1],z1]);
      pushTri(tris, [a[0],a[1],z0], [c[0],c[1],z0], [b[0],b[1],z0]);
    }
    const rings = [outer, ...holes];
    for (const r of rings) {
      const pts = r.pts;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        if (p[0] === q[0] && p[1] === q[1]) continue;
        pushQuad(tris, [p[0],p[1],z0], [q[0],q[1],z0], [q[0],q[1],z1], [p[0],p[1],z1]);
      }
    }
  }
}

// Deterministisk antikollinearitetsjitter (läxa C7/D3/D4): funktion av punktens
// EGNA koordinater (lika punkter får lika offset, skilda punkter på samma linje
// olika), amplitud 1e-4 mm — en storleksordning över float32-steget, fyra under
// munstycket. Utan den släpper earcut exakt kollineära punkter och lock/vägg
// blir oense om konturen.
function jit(x, y, seed) {
  const v = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return (v - Math.floor(v)) * 2e-4 - 1e-4;
}

// En textrad: skala till versalhöjd capMM, placera, returnera konturer + bredd.
function layoutLine(glyphData, text, capMM) {
  const s = capMM / glyphData.capHeight;
  const track = glyphData.tracking * s;
  let penX = 0;
  const contours = [];
  let idxCounter = 0;
  for (const ch of text) {
    const g = glyphData.glyphs[ch];
    if (!g) throw new Error(`Tecken saknas i fonten: "${ch}"`);
    const base = idxCounter; // hålens föräldrar är geometriskt satta i
    for (const c of g.contours) { // pipeline (fontens konturordning är godtycklig)
      if (c.hole && (c.parent === null || c.parent === undefined)) {
        throw new Error(`BYGGSPÄRR: hål utan förälder i "${ch}" — kör om extract_glyphs.py`);
      }
      contours.push({
        hole: c.hole, depth: c.depth, idx: idxCounter,
        parent: c.hole ? base + c.parent : null,
        pts: c.pts.map(p => {
          const px = p[0] * s + penX, py = p[1] * s;
          return [px + jit(px, py, 1.7), py + jit(px, py, 9.1)];
        }),
      });
      idxCounter++;
    }
    penX += g.adv * s + track;
  }
  return { contours, width: penX - track };
}

// Textblock med spärr: versalhöjd under golvet ⇒ bygget VÄGRAR (ingen krympning).
function placeTextBlock(tris, glyphData, text, capMM, x, y, z0, z1, report, name, maxW) {
  if (capMM < CAP_FLOOR - 1e-9) {
    throw new Error(`BYGGSPÄRR: textblock "${name}" (${text}) versalhöjd ` +
      `${capMM.toFixed(2)} mm < golvet ${CAP_FLOOR} mm`);
  }
  const line = layoutLine(glyphData, text, capMM);
  if (maxW && line.width > maxW) return null; // anroparen får krympa/avstå — rapporteras
  for (const c of line.contours) c.pts = c.pts.map(p => [p[0] + x, p[1] + y]);
  glyphSolid(tris, line.contours, z0, z1);
  report.push({ name, text, capMM: +capMM.toFixed(2), widthMM: +line.width.toFixed(1) });
  return line.width;
}

// --------------------------------------------------------------- text för plattan
// cfg utökas med: title, years [{isoYear, weeks}] (kronologiskt), weekLabels [1,26,52]
function buildTextSolid(cfg, glyphData, plate) {
  const tris = [];
  const report = [];
  const zP = plate.zP;
  const z0 = zP - TEXT_EMBED, z1 = zP + TEXT_PROUD;
  const N = plate.nRows;

  // 1. Titelband y 0–6: centrerad, cap 4,6 → krymp till bredd, golv 2,2.
  // Ryms den inte ens på golvet VÄGRAR bygget (aldrig tyst överhäng — E3).
  {
    let cap = 4.6;
    const maxW = DATA_W + RIGHT_APRON - 4;
    let probe = layoutLine(glyphData, cfg.title, cap);
    if (probe.width > maxW) {
      const capNeeded = cap * maxW / probe.width;
      if (capNeeded < CAP_FLOOR - 1e-9) {
        throw new Error(`BYGGSPÄRR: titeln "${cfg.title}" ryms inte ens vid ` +
          `golvet 2,2 mm (kräver ${capNeeded.toFixed(2)} mm) — korta titeln`);
      }
      cap = capNeeded;
      probe = layoutLine(glyphData, cfg.title, cap);
    }
    const x = (DATA_W + RIGHT_APRON - probe.width) / 2;
    placeTextBlock(tris, glyphData, cfg.title, cap, x, 0.7, z0, z1, report, "titel");
  }

  // 2. Veckodagsband y 6–12, ett block per dygn
  const days = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
  for (let d = 0; d < 7; d++) {
    const cap = 3.4;
    const line = layoutLine(glyphData, days[d], cap);
    const x = d * 25 + (DAY_BLOCK - line.width) / 2;
    placeTextBlock(tris, glyphData, days[d], cap, x, 6.9, z0, z1, report, `veckodag ${days[d]}`);
  }

  // 3. Höger apron: per år — årtal vid årsblockets framkant + valda veckonummer.
  //   Radindex i rowsMeta (inkl. årsskåror): idx(yi, w0) = veckostart + yi skåror + w0.
  const rowIdx = (yi, w0) => plate.weekStart[yi] + yi + w0;
  const rowY = (idx) => FRONT_APRON + (N - 1 - idx) * ROW_D;
  const yearBands = [];
  cfg.years.forEach((yd, yi) => {
    const yFront = rowY(rowIdx(yi, yd.weeks - 1));             // årets nyaste rad
    const yBack = rowY(rowIdx(yi, 0)) + ROW_D;
    const capY = 3.6;
    const yearStr = String(yd.isoYear);
    const lineY = layoutLine(glyphData, yearStr, capY);
    const yYear = Math.min(yFront + 1.2, yBack - capY - 1.2);
    const xYear = DATA_W + (RIGHT_APRON - lineY.width) / 2;
    placeTextBlock(tris, glyphData, yearStr, capY, xYear, yYear, z0, z1, report,
      `år ${yearStr}`);
    yearBands.push({ y0: yYear - 0.8, y1: yYear + capY + 0.8 });

    const capW = 2.6;
    let prevBand = null;
    for (const w of cfg.weekLabels) {
      if (w < 1 || w > yd.weeks) continue;
      const yRow = rowY(rowIdx(yi, w - 1));
      const label = `v${w}`;
      const lw = layoutLine(glyphData, label, capW);
      let yLab = yRow + ROW_D / 2 - capW / 2;
      yLab = Math.max(yFront + 0.4, Math.min(yLab, yBack - capW - 0.4));
      const band = { y0: yLab - 0.5, y1: yLab + capW + 0.5 };
      const hitsYear = yearBands.some(b => band.y0 < b.y1 && band.y1 > b.y0);
      const hitsPrev = prevBand && band.y0 < prevBand.y1 && band.y1 > prevBand.y0;
      if (hitsYear || hitsPrev) {
        report.push({ name: `vecka v${w} (${yd.isoYear})`, text: label,
                      skipped: "överlapp på apronen — hoppad, deklareras" });
        continue;
      }
      const xLab = DATA_W + (RIGHT_APRON - lw.width) / 2;
      placeTextBlock(tris, glyphData, label, capW, xLab, yLab, z0, z1, report,
        `vecka v${w} (${yd.isoYear})`);
      prevBand = band;
    }
  });

  // Golvkontroll över hela rapporten (spärren har redan vägrat per block,
  // detta är bältet till hängslena — och tabellen loggas alltid)
  for (const b of report) {
    if (!b.skipped && b.capMM < CAP_FLOOR - 1e-9) {
      throw new Error(`BYGGSPÄRR: "${b.name}" under golvet i slutkontroll`);
    }
  }
  return { tris, report };
}

// --------------------------------------------------- undersidan (QR + text + fält)
// Tre filer skrivs ut i bandet z 0–UNDER_T under modellen: bakgrundsfältet
// (ljus kontrast, hela fotavtrycket minus tryck), trycket (mörk kontrast:
// QR-moduler + glyfer) — färg, inte djup (praxis §2.4). Geometrin speglas
// (x → bredd−x) så den läses rättvänt underifrån.
const UNDER_T = 0.6;          // tre lager à 0,2 mm
const QR_MODULE = 1.4;        // mm/modul — golv 1,25 (praxis §2.4b), spärr nedan

function prismWithHoles(tris, outer, holes, z0, z1) {
  const coords = [];
  const holeIdx = [];
  for (const p of outer) coords.push(p[0], p[1]);
  for (const h of holes) {
    holeIdx.push(coords.length / 2);
    for (const p of h) coords.push(p[0], p[1]);
  }
  const idx = earcut(coords, holeIdx.length ? holeIdx : null, 2);
  for (let t = 0; t < idx.length; t += 3) {
    const a = [coords[idx[t]*2], coords[idx[t]*2+1]],
          b = [coords[idx[t+1]*2], coords[idx[t+1]*2+1]],
          c = [coords[idx[t+2]*2], coords[idx[t+2]*2+1]];
    pushTri(tris, [a[0],a[1],z1], [b[0],b[1],z1], [c[0],c[1],z1]);
    pushTri(tris, [a[0],a[1],z0], [c[0],c[1],z0], [b[0],b[1],z0]);
  }
  for (const ring of [outer, ...holes]) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      if (p[0] === q[0] && p[1] === q[1]) continue;
      pushQuad(tris, [p[0],p[1],z0], [q[0],q[1],z0], [q[0],q[1],z1], [p[0],p[1],z1]);
    }
  }
}

// spegling x → W−x med bevarad ringorientering (punktordningen vänds)
function mirrorRing(pts, W) {
  return pts.map(p => [W - p[0], p[1]]).reverse();
}

function buildUnderside(cfg, glyphData, qrData, plate) {
  if (QR_MODULE < 1.25) throw new Error("BYGGSPÄRR: QR-modul under golvet 1,25 mm");
  const W = plate.widthMM, D = plate.depthMM, T = UNDER_T;
  const bg = [], ink = [];
  const report = [];
  const size = qrData.size;
  const sym = size * QR_MODULE;

  // layout i underifrån-vy (u = W−x, v = y): QR till höger, text till vänster
  const uQR0 = W - 8 - sym, vQR0 = Math.max(6, (D - sym) / 2);
  if (sym + 2 * QR_MODULE * 2 > D - 8) {
    throw new Error("BYGGSPÄRR: QR-symbolen ryms inte på undersidan");
  }
  // verkliga koordinater för QR-rutnätet (spegling: u → x = W−u)
  const xQR0 = W - (uQR0 + sym);
  const qxs = [], qys = [];
  for (let k = 0; k <= size; k++) { qxs.push(xQR0 + k * QR_MODULE); qys.push(vQR0 + k * QR_MODULE); }
  // matris[r][c]: r=0 översta raden i vanlig vy. I vår grid: kolumn i (låg x)
  // motsvarar spegling av kolumnindex; rad j (låg y) = nedersta = sista raden.
  const darkH = [], lightH = [];
  for (let j = 0; j < size; j++) {
    const dRow = [], lRow = [];
    for (let i = 0; i < size; i++) {
      const r = size - 1 - j, c = size - 1 - i; // spegling + v-flip
      const dark = qrData.matrix[r][c] === 1;
      dRow.push(dark ? T : null);
      lRow.push(dark ? null : T);
    }
    darkH.push(dRow); lightH.push(lRow);
  }
  for (const t of heightfieldSolid(qxs, qys, darkH, 0)) ink.push(t);
  for (const t of heightfieldSolid(qxs, qys, lightH, 0)) bg.push(t);
  report.push({ name: "QR", text: qrData.url,
                capMM: null, qrModuleMM: QR_MODULE, symbolMM: +sym.toFixed(1) });

  // textblock: rader uppifrån (hög v) och nedåt, i u-rymd, sedan speglade
  const capU = 2.8, pitch = 1.45 * capU;
  const uText0 = 8, uTextMax = uQR0 - 2 * QR_MODULE - 4;
  const lines = (cfg.underLines || []).slice();
  const maxLines = Math.floor((D - 12) / pitch);
  const dropped = lines.length > maxLines ? lines.splice(maxLines) : [];
  for (const dl of dropped) report.push({ name: "undersida rad", text: dl,
    skipped: "ryms inte på undersidan — deklareras" });
  // textfältets rektangel (u-rymd) → verklig
  const blockH = lines.length ? (lines.length - 1) * pitch + capU : 0;
  const vTop = Math.min(D - 6, vQR0 + sym);
  const vBase0 = vTop - capU;
  const rectU = [uText0 - 2, uTextMax + 2];
  const rectV = [Math.max(4, vBase0 - (lines.length - 1) * pitch - 2), vTop + 2];
  const rectX = [W - rectU[1], W - rectU[0]];

  // glyfgrupper (ytterring + dess hål, via parent-kopplingen) i verkliga,
  // speglade koordinater. Ink = glyf MED hål; hålen blir dessutom ö-prismor i
  // bakgrundsfärg (flush — hålet i O är bakgrundsfärg, inte luft).
  const glyphGroups = [];
  lines.forEach((txt, li) => {
    if (!txt) return;
    let cap = capU;
    let line = layoutLine(glyphData, txt, cap);
    if (line.width > uTextMax - uText0) {
      const capNeeded = cap * (uTextMax - uText0) / line.width;
      if (capNeeded < CAP_FLOOR - 1e-9) {
        throw new Error(`BYGGSPÄRR: undersidesraden "${txt}" ryms inte ens vid ` +
          `golvet 2,2 mm — korta raden`);
      }
      cap = capNeeded;
      line = layoutLine(glyphData, txt, cap);
    }
    const vBase = vBase0 - li * pitch;
    const real = (pts) => mirrorRing(pts.map(p => [p[0] + uText0, p[1] + vBase]), W);
    for (const c of line.contours) {
      if (c.hole) continue;
      const holes = line.contours.filter(h => h.hole && h.parent === c.idx);
      glyphGroups.push({ outer: real(c.pts), holes: holes.map(h => real(h.pts)) });
    }
    report.push({ name: `undersida rad ${li + 1}`, text: txt, capMM: +cap.toFixed(2),
                  widthMM: +line.width.toFixed(1) });
  });
  for (const g of glyphGroups) {
    prismWithHoles(ink, g.outer, g.holes, 0, T);
    for (const isl of g.holes) {
      prismWithHoles(bg, isl.slice().reverse(), [], 0, T); // ö: CW → CCW ytterring
    }
  }

  // bakgrundsfältet: hela fotavtrycket minus QR-rektangeln minus textrektangeln
  const fxs = [0, W], fys = [0, D];
  const addLine = (arr, v) => { if (!arr.includes(v)) arr.push(v); };
  addLine(fxs, qxs[0]); addLine(fxs, qxs[size]);
  addLine(fys, qys[0]); addLine(fys, qys[size]);
  addLine(fxs, rectX[0]); addLine(fxs, rectX[1]);
  addLine(fys, rectV[0]); addLine(fys, rectV[1]);
  fxs.sort((a, b) => a - b); fys.sort((a, b) => a - b);
  const FH = [];
  for (let j = 0; j < fys.length - 1; j++) {
    const row = [];
    const cy = (fys[j] + fys[j + 1]) / 2;
    for (let i = 0; i < fxs.length - 1; i++) {
      const cx = (fxs[i] + fxs[i + 1]) / 2;
      const inQR = cx > qxs[0] && cx < qxs[size] && cy > qys[0] && cy < qys[size];
      const inText = cx > rectX[0] && cx < rectX[1] && cy > rectV[0] && cy < rectV[1];
      row.push(inQR || inText ? null : T);
    }
    FH.push(row);
  }
  for (const t of heightfieldSolid(fxs, fys, FH, 0)) bg.push(t);
  // textfältet: rektangel med glyf-ytterringar som hål
  if (lines.length) {
    const outer = [[rectX[0], rectV[0]], [rectX[1], rectV[0]],
                   [rectX[1], rectV[1]], [rectX[0], rectV[1]]];
    const holes = glyphGroups.map(g => g.outer.slice().reverse()); // CCW → CW som hål
    prismWithHoles(bg, outer, holes, 0, T);
  }
  return { bgTris: bg, inkTris: ink, report,
           qr: { x0: xQR0, y0: vQR0, module: QR_MODULE, size } };
}

// --------------------------------------------------------------- STL + kontroll
function trisToBinarySTL(tris, name) {
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const enc = (name || "sweden_electricity").slice(0, 79);
  for (let i = 0; i < enc.length; i++) dv.setUint8(i, enc.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const i9 = t * 9;
    const ax = tris[i9], ay = tris[i9+1], az = tris[i9+2],
          bx = tris[i9+3], by = tris[i9+4], bz = tris[i9+5],
          cx = tris[i9+6], cy = tris[i9+7], cz = tris[i9+8];
    const ux = bx-ax, uy = by-ay, uz = bz-az, vx = cx-ax, vy = cy-ay, vz = cz-az;
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx/len, true); dv.setFloat32(o+4, ny/len, true); dv.setFloat32(o+8, nz/len, true);
    dv.setFloat32(o+12, ax, true); dv.setFloat32(o+16, ay, true); dv.setFloat32(o+20, az, true);
    dv.setFloat32(o+24, bx, true); dv.setFloat32(o+28, by, true); dv.setFloat32(o+32, bz, true);
    dv.setFloat32(o+36, cx, true); dv.setFloat32(o+40, cy, true); dv.setFloat32(o+44, cz, true);
    dv.setUint16(o+48, 0, true);
    o += 50;
  }
  return buf;
}

// Vattentäthet: varje riktad kant har exakt en motriktad partner.
// Volym via divergenssatsen (> 0 för korrekt vänt slutet skal).
function checkSolid(tris) {
  const edges = new Map();
  const key = (x, y, z) => x + "," + y + "," + z;
  let vol6 = 0;
  for (let t = 0; t < tris.length; t += 9) {
    const p = [[tris[t],tris[t+1],tris[t+2]],[tris[t+3],tris[t+4],tris[t+5]],[tris[t+6],tris[t+7],tris[t+8]]];
    const [a, b, c] = p;
    if ((a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]) || (b[0]===c[0]&&b[1]===c[1]&&b[2]===c[2]) ||
        (a[0]===c[0]&&a[1]===c[1]&&a[2]===c[2])) {
      return { watertight: false, badEdges: -1, volumeMM3: 0, error: "degenererad triangel" };
    }
    vol6 += a[0]*(b[1]*c[2]-c[1]*b[2]) - b[0]*(a[1]*c[2]-c[1]*a[2]) + c[0]*(a[1]*b[2]-b[1]*a[2]);
    for (let e = 0; e < 3; e++) {
      const u = p[e], v = p[(e+1)%3];
      const kf = key(u[0],u[1],u[2]) + "|" + key(v[0],v[1],v[2]);
      const kr = key(v[0],v[1],v[2]) + "|" + key(u[0],u[1],u[2]);
      if (edges.has(kr)) {
        const cnt = edges.get(kr);
        if (cnt === 1) edges.delete(kr); else edges.set(kr, cnt - 1);
      } else {
        edges.set(kf, (edges.get(kf) || 0) + 1);
      }
    }
  }
  return { watertight: edges.size === 0, badEdges: edges.size, volumeMM3: vol6 / 6 };
}

// ------------------------------------------------- zip (verifieras med unzip -t)
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  c = 0xffffffff;
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) c = table[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(files) { // files: [{name, data(ArrayBuffer|string)}]
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const nameB = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : new Uint8Array(f.data);
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true); lh.setUint16(26, nameB.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true); ch.setUint16(28, nameB.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of [...parts, ...central, new Uint8Array(end.buffer)]) { out.set(p, o); o += p.length; }
  return out;
}

/*STL-CORE-END*/

// ==================================================================== app
/* global THREE */
if (typeof window !== "undefined") (function () {

const $ = (id) => document.getElementById(id);
const state = {
  index: null, glyphs: null, qr: null,
  measure: "consumption", zone: "SE",
  yearFrom: null, yearTo: null,
  cap: null, zoom: 1,
  norm: false, normMeasure: "consumption", normZone: "SE2",
  resolution: "hour", maWindow: 24,
  showNegTwin: false,
  weekLabels: [1, 26, 52],
  dataCache: new Map(),
  plate: null, textSolid: null, under: null, twinPlate: null,
  cfg: null, lastNormFactor: 1,
};

const RES_LABEL = {
  hour: null, ma: null, day: "DYGNSMEDEL", week: "VECKOMEDEL", month: "MÅNADSMEDEL",
};
function resolutionSuffix() {
  if (state.resolution === "ma") return `GLID ${state.maWindow} H`;
  return RES_LABEL[state.resolution];
}

const fmtSw = (x, dec = 1) => x.toLocaleString("sv-SE",
  { minimumFractionDigits: dec, maximumFractionDigits: dec });

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

async function loadYear(measure, year) {
  const k = `${measure}_${year}`;
  if (!state.dataCache.has(k)) {
    state.dataCache.set(k, await fetchJSON(`data/${k}.json`));
  }
  return state.dataCache.get(k);
}

function selectedYears() {
  const ys = [];
  for (let y = state.yearFrom; y <= state.yearTo; y++) ys.push(y);
  return ys;
}

async function gatherYearsData(measure, zone, years) {
  const out = [];
  for (const y of years) {
    const f = await loadYear(measure, y);
    out.push({ isoYear: y, weeks: f.weeks, values: f.zones[zone] });
  }
  return out;
}

function measureInfo(m) { return state.index.measures[m]; }

function zoneLabel(z) { return z === "SE" ? "Sverige" : z; }

// ------------------------------------------------------------- bygga modellen
async function rebuild() {
  const info = measureInfo(state.measure);
  const years = selectedYears();
  const raw = await gatherYearsData(state.measure, state.zone, years);
  const yearsData = transformSeries(raw, state.resolution, state.maWindow);

  const isPrice = state.measure === "price";
  const cap = isPrice ? state.cap : null;
  // D2 (rev 1): negativa priser KLIPPS till 0 i huvudmodellen (deklarerat,
  // räknat) och redovisas i negativ-tvillingen i stället för som gropar.
  const floor = isPrice ? 0 : null;

  let normFactor = 1, normNote = null;
  if (state.norm) {
    const refInfo = measureInfo(state.normMeasure);
    const missingYears = years.filter(y => !refInfo.years.includes(y));
    if (missingYears.length) {
      throw new Error(`Referensserien ${refInfo.label} saknar år ${missingYears.join(", ")}`);
    }
    const refRaw = await gatherYearsData(state.normMeasure, state.normZone, years);
    const refData = transformSeries(refRaw, state.resolution, state.maWindow);
    const vRef = seriesVolume(refData, refInfo.scalePerUnit,
      state.normMeasure === "price" ? state.cap : null,
      state.normMeasure === "price" ? 0 : null);
    const vOwn = seriesVolume(yearsData, info.scalePerUnit, cap, floor);
    if (vOwn <= 0) throw new Error("Egen volym är 0 — kan inte normera");
    normFactor = vRef / vOwn;
    normNote = `${refInfo.label} ${zoneLabel(state.normZone)}`;
  }

  const cfg = {
    yearsData, scalePerUnit: info.scalePerUnit, zoom: state.zoom,
    normFactor, cap, floor, underT: UNDER_T,
    years: yearsData.map(y => ({ isoYear: y.isoYear, weeks: y.weeks })),
    weekLabels: state.weekLabels,
  };

  const plate = buildPlate(cfg);

  // negativa timmar (efter transform) → tvilling med |negativa|, tak 100 öre
  let negCount = 0;
  if (isPrice) for (const yd of yearsData) for (const v of yd.values) if (v !== null && v < 0) negCount++;
  let twinPlate = null;
  if (negCount > 0) {
    const twinData = yearsData.map(yd => ({ isoYear: yd.isoYear, weeks: yd.weeks,
      values: yd.values.map(v => v === null ? null : (v < 0 ? Math.min(-v, 100) : 0)) }));
    twinPlate = buildPlate({ ...cfg, yearsData: twinData, cap: null, floor: null,
                             underT: 0, normFactor: 1 });
  }

  // titel: OMRÅDE — MÅTT ÅR [· UPPLÖSNING] [· TAK] [· NORM] [· ZOOM]
  const parts = [`${zoneLabel(state.zone)} — ${info.label}`.toUpperCase()];
  parts.push(years.length > 1 ? `${years[0]}–${years[years.length-1]}` : String(years[0]));
  const resSuf = resolutionSuffix();
  if (resSuf) parts.push(resSuf);
  if (cap !== null && cap !== undefined) parts.push(`TAK ${cap} ÖRE`);
  if (state.norm) parts.push(`NORM ×${fmtSw(normFactor, 2)}`);
  if (state.zoom !== 1) parts.push(`ZOOM ×${state.zoom}`);
  cfg.title = parts.join(" · ");

  const text = buildTextSolid(cfg, state.glyphs, plate);

  // undersidan: bakgrundsfält + QR + speglad källtext
  cfg.underLines = [
    cfg.title,
    `SKALA ${info.scaleLabel.toUpperCase()}` +
      (state.zoom !== 1 ? ` × ZOOM ${state.zoom}` : "") +
      (state.norm ? ` × NORM ${fmtSw(normFactor, 2)}` : ""),
    "1 MM = 1 TIMME · 1 MM = 1 VECKA",
    "KÄLLA: NORD POOL / ENTSO-E",
    "HEDIN.IT/EL3D",
  ];
  const under = buildUnderside(cfg, state.glyphs, state.qr, plate);

  state.plate = plate; state.textSolid = text; state.under = under;
  state.twinPlate = twinPlate; state.negCount = negCount; state.cfg = cfg;
  state.lastNormFactor = normFactor; state.normNote = normNote;
  refreshTwinToggle();
  updateScene();
  updateReadout(plate, text, cfg);
}

function refreshTwinToggle() {
  const row = $("negtwin-row");
  if (row) {
    row.style.display = state.measure === "price" && state.negCount > 0 ? "" : "none";
    if (!(state.measure === "price" && state.negCount > 0)) state.showNegTwin = false;
  }
}

// ------------------------------------------------------------------ three.js
let scene, camera, renderer, canvasEl, rafPending = false;
let plateMesh, textMesh, underBgMesh, underInkMesh;
const view = { yaw: -0.6, pitch: 0.9, dist: 320, cx: 96, cy: 60, fitted: false };

function initThree() {
  canvasEl = $("view");
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f2e6);
  camera = new THREE.PerspectiveCamera(38, 1, 1, 4000);
  const amb = new THREE.AmbientLight(0xffffff, 0.55);
  const dir = new THREE.DirectionalLight(0xfff4e0, 0.75);
  dir.position.set(-150, -220, 300);
  const dir2 = new THREE.DirectionalLight(0xd8e8ff, 0.25);
  dir2.position.set(200, 150, 120);
  // underljus så undersidans QR/text kan förhandsgranskas (G6-läxan:
  // undersidan måste gå att titta på)
  const dir3 = new THREE.DirectionalLight(0xfff4e0, 0.65);
  dir3.position.set(60, -80, -260);
  scene.add(amb, dir, dir2, dir3);
  resize();
  window.addEventListener("resize", resize);

  let dragging = false, lx = 0, ly = 0;
  canvasEl.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener("pointerup", () => { dragging = false; });
  window.addEventListener("pointermove", (e) => {
    if (dragging) {
      view.yaw -= (e.clientX - lx) * 0.008;
      view.pitch = Math.max(-1.49, Math.min(1.49, view.pitch + (e.clientY - ly) * 0.008));
      lx = e.clientX; ly = e.clientY;
      requestRender();
    } else tooltipMove(e);
  });
  canvasEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    view.dist = Math.max(60, Math.min(2500, view.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
    requestRender();
  }, { passive: false });
}

function resize() {
  const w = canvasEl.clientWidth || canvasEl.parentElement.clientWidth;
  const h = canvasEl.parentElement.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  requestRender();
}

function meshFromTris(tris, color) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris), 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhongMaterial({ color, shininess: 12 });
  return new THREE.Mesh(geo, mat);
}

function updateScene() {
  for (const m of [plateMesh, textMesh, underBgMesh, underInkMesh]) {
    if (m) { scene.remove(m); m.geometry.dispose(); }
  }
  plateMesh = textMesh = underBgMesh = underInkMesh = null;
  const plate = state.showNegTwin && state.twinPlate ? state.twinPlate : state.plate;
  plateMesh = meshFromTris(plate.tris, 0xc96f4a);
  scene.add(plateMesh);
  if (!state.showNegTwin) {
    textMesh = meshFromTris(state.textSolid.tris, 0x2f5a8f);
    underBgMesh = meshFromTris(state.under.bgTris, 0xf3ecd9);
    underInkMesh = meshFromTris(state.under.inkTris, 0x25313d);
    scene.add(textMesh, underBgMesh, underInkMesh);
  }
  view.cx = plate.widthMM / 2; view.cy = plate.depthMM / 2;
  // passa in en gång per modellbygge (inte per vinkel — G4-läxan)
  const diag = Math.hypot(plate.widthMM, plate.depthMM, 80);
  view.dist = diag * 1.45;
  requestRender();
}

function requestRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    camera.position.set(
      view.cx + view.dist * cp * Math.sin(view.yaw),
      view.cy - view.dist * cp * Math.cos(view.yaw),
      20 + view.dist * sp);
    camera.up.set(0, 0, 1);
    camera.lookAt(view.cx, view.cy, 12);
    renderer.render(scene, camera);
  });
}

// ------------------------------------------------------------------- tooltip
const raycaster = typeof THREE !== "undefined" ? new THREE.Raycaster() : null;
function tooltipMove(e) {
  const tt = $("tooltip");
  if (!plateMesh || !state.plate) { tt.style.display = "none"; return; }
  const rect = canvasEl.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera({ x: mx, y: my }, camera);
  const hit = raycaster.intersectObject(plateMesh)[0];
  if (!hit) { tt.style.display = "none"; return; }
  const p = hit.point;
  const info = cellAt(p.x, p.y);
  if (!info) { tt.style.display = "none"; return; }
  tt.style.display = "block";
  tt.style.left = (e.clientX - rect.left + 14) + "px";
  tt.style.top = (e.clientY - rect.top + 10) + "px";
  tt.innerHTML = info;
}

const DAY_NAMES = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];
function cellAt(x, y) {
  const plate = state.showNegTwin && state.twinPlate ? state.twinPlate : state.plate;
  if (x < 0 || x >= DATA_W || y < FRONT_APRON) return null;
  const d = Math.floor(x / 25), hh = Math.floor(x - d * 25);
  if (hh >= 24 || d > 6) return null;
  const r = Math.floor(y - FRONT_APRON);
  const M = plate.nRows;
  if (r < 0 || r >= M) return null;
  const meta = plate.rowsMeta[M - 1 - r];
  if (!meta || meta.gap) return null;               // årsskåra
  const yd = state.cfg.years[meta.yi];
  const w = meta.w + 1;
  let v = state.cfg.yearsData[meta.yi].values[meta.w * 168 + d * 24 + hh];
  if (state.showNegTwin && v !== null && v !== undefined) v = v < 0 ? -v : 0;
  const dt = new Date(isoWeek1Monday(yd.isoYear));
  dt.setUTCDate(dt.getUTCDate() + meta.w * 7 + d);
  const ds = dt.toISOString().slice(0, 10);
  const unit = measureInfo(state.measure).unit;
  const resNote = state.resolution === "hour" ? ""
    : ` <i>(${(resolutionSuffix() || "").toLowerCase()})</i>`;
  const val = v === null || v === undefined ? "saknas"
    : `${fmtSw(v, state.measure === "price" ? 1 : 0)} ${unit}${resNote}` +
      (state.showNegTwin ? " <i>(negativ, tvilling)</i>" : "");
  return `<b>${DAY_NAMES[d]} v${w} ${yd.isoYear}</b> (${ds}) kl ${String(hh).padStart(2,"0")}<br>${val}`;
}

// ------------------------------------------------------------------ readout
function updateReadout(plate, text, cfg) {
  const info = measureInfo(state.measure);
  const s = plate.stats;
  const lines = [];
  lines.push(`<b>${cfg.title}</b>`);
  lines.push(`Fotavtryck ${fmtSw(plate.widthMM, 0)} × ${fmtSw(plate.depthMM, 0)} mm, ` +
    `maxhöjd ${fmtSw(BASE + plate.plinth + s.maxMM, 1)} mm, ` +
    `${(plate.tris.length / 9 + text.tris.length / 9).toLocaleString("sv-SE")} trianglar`);
  lines.push(`Skala: ${info.scaleLabel}` +
    (state.zoom !== 1 ? ` × zoom ${state.zoom}` : "") +
    (state.norm ? ` × norm ${fmtSw(state.lastNormFactor, 3)} (mot ${state.normNote})` : ""));
  if (state.resolution !== "hour") lines.push(`Upplösning: ${resolutionSuffix()}`);
  if (s.capped) lines.push(`${s.capped} timmar kapade i taket (platå)`);
  if (state.negCount) lines.push(`${state.negCount} timmar med negativt pris — klippta ` +
    `till 0 i huvudmodellen; se negativ-tvillingen`);
  if (s.missing) lines.push(`${s.missing} saknade timmar (visas på nollplanet)`);
  lines.push(`Undersida: QR (${fmtSw(QR_MODULE, 2)} mm/modul) + källtext i två ` +
    `kontrastfärger, 0–${fmtSw(UNDER_T, 1)} mm`);
  if (state.showNegTwin) lines.push(`<b>Visar negativ-tvillingen</b> — endast ` +
    `|negativa| priser, samma layout, utan texter`);
  $("readout").innerHTML = lines.map(l => `<div>${l}</div>`).join("");

  const rep = text.report.map(b => b.skipped
    ? `  ${b.name}: HOPPAD (${b.skipped})`
    : `  ${b.name}: versal ${fmtSw(b.capMM, 2)} mm, bredd ${fmtSw(b.widthMM, 1)} mm`);
  $("buildreport").textContent =
    `Textblock (golv ${CAP_FLOOR} mm, föredraget ${CAP_PREF} mm):\n` + rep.join("\n");
}

// (crc32/makeZip ligger i STL-CORE så Node-testet kan verifiera zip-artefakten)

function foljesedel(plate, text, cfg) {
  const info = measureInfo(state.measure);
  const years = selectedYears();
  const s = plate.stats;
  const idx = state.index;
  const L = [];
  L.push("FÖLJESEDEL — El i Sverige över tid (kalenderrelief)");
  L.push("=".repeat(56));
  L.push("");
  L.push(`Titel på modellen : ${cfg.title}`);
  L.push(`Mått              : ${info.label} (${info.unit})`);
  L.push(`Område            : ${zoneLabel(state.zone)}`);
  L.push(`År (ISO-år)       : ${years.join(", ")}`);
  L.push(`Exporterad        : ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
  L.push("");
  L.push("FILER — IMPORTERA ALLA I SLICERN (samma koordinatsystem, auto-arrange AV):");
  L.push("  *_modell.stl       — datasoliden (bas, aproner, staplar), datafärg");
  L.push("  *_text.stl         — text ovanpå (titel, veckodagar, år, veckor), kontrastfärg 1");
  L.push(`  *_under_botten.stl — bakgrundsskikt 0–${fmtSw(UNDER_T,1)} mm på HELA undersidan, LJUS färg`);
  L.push("  *_under_tryck.stl  — QR-kod + källtext på undersidan, MÖRK färg");
  if (state.negCount) {
    L.push("  *_negativ_modell.stl — TVILLING: endast |negativa| priser, samma layout,");
    L.push("      utan texter/undersida. Skrivs ut separat (egen platta).");
  }
  L.push("  QR och undersidestext är SPEGLADE i filerna och läses rättvänt underifrån.");
  L.push("");
  L.push("SKALOR (familjeinvarianter — samma i alla exporter):");
  L.push(`  Höjd   : ${info.scaleLabel}`);
  L.push("  Bredd  : 1 mm = 1 timme; 24 mm = 1 dygn (mån–sön, 1 mm mellanrum)");
  L.push("  Djup   : 1 mm = 1 vecka (ISO-veckor, hela veckor mån–sön)");
  if (state.zoom !== 1) L.push(`  ZOOM   : ×${state.zoom} — höjdskalan avviker från familjen (deklarerat)`);
  if (state.norm) {
    L.push(`  NORM   : ×${fmtSw(state.lastNormFactor, 3)} mot ${state.normNote} — volymerna är`);
    L.push("           lika; absolut höjdskala gäller EJ. Paret jämför form, inte mängd.");
  }
  if (state.resolution !== "hour") {
    L.push(`  UPPLÖSNING: ${resolutionSuffix()} — värdena är medelvärden` +
      (state.resolution === "ma" ? ` (centrerat glidande fönster ${state.maWindow} h)` : "") + ".");
  }
  L.push("");
  L.push("LAYOUT:");
  L.push("  Raderna är veckor. Tiden växer mot betraktaren: januari år X+1 ligger");
  L.push("  direkt framför december år X; inom ett år ligger v52 främst och v1 bakerst.");
  L.push("  Årsskiften markeras med en 1 mm skåra i nollplanet (som dygnsskårorna).");
  L.push(`  Fotavtryck ${fmtSw(plate.widthMM,0)} × ${fmtSw(plate.depthMM,0)} mm, maxhöjd ${fmtSw(BASE+plate.plinth+s.maxMM,1)} mm.`);
  L.push("  Nollplanet är apronens ovansida (basplattans topp).");
  L.push("");
  L.push("DATADEKLARATIONER:");
  if (cfg.cap !== null && cfg.cap !== undefined)
    L.push(`  Pristak ${cfg.cap} öre/kWh: ${s.capped} timmar kapade till platå (gravyr TAK).`);
  if (state.negCount) {
    L.push(`  Negativa priser: ${state.negCount} timmar — KLIPPTA till 0 i huvudmodellen`);
    L.push("  (D2-revision 1). Tvillingfilen visar dem som |öre/kWh| i samma skala,");
    L.push("  tak 100 öre. Ställ tvillingen bakom/bredvid huvudmodellen.");
  }
  for (const y of years) {
    const f = state.dataCache.get(`${state.measure}_${y}`);
    if (f && f.partial) {
      L.push(`  År ${y} PÅGÅR: data t.o.m. ${f.dataThrough}; resterande veckor`);
      L.push("  ligger på nollplanet.");
    }
  }
  L.push(`  Saknade timmar: ${s.missing} (visas på nollplanet). DST: vårens timme`);
  L.push("  saknas; höstens dubbeltimme är medelvärdesbildad (spotpris: första).");
  if (state.zone === "SE" && state.measure === "price") L.push("  " + idx.declarations.SE_price);
  L.push("  Spotpriser är nominella öre/kWh utan skatt, moms, påslag och nätavgift.");
  L.push("  " + idx.declarations.weeks);
  L.push("  " + idx.declarations.sources);
  L.push("");
  L.push("UNDERSIDA:");
  L.push(`  QR: ${state.qr.url} — v${state.qr.version}, ${state.qr.size}×${state.qr.size} moduler à ${fmtSw(QR_MODULE,2)} mm`);
  L.push("  (golv 1,25). Kvietzon = bakgrundsskiktets egen färg. Skanna underifrån.");
  L.push("  VÄLJ FÄRGER PÅ LUMINANS: ljust bakgrundsskikt + mörkt tryck (eller");
  L.push("  omvänt), matt filament — kulörkontrast räcker inte (praxis §2.4b).");
  L.push("");
  L.push("TEXTBLOCK (versalhöjdsgolv 2,2 mm):");
  for (const b of [...text.report, ...(state.under ? state.under.report : [])]) {
    L.push(b.skipped ? `  ${b.name}: HOPPAD (${b.skipped})`
      : b.capMM ? `  ${b.name}: "${b.text}" versal ${fmtSw(b.capMM,2)} mm`
      : `  ${b.name}: "${b.text}" (${fmtSw(b.qrModuleMM,2)} mm/modul, ${fmtSw(b.symbolMM,1)} mm symbol)`);
  }
  L.push("");
  L.push("UTSKRIFT: stående som den är; toppen 1,0 mm ovanpå apronytan (0,2 mm");
  L.push(`inbäddad), undersidan flush i skiktet 0–${fmtSw(UNDER_T,1)} mm mot byggplattan —`);
  L.push("använd SLÄT platta, inte texturerad (QR:n trycks mot den). Fyra filament:");
  L.push("datafärg, toppkontrast, ljus undersidesbotten, mörkt undersidestryck.");
  L.push("");
  L.push("Genererad av sweden_electricity-tvillingen (WYSIWYG: vyn och STL:en byggs");
  L.push("av samma kod). Designgrammatik: se Om & metod i webbappen samt SPEC.md.");
  return L.join("\n");
}

async function doExport() {
  const btn = $("export-btn");
  btn.disabled = true; btn.textContent = "Kontrollerar…";
  try {
    await rebuild(); // exportera exakt det som visas
    const plate = state.plate, text = state.textSolid, under = state.under;
    const solids = [
      ["modellsoliden", plate.tris], ["textsoliden", text.tris],
      ["undersidesbottnen", under.bgTris], ["undersidestrycket", under.inkTris],
    ];
    if (state.twinPlate) solids.push(["negativ-tvillingen", state.twinPlate.tris]);
    for (const [name, tris] of solids) {
      const c = checkSolid(tris);
      if (!c.watertight || c.volumeMM3 <= 0) {
        throw new Error(`${name} ej vattentät (${c.badEdges} oparade kanter, ` +
          `volym ${fmtSw(c.volumeMM3, 0)} mm³) — export vägrad`);
      }
    }
    const years = selectedYears();
    const tag = `${state.measure}_${zoneLabel(state.zone)}_${years[0]}` +
      (years.length > 1 ? `-${years[years.length-1]}` : "");
    const files = [
      { name: `${tag}_modell.stl`, data: trisToBinarySTL(plate.tris, tag) },
      { name: `${tag}_text.stl`, data: trisToBinarySTL(text.tris, tag + "_text") },
      { name: `${tag}_under_botten.stl`, data: trisToBinarySTL(under.bgTris, tag + "_ub") },
      { name: `${tag}_under_tryck.stl`, data: trisToBinarySTL(under.inkTris, tag + "_ut") },
    ];
    if (state.twinPlate) {
      files.push({ name: `${tag}_negativ_modell.stl`,
                   data: trisToBinarySTL(state.twinPlate.tris, tag + "_neg") });
    }
    files.push({ name: "FOLJESEDEL.txt", data: foljesedel(plate, text, state.cfg) });
    const zip = makeZip(files);
    const blob = new Blob([zip], { type: "application/zip" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `el_sverige_${tag}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $("error").textContent = "";
  } catch (err) {
    $("error").textContent = String(err.message || err);
  } finally {
    btn.disabled = false; btn.textContent = "Exportera STL (zip)";
  }
}

// ----------------------------------------------------------------------- UI
function yearOpt(y) {
  const p = y === state.index.partialYear ? " (pågår)" : "";
  return `<option value="${y}">${y}${p}</option>`;
}
function fillYearSelects() {
  const info = measureInfo(state.measure);
  const years = info.years;
  const from = $("year-from"), to = $("year-to");
  from.innerHTML = years.map(yearOpt).join("");
  const def = years[years.length - 1];
  if (!years.includes(state.yearFrom)) state.yearFrom = def;
  if (!years.includes(state.yearTo) || state.yearTo < state.yearFrom) state.yearTo = state.yearFrom;
  from.value = state.yearFrom;
  refreshToSelect();
}
function refreshToSelect() {
  const info = measureInfo(state.measure);
  const to = $("year-to");
  const opts = info.years.filter(y => y >= state.yearFrom);
  to.innerHTML = opts.map(yearOpt).join("");
  if (!opts.includes(state.yearTo)) state.yearTo = state.yearFrom;
  to.value = state.yearTo;
  const n = state.yearTo - state.yearFrom + 1;
  $("year-hint").textContent = n > 1
    ? `${n} år rygg mot rygg — djup ~${FRONT_APRON + n * 52} mm` +
      (FRONT_APRON + n * 53 > 250 ? " (större än de flesta skrivarbäddar!)" : "")
    : "Flera år staplas rygg mot rygg, nyaste året främst.";
}

function refreshVisibility() {
  $("cap-row").style.display = state.measure === "price" ? "" : "none";
  $("norm-detail").style.display = state.norm ? "" : "none";
}

async function onChange() {
  $("error").textContent = "";
  try {
    await rebuild();
  } catch (err) {
    $("error").textContent = String(err.message || err);
  }
}

function bindUI() {
  $("measure").addEventListener("change", async (e) => {
    state.measure = e.target.value;
    fillYearSelects(); refreshVisibility(); await onChange();
  });
  $("zone").addEventListener("change", async (e) => { state.zone = e.target.value; await onChange(); });
  $("year-from").addEventListener("change", async (e) => {
    state.yearFrom = +e.target.value; refreshToSelect(); await onChange();
  });
  $("year-to").addEventListener("change", async (e) => {
    state.yearTo = +e.target.value; refreshToSelect(); await onChange();
  });
  $("cap").addEventListener("change", async (e) => {
    state.cap = e.target.value === "none" ? null : +e.target.value;
    await onChange();
  });
  $("zoom").addEventListener("change", async (e) => { state.zoom = +e.target.value; await onChange(); });
  $("norm").addEventListener("change", async (e) => {
    state.norm = e.target.checked; refreshVisibility(); await onChange();
  });
  $("norm-measure").addEventListener("change", async (e) => { state.normMeasure = e.target.value; await onChange(); });
  $("norm-zone").addEventListener("change", async (e) => { state.normZone = e.target.value; await onChange(); });
  $("weeks").addEventListener("change", async (e) => {
    state.weekLabels = e.target.value.split(",").map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 53);
    await onChange();
  });
  $("resolution").addEventListener("change", async (e) => {
    state.resolution = e.target.value;
    $("ma-row").style.display = state.resolution === "ma" ? "" : "none";
    await onChange();
  });
  $("ma-window").addEventListener("change", async (e) => {
    state.maWindow = Math.max(2, Math.min(2000, parseInt(e.target.value, 10) || 24));
    e.target.value = state.maWindow;
    await onChange();
  });
  $("negtwin").addEventListener("change", async (e) => {
    state.showNegTwin = e.target.checked;
    updateScene();
    updateReadout(state.plate, state.textSolid, state.cfg);
  });
  $("export-btn").addEventListener("click", doExport);
  $("about-btn").addEventListener("click", () => {
    $("about").style.display = $("about").style.display === "none" ? "block" : "none";
  });
  $("about-close").addEventListener("click", () => { $("about").style.display = "none"; });
}

async function main() {
  try {
    state.glyphs = await fetchJSON("glyphs.json");
    state.index = await fetchJSON("data/index.json");
    state.qr = await fetchJSON("qr.json");
  } catch (err) {
    $("error").textContent = "Kunde inte läsa data. Kör via en webbserver " +
      "(t.ex. python -m http.server i site/) — file:// fungerar inte. " + err;
    return;
  }
  const mSel = $("measure");
  mSel.innerHTML = Object.entries(state.index.measures)
    .map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("");
  mSel.value = state.measure;
  const zoneOpts = state.index.zones
    .map(z => `<option value="${z}">${zoneLabel(z)}</option>`).join("");
  $("zone").innerHTML = zoneOpts;
  $("norm-zone").innerHTML = zoneOpts;
  $("norm-measure").innerHTML = mSel.innerHTML;
  $("norm-zone").value = state.normZone;
  fillYearSelects();
  refreshVisibility();
  $("declarations").innerHTML = Object.values(state.index.declarations)
    .map(d => `<li>${d}</li>`).join("");
  bindUI();
  initThree();
  await onChange();
}

main();

})();

// Node-export för testet (ingen effekt i webbläsaren)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BAR_W, DAY_GAP, DAY_BLOCK, DATA_W, RIGHT_APRON, FRONT_APRON, ROW_D, BASE,
    CAP_FLOOR, PRICE_FLOOR, computeHeights, seriesVolume, buildPlate,
    buildTextSolid, trisToBinarySTL, checkSolid, earcut, layoutLine, makeZip, crc32,
  };
}
