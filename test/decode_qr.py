#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Avkodningsorakel för Node-testet: läser {matrices: [{matrix, expect}...]}
från argv[1], avkodar varje matris med cv2 och skriver en rad per resultat:
OK <text> eller MISS. Oberoende av JS-kodaren — riktig avkodning, inte
kodgranskning (praxis §"verifiera genom att avkoda")."""
import json
import sys

import numpy as np
import cv2


def decode(matrix):
    s = len(matrix)
    px = 16
    q = 4 * px
    img = np.full((s * px + 2 * q, s * px + 2 * q), 255, np.uint8)
    for y, row in enumerate(matrix):
        for x, v in enumerate(row):
            if v:
                img[q + y * px:q + (y + 1) * px, q + x * px:q + (x + 1) * px] = 0
    data, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    return data


def main():
    obj = json.load(open(sys.argv[1]))
    for case in obj["matrices"]:
        got = decode(case["matrix"])
        print(f"OK {got}" if got else "MISS")


if __name__ == "__main__":
    main()
