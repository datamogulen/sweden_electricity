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

function heightfieldSolid(xs, ys, H) {
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
      const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1], h = H[j][i];
      // topp (normal +z) och botten (normal −z)
      pushQuad(tris, [x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]);
      pushQuad(tris, [x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0]);
    }
  }
  // väggar längs vertikala linjer x = xs[i], mellan cellerna (i−1,j) och (i,j)
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j < ny; j++) {
      const hL = hAt(i - 1, j), hR = hAt(i, j);
      if (hL === null && hR === null) continue;
      const lo = (hL === null || hR === null) ? 0 : Math.min(hL, hR);
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
      const lo = (hF === null || hB === null) ? 0 : Math.min(hF, hB);
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
function buildPlate(cfg) {
  const ch = computeHeights(cfg);
  const zP = BASE + ch.plinth;              // nollplanet = apronens ovansida
  const N = ch.nRows;
  const xs = [];
  for (let d = 0; d < 7; d++) for (let h = 0; h <= 24; h++) xs.push(d * 25 + h);
  xs.push(DATA_W + RIGHT_APRON);
  const ys = [0, 6, 12];
  for (let i = 1; i <= N; i++) ys.push(FRONT_APRON + i * ROW_D);
  const nx = xs.length - 1, ny = ys.length - 1;

  const H = [];
  for (let j = 0; j < ny; j++) {
    const rowH = new Array(nx);
    for (let i = 0; i < nx; i++) {
      const x0 = xs[i];
      let h = zP; // aproner, dygnsmellanrum och saknade timmar ligger på nollplanet
      if (j >= 2 && x0 < DATA_W) {
        const d = Math.floor(x0 / 25), hh = x0 - d * 25;
        if (hh < 24) {
          const c = N - 1 - (j - 2);            // rad 0 (främst) = nyaste veckan
          const v = ch.rows[c][d * 24 + hh];    // dygnsblock d = ISO-veckodag d
          if (v !== null) h = Math.max(zP + v, BASE); // gropbotten aldrig under basen
        }
      }
      rowH[i] = h;
    }
    H.push(rowH);
  }
  const tris = heightfieldSolid(xs, ys, H);
  return { tris, zP, nRows: N, plinth: ch.plinth, stats: ch.stats,
           widthMM: DATA_W + RIGHT_APRON, depthMM: FRONT_APRON + N * ROW_D,
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

  // 1. Titelband y 0–6: centrerad, cap 4,6 → krymp till bredd, golv 2,2 (spärr)
  {
    let cap = 4.6;
    const maxW = DATA_W + RIGHT_APRON - 4;
    let probe = layoutLine(glyphData, cfg.title, cap);
    if (probe.width > maxW) cap = Math.max(CAP_FLOOR, cap * maxW / probe.width);
    probe = layoutLine(glyphData, cfg.title, cap);
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
  //   Rad c (kronologiskt) ligger på y = FRONT_APRON + (N−1−c)·ROW_D.
  let off = 0;
  const yearBands = [];
  for (const yd of cfg.years) {
    const cFirst = off, cLast = off + yd.weeks - 1;
    const yFront = FRONT_APRON + (N - 1 - cLast) * ROW_D;      // årets nyaste rad
    const yBack = FRONT_APRON + (N - 1 - cFirst) * ROW_D + ROW_D;
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
      const c = off + w - 1;
      const rowY = FRONT_APRON + (N - 1 - c) * ROW_D;
      const label = `v${w}`;
      const lw = layoutLine(glyphData, label, capW);
      let yLab = rowY + ROW_D / 2 - capW / 2;
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
    off += yd.weeks;
  }

  // Golvkontroll över hela rapporten (spärren har redan vägrat per block,
  // detta är bältet till hängslena — och tabellen loggas alltid)
  for (const b of report) {
    if (!b.skipped && b.capMM < CAP_FLOOR - 1e-9) {
      throw new Error(`BYGGSPÄRR: "${b.name}" under golvet i slutkontroll`);
    }
  }
  return { tris, report };
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
/*STL-CORE-END*/

// ==================================================================== app
/* global THREE */
if (typeof window !== "undefined") (function () {

const $ = (id) => document.getElementById(id);
const state = {
  index: null, glyphs: null,
  measure: "consumption", zone: "SE",
  yearFrom: null, yearTo: null,
  cap: null, zoom: 1,
  norm: false, normMeasure: "consumption", normZone: "SE2",
  weekLabels: [1, 26, 52],
  dataCache: new Map(),
  plate: null, textSolid: null, cfg: null, lastNormFactor: 1,
};

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
  const yearsData = await gatherYearsData(state.measure, state.zone, years);

  const isPrice = state.measure === "price";
  const cap = isPrice ? state.cap : null;
  const floor = isPrice ? PRICE_FLOOR : null;

  let normFactor = 1, normNote = null;
  if (state.norm) {
    const refInfo = measureInfo(state.normMeasure);
    const missingYears = years.filter(y => !refInfo.years.includes(y));
    if (missingYears.length) {
      throw new Error(`Referensserien ${refInfo.label} saknar år ${missingYears.join(", ")}`);
    }
    const refData = await gatherYearsData(state.normMeasure, state.normZone, years);
    const vRef = seriesVolume(refData, refInfo.scalePerUnit,
      state.normMeasure === "price" ? state.cap : null,
      state.normMeasure === "price" ? PRICE_FLOOR : null);
    const vOwn = seriesVolume(yearsData, info.scalePerUnit, cap, floor);
    if (vOwn <= 0) throw new Error("Egen volym är 0 — kan inte normera");
    normFactor = vRef / vOwn;
    normNote = `${refInfo.label} ${zoneLabel(state.normZone)}`;
  }

  const cfg = {
    yearsData, scalePerUnit: info.scalePerUnit, zoom: state.zoom,
    normFactor, cap, floor,
    years: yearsData.map(y => ({ isoYear: y.isoYear, weeks: y.weeks })),
    weekLabels: state.weekLabels,
  };

  const plate = buildPlate(cfg);

  // titel: OMRÅDE — MÅTT ÅR [· TAK] [· NORM] [· ZOOM] [· 0-plan]
  const parts = [`${zoneLabel(state.zone)} — ${info.label}`.toUpperCase()];
  parts.push(years.length > 1 ? `${years[0]}–${years[years.length-1]}` : String(years[0]));
  if (cap !== null && cap !== undefined) parts.push(`TAK ${cap} ÖRE`);
  if (state.norm) parts.push(`NORM ×${fmtSw(normFactor, 2)}`);
  if (state.zoom !== 1) parts.push(`ZOOM ×${state.zoom}`);
  if (plate.plinth > 0) parts.push(`0 = +${plate.plinth} MM`);
  cfg.title = parts.join(" · ");

  const text = buildTextSolid(cfg, state.glyphs, plate);

  state.plate = plate; state.textSolid = text; state.cfg = cfg;
  state.lastNormFactor = normFactor; state.normNote = normNote;
  updateScene(plate, text);
  updateReadout(plate, text, cfg);
}

// ------------------------------------------------------------------ three.js
let scene, camera, renderer, plateMesh, textMesh, canvasEl, rafPending = false;
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
  scene.add(amb, dir, dir2);
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

function updateScene(plate, text) {
  if (plateMesh) { scene.remove(plateMesh); plateMesh.geometry.dispose(); }
  if (textMesh) { scene.remove(textMesh); textMesh.geometry.dispose(); }
  plateMesh = meshFromTris(plate.tris, 0xc96f4a);
  textMesh = meshFromTris(text.tris, 0x2f5a8f);
  scene.add(plateMesh, textMesh);
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
function isoWeekStart(y) {
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const wd = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - wd);
  return jan4;
}
function cellAt(x, y) {
  if (x < 0 || x >= DATA_W || y < FRONT_APRON) return null;
  const d = Math.floor(x / 25), hh = Math.floor(x - d * 25);
  if (hh >= 24 || d > 6) return null;
  const r = Math.floor(y - FRONT_APRON);
  const N = state.plate.nRows;
  if (r < 0 || r >= N) return null;
  const c = N - 1 - r;
  let off = 0;
  for (const yd of state.cfg.years) {
    if (c < off + yd.weeks) {
      const w = c - off + 1;
      const v = state.cfg.yearsData[state.cfg.years.indexOf(yd)]
        .values[(w - 1) * 168 + d * 24 + hh];
      const dt = new Date(isoWeekStart(yd.isoYear));
      dt.setUTCDate(dt.getUTCDate() + (w - 1) * 7 + d);
      const ds = dt.toISOString().slice(0, 10);
      const unit = measureInfo(state.measure).unit;
      const val = v === null || v === undefined ? "saknas"
        : `${fmtSw(v, state.measure === "price" ? 1 : 0)} ${unit}`;
      return `<b>${DAY_NAMES[d]} v${w} ${yd.isoYear}</b> (${ds}) kl ${String(hh).padStart(2,"0")}<br>${val}`;
    }
    off += yd.weeks;
  }
  return null;
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
  if (plate.plinth > 0) lines.push(`Sockel ${plate.plinth} mm — nollplanet är apronytan; ` +
    `negativa timmar är gropar`);
  if (s.capped) lines.push(`${s.capped} timmar kapade i taket (platå)`);
  if (s.floored) lines.push(`${s.floored} timmar under golvet ${PRICE_FLOOR} öre (kapade)`);
  if (s.missing) lines.push(`${s.missing} saknade timmar (visas på nollplanet)`);
  $("readout").innerHTML = lines.map(l => `<div>${l}</div>`).join("");

  const rep = text.report.map(b => b.skipped
    ? `  ${b.name}: HOPPAD (${b.skipped})`
    : `  ${b.name}: versal ${fmtSw(b.capMM, 2)} mm, bredd ${fmtSw(b.widthMM, 1)} mm`);
  $("buildreport").textContent =
    `Textblock (golv ${CAP_FLOOR} mm, föredraget ${CAP_PREF} mm):\n` + rep.join("\n");
}

// -------------------------------------------------------------------- export
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
  L.push("  modell.stl  — datasoliden (bas, aproner, sockel, staplar) i datafärg");
  L.push("  text.stl    — all text (titel, veckodagar, år, veckonummer) i kontrastfärg");
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
  L.push("");
  L.push("LAYOUT:");
  L.push("  Raderna är veckor. Tiden växer mot betraktaren: januari år X+1 ligger");
  L.push("  direkt framför december år X; inom ett år ligger v52 främst och v1 bakerst.");
  L.push(`  Fotavtryck ${fmtSw(plate.widthMM,0)} × ${fmtSw(plate.depthMM,0)} mm, maxhöjd ${fmtSw(BASE+plate.plinth+s.maxMM,1)} mm.`);
  if (plate.plinth > 0) {
    L.push(`  Sockel ${plate.plinth} mm: nollplanet är apronens OVANSIDA; negativa`);
    L.push("  spotpristimmar är gropar under nollplanet.");
  } else {
    L.push("  Nollplanet är apronens ovansida (basplattans topp, 1,2 mm).");
  }
  L.push("");
  L.push("DATADEKLARATIONER:");
  if (cfg.cap !== null && cfg.cap !== undefined)
    L.push(`  Pristak ${cfg.cap} öre/kWh: ${s.capped} timmar kapade till platå (gravyr TAK).`);
  if (s.floored) L.push(`  Prisgolv ${PRICE_FLOOR} öre/kWh: ${s.floored} timmar kapade.`);
  L.push(`  Saknade timmar: ${s.missing} (visas på nollplanet). DST: vårens timme`);
  L.push("  saknas; höstens dubbeltimme är medelvärdesbildad (spotpris: första).");
  if (state.zone === "SE" && state.measure === "price") L.push("  " + idx.declarations.SE_price);
  L.push("  Spotpriser är nominella öre/kWh utan skatt, moms, påslag och nätavgift.");
  L.push("  " + idx.declarations.weeks);
  L.push("  " + idx.declarations.sources);
  L.push("");
  L.push("TEXTBLOCK (versalhöjdsgolv 2,2 mm):");
  for (const b of text.report) {
    L.push(b.skipped ? `  ${b.name}: HOPPAD (${b.skipped})`
      : `  ${b.name}: "${b.text}" versal ${fmtSw(b.capMM,2)} mm`);
  }
  L.push("");
  L.push("UTSKRIFT: stående som den är; texten ligger 1,0 mm ovanpå apronytan och");
  L.push("0,2 mm inbäddad. Två filament: datafärg + kontrastfärg (matt, ljus bas");
  L.push("och mörk text eller omvänt — luminanskontrast, inte bara kulörkontrast).");
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
    const plate = state.plate, text = state.textSolid;
    const cp = checkSolid(plate.tris);
    const ct = checkSolid(text.tris);
    if (!cp.watertight || cp.volumeMM3 <= 0) {
      throw new Error(`Modellsoliden ej vattentät (${cp.badEdges} oparade kanter, ` +
        `volym ${fmtSw(cp.volumeMM3, 0)} mm³) — export vägrad`);
    }
    if (!ct.watertight || ct.volumeMM3 <= 0) {
      throw new Error(`Textsoliden ej vattentät (${ct.badEdges} oparade kanter) — export vägrad`);
    }
    const years = selectedYears();
    const tag = `${state.measure}_${zoneLabel(state.zone)}_${years[0]}` +
      (years.length > 1 ? `-${years[years.length-1]}` : "");
    const zip = makeZip([
      { name: `${tag}_modell.stl`, data: trisToBinarySTL(plate.tris, tag) },
      { name: `${tag}_text.stl`, data: trisToBinarySTL(text.tris, tag + "_text") },
      { name: "FOLJESEDEL.txt", data: foljesedel(plate, text, state.cfg) },
    ]);
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
function fillYearSelects() {
  const info = measureInfo(state.measure);
  const years = info.years;
  const from = $("year-from"), to = $("year-to");
  from.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
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
  to.innerHTML = opts.map(y => `<option value="${y}">${y}</option>`).join("");
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
    buildTextSolid, trisToBinarySTL, checkSolid, earcut, layoutLine, makeZip: null,
  };
}
