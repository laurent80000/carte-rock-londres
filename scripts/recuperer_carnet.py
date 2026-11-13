#!/usr/bin/env python3
"""Reverse le carnet de terrain dans les fiches.

Le carnet (visites marquées et notes prises depuis le téléphone) vit chez
l'hébergeur. Ce script lit une copie de ce carnet et met à jour data/lieux :
un lieu marqué visité passe au statut "visite", les notes rejoignent le champ
"notes" de la fiche. Il peut être relancé sans créer de doublons.

Usage : python3 scripts/recuperer_carnet.py carnet.json
        (carnet.json = le contenu de la page /api/carnet du site)
"""
import json
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent

operations = sorted(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["operations"], key=lambda o: o["date"])
visites, notes = {}, {}
for o in operations:
    if o["type"] == "visite":
        visites[o["lieu"]] = o["date"][:10]
    elif o["type"] == "annuler_visite":
        visites.pop(o["lieu"], None)
    elif o["type"] == "note":
        notes.setdefault(o["lieu"], []).append(o)

modifiees = 0
for lieu in sorted(set(visites) | set(notes)):
    chemin = RACINE / "data/lieux" / f"{lieu}.json"
    if not chemin.exists():
        print(f"Fiche introuvable pour \"{lieu}\" : opération ignorée.")
        continue
    fiche = json.loads(chemin.read_text(encoding="utf-8"))
    avant = json.dumps(fiche, sort_keys=True)
    if lieu in visites:
        fiche["statut"] = "visite"
        jours = set(fiche.get("visites_terrain", [])) | {visites[lieu]}
        fiche["visites_terrain"] = sorted(jours)
    connues = {n.get("id") for n in fiche.get("notes", [])}
    for n in notes.get(lieu, []):
        if n["id"] not in connues:
            fiche.setdefault("notes", []).append({"id": n["id"], "date": n["date"][:10], "texte": n["texte"], "origine": "carnet de terrain"})
    if json.dumps(fiche, sort_keys=True) != avant:
        chemin.write_text(json.dumps(fiche, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        modifiees += 1
print(f"{len(operations)} opérations lues, {modifiees} fiches modifiées.")
