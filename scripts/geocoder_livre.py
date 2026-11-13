#!/usr/bin/env python3
"""Géocode les adresses d'un relevé de livre avec Nominatim (OpenStreetMap).

    python3 scripts/geocoder_livre.py sources/livres/wooldridge_2002.csv

Remplit les colonnes lat, lon et precision du CSV (adresse, rue ou quartier).
Les réponses sont gardées dans sources/livres/geocodage_cache.json pour ne
jamais interroger deux fois le service, dont la règle d'usage impose au plus
une requête par seconde. Les lignes déjà rattachées à une fiche existante ne
sont pas géocodées : leur position est celle de la fiche.
"""
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
CACHE = RACINE / "sources/livres/geocodage_cache.json"
# Grand Londres et ses abords (Dartford, Shepperton), pour écarter les homonymes.
CADRE = "-0.62,51.70,0.32,51.28"
AGENT = "carte-rock-londres/1.0 (usage personnel)"


def chercher(requete, cache):
    if requete in cache:
        return cache[requete]
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": requete, "format": "jsonv2", "limit": 1, "countrycodes": "gb",
        "viewbox": CADRE, "bounded": 1, "addressdetails": 1,
    })
    time.sleep(1.1)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": AGENT}), timeout=30) as r:
        resultat = json.load(r)
    cache[requete] = resultat[0] if resultat else None
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    return cache[requete]


def precision(r):
    adr = r.get("address", {})
    if adr.get("house_number") or r.get("category") in ("building", "amenity", "tourism", "leisure", "shop", "office"):
        return "adresse"
    if r.get("category") == "highway" or r.get("addresstype") in ("road", "residential"):
        return "rue"
    return "quartier"


def main():
    chemin = Path(sys.argv[1])
    with open(chemin, encoding="utf-8", newline="") as f:
        lignes = list(csv.DictReader(f))
        champs = list(lignes[0].keys())
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    bilan = {"adresse": 0, "rue": 0, "quartier": 0, "introuvable": 0, "fiche": 0}
    for l in lignes:
        if l["fiche_existante"]:
            bilan["fiche"] += 1
            continue
        if l["lat"] and l["lon"]:
            bilan[l["precision"] or "adresse"] += 1
            continue
        essais = [
            f"{l['adresse']}, {l['quartier']}, London",
            f"{l['adresse']}, London",
            f"{l['lieu']}, {l['quartier']}, London",
            f"{l['quartier']}, London",
        ]
        trouve = None
        for i, requete in enumerate(essais):
            r = chercher(requete, cache)
            if r:
                trouve = (r, "quartier" if i == 3 else precision(r))
                break
        if not trouve:
            l["precision"] = "introuvable"
            bilan["introuvable"] += 1
            continue
        r, p = trouve
        l["lat"], l["lon"], l["precision"] = f"{float(r['lat']):.6f}", f"{float(r['lon']):.6f}", p
        bilan[p] += 1
        print(f"{p:9} {l['lieu']} ({r.get('display_name', '')[:70]})")
    with open(chemin, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=champs)
        w.writeheader()
        w.writerows(lignes)
    print(bilan)


if __name__ == "__main__":
    main()
