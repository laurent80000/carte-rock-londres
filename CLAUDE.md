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
- app/ : la carte (voir plus bas). scripts/construire.mjs, scripts/fond_de_carte.sh et scripts/serveur.py la préparent et la servent.

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
3. Mise en ligne privée, marquage "visité" et notes depuis le téléphone : en ligne le 13/11/2026, protection contrôlée à distance, connexion et carte confirmées par Laurent sur son téléphone. Étape avancée avant les médias pour permettre l'essai sur iPhone.
4. Préparation et sélection des médias, exécutées sur le Mac.
5. Import des livres (un CSV par ouvrage) : premier ouvrage importé le 13/11/2026. Export Facebook : en attente.

## L'application (dossier app/)

Site statique sans étape de compilation : index.html, style.css, app.js. MapLibre GL JS affiche un fond de carte Protomaps tiré d'OpenStreetMap. Les tuiles (Grand Londres, zooms 0 à 15, 7791 fichiers, 242 Mo) sont dans app/tuiles/z/x/y.pbf et versionnées dans git, comme les polices et les pictogrammes : la carte n'appelle aucun service extérieur, donc aucun coût à l'usage. L'attribution "© OpenStreetMap" doit rester visible. Bibliothèques sous licence BSD (MapLibre, style Protomaps), données OpenStreetMap sous licence ODbL.

L'application lit app/data/lieux.json, produit par scripts/construire.mjs à partir des fiches. En mode privé, la fiche montre aussi le carnet de terrain et les notes de travail. L'option --public ne garde que les fiches dont la publication vaut "public" et retire les champs de travail.

Couleurs des points : vert pour un lieu visité, orange pour un lieu à visiter, violet pour un événement temporaire.

## Hébergement (Cloudflare Workers, offre gratuite)

Décision du 13/11/2026, validée par Laurent. Le projet Cloudflare est un Worker avec fichiers statiques (et non un projet Pages), relié au dépôt GitHub : chaque envoi sur la branche main déclenche `npx wrangler deploy`. Adresse : https://carte-rock-londres.laurent-rieppi.workers.dev/

- wrangler.jsonc est la source de vérité du déploiement : dossier publié app/, script src/worker.js, commande d'assemblage `node scripts/construire.mjs` lancée avant chaque déploiement.
- src/worker.js protège tout le site par un mot de passe (cookie signé, six mois, huit essais par quart d'heure) et tient le carnet de terrain sur /api/carnet : un journal d'opérations (visite, annulation, note) qui ne fait que s'allonger. Le téléphone garde les opérations en attente quand il n'a pas de réseau et les renvoie ensuite.
- Les tuiles, polices, pictogrammes et bibliothèques, qui sont des données publiques, sont servis sans passer par le Worker (run_worker_first) pour ne pas consommer le quota.
- Secrets à régler dans le tableau de bord Cloudflare (Settings, Variables and Secrets), jamais dans le dépôt : MOT_DE_PASSE et SECRET_SESSION. Sans eux le site répond "Configuration incomplète" et reste fermé.
- L'espace KV CARNET est déclaré sans identifiant : wrangler le crée au premier déploiement.
- Limites vérifiées le 13/11/2026 dans la documentation Cloudflare : 20 000 fichiers par site, 25 Mio par fichier (d'où les tuiles individuelles plutôt qu'un fichier unique), 100 000 appels par jour, 1 000 écritures KV par jour.
- Incident du 13/11/2026 : le premier déploiement, fait avant que le dépôt ne contienne wrangler.jsonc, a publié app/ sans protection pendant quelques dizaines de minutes. Les données des lieux n'y figuraient pas (le fichier n'était pas encore assemblé) et aucun fichier personnel n'a été servi.
- scripts/recuperer_carnet.py reverse le carnet dans les fiches (statut "visite", champ "notes").
- Photos : espace Cloudflare R2 lié au Worker sous le nom MEDIAS (décision du 13/11/2026, validée par Laurent ; offre gratuite de 10 Go). Servies par le Worker derrière le même mot de passe, sur /medias/lieux/<lieu>/<photo>-v.jpg (vignette, 480 px) et -a.jpg (affichage, 1600 px). La sélection (couverture et photos de chaque lieu) est dans selection.json, lue par la carte sur /api/medias/selection. La liaison R2 ne s'ajoute à wrangler.jsonc qu'une fois R2 activé sur le compte de Laurent.

## Photos (outils/medias.py, lancé sur le Mac)

Lancement simplifié (13/11/2026, à la demande de Laurent) : la première fois, il colle dans le Terminal `curl -fsSL https://carte-rock-londres.laurent-rieppi.workers.dev/outils/photos.sh | bash` ; ensuite il double-clique sur "Photos carte rock" sur son Bureau. outils/photos.sh installe Pillow et pillow-heif dans un environnement Python propre au projet (~/Library/Application Support/carte-rock-londres), télécharge la dernière version de outils/medias.py et crée le raccourci. Ces deux fichiers sont publiés sans protection sur /outils/ (du code seul, aucune donnée). Le mot de passe est gardé dans le trousseau d'Apple après la première connexion réussie. Le script se connecte au site avec le mot de passe, lit ~/Pictures/Londres Rock/index.csv et les seuls fichiers de "01 Lieux rock" (vérification du chemin réel, rien n'est jamais écrit dans ce dossier), puis ouvre une page de sélection locale. Pour chaque lieu validé, il produit une vignette et une image d'affichage réenregistrées sans aucune métadonnée (ni GPS, ni date, ni appareil), les envoie, retire du site celles qui ne sont plus retenues et met à jour selection.json. Les aperçus de travail sont mis en cache dans ~/Library/Caches/carte-rock-londres. Les vidéos ne sont pas encore sélectionnables : leurs originaux sont sur iCloud.

Constat du 13/11/2026 : les aperçus du dossier font 360 x 480 pixels. Ils suffisent pour les vignettes mais restent flous en plein écran ; une meilleure qualité demandera les originaux ou un export de Photos en pleine taille.

## Lieux tirés des livres

Un relevé par ouvrage dans sources/livres/<ouvrage>.csv (colonnes : ouvrage, page, lieu, adresse, quartier, zone, type, artistes séparés par ;, fait, etat_2002, fiche_existante, lat, lon, precision). Le fait est une présentation courte du lieu, en deux ou trois lignes, reformulée et jamais recopiée : Laurent la réécrit ensuite à sa guise (consigne du 13/11/2026). Le texte intégral du livre reste hors du dépôt.

- scripts/geocoder_livre.py remplit lat, lon et precision avec Nominatim (OpenStreetMap), au plus une requête par seconde, réponses gardées dans sources/livres/geocodage_cache.json. Précision "adresse", "rue" (point au milieu de la rue, faute de numéro connu), "quartier" ou "introuvable".
- scripts/import_livre.py crée une fiche "a_visiter", marquée "a_verifier", pour chaque lieu nouveau (origine_fiche "livre:<ouvrage>", etat_selon_source, coordonnées d'origine "geocodage" jamais validées d'office), et ajoute le livre aux sources des fiches déjà visitées. Il écrit rapports/a_visiter_<ouvrage>.md, la liste de visite par zone et quartier, qui signale les photos du dossier Londres Rock prises à moins de 45 m d'une adresse précise.
- Premier relevé (13/11/2026) : Max Wooldridge, Rock'n'Roll London (2002), 331 adresses, dont 41 rattachées à des lieux déjà visités.
- Sur la carte, les lieux d'une même position sont légèrement écartés en cercle à l'affichage, sans toucher aux données.

## Commandes

    python3 scripts/import_lieux.py          # fiches et rapport, depuis les CSV du Mac
    npm install                              # bibliothèques de la carte
    node scripts/construire.mjs              # assemble app/data et app/vendor
    npx wrangler dev                         # essai en local avec la protection (secrets d'essai dans .dev.vars, hors git)
    python3 scripts/serveur.py 8000          # essai en local sans protection ni carnet
    scripts/fond_de_carte.sh                 # refait le fond de carte (rarement) : demande les outils pmtiles (Go) et pmtiles (pip)
    python3 scripts/recuperer_carnet.py carnet.json
    python3 scripts/geocoder_livre.py sources/livres/wooldridge_2002.csv
    python3 scripts/import_livre.py sources/livres/wooldridge_2002.csv
