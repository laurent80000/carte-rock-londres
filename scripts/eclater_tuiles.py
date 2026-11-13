#!/usr/bin/env python3
"""Éclate un fichier .pmtiles en un dossier de tuiles z/x/y.pbf décompressées.

L'hébergeur refuse les fichiers de plus de 25 Mio : le fond de carte est donc
publié tuile par tuile plutôt qu'en un seul fichier.

Usage : python3 scripts/eclater_tuiles.py londres.pmtiles app/tuiles
"""
import gzip
import shutil
import sys
from pathlib import Path

from pmtiles.reader import MmapSource, all_tiles

source, sortie = Path(sys.argv[1]), Path(sys.argv[2])
if sortie.exists():
    shutil.rmtree(sortie)
nb = total = plus_gros = 0
with open(source, "rb") as f:
    for (z, x, y), donnees in all_tiles(MmapSource(f)):
        if donnees[:2] == b"\x1f\x8b":
            donnees = gzip.decompress(donnees)
        chemin = sortie / str(z) / str(x) / f"{y}.pbf"
        chemin.parent.mkdir(parents=True, exist_ok=True)
        chemin.write_bytes(donnees)
        nb += 1
        total += len(donnees)
        plus_gros = max(plus_gros, len(donnees))
print(f"{nb} tuiles, {total / 1e6:.0f} Mo au total, la plus grosse fait {plus_gros / 1e6:.1f} Mo.")
