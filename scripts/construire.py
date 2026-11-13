#!/usr/bin/env python3
"""Assemble l'application dans app/ : données des lieux et bibliothèques.

  python3 scripts/construire.py            version privée (toutes les fiches)
  python3 scripts/construire.py --public   seulement les fiches publiées, sans les champs de travail

Le fond de carte (tuiles, polices, pictogrammes) se télécharge à part avec
scripts/fond_de_carte.sh.
"""
import argparse
import json
import shutil
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
BIBLIOTHEQUES = [
    "maplibre-gl/dist/maplibre-gl.mjs",
    "maplibre-gl/dist/maplibre-gl-shared.mjs",
    "maplibre-gl/dist/maplibre-gl-worker.mjs",
    "maplibre-gl/dist/maplibre-gl.css",
    "@protomaps/basemaps/dist/basemaps.js",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--public", action="store_true")
    args = ap.parse_args()

    lieux = []
    for p in sorted((RACINE / "data/lieux").glob("*.json")):
        f = json.loads(p.read_text(encoding="utf-8"))
        if not f.get("coordonnees"):
            continue
        if args.public and f.get("publication") != "public":
            continue
        imp = f.get("import") or {}
        lieu = {
            "id": f["id"], "nom": f["nom"], "nature": f["nature"], "type": f["type"],
            "adresse": f.get("adresse"), "quartier": f.get("quartier"),
            "lat": f["coordonnees"]["lat"], "lon": f["coordonnees"]["lon"],
            "artistes": f.get("artistes", []), "periode": f.get("periode"),
            "statut": f["statut"], "evenement": f.get("evenement"),
            "historique_court": f.get("historique_court", ""),
            "historique_long": f.get("historique_long", ""),
            "medias": f.get("medias", {"couverture": None, "selection": []}),
            "articles": [{k: a[k] for k in ("type", "date", "titre", "url")} for a in f.get("sources_site", [])],
        }
        if args.public:
            lieu["sources"] = [{k: s[k] for k in ("type", "reference", "url", "page") if s.get(k)}
                               for s in f.get("sources", [])]
        else:
            lieu.update({
                "verification": f.get("verification"),
                "coordonnees_validees": f["coordonnees"].get("validees", False),
                "publication": f.get("publication"),
                "sources": f.get("sources", []),
                "notes": f.get("notes", []),
                "jours_de_visite": imp.get("jours_de_visite", []),
                "nb_photos": imp.get("nb_photos", 0), "nb_videos": imp.get("nb_videos", 0),
                "faits_a_reprendre": [a["faits_a_reprendre"] for a in f.get("sources_site", []) if a.get("faits_a_reprendre")],
                "a_verifier": [a["a_verifier"] for a in f.get("sources_site", []) if a.get("a_verifier")],
            })
        lieux.append(lieu)

    sortie = RACINE / "app/data"
    sortie.mkdir(parents=True, exist_ok=True)
    (sortie / "lieux.json").write_text(
        json.dumps({"mode": "public" if args.public else "prive", "lieux": lieux}, ensure_ascii=False),
        encoding="utf-8")

    vendor = RACINE / "app/vendor"
    vendor.mkdir(exist_ok=True)
    for b in BIBLIOTHEQUES:
        source = RACINE / "node_modules" / b
        if not source.exists():
            raise SystemExit("Bibliothèques absentes : lancer d'abord npm install")
        shutil.copy(source, vendor / source.name)
    print(f"{len(lieux)} lieux écrits dans app/data/lieux.json ({'public' if args.public else 'privé'}).")


if __name__ == "__main__":
    main()
