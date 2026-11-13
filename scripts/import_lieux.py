#!/usr/bin/env python3
"""Import relançable des lieux de la carte rock de Londres.

Lit lieux.csv, index.csv et journal_reclassement.csv (copies des fichiers de
~/Pictures/Londres Rock, jamais modifiés), l'index des articles du site et la
table data/regles_import.csv, puis :

  1. crée ou met à jour une fiche JSON par lieu rock dans data/lieux/ ;
  2. écrit rapports/rapport_import.md.

Une fiche existante n'est jamais écrasée : seuls les blocs "import" et
"sources_site" sont régénérés, ainsi que les coordonnées tant que leur origine
est "photos". Tout le reste (textes, validations, publication) appartient à la
main de l'auteur.

Usage : python3 scripts/import_lieux.py [--simulation]
"""
import argparse
import collections
import csv
import datetime
import json
import math
import statistics
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
CAT_ROCK = "01 Lieux rock"
CAT_AUTRES = "02 Autres lieux"

# Seuils du contrôle des coordonnées (mètres).
SEUIL_DISPERSION = 250
SEUIL_ECART_MOYENNE = 100
SEUIL_VOISINS = 120
SEUIL_RATTACHEMENT = 80

NOTES = {
    "": "non_renseigne",
    "lieu confirme visuellement": "confirme_visuellement",
    "a verifier": "a_verifier",
    "a identifier": "a_identifier",
    "adresse Apple a verifier": "a_verifier",
    "ancienne adresse du Marquee, a verifier": "a_verifier",
}

# Lieux signalés comme non tranchés : mots cherchés dans les adresses Apple
# et les noms de dossiers de "02 Autres lieux".
A_TRANCHER = {
    "Electric Ballroom (Camden)": ["electric ballroom", "184 camden high", "178 camden high"],
    "Imperial College": ["imperial college"],
    "Muswell Hill (visite Kinks)": ["muswell", "fortis green", "denmark terrace"],
    "Dominion Theatre": ["dominion", "268 tottenham court", "269 tottenham court"],
    "Claridge's et 54 Brook Street": ["claridge", "54 brook street"],
    "Fresque du 233 Portobello Road": ["portobello"],
    "24 Osborn Street (Sarm East ?)": ["osborn street"],
    "Barbican (exposition 2 Tone, 2024 ?)": ["barbican", "lakeside terrace", "silk street"],
}


def lire_csv(chemin):
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def distance(a, b):
    """Distance en mètres entre deux points (lat, lon)."""
    r = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def centile(valeurs, q):
    v = sorted(valeurs)
    return v[min(len(v) - 1, int(q * len(v)))]


def nombre(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def synthese_gps(fichiers):
    pts = [(nombre(f["latitude"]), nombre(f["longitude"])) for f in fichiers]
    pts = [p for p in pts if p[0] is not None and p[1] is not None and p != (0.0, 0.0)]
    if not pts:
        return None
    med = (statistics.median(p[0] for p in pts), statistics.median(p[1] for p in pts))
    moy = (statistics.fmean(p[0] for p in pts), statistics.fmean(p[1] for p in pts))
    d = [distance(med, p) for p in pts]
    return {
        "mediane": med,
        "moyenne": moy,
        "nb_points": len(pts),
        "dispersion_p90_m": round(centile(d, 0.9)),
        "distance_max_m": round(max(d)),
        "ecart_moyenne_mediane_m": round(distance(med, moy)),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--photos", default=RACINE / "entrees/photos", type=Path,
                    help="dossier contenant lieux.csv, index.csv et journal_reclassement.csv")
    ap.add_argument("--site", default=RACINE / "sources/sources_site_laurentrieppi_londres.csv", type=Path)
    ap.add_argument("--simulation", action="store_true", help="n'écrit aucune fiche, seulement le rapport")
    args = ap.parse_args()

    lieux = lire_csv(args.photos / "lieux.csv")
    index = lire_csv(args.photos / "index.csv")
    journal = lire_csv(args.photos / "journal_reclassement.csv")
    site = lire_csv(args.site) if args.site.exists() else []
    regles = {r["dossier_photo"]: r for r in lire_csv(RACINE / "data/regles_import.csv")}

    par_lieu = collections.defaultdict(list)
    for f in index:
        par_lieu[(f["categorie"], f["lieu"])].append(f)

    dossier_fiches = RACINE / "data/lieux"
    dossier_fiches.mkdir(parents=True, exist_ok=True)
    existantes = {}
    for p in sorted(dossier_fiches.glob("*.json")):
        fiche = json.loads(p.read_text(encoding="utf-8"))
        existantes[fiche.get("dossier_photo")] = (p, fiche)

    site_par_dossier = collections.defaultdict(list)
    for a in site:
        site_par_dossier[a["dossier_photo_existant"]].append(a)

    crees, maj, sans_regle, synth = [], [], [], {}
    rock = [l for l in lieux if l["categorie"] == CAT_ROCK]
    for l in rock:
        nom = l["lieu"]
        fichiers = par_lieu[(CAT_ROCK, nom)]
        utiles = [f for f in fichiers if "_obsolete" not in f["fichier"] and "_avant_reclassement" not in f["fichier"]]
        g = synthese_gps(utiles)
        synth[nom] = g
        jours = sorted({f["date"][:10] for f in utiles if f["date"]})
        adresses = collections.Counter(f["adresse_apple"] for f in utiles if f["adresse_apple"])
        bloc_import = {
            "nb_fichiers": len(utiles),
            "nb_photos": sum(f["photo_ou_video"] == "photo" for f in utiles),
            "nb_videos": sum(f["photo_ou_video"] == "video" for f in utiles),
            "nb_originaux": sum(f["type_fichier"] == "original" for f in utiles),
            "jours_de_visite": jours,
            "annees": sorted({j[:4] for j in jours}),
            "adresses_apple": [a for a, _ in adresses.most_common(5)],
            "note_verification_brute": l["note"],
            "gps_photos": None if not g else {
                "lat": round(g["mediane"][0], 6), "lon": round(g["mediane"][1], 6),
                "nb_points": g["nb_points"], "dispersion_p90_m": g["dispersion_p90_m"],
            },
        }
        articles = [{
            "type": a["type_de_contenu"], "date": a["date_article"], "titre": a["titre_article"],
            "url": a["url"], "faits_a_reprendre": a["faits_a_reprendre"],
            "a_verifier": a["a_verifier_ou_a_faire"],
        } for a in site_par_dossier.get(nom, [])]
        coords = None if not g else {
            "lat": round(g["mediane"][0], 6), "lon": round(g["mediane"][1], 6),
            "origine": "photos", "validees": False,
        }

        if nom in existantes:
            chemin, fiche = existantes[nom]
            fiche["import"] = bloc_import
            fiche["sources_site"] = articles
            if (fiche.get("coordonnees") or {}).get("origine", "photos") == "photos":
                fiche["coordonnees"] = coords
            maj.append(fiche["id"])
        else:
            r = regles.get(nom)
            if not r:
                sans_regle.append(nom)
                continue
            fiche = {
                "id": r["id"],
                "nom": r["nom"],
                "dossier_photo": nom,
                "nature": r["nature"],
                "type": r["type"],
                "adresse": r["adresse"] or None,
                "quartier": r["quartier"] or None,
                "coordonnees": coords,
                "artistes": [a for a in r["artistes"].split(";") if a],
                "periode": None,
                "statut": "visite",
                "verification": NOTES.get(l["note"], "a_verifier"),
                "publication": "prive",
                "historique_court": "",
                "historique_long": "",
                "sources": [],
                "medias": {"couverture": None, "selection": []},
                "notes": [],
            }
            if r["nature"] == "evenement":
                fiche["evenement"] = {
                    "lieu_hote": r["lieu_hote"] or None,
                    "date_debut": None, "date_fin": None,
                    "annee": jours[0][:4] if jours else None,
                }
            fiche["sources_site"] = articles
            fiche["import"] = bloc_import
            chemin = dossier_fiches / f"{r['id']}.json"
            crees.append(fiche["id"])
        if not args.simulation:
            chemin.write_text(json.dumps(fiche, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Les fiches venues d'un livre n'ont pas de dossier photo : elles ne sont pas orphelines.
    orphelines = [f["id"] for d, (_, f) in existantes.items() if d and d not in {l["lieu"] for l in rock}]

    # ------------------------------------------------------------------ rapport
    R = []
    w = R.append
    w("# Rapport d'import")
    w("")
    w(f"Généré le {datetime.date.today().isoformat()} par scripts/import_lieux.py. Ce fichier est réécrit à chaque import.")
    w("")
    w("## Bilan")
    w("")
    nb_rock = sum(len(par_lieu[(CAT_ROCK, l["lieu"])]) for l in rock)
    w(f"- {len(index)} fichiers indexés, dont {nb_rock} dans {len(rock)} lieux rock et {len(index) - nb_rock} dans {len(lieux) - len(rock)} autres lieux.")
    w(f"- {len(crees) + len(maj)} fiches à jour dans data/lieux ({len(crees)} créées lors de cet import), {len(sans_regle)} dossiers sans règle d'import.")
    types = collections.Counter(f["type_fichier"] for f in index)
    vid = sum(f["photo_ou_video"] == "video" for f in index)
    vid_orig = sum(f["photo_ou_video"] == "video" and f["type_fichier"] == "original" for f in index)
    w(f"- {types['apercu']} aperçus et {types['original']} originaux. {vid} vidéos, dont {vid_orig} disponibles en original : les autres attendent le rapatriement depuis iCloud.")
    if sans_regle:
        w("")
        w("Dossiers rock absents de data/regles_import.csv (aucune fiche créée) :")
        for n in sans_regle:
            w(f"- {n}")
    if orphelines:
        w("")
        w("Fiches dont le dossier photo n'existe plus dans lieux.csv (dossier renommé ou supprimé ?) :")
        for n in orphelines:
            w(f"- {n}")

    w("")
    w("## Cohérence des trois fichiers")
    w("")
    ecarts = []
    for l in lieux:
        fs = par_lieu[(l["categorie"], l["lieu"])]
        v = sum(f["photo_ou_video"] == "video" for f in fs)
        if len(fs) != int(l["nb_fichiers"]) or v != int(l["dont_videos"]):
            ecarts.append(f"- {l['lieu']} : lieux.csv annonce {l['nb_fichiers']} fichiers et {l['dont_videos']} vidéos, index.csv en contient {len(fs)} et {v}.")
    hors = sorted({k for k in par_lieu if k[1] not in {l["lieu"] for l in lieux}})
    w(f"- Comptages lieux.csv contre index.csv : {'aucun écart' if not ecarts else str(len(ecarts)) + ' écarts'}.")
    R.extend(ecarts)
    if hors:
        w(f"- Lieux présents dans index.csv mais absents de lieux.csv : {', '.join(k[1] for k in hors)}.")
    chemins = {f["fichier"] for f in index}
    manquants = [j for j in journal if j["nouveau_chemin"] not in chemins]
    anciens = [j for j in journal if j["ancien_chemin"] in chemins]
    w(f"- Journal de reclassement : {len(journal)} déplacements, {len(manquants)} dont la destination manque dans index.csv, {len(anciens)} dont l'ancien chemin y figure encore.")
    obso = [f["fichier"] for f in index if "_obsolete" in f["fichier"] or "_avant_reclassement" in f["fichier"]]
    w(f"- Fichiers marqués \"_obsolete\" ou \"_avant_reclassement\" dans index.csv : {len(obso)}.")
    doublons = [n for n, c in collections.Counter(f["nom_original"] for f in index).items() if c > 1]
    w(f"- Noms originaux présents plusieurs fois dans index.csv : {len(doublons)}.")
    sans_gps = sum(1 for f in index if nombre(f["latitude"]) in (None, 0.0))
    sans_date = sum(1 for f in index if not f["date"])
    w(f"- Fichiers sans coordonnées GPS : {sans_gps}. Fichiers sans date : {sans_date}.")

    w("")
    w("## Coordonnées à contrôler")
    w("")
    w("Le point d'un lieu est provisoirement la médiane des positions GPS de ses photos, c'est-à-dire l'endroit où se tenait le photographe, pas l'adresse du lieu. Chaque point reste \"non validé\" jusqu'à contrôle. Les lieux ci-dessous cumulent un signal d'alerte : photos très dispersées, ou moyenne de lieux.csv éloignée de la médiane.")
    w("")
    w("| Lieu | Fichiers | Dispersion (90 % des photos) | Photo la plus lointaine | Écart moyenne/médiane |")
    w("|---|---|---|---|---|")
    for l in rock:
        g = synth.get(l["lieu"])
        if g and (g["dispersion_p90_m"] > SEUIL_DISPERSION or g["ecart_moyenne_mediane_m"] > SEUIL_ECART_MOYENNE):
            w(f"| {l['lieu']} | {l['nb_fichiers']} | {g['dispersion_p90_m']} m | {g['distance_max_m']} m | {g['ecart_moyenne_mediane_m']} m |")
    w("")
    w("Écart entre la moyenne donnée par lieux.csv et la médiane retenue, quand il dépasse 50 m :")
    w("")
    for l in rock:
        g = synth.get(l["lieu"])
        if g:
            e = distance(g["mediane"], (float(l["latitude_moyenne"]), float(l["longitude_moyenne"])))
            if e > 50:
                w(f"- {l['lieu']} : {round(e)} m.")

    w("")
    w("## Lieux rock très proches les uns des autres")
    w("")
    w(f"Paires distantes de moins de {SEUIL_VOISINS} m : doublons possibles, ou points qui se superposeront sur la carte.")
    w("")
    for i, a in enumerate(rock):
        for b in rock[i + 1:]:
            ga, gb = synth.get(a["lieu"]), synth.get(b["lieu"])
            if ga and gb:
                d = distance(ga["mediane"], gb["mediane"])
                if d < SEUIL_VOISINS:
                    w(f"- {a['lieu']} et {b['lieu']} : {round(d)} m.")

    w("")
    w("## Drapeaux de vérification")
    w("")
    for note, code in NOTES.items():
        if code in ("a_verifier", "a_identifier"):
            noms = [l["lieu"] for l in rock if l["note"] == note]
            if noms:
                w(f"- \"{note}\" : {' ; '.join(noms)}.")
    nr = [l["lieu"] for l in rock if not l["note"]]
    w(f"- Sans note de vérification ({len(nr)} lieux) : {' ; '.join(nr)}.")

    w("")
    w("## Événements temporaires")
    w("")
    w("Fiches créées avec la nature \"evenement\" (dates de début et de fin à renseigner) :")
    w("")
    for l in rock:
        r = regles.get(l["lieu"])
        if r and r["nature"] == "evenement":
            w(f"- {l['lieu']} (lieu hôte : {r['lieu_hote'] or 'à préciser'}).")

    w("")
    w("## Lieux à trancher dans \"02 Autres lieux\"")
    w("")
    autres = [f for f in index if f["categorie"] == CAT_AUTRES]
    for titre, mots in A_TRANCHER.items():
        trouves = [f for f in autres if any(m in (f["adresse_apple"] + " " + f["lieu"]).lower() for m in mots)]
        if not trouves:
            w(f"- {titre} : aucun fichier repéré par l'adresse Apple ou le nom de dossier, à retrouver à l'œil.")
            continue
        det = collections.Counter((f["lieu"], f["adresse_apple"], f["date"][:10]) for f in trouves)
        w(f"- {titre} : {len(trouves)} fichiers.")
        for (lieu, adr, jour), n in sorted(det.items(), key=lambda x: (x[0][2], x[0][0])):
            w(f"  - {n} dans \"{lieu}\", adresse Apple \"{adr}\", le {jour}.")
    w("")
    w(f"Fichiers de \"02 Autres lieux\" pris à moins de {SEUIL_RATTACHEMENT} m d'un lieu rock, qui lui appartiennent peut-être :")
    w("")
    centres = [(l["lieu"], synth[l["lieu"]]["mediane"]) for l in rock if synth.get(l["lieu"])]
    proches = collections.Counter()
    for f in autres:
        p = (nombre(f["latitude"]), nombre(f["longitude"]))
        if p[0] is None or p[1] is None:
            continue
        nom, d = min(((n, distance(c, p)) for n, c in centres), key=lambda x: x[1])
        if d < SEUIL_RATTACHEMENT:
            proches[(nom, f["lieu"], f["date"][:10])] += 1
    for (nom, dossier, jour), n in sorted(proches.items()):
        w(f"- {n} fichier(s) de \"{dossier}\" du {jour}, près de {nom}.")
    if not proches:
        w("- Aucun.")

    w("")
    w("## Articles du site")
    w("")
    rattaches = sum(len(v) for d, v in site_par_dossier.items() if d in {l["lieu"] for l in rock})
    w(f"{len(site)} contenus recensés, dont {rattaches} rattachés à une fiche existante.")
    w("")
    inconnus = [a for a in site if a["dossier_photo_existant"] and a["dossier_photo_existant"] not in {l["lieu"] for l in rock}]
    if inconnus:
        w("Contenus dont le dossier photo indiqué n'existe pas parmi les lieux rock :")
        for a in inconnus:
            w(f"- {a['lieu']} (dossier \"{a['dossier_photo_existant']}\").")
        w("")
    w("Contenus sans dossier photo, donc sans fiche pour l'instant (points à créer) :")
    w("")
    for a in site:
        if not a["dossier_photo_existant"]:
            w(f"- {a['lieu']}, {a['type_de_contenu']} du {a['date_article']}. {a['a_verifier_ou_a_faire']}")
    w("")
    w("Remarques de l'index du site sur les contenus rattachés (points à créer, faits à recouper, corrections d'articles) :")
    w("")
    for a in site:
        if a["dossier_photo_existant"] and a["a_verifier_ou_a_faire"]:
            w(f"- {a['lieu']} ({a['date_article']}) : {a['a_verifier_ou_a_faire']}")

    w("")
    w("## Lieux les plus chargés")
    w("")
    w("Lieux de plus de 50 fichiers, pour lesquels la sélection des médias sera indispensable :")
    w("")
    for l in sorted(rock, key=lambda x: -int(x["nb_fichiers"])):
        if int(l["nb_fichiers"]) > 50:
            jours = sorted({f["date"][:10] for f in par_lieu[(CAT_ROCK, l["lieu"])]})
            w(f"- {l['lieu']} : {l['nb_fichiers']} fichiers, {l['dont_videos']} vidéos, {len(jours)} jour(s) de visite.")
    w("")

    (RACINE / "rapports").mkdir(exist_ok=True)
    (RACINE / "rapports/rapport_import.md").write_text("\n".join(R), encoding="utf-8")
    print(f"{len(crees)} fiches créées, {len(maj)} mises à jour, {len(sans_regle)} sans règle.")
    print("Rapport : rapports/rapport_import.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
