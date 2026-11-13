#!/usr/bin/env python3
"""Importe un relevé de livre (sources/livres/<ouvrage>.csv) dans les fiches.

    python3 scripts/import_livre.py sources/livres/wooldridge_2002.csv

Format du CSV, une ligne par lieu : ouvrage, page, lieu, adresse, quartier,
zone, type, artistes (séparés par ;), fait (reformulé, jamais recopié),
etat_2002 (existant, transformé ou disparu, selon le livre), fiche_existante
(identifiant d'une fiche déjà créée, sinon vide), lat, lon, precision.

Une ligne rattachée à une fiche existante ajoute seulement le livre à ses
sources. Les autres créent une fiche "à visiter", marquée "à vérifier", avec la
position du géocodage (jamais validée d'office). Relancer le script ne crée
pas de doublon et ne touche ni aux textes ni aux validations faites à la main.

Écrit aussi rapports/a_visiter_<ouvrage>.md, la liste de visite par quartier,
qui signale les lieux près desquels des photos existent déjà dans index.csv.
"""
import collections
import csv
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
FICHES = RACINE / "data/lieux"
RAYON_PHOTOS = 45  # mètres


def identifiant(texte):
    t = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:70]


def distance(a, b):
    r, p1, p2 = 6371000, math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def main():
    chemin = Path(sys.argv[1])
    ouvrage_id = chemin.stem
    with open(chemin, encoding="utf-8", newline="") as f:
        lignes = list(csv.DictReader(f))

    fiches = {}
    for p in FICHES.glob("*.json"):
        f = json.loads(p.read_text(encoding="utf-8"))
        fiches[f["id"]] = (p, f)

    def ecrire(p, f):
        p.write_text(json.dumps(f, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    crees = maj = sources_ajoutees = sans_position = 0
    importees = []
    for l in lignes:
        source = {"type": "livre", "reference": l["ouvrage"], "page": l["page"], "faits": l["fait"],
                  "etat_selon_source": l["etat_2002"], "releve": ouvrage_id}
        if l["fiche_existante"]:
            p, f = fiches[l["fiche_existante"]]
            if not any(s.get("releve") == ouvrage_id and s.get("page") == l["page"] for s in f.get("sources", [])):
                f.setdefault("sources", []).append(source)
                ecrire(p, f)
                sources_ajoutees += 1
            continue
        fid = f"{identifiant(l['lieu'])}"
        if fid in fiches and fiches[fid][1].get("origine_fiche") != f"livre:{ouvrage_id}":
            fid = f"{fid}-{identifiant(l['quartier'])}"
        coords = None
        if l["lat"] and l["lon"]:
            coords = {"lat": float(l["lat"]), "lon": float(l["lon"]), "origine": "geocodage",
                      "precision": l["precision"], "validees": False}
        else:
            sans_position += 1
        if fid in fiches:
            p, f = fiches[fid]
            if (f.get("coordonnees") or {}).get("origine", "geocodage") == "geocodage":
                f["coordonnees"] = coords
            ecrire(p, f)
            maj += 1
        else:
            f = {
                "id": fid,
                "nom": l["lieu"],
                "dossier_photo": None,
                "origine_fiche": f"livre:{ouvrage_id}",
                "nature": "permanent",
                "type": l["type"],
                "adresse": l["adresse"] or None,
                "quartier": l["quartier"] or None,
                "zone": l["zone"] or None,
                "coordonnees": coords,
                "artistes": [a for a in l["artistes"].split(";") if a],
                "periode": None,
                "statut": "a_visiter",
                "verification": "a_verifier",
                "etat_selon_source": l["etat_2002"],
                "publication": "prive",
                "historique_court": l["fait"],
                "historique_long": "",
                "sources": [source],
                "medias": {"couverture": None, "selection": []},
                "notes": [],
            }
            p = FICHES / f"{fid}.json"
            fiches[fid] = (p, f)
            ecrire(p, f)
            crees += 1
        importees.append(fiches[fid][1])

    # -------------------------------------------------- liste de visite
    photos = []
    index = RACINE / "entrees/photos/index.csv"
    if index.exists():
        with open(index, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                try:
                    photos.append(((float(r["latitude"]), float(r["longitude"])), r["lieu"], r["date"][:10]))
                except ValueError:
                    pass

    def photos_proches(f):
        c = f.get("coordonnees")
        if not c or c.get("precision") != "adresse":
            return []
        trouve = collections.Counter()
        for pos, dossier, jour in photos:
            if distance((c["lat"], c["lon"]), pos) < RAYON_PHOTOS:
                trouve[(dossier, jour)] += 1
        return sorted(trouve.items(), key=lambda x: x[0][1])

    R = []
    w = R.append
    titre = lignes[0]["ouvrage"] if lignes else ouvrage_id
    w(f"# À visiter d'après {titre}")
    w("")
    deja_visites = sorted({l["fiche_existante"] for l in lignes if l["fiche_existante"]})
    w(f"{len(importees)} lieux du livre ne figurent pas encore parmi tes lieux visités ; ils sont classés ici par zone et par quartier. "
      f"{len(deja_visites)} autres adresses du livre correspondent à des lieux que tu as déjà visités : le livre a été ajouté à leurs sources.")
    w("")
    w("L'état indiqué est celui du livre en 2002 : un lieu \"disparu\" n'a plus que son emplacement à photographier, et beaucoup de lieux \"existants\" en 2002 ont pu changer depuis. "
      "La mention \"photos déjà prises\" signale des fichiers de ton dossier Londres Rock pris à moins de 45 m d'une adresse localisée précisément : ce lieu est peut-être déjà photographié sans être rangé. "
      "Une position \"à la rue\" place le point au milieu de la rue, faute de numéro connu d'OpenStreetMap.")
    w("")
    ordre_zones = ["Central", "Nord-Ouest", "Nord et Nord-Est", "Ouest", "Sud-Ouest", "Sud-Est"]
    par_zone = collections.defaultdict(lambda: collections.defaultdict(list))
    for f in importees:
        par_zone[f.get("zone") or "Autre"][f.get("quartier") or "Autre"].append(f)
    nb_deja = 0
    for zone in ordre_zones + sorted(set(par_zone) - set(ordre_zones)):
        if zone not in par_zone:
            continue
        total = sum(len(v) for v in par_zone[zone].values())
        w(f"## {zone} ({total})")
        w("")
        for quartier in sorted(par_zone[zone]):
            w(f"### {quartier}")
            w("")
            for f in sorted(par_zone[zone][quartier], key=lambda x: x["nom"]):
                src = f["sources"][0]
                etat = {"existant": "", "transformé": " · transformé en 2002", "disparu": " · disparu en 2002"}.get(f.get("etat_selon_source"), "")
                c = f.get("coordonnees") or {}
                pos = {"rue": " · position à la rue", "quartier": " · position approximative (quartier)"}.get(c.get("precision"), "")
                if not c:
                    pos = " · position introuvable"
                w(f"- **{f['nom']}**, {f['adresse'] or 'adresse à trouver'} (p. {src['page']}{etat}{pos})")
                w(f"  {f['historique_court']}")
                deja = photos_proches(f)
                if deja:
                    nb_deja += 1
                    detail = " ; ".join(f"{n} dans \"{d}\" le {j}" for (d, j), n in deja[:3])
                    w(f"  Photos déjà prises : {detail}.")
            w("")
    (RACINE / "rapports").mkdir(exist_ok=True)
    (RACINE / f"rapports/a_visiter_{ouvrage_id}.md").write_text("\n".join(R), encoding="utf-8")
    print(f"{crees} fiches créées, {maj} mises à jour, {sources_ajoutees} sources ajoutées à des fiches existantes, "
          f"{sans_position} sans position, {nb_deja} lieux avec des photos déjà prises à proximité.")


if __name__ == "__main__":
    main()
