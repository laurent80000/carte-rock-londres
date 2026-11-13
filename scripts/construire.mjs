#!/usr/bin/env node
// Assemble l'application dans app/ : données des lieux et bibliothèques.
//
//   node scripts/construire.mjs            version privée (toutes les fiches)
//   node scripts/construire.mjs --public   seulement les fiches publiées, sans les champs de travail
//
// Écrit en JavaScript parce que l'hébergeur lance ce script à chaque déploiement.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIBLIOTHEQUES = [
  'maplibre-gl/dist/maplibre-gl.mjs',
  'maplibre-gl/dist/maplibre-gl-shared.mjs',
  'maplibre-gl/dist/maplibre-gl-worker.mjs',
  'maplibre-gl/dist/maplibre-gl.css',
  '@protomaps/basemaps/dist/basemaps.js',
];
const enPublic = process.argv.includes('--public');
const choisir = (objet, cles) => Object.fromEntries(cles.filter((k) => objet[k]).map((k) => [k, objet[k]]));

const lieux = [];
const dossier = join(RACINE, 'data/lieux');
for (const nom of readdirSync(dossier).filter((n) => n.endsWith('.json')).sort()) {
  const f = JSON.parse(readFileSync(join(dossier, nom), 'utf8'));
  if (!f.coordonnees) continue;
  if (enPublic && f.publication !== 'public') continue;
  const imp = f.import ?? {};
  const articlesSite = f.sources_site ?? [];
  const lieu = {
    id: f.id, nom: f.nom, nature: f.nature, type: f.type,
    adresse: f.adresse ?? null, quartier: f.quartier ?? null,
    lat: f.coordonnees.lat, lon: f.coordonnees.lon,
    artistes: f.artistes ?? [], periode: f.periode ?? null,
    statut: f.statut, evenement: f.evenement ?? null,
    historique_court: f.historique_court ?? '', historique_long: f.historique_long ?? '',
    medias: f.medias ?? { couverture: null, selection: [] },
    articles: articlesSite.map((a) => ({ type: a.type, date: a.date, titre: a.titre, url: a.url })),
  };
  if (enPublic) {
    lieu.sources = (f.sources ?? []).map((s) => choisir(s, ['type', 'reference', 'url', 'page']));
  } else {
    Object.assign(lieu, {
      dossier: f.dossier_photo ?? null,
      verification: f.verification ?? null,
      coordonnees_validees: f.coordonnees.validees ?? false,
      publication: f.publication ?? null,
      sources: f.sources ?? [],
      notes: f.notes ?? [],
      jours_de_visite: [...new Set([...(imp.jours_de_visite ?? []), ...(f.visites_terrain ?? [])])].sort(),
      nb_photos: imp.nb_photos ?? 0, nb_videos: imp.nb_videos ?? 0,
      faits_a_reprendre: articlesSite.map((a) => a.faits_a_reprendre).filter(Boolean),
      a_verifier: articlesSite.map((a) => a.a_verifier).filter(Boolean),
    });
  }
  lieux.push(lieu);
}
mkdirSync(join(RACINE, 'app/data'), { recursive: true });
writeFileSync(join(RACINE, 'app/data/lieux.json'), JSON.stringify({ mode: enPublic ? 'public' : 'prive', lieux }));

if (!existsSync(join(RACINE, 'node_modules/maplibre-gl'))) {
  console.log('Bibliothèques absentes : installation.');
  execSync('npm ci', { cwd: RACINE, stdio: 'inherit' });
}
mkdirSync(join(RACINE, 'app/vendor'), { recursive: true });
for (const b of BIBLIOTHEQUES) copyFileSync(join(RACINE, 'node_modules', b), join(RACINE, 'app/vendor', basename(b)));
// Outils du Mac, publiés sans protection : du code seul, sans aucune donnée.
mkdirSync(join(RACINE, 'app/outils'), { recursive: true });
for (const f of ['medias.py', 'photos.sh']) copyFileSync(join(RACINE, 'outils', f), join(RACINE, 'app/outils', f));
console.log(`${lieux.length} lieux écrits dans app/data/lieux.json (${enPublic ? 'public' : 'privé'}).`);
