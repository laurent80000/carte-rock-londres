#!/usr/bin/env python3
"""Propose une décennie principale pour chaque fiche qui n'en a pas.

La décennie sert à colorer le marqueur du lieu. Elle est déduite des années
citées dans les textes déjà présents dans la fiche (historique, faits des
sources, faits des articles) : la décennie la plus citée l'emporte, la plus
ancienne en cas d'égalité. Les années 1990 et suivantes sont rangées ensemble
sous 1990. La proposition porte "validee": false jusqu'à relecture par Laurent,
et une fiche dont la période est validée ou saisie à la main n'est jamais
retouchée. Sans année dans les textes, la fiche reste sans période.

Usage : python3 scripts/proposer_decennies.py
"""
import collections
import json
import re
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
bilan = collections.Counter()
for chemin in sorted((RACINE / "data/lieux").glob("*.json")):
    f = json.loads(chemin.read_text(encoding="utf-8"))
    p = f.get("periode")
    if isinstance(p, dict) and (p.get("validee") or p.get("origine") == "manuel"):
        bilan["gardées"] += 1
        continue
    textes = [f.get("historique_court", ""), f.get("historique_long", "")]
    textes += [s.get("faits", "") for s in f.get("sources", [])]
    textes += [a.get("faits_a_reprendre", "") for a in f.get("sources_site", [])]
    ev = f.get("evenement") or {}
    textes.append(str(ev.get("annee") or ""))
    annees = [int(a) for a in re.findall(r"(?<!\d)(19[5-9]\d|20[0-2]\d)(?!\d)", " ".join(textes))]
    annees += [1900 + int(d) for d in re.findall(r"années (\d0)\b", " ".join(textes)) if int(d) >= 50]
    if not annees:
        f["periode"] = None
        bilan["sans année"] += 1
    else:
        decennies = collections.Counter(min(a // 10 * 10, 1990) for a in annees)
        meilleure = max(decennies.values())
        d = min(k for k, v in decennies.items() if v == meilleure)
        f["periode"] = {"decennie": d, "origine": "texte", "validee": False, "annees_citees": sorted(set(annees))}
        bilan[str(d)] += 1
    chemin.write_text(json.dumps(f, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(dict(bilan))
