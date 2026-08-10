#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_qr.py — genererar QR-matrisen för undersidan → site/qr.json.

Praxisregler (PRACTICE_NOTES): versal-URL (alfanumeriskt läge, mindre version),
budgeterad mot versionsgränsen 25 tecken (v1), ECC L, ingen query-sträng.
Verifiering genom AVKODNING (cv2.QRCodeDetector) — inte genom att titta på
koden — plus känt-dåligt-test (spegling ska inte avkoda till samma sträng).
"""
import json
import sys
from pathlib import Path

import numpy as np
import qrcode
import cv2

URL = "HTTPS://HEDIN.IT/R/EL3D"  # 23 tecken -> QR v1, ompekbar via r/-tabellen
OUT = Path(__file__).resolve().parent.parent / "site" / "qr.json"


def main():
    if len(URL) > 25:
        sys.exit(f"BYGGSPÄRR: URL {len(URL)} tecken > v1-gränsen 25 — kräver v2 "
                 "(4 moduler bredare); korta URL:en eller höj golvet medvetet.")
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L, border=0)
    qr.add_data(URL)
    qr.make(fit=True)
    if qr.version != 1:
        sys.exit(f"BYGGSPÄRR: fick version {qr.version}, väntade 1")
    m = qr.get_matrix()
    size = len(m)
    matrix = [[1 if c else 0 for c in row] for row in m]

    # verifiera genom att avkoda en renderad bild (kvietzon 4 moduler, skala 16)
    def decode(mat):
        s = len(mat)
        px = 16
        q = 4 * px
        img = np.full(((s * px) + 2 * q, (s * px) + 2 * q), 255, np.uint8)
        for y, row in enumerate(mat):
            for x, v in enumerate(row):
                if v:
                    img[q + y*px:q + (y+1)*px, q + x*px:q + (x+1)*px] = 0
        data, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
        return data

    got = decode(matrix)
    if got != URL:
        sys.exit(f"BYGGSPÄRR: avkodning gav {got!r}, väntade {URL!r}")
    # känt-dåligt: förstört sökmönster (övre vänstra 7×7 inverterat) ska inte avkodas
    # (obs: spegling duger inte som känt-dåligt — cv2 avkodar speglade koder)
    broken = [row[:] for row in matrix]
    for y in range(7):
        for x in range(7):
            broken[y][x] ^= 1
    if decode(broken) == URL:
        sys.exit("BYGGSPÄRR: verifieringen godkände förstört sökmönster — otillförlitlig")
    print(f"QR v1 {size}×{size}, ECC L, avkodad OK: {got}")
    print("Känt-dåligt (förstört sökmönster) avkodas inte: OK")

    OUT.write_text(json.dumps({
        "url": URL, "version": 1, "ecc": "L", "size": size, "matrix": matrix,
        "note": "border=0; kvietzon läggs i geometrin (2+ moduler i bottenfärgen)",
    }, separators=(",", ":")))
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
