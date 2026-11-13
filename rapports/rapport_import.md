# Rapport d'import

Généré le 2026-11-13 par scripts/import_lieux.py. Ce fichier est réécrit à chaque import.

## Bilan

- 3617 fichiers indexés, dont 2566 dans 69 lieux rock et 1051 dans 25 autres lieux.
- 69 fiches à jour dans data/lieux (0 créées lors de cet import), 0 dossiers sans règle d'import.
- 3535 aperçus et 82 originaux. 270 vidéos, dont 0 disponibles en original : les autres attendent le rapatriement depuis iCloud.

## Cohérence des trois fichiers

- Comptages lieux.csv contre index.csv : aucun écart.
- Journal de reclassement : 605 déplacements, 0 dont la destination manque dans index.csv, 0 dont l'ancien chemin y figure encore.
- Fichiers marqués "_obsolete" ou "_avant_reclassement" dans index.csv : 0.
- Noms originaux présents plusieurs fois dans index.csv : 0.
- Fichiers sans coordonnées GPS : 0. Fichiers sans date : 0.

## Coordonnées à contrôler

Le point d'un lieu est provisoirement la médiane des positions GPS de ses photos, c'est-à-dire l'endroit où se tenait le photographe, pas l'adresse du lieu. Chaque point reste "non validé" jusqu'à contrôle. Les lieux ci-dessous cumulent un signal d'alerte : photos très dispersées, ou moyenne de lieux.csv éloignée de la médiane.

| Lieu | Fichiers | Dispersion (90 % des photos) | Photo la plus lointaine | Écart moyenne/médiane |
|---|---|---|---|---|
| Battersea Power Station (Pink Floyd, Animals) | 132 | 308 m | 370 m | 36 m |
| Dartford, gare (rencontre Jagger et Richards) | 15 | 16168 m | 16278 m | 5228 m |

Écart entre la moyenne donnée par lieux.csv et la médiane retenue, quand il dépasse 50 m :

- Dartford, gare (rencontre Jagger et Richards) : 5228 m.

## Lieux rock très proches les uns des autres

Paires distantes de moins de 120 m : doublons possibles, ou points qui se superposeront sur la carte.

- Sotheby's (exposition Freddie Mercury, 2023) et Halcyon Gallery (exposition Bob Dylan, Point Blank, 2025) : 53 m.
- Heddon Street (pochette de Ziggy Stardust) et Apple Corps, Savile Row (concert sur le toit) : 81 m.
- RS No. 9 Carnaby (boutique des Rolling Stones) et Third Man Records (1 Marshall Street) : 65 m.
- RS No. 9 Carnaby (boutique des Rolling Stones) et Bag O'Nails (9 Kingly Street) : 67 m.
- Berwick Street (pochette d'Oasis, Sister Ray) et Trident Studios (17 St Anne's Court) : 102 m.
- Marquee Club (90 Wardour Street) et Trident Studios (17 St Anne's Court) : 110 m.

## Drapeaux de vérification

- "a verifier" : Beckenham, Croydon Road Recreation Ground (Bowie) ; Beckenham, Three Tuns (Bowie, Arts Lab) ; Marc Bolan Rock Shrine (Barnes).
- "a identifier" : 75 Leather Lane (galerie d'affiches rock, à identifier) ; 80 Old Church Street (façade punk Roxy, à identifier).
- "adresse Apple a verifier" : Apple Corps, Savile Row (concert sur le toit).
- "ancienne adresse du Marquee, a verifier" : Marquee Club (90 Wardour Street).
- Sans note de vérification (15 lieux) : Roundhouse (Chalk Farm) ; Alexandra Palace ; Shepherd's Bush Empire ; Royal Albert Hall ; Battersea Power Station (Pink Floyd, Animals) ; Wembley Stadium ; Handel et Hendrix House (23 Brook Street) ; The O2 (North Greenwich) ; Dublin Castle (94 Parkway, Camden) ; Heddon Street (pochette de Ziggy Stardust) ; Denmark Street (Tin Pan Alley) ; Camden Market ; Island Studios (10 Basing Street) ; 430 King's Road (boutique SEX, Malcolm McLaren) ; Abbey Road Studios.

## Événements temporaires

Fiches créées avec la nature "evenement" (dates de début et de fin à renseigner) :

- Sotheby's (exposition Freddie Mercury, 2023) (lieu hôte : Sotheby's).
- Lightroom (12 Lewis Cubitt Square, David Bowie) (lieu hôte : Lightroom).
- Halcyon Gallery (exposition Bob Dylan, Point Blank, 2025) (lieu hôte : Halcyon Gallery).
- King's Cross (exposition Amy Winehouse In Focus, 2026) (lieu hôte : à préciser).
- Fitzrovia Chapel (exposition David Bowie, A London Day, 2024) (lieu hôte : Fitzrovia Chapel).
- Kings Place (Nick Cave, Wild God, 2024) (lieu hôte : Kings Place).
- Royal College of Music (exposition Kurt Cobain Unplugged) (lieu hôte : Royal College of Music).

## Lieux à trancher dans "02 Autres lieux"

- Electric Ballroom (Camden) : 2 fichiers.
  - 2 dans "_Divers", adresse Apple "178 Camden High Street", le 2024-11-09.
- Imperial College : 3 fichiers.
  - 2 dans "_Divers", adresse Apple "Imperial College London", le 2022-05-26.
  - 1 dans "_Divers", adresse Apple "Imperial College London", le 2025-11-18.
- Muswell Hill (visite Kinks) : 12 fichiers.
  - 1 dans "_Divers", adresse Apple "88 Muswell Hill Broadway", le 2025-07-20.
  - 1 dans "_Divers", adresse Apple "122 Fortis Green Road", le 2025-07-20.
  - 2 dans "_Divers", adresse Apple "119 Muswell Hill Road", le 2025-07-20.
  - 1 dans "_Divers", adresse Apple "72 Fortis Green Road", le 2025-07-20.
  - 1 dans "_Divers", adresse Apple "1 Fortis Green Road", le 2025-07-20.
  - 4 dans "_Divers", adresse Apple "118 Muswell Hill Broadway", le 2025-07-20.
  - 2 dans "_Divers", adresse Apple "126-138 Muswell Hill Broadway", le 2025-07-20.
- Dominion Theatre : 9 fichiers.
  - 7 dans "_Divers", adresse Apple "268-269 Tottenham Court Road", le 2023-04-28.
  - 2 dans "_Divers", adresse Apple "268-269 Tottenham Court Road", le 2023-04-29.
- Claridge's et 54 Brook Street : 12 fichiers.
  - 11 dans "54 Brook Street", adresse Apple "54 Brook Street", le 2023-07-08.
  - 1 dans "54 Brook Street", adresse Apple "54 Brook Street", le 2023-07-10.
- Fresque du 233 Portobello Road : 14 fichiers.
  - 3 dans "_Divers", adresse Apple "22 Portobello Road", le 2023-04-30.
  - 1 dans "_Divers", adresse Apple "193 Portobello Road", le 2023-04-30.
  - 1 dans "_Divers", adresse Apple "186 Portobello Road", le 2024-11-08.
  - 1 dans "_Divers", adresse Apple "181 Portobello Road", le 2024-11-08.
  - 3 dans "_Divers", adresse Apple "160 Portobello Road", le 2025-02-09.
  - 5 dans "_Divers", adresse Apple "233 Portobello Road", le 2025-02-09.
- 24 Osborn Street (Sarm East ?) : 3 fichiers.
  - 3 dans "_Divers", adresse Apple "24 Osborn Street", le 2026-09-13.
- Barbican (exposition 2 Tone, 2024 ?) : 50 fichiers.
  - 17 dans "Barbican Centre", adresse Apple "Barbican Centre", le 2024-03-20.
  - 2 dans "Lakeside Terrace", adresse Apple "Lakeside Terrace", le 2024-03-20.
  - 4 dans "_Divers", adresse Apple "1 Silk Street", le 2024-03-20.
  - 1 dans "_Divers", adresse Apple "Gilbert House, Barbican", le 2024-03-20.
  - 1 dans "Barbican Centre", adresse Apple "Barbican Centre", le 2026-09-11.
  - 21 dans "Lakeside Terrace", adresse Apple "Lakeside Terrace", le 2026-09-11.
  - 3 dans "_Divers", adresse Apple "Barbican Arts And Conference Centre, Silk Street", le 2026-09-11.
  - 1 dans "_Divers", adresse Apple "1 Silk Street", le 2026-09-11.

Fichiers de "02 Autres lieux" pris à moins de 80 m d'un lieu rock, qui lui appartiennent peut-être :

- 2 fichier(s) de "_Divers" du 2023-07-03, près de Brixton, maison natale de David Bowie (40 Stansfield Road).
- 1 fichier(s) de "London" du 2022-05-29, près de Brompton Oratory (Nick Cave).
- 4 fichier(s) de "_Divers" du 2022-05-29, près de Brompton Oratory (Nick Cave).
- 19 fichier(s) de "55–77 Regent Street" du 2023-04-28, près de Café Royal (The Last Supper, David Bowie).
- 3 fichier(s) de "_Divers" du 2023-07-03, près de Café Royal (The Last Supper, David Bowie).
- 1 fichier(s) de "_Divers" du 2024-06-25, près de Dublin Castle (94 Parkway, Camden).
- 1 fichier(s) de "_Divers" du 2026-09-30, près de Edith Grove (appartement des Rolling Stones).
- 9 fichier(s) de "London" du 2024-03-19, près de Fitzrovia Chapel (exposition David Bowie, A London Day, 2024).
- 4 fichier(s) de "_Divers" du 2024-03-19, près de Fitzrovia Chapel (exposition David Bowie, A London Day, 2024).
- 2 fichier(s) de "_Divers" du 2024-06-27, près de Garden Lodge (1 Logan Place, Freddie Mercury).
- 1 fichier(s) de "_Divers" du 2022-05-27, près de RS No. 9 Carnaby (boutique des Rolling Stones).
- 2 fichier(s) de "_Divers" du 2022-05-27, près de Ronnie Scott's (47 Frith Street).
- 1 fichier(s) de "_Divers" du 2025-11-18, près de Royal College of Music (exposition Kurt Cobain Unplugged).
- 2 fichier(s) de "_Divers" du 2024-03-19, près de Saville Theatre (135 Shaftesbury Avenue).
- 1 fichier(s) de "_Divers" du 2023-08-31, près de Sotheby's (exposition Freddie Mercury, 2023).
- 1 fichier(s) de "_Divers" du 2023-08-31, près de Third Man Records (1 Marshall Street).
- 1 fichier(s) de "_Divers" du 2024-11-11, près de Third Man Records (1 Marshall Street).
- 1 fichier(s) de "_Divers" du 2025-05-15, près de Townhouse Studios (Goldhawk Road).
- 1 fichier(s) de "_Divers" du 2023-07-04, près de Trident Studios (17 St Anne's Court).

## Articles du site

28 contenus recensés, dont 24 rattachés à une fiche existante.

Contenus sans dossier photo, donc sans fiche pour l'instant (points à créer) :

- Sarm East Studios (Osborn Street), interview du 2026-10-26. Point a creer. Tes photos du 24 Osborn Street (13/09/2026, restees dans _Divers) sont dans la meme rue : a confirmer
- Barbican Music Library (exposition 2 Tone, 2024), recit de visite du 2024-03-21. Les photos de 2024 des dossiers Barbican Centre, Lakeside Terrace et 1 Silk Street (02 Autres lieux) viennent sans doute de cette visite : a verifier puis reclasser
- 21Soho (rencontre Phil Manzanera, 2024), recit d'evenement du 2024-03-20. Point a creer. L'anecdote de 2006 enrichit aussi la fiche Royal Albert Hall
- Haddon Hall (42 Southend Road, Beckenham), recit de concert du 2025-05-16. Point a creer, a rapprocher des deux lieux Bowie de Beckenham deja photographies. L'article situe l'installation a l'ete 1970 : Bowie y emmenage des 1969, a verifier

Remarques de l'index du site sur les contenus rattachés (points à créer, faits à recouper, corrections d'articles) :

- Trident Studios et Ramport Studios (2026-10-26) : Ramport, Paddington et Leicester Square sont des points a creer
- Island Studios (10 Basing Street) (2026-10-27) : Tramp et le studio de Battersea (Ramport) sont des points a creer
- Handel et Hendrix House (23 Brook Street) (2025-05-23) : HMV Oxford Street et One Stop Records sont des points a creer
- Clissold Arms (Fortis Green, les Kinks) (2025-07-31) : La maison familiale en face du pub est un point a creer. Les photos de Muswell Hill restees dans _Divers appartiennent a cette visite
- Marquee Club (90 Wardour Street) (2023-07-06) : L'article parle de facade du club original : le Marquee de 1958 etait au 165 Oxford Street, Wardour Street est la deuxieme adresse (1964). Date de fermeture 2009 a verifier (2008 selon les sources courantes)
- Marquee Club (90 Wardour Street) (2020-12-26) : Le concert de mars 1964 a ete enregistre au Marquee d'Oxford Street, pas a Wardour Street : a verifier avant de le rattacher a ce point
- Dublin Castle (94 Parkway, Camden) (2024-03-21) : Date du concert de Coldplay a recouper
- Fitzrovia Chapel (exposition David Bowie, A London Day, 2024) (2024-03-20) : ERREUR dans l'article : la reprise de Cream sur cet album est I Feel Free, pas I'm so Free
- V&A East Storehouse (David Bowie Centre) (2025-07-10) : L'article laisse entendre South Kensington : le Centre est au V&A East Storehouse, a Stratford

## Lieux les plus chargés

Lieux de plus de 50 fichiers, pour lesquels la sélection des médias sera indispensable :

- Roundhouse (Chalk Farm) : 413 fichiers, 16 vidéos, 2 jour(s) de visite.
- Alexandra Palace : 279 fichiers, 11 vidéos, 1 jour(s) de visite.
- Shepherd's Bush Empire : 204 fichiers, 9 vidéos, 1 jour(s) de visite.
- Royal Albert Hall : 137 fichiers, 27 vidéos, 3 jour(s) de visite.
- Battersea Power Station (Pink Floyd, Animals) : 132 fichiers, 11 vidéos, 2 jour(s) de visite.
- Sotheby's (exposition Freddie Mercury, 2023) : 118 fichiers, 16 vidéos, 1 jour(s) de visite.
- Wembley Stadium : 101 fichiers, 13 vidéos, 2 jour(s) de visite.
- Handel et Hendrix House (23 Brook Street) : 88 fichiers, 5 vidéos, 3 jour(s) de visite.
- KOKO (Camden) : 81 fichiers, 4 vidéos, 1 jour(s) de visite.
- The O2 (North Greenwich) : 77 fichiers, 6 vidéos, 1 jour(s) de visite.
- Hammersmith Apollo : 67 fichiers, 3 vidéos, 2 jour(s) de visite.
- Dublin Castle (94 Parkway, Camden) : 56 fichiers, 3 vidéos, 4 jour(s) de visite.
