#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_glyphs.py — DejaVu Sans Bold → site/glyphs.json (SPEC.md §5).

Konturer i em-enheter (1.0 = em), flatade (kvadratiska bézier, 8 segment).
Hål klassas via nästningsdjup med containment (INTE via orientering —
petrol-läxan: annars försvinner hålen i A, O, 0). Yttre ringar CCW, hål CW.
Advance per tecken; capHeight ur 'H'. Ingen bitmappsfont någonsin.
"""
import json
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from shapely.geometry import Polygon

FONT = "/Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSans-Bold.ttf"
CHARS = ("ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖ" "abcdefghijklmnopqrstuvwxyzåäö"
         "0123456789" " .,:;()/×−-–—·+=%")
OUT = Path(__file__).resolve().parent.parent / "site" / "glyphs.json"
SEG = 8


def flatten_quad(p0, p1, p2):
    return [(
        (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0],
        (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1],
    ) for t in (i / SEG for i in range(1, SEG + 1))]


def glyph_contours(glyphset, name):
    pen = DecomposingRecordingPen(glyphset)
    glyphset[name].draw(pen)
    contours, cur = [], []
    for op, args in pen.value:
        if op == "moveTo":
            cur = [args[0]]
        elif op == "lineTo":
            cur.append(args[0])
        elif op == "qCurveTo":
            # TrueType: implicita on-kurvpunkter mellan konsekutiva off-punkter
            pts = list(args)
            p0 = cur[-1]
            if pts[-1] is None:  # sluten kurva utan explicit slutpunkt
                pts[-1] = cur[0]
            offs, last = pts[:-1], pts[-1]
            for i, off in enumerate(offs):
                end = (offs[i + 1] if i + 1 < len(offs) else last)
                if i + 1 < len(offs):
                    end = ((off[0] + end[0]) / 2, (off[1] + end[1]) / 2)
                cur += flatten_quad(p0, off, end)
                p0 = cur[-1]
        elif op == "curveTo":  # kubisk (förekommer ej i DejaVu ttf, men säkert)
            p0 = cur[-1]
            c1, c2, p3 = args
            for i in range(1, SEG + 1):
                t = i / SEG
                mt = 1 - t
                cur.append((
                    mt**3*p0[0] + 3*mt*mt*t*c1[0] + 3*mt*t*t*c2[0] + t**3*p3[0],
                    mt**3*p0[1] + 3*mt*mt*t*c1[1] + 3*mt*t*t*c2[1] + t**3*p3[1]))
        elif op == "closePath":
            if len(cur) >= 3:
                contours.append(cur)
            cur = []
    return contours


def classify(contours):
    """Nästningsdjup via containment: jämnt djup = ö (yttre), udda = hål.
    Hålets FÖRÄLDER (den yttre ring som omsluter det, djup−1) avgörs också
    geometriskt här — fontens konturordning är godtycklig (DejaVu listar
    t.ex. O:s hål FÖRE ytterringen), så ordningsbaserad koppling är fel."""
    polys = [Polygon(c).buffer(0) for c in contours]
    out = []
    for i, (c, p) in enumerate(zip(contours, polys)):
        depth = sum(1 for j, q in enumerate(polys) if j != i and q.covers(p))
        out.append({"pts": c, "hole": depth % 2 == 1, "depth": depth, "parent": None})
    for i, ci in enumerate(out):
        if not ci["hole"]:
            continue
        for j, cj in enumerate(out):
            if j != i and not cj["hole"] and cj["depth"] == ci["depth"] - 1 \
                    and polys[j].covers(polys[i]):
                ci["parent"] = j
                break
        if ci["parent"] is None:
            raise SystemExit(f"BYGGSPÄRR: hål utan förälder (kontur {i})")
    return out


def orient(pts, ccw):
    area = sum((pts[i][0] * pts[(i + 1) % len(pts)][1]
                - pts[(i + 1) % len(pts)][0] * pts[i][1]) for i in range(len(pts)))
    return pts if (area > 0) == ccw else pts[::-1]


def main():
    font = TTFont(FONT)
    upm = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    glyphset = font.getGlyphSet()
    hmtx = font["hmtx"]

    glyphs = {}
    for ch in CHARS:
        cp = ord(ch)
        if cp not in cmap:
            raise SystemExit(f"BYGGSPÄRR: '{ch}' saknas i fonten")
        gname = cmap[cp]
        adv = hmtx[gname][0] / upm
        contours = glyph_contours(glyphset, gname)
        cls = classify(contours)
        glyphs[ch] = {
            "adv": round(adv, 4),
            "contours": [{
                "hole": c["hole"],
                "depth": c["depth"],
                "parent": c["parent"],
                "pts": [[round(x / upm, 4), round(y / upm, 4)]
                        for x, y in orient(c["pts"], ccw=not c["hole"])],
            } for c in cls],
        }

    h = glyphs["H"]["contours"][0]["pts"]
    cap = max(p[1] for p in h)
    obj = {"font": "DejaVu Sans Bold", "upm": upm, "capHeight": round(cap, 4),
           "tracking": 0.03, "glyphs": glyphs}
    OUT.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    npts = sum(len(c["pts"]) for g in glyphs.values() for c in g["contours"])
    print(f"{len(glyphs)} tecken, {npts} punkter, capHeight {cap:.3f} em → {OUT}")
    # sanity: tecken som MÅSTE ha hål
    for ch in "AOÖ0846abdegopqå":
        assert any(c["hole"] for c in glyphs[ch]["contours"]), f"'{ch}' saknar hål!"
    print("Hålkontroll (A O Ö 0 8 4 6 a b d e g o p q å): OK")


if __name__ == "__main__":
    main()
