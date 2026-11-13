# Carte rock de Londres

Carte interactive de Londres consacrée à l'histoire du rock, par Laurent Rieppi. Chaque lieu est un point cliquable qui ouvre une fiche (photos, vidéos, historique, sources). Trois temps : outil personnel sur iPhone, enrichissement par les livres et les notes, puis complément d'un livre et application payante.

## Règles qui ne se discutent pas

- Projet de l'activité indépendante de Laurent : aucune mention de son employeur, de Classic 21 ou de la RTBF dans le code, les textes ou les métadonnées.
- Le dossier ~/Pictures/Londres Rock du Mac se lit et ne s'écrit jamais. Rien n'y est modifié, déplacé ou supprimé.
- Les médias (originaux et versions web) ne vont jamais dans git.
- Les photos de "02 Autres lieux" sont personnelles et n'apparaissent jamais sur la carte.
- Les fichiers préfixés "_obsolete" ou suffixés "_avant_reclassement" ne servent jamais de source.
- Un lieu noté "a verifier" ou "a identifier" garde son drapeau jusqu'à validation par Laurent.
- Aucune information ne s'invente. Un fait sans source reste marqué "à vérifier" et ne s'écrit pas comme une certitude.
- Les textes tirés de livres sont reformulés et accompagnés de leur source (ouvrage et page), jamais recopiés. Le texte du guide de Wooldridge reste hors du dépôt (.gitignore).
- Toute décision qui a un coût ou qui engage la suite (hébergement, fournisseur de tuiles) se soumet à Laurent avant d'être prise.

## Règles éditoriales des textes

Français, prose continue, sans listes à puces dans les historiques. Pas de tirets longs ni de doubles tirets. Guillemets droits uniquement. Albums en italique, titres entre guillemets. "Titre" et non "chanson", "album" et non "disque", "années 70" en chiffres, "septante" et "nonante". Les propres textes et interviews de Laurent (laurentrieppi.com) sont la matière prioritaire, cités avec le lien vers l'article.

## Structure du projet

- entrees/photos/ : copies de lieux.csv, index.csv et journal_reclassement.csv venues du Mac. À remplacer par des copies fraîches avant de relancer l'import.
- sources/ : index des articles du site (CSV) et, hors git, le texte du guide de Wooldridge.
- data/regles_import.csv : table écrite à la main qui donne à chaque dossier photo son identifiant, son nom, son type, sa nature, ses artistes, son quartier et son adresse. Elle ne sert qu'à la création d'une fiche.
- data/lieux/ : la source de vérité, une fiche JSON par lieu.
- scripts/import_lieux.py : import relançable, qui écrit aussi rapports/rapport_import.md.
- rapports/ : rapports générés.
- app/ : la carte (voir plus bas). scripts/construire.py, scripts/fond_de_carte.sh et scripts/serveur.py la préparent et la servent.

## Modèle d'une fiche (data/lieux/<id>.json)

- id : identifiant stable, jamais renommé une fois publié.
- nom, adresse, quartier.
- dossier_photo : nom exact du dossier dans "01 Lieux rock", clé de rapprochement avec l'import.
- nature : "permanent" ou "evenement". Un événement porte un bloc "evenement" (lieu_hote, date_debut, date_fin, annee).
- type : studio, salle, domicile, pochette, plaque, boutique, pub, musee, exposition, ecole, memorial, fresque, rue, autre.
- coordonnees : lat, lon, origine ("photos" ou "manuel"), validees. Tant que l'origine est "photos", l'import recalcule le point (médiane des positions GPS des photos). Une correction manuelle passe l'origine à "manuel" et n'est plus touchée.
- artistes, periode.
- statut : "visite" ou "a_visiter".
- verification : confirme_visuellement, a_verifier, a_identifier, non_renseigne.
- publication : "prive" par défaut, "public" quand la fiche pourra figurer dans l'application.
- historique_court, historique_long.
- sources : liste d'objets (type livre, interview, article ou note personnelle, référence, page, url).
- medias : couverture et sélection, remplis par l'outil de sélection.
- notes : notes rapides prises sur place.
- sources_site et import : blocs régénérés à chaque import, à ne pas modifier à la main.

## Décisions prises

- 13/11/2026. Source de vérité en fichiers JSON, un par lieu, versionnés dans git, plutôt qu'une base SQLite : relecture à l'œil et historique des modifications. Une base pourra être générée à partir de ces fichiers pour l'application.
- 13/11/2026. Le travail se fait dans une session cloud. Les scripts qui touchent aux photos sont écrits ici et exécutés sur le Mac.
- 13/11/2026. Le point d'un lieu est la médiane des positions GPS des photos et non leur moyenne, qu'une seule photo prise depuis un train suffit à fausser (gare de Dartford : 5 km d'écart).
- 13/11/2026. Événements créés d'office : Sotheby's 2023, Fitzrovia Chapel 2024, Kings Place 2024, Halcyon Gallery 2025, Lightroom 2026, King's Cross 2026. Hackney Empire reste un lieu permanent.
- 13/11/2026. L'exposition Kurt Cobain Unplugged du Royal College of Music Museum est confirmée comme événement (3 juin au 18 novembre 2025, dates données par Laurent d'après le site du musée).

## Étapes

1. Import des données et rapport : fait le 13/11/2026.
2. Carte avec les 69 lieux rock : faite le 13/11/2026.
3. Mise en ligne privée, marquage "visité" et notes depuis le téléphone : code prêt et essayé en local le 13/11/2026, en attente de la création du site chez Cloudflare par Laurent. Étape avancée avant les médias pour permettre l'essai sur iPhone.
4. Préparation et sélection des médias, exécutées sur le Mac.
5. Import des livres (un CSV par ouvrage) et de l'export Facebook.

## L'application (dossier app/)

Site statique sans étape de compilation : index.html, style.css, app.js. MapLibre GL JS affiche un fond de carte Protomaps tiré d'OpenStreetMap. Les tuiles (Grand Londres, zooms 0 à 15, 7791 fichiers, 242 Mo) sont dans app/tuiles/z/x/y.pbf et versionnées dans git, comme les polices et les pictogrammes : la carte n'appelle aucun service extérieur, donc aucun coût à l'usage. L'attribution "© OpenStreetMap" doit rester visible. Bibliothèques sous licence BSD (MapLibre, style Protomaps), données OpenStreetMap sous licence ODbL.

L'application lit app/data/lieux.json, produit par scripts/construire.py à partir des fiches. En mode privé, la fiche montre aussi le carnet de terrain et les notes de travail. L'option --public ne garde que les fiches dont la publication vaut "public" et retire les champs de travail.

Couleurs des points : vert pour un lieu visité, orange pour un lieu à visiter, violet pour un événement temporaire.

## Hébergement (Cloudflare Pages, offre gratuite)

Décision du 13/11/2026, validée par Laurent. Cloudflare publie le dépôt GitHub à chaque envoi sur la branche main.

- Commande de build : `npm ci && python3 scripts/construire.py`. Dossier publié : `app`.
- functions/_middleware.js protège tout le site par un mot de passe (cookie signé, six mois, huit essais par quart d'heure). Les tuiles, polices, pictogrammes et bibliothèques, qui sont des données publiques, restent hors protection (app/_routes.json) pour ne pas consommer le quota de fonctions.
- functions/api/carnet.js tient le carnet de terrain : un journal d'opérations (visite, annulation, note) qui ne fait que s'allonger. Le téléphone garde les opérations en attente quand il n'a pas de réseau et les renvoie ensuite.
- Réglages à faire dans le tableau de bord Cloudflare, jamais dans le dépôt : secrets MOT_DE_PASSE et SECRET_SESSION, espace KV lié sous le nom CARNET.
- Limites vérifiées le 13/11/2026 dans la documentation Cloudflare : 20 000 fichiers par site, 25 Mio par fichier (d'où les tuiles individuelles plutôt qu'un fichier unique), 100 000 appels de fonctions par jour, 1 000 écritures KV par jour.
- Pas de fichier wrangler.toml : il prendrait le pas sur les réglages du tableau de bord.
- scripts/recuperer_carnet.py reverse le carnet dans les fiches (statut "visite", champ "notes").
- Les médias ne passeront pas par git : leur hébergement privé reste à décider à l'étape 3.

## Commandes

    python3 scripts/import_lieux.py          # fiches et rapport, depuis les CSV du Mac
    npm install                              # bibliothèques de la carte
    python3 scripts/construire.py            # assemble app/data et app/vendor
    npx wrangler pages dev app --kv CARNET --binding MOT_DE_PASSE=essai --binding SECRET_SESSION=essai   # essai en local avec la protection
    python3 scripts/serveur.py 8000          # essai en local sans protection ni carnet
    scripts/fond_de_carte.sh                 # refait le fond de carte (rarement) : demande les outils pmtiles (Go) et pmtiles (pip)
    python3 scripts/recuperer_carnet.py carnet.json
