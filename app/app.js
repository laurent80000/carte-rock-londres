import * as maplibregl from './vendor/maplibre-gl.mjs';
import { T } from './textes.fr.js';

/* ------------------------------------------------------------ utilitaires */
const $ = (s, racine = document) => racine.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sansAccent = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const css = (nom) => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
const pluriel = (n, mot, mots = mot + 's') => `${n} ${n > 1 ? mots : mot}`;

const TYPES = T.types;
const CATEGORIES = T.categories;
const VERIFICATIONS = T.verifications;
const ARTICLES = T.articles;

// Familles de lieux : un pictogramme par famille sur le marqueur.
const FAMILLES = {
  salle: 'scene', studio: 'studio', domicile: 'maison', ecole: 'maison', pub: 'comptoir', boutique: 'comptoir',
  pochette: 'image', fresque: 'image', rue: 'image', memorial: 'memoire', plaque: 'memoire', musee: 'memoire',
  exposition: 'memoire', autre: 'repere',
};
// Une couleur par époque, toujours doublée de son nom écrit dans la fiche.
const DECENNIES = { 1950: '#2f6b4f', 1960: '#1f5fd0', 1970: '#e0457b', 1980: '#7b3fe4', 1990: '#8e9299' };
const KRAFT = '#8a7658', ENCRE = '#15120f', CREME = '#f3ead7', ROUGE = '#c8102e';
const couleurEpoque = (l) => DECENNIES[l.decennie] ?? KRAFT;
const nomEpoque = (l) => T.decennies[l.decennie] ?? T.decennieInconnue;

const dateLongue = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });
const dateCourte = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' });

function distance(a, b) {
  const r = 6371000, rad = Math.PI / 180;
  const dp = (b.lat - a.lat) * rad, dl = (b.lon - a.lon) * rad;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
const distanceLisible = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

let minuterie;
function message(texte) {
  const el = $('#message');
  el.textContent = texte;
  el.hidden = false;
  clearTimeout(minuterie);
  minuterie = setTimeout(() => { el.hidden = true; }, 3500);
}

/* ------------------------------------------------------------------ état */
const etat = {
  lieux: [], mode: 'prive',
  categorie: 'tous', types: new Set(), artiste: null, quartier: null, requete: '',
  position: null, lieuOuvert: null, vue: null,
};
const visite = (l) => l.statut === 'visite' || carnet.visites.has(l.id);
const categorie = (l) => (l.nature === 'evenement' ? 'evenement' : visite(l) ? 'visite' : 'a_visiter');

function correspond(l, { sansCategorie = false, sansType = false, sansArtiste = false, sansQuartier = false } = {}) {
  if (!sansCategorie && etat.categorie !== 'tous' && categorie(l) !== etat.categorie) return false;
  if (!sansType && etat.types.size && !etat.types.has(l.type)) return false;
  if (!sansArtiste && etat.artiste && !l.artistes.includes(etat.artiste)) return false;
  if (!sansQuartier && etat.quartier && l.quartier !== etat.quartier) return false;
  if (etat.requete) {
    const q = sansAccent(etat.requete);
    if (!l.index.includes(q)) return false;
  }
  return true;
}
const lieuxFiltres = () => etat.lieux.filter((l) => correspond(l));
const nbFiltres = () => etat.types.size + (etat.artiste ? 1 : 0) + (etat.quartier ? 1 : 0);

/* ---------------------------------------------------------------- carnet */
// Visites et notes prises sur place. Chaque geste est une opération gardée dans le
// téléphone tant que le serveur ne l'a pas reçue : le carnet marche donc sans réseau.
const carnet = { operations: [], attente: [], visites: new Map(), notes: new Map() };
const memoire = {
  lire(cle) { try { return JSON.parse(localStorage.getItem(cle)) ?? []; } catch { return []; } },
  ecrire(cle, valeur) { try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch { /* stockage indisponible */ } },
};
function recalculerCarnet() {
  carnet.visites.clear();
  carnet.notes.clear();
  const toutes = [...carnet.operations, ...carnet.attente].sort((a, b) => a.date.localeCompare(b.date));
  for (const o of toutes) {
    if (o.type === 'visite') carnet.visites.set(o.lieu, o.date);
    else if (o.type === 'annuler_visite') carnet.visites.delete(o.lieu);
    else if (o.type === 'note') carnet.notes.set(o.lieu, [...(carnet.notes.get(o.lieu) ?? []), o]);
  }
}
async function synchroniserCarnet() {
  try {
    const envoi = carnet.attente.slice();
    const r = envoi.length
      ? await fetch('api/carnet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operations: envoi }) })
      : await fetch('api/carnet', { cache: 'no-store' });
    if (r.status === 401) { location.reload(); return; }
    if (!r.ok) return;
    carnet.operations = (await r.json()).operations ?? [];
    const recues = new Set(carnet.operations.map((o) => o.id));
    carnet.attente = carnet.attente.filter((o) => !recues.has(o.id));
    memoire.ecrire('carnet', carnet.operations);
    memoire.ecrire('carnet-attente', carnet.attente);
    recalculerCarnet();
    rafraichir();
    if (etat.vue === 'fiche' && !$('#note')?.value) ouvrirFiche(etat.lieuOuvert, { centrer: false, garder: true });
  } catch { /* hors connexion : les opérations restent en attente */ }
}
function noter(lieu, type, texte) {
  const o = { id: crypto.randomUUID(), lieu, type, date: new Date().toISOString(), ...(texte ? { texte } : {}) };
  carnet.attente.push(o);
  memoire.ecrire('carnet-attente', carnet.attente);
  recalculerCarnet();
  rafraichir();
  synchroniserCarnet();
}
const dateHeure = (iso) => new Date(iso).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });

/* ---------------------------------------------------------------- musique */
// Aucun compte ni service appelé : un titre ouvre simplement la recherche du service préféré.
const SERVICES = [
  { id: 'spotify', nom: 'Spotify', url: (q) => `https://open.spotify.com/search/${q}` },
  { id: 'apple', nom: 'Apple Music', url: (q) => `https://music.apple.com/search?term=${q}` },
  { id: 'tidal', nom: 'Tidal', url: (q) => `https://tidal.com/search?q=${q}` },
  { id: 'qobuz', nom: 'Qobuz', url: (q) => `https://www.qobuz.com/search?q=${q}` },
  { id: 'deezer', nom: 'Deezer', url: (q) => `https://www.deezer.com/search/${q}` },
  { id: 'youtube', nom: 'YouTube', url: (q) => `https://www.youtube.com/results?search_query=${q}` },
];
const serviceChoisi = () => { try { return localStorage.getItem('service-musique'); } catch { return null; } };

/* ---------------------------------------------------------------- photos */
// Sélection faite sur le Mac (outils/medias.py) et rangée dans l'espace photos du site.
let selectionPhotos = { lieux: {} };
const urlMedia = (lieu, photo, taille) => `medias/lieux/${encodeURIComponent(lieu)}/${encodeURIComponent(photo)}-${taille}.jpg`;
const srcPhoto = (l, p, taille) => (p.local ? p[`url_${taille}`] : urlMedia(l.id, p.id, taille));
function photosTerrain(l) {
  const enLigne = selectionPhotos.lieux?.[l.id]?.terrain ?? [];
  const connues = new Set(enLigne.map((p) => p.id));
  return [...enLigne, ...fileAttente.filter((p) => p.lieu === l.id && !connues.has(p.id))];
}
function photosDe(l) {
  const s = selectionPhotos.lieux?.[l.id];
  // La couverture passe en premier, les photos prises sur place à la suite.
  const choisies = [...(s?.photos ?? [])].sort((a, b) => (b.id === s.couverture) - (a.id === s.couverture));
  return [...choisies, ...photosTerrain(l)];
}

/* Photos ajoutées sur place. Chaque image est réduite dans le téléphone (ce qui retire ses
   métadonnées, position comprise), gardée dans une file locale, puis envoyée dès qu'il y a du réseau. */
let fileAttente = [];
const ouvrirBase = () => new Promise((ok, non) => {
  const r = indexedDB.open('carte-rock', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
  r.onsuccess = () => ok(r.result);
  r.onerror = () => non(r.error);
});
const transaction = async (mode, geste) => {
  const b = await ouvrirBase();
  return new Promise((ok, non) => {
    const t = b.transaction('photos', mode);
    const r = geste(t.objectStore('photos'));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => non(t.error);
  });
};
const avecAdresses = (p) => ({ ...p, local: true, url_a: URL.createObjectURL(p.a), url_v: URL.createObjectURL(p.v) });
async function lireFile() {
  try { fileAttente = ((await transaction('readonly', (s) => s.getAll())) ?? []).map(avecAdresses); } catch { fileAttente = []; }
}
async function reduire(fichier, cote) {
  let image;
  try { image = await createImageBitmap(fichier, { imageOrientation: 'from-image' }); } catch {
    image = await new Promise((ok, non) => { const i = new Image(); i.onload = () => ok(i); i.onerror = non; i.src = URL.createObjectURL(fichier); });
  }
  const sortie = {};
  for (const [nom, max] of Object.entries(cote)) {
    const k = Math.min(1, max / Math.max(image.width, image.height));
    const toile = document.createElement('canvas');
    toile.width = Math.round(image.width * k); toile.height = Math.round(image.height * k);
    toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height);
    sortie[nom] = await new Promise((ok) => toile.toBlob(ok, 'image/jpeg', 0.85));
    sortie[`largeur_${nom}`] = toile.width; sortie[`hauteur_${nom}`] = toile.height;
    if (!sortie[nom]) throw new Error('image illisible');
  }
  return sortie;
}
async function ajouterPhotos(lieu, fichiers) {
  let n = 0;
  for (const f of fichiers) {
    try {
      const p = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, lieu, date: new Date().toISOString(), ...(await reduire(f, { a: 1600, v: 480 })) };
      await transaction('readwrite', (s) => s.put(p));
      fileAttente.push(avecAdresses(p));
      n++;
    } catch { message(T.fiche.photoIllisible(f.name)); }
  }
  if (n) message(T.fiche.photosPreparees(n));
  if (etat.lieuOuvert === lieu) ouvrirFiche(lieu, { centrer: false, garder: true });
  envoyerPhotos();
}
let envoiEnCours = false;
async function envoyerPhotos() {
  if (envoiEnCours || !fileAttente.length) return;
  envoiEnCours = true;
  try {
    for (const p of fileAttente.slice()) {
      for (const t of ['a', 'v']) {
        const r = await fetch(`api/medias/lieux/${p.lieu}/${p.id}-${t}.jpg`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: p[t] });
        if (r.status === 401) { location.reload(); return; }
        if (!r.ok) throw new Error('envoi refusé');
      }
      const { id, date, largeur_v, hauteur_v, largeur_a, hauteur_a } = p;
      const r = await fetch('api/medias/terrain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lieu: p.lieu, photo: { id, date, largeur_v, hauteur_v, largeur_a, hauteur_a } }) });
      if (!r.ok) throw new Error('inscription refusée');
      selectionPhotos = await r.json();
      await transaction('readwrite', (s) => s.delete(p.id));
      fileAttente = fileAttente.filter((x) => x.id !== p.id);
    }
  } catch { /* hors connexion : les photos restent dans la file */ } finally {
    envoiEnCours = false;
    if (etat.vue === 'fiche' && !$('#note')?.value) ouvrirFiche(etat.lieuOuvert, { centrer: false, garder: true });
  }
}
async function retirerPhoto(lieu, id) {
  if (fileAttente.some((p) => p.id === id)) {
    await transaction('readwrite', (s) => s.delete(id));
    fileAttente = fileAttente.filter((p) => p.id !== id);
  } else {
    try {
      const r = await fetch(`api/medias/terrain?lieu=${encodeURIComponent(lieu)}&id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      selectionPhotos = await r.json();
    } catch { message(T.fiche.retraitImpossible); return; }
  }
  ouvrirFiche(lieu, { centrer: false, garder: true });
}
function archivesDe(l) {
  return selectionPhotos.lieux?.[l.id]?.archives ?? [];
}
async function chargerSelection() {
  try {
    const r = await fetch('api/medias/selection', { cache: 'no-store' });
    if (!r.ok) return;
    selectionPhotos = await r.json();
    if (etat.vue === 'fiche') ouvrirFiche(etat.lieuOuvert, { centrer: false, garder: true });
  } catch { /* hors connexion : la fiche reste sans photos */ }
}

const visionneuse = document.createElement('div');
visionneuse.className = 'visionneuse';
visionneuse.hidden = true;
visionneuse.innerHTML = '<div class="defile"></div><div class="legende"><span class="compte"></span><p class="texte"></p><p class="liens"></p></div><button class="rond fermer-photo" aria-label="Fermer">&times;</button>';
document.body.append(visionneuse);
// items : [{ src, texte, liens: [{ texte, url }] }]
function ouvrirVisionneuse(items, depart) {
  const defile = visionneuse.querySelector('.defile');
  defile.innerHTML = items.map((it) => `<figure><img src="${esc(it.src)}" alt="" loading="lazy"></figure>`).join('');
  const legende = () => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(defile.scrollLeft / defile.clientWidth)));
    const it = items[i];
    visionneuse.querySelector('.compte').textContent = `${i + 1} / ${items.length}`;
    visionneuse.querySelector('.texte').textContent = it?.texte ?? '';
    visionneuse.querySelector('.liens').innerHTML = (it?.liens ?? []).filter((x) => x.url)
      .map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.texte)}</a>`).join(' · ');
  };
  defile.onscroll = legende;
  visionneuse.hidden = false;
  defile.scrollLeft = depart * defile.clientWidth;
  legende();
}
function itemsPhotos(l) {
  return photosDe(l).map((p) => ({ src: srcPhoto(l, p, 'a'), texte: p.date ? dateLongue(p.date) : '', liens: [] }));
}
function itemsArchives(l) {
  return archivesDe(l).map((a) => ({
    src: urlMedia(l.id, a.id, 'a'),
    texte: `${a.legende} ${T.visionneuse.redimensionnee}`,
    liens: [{ texte: T.visionneuse.source, url: a.page }, { texte: a.licence, url: a.licence_url }],
  }));
}
visionneuse.querySelector('.fermer-photo').addEventListener('click', () => { visionneuse.hidden = true; });
addEventListener('keydown', (e) => {
  if (visionneuse.hidden) return;
  const defile = visionneuse.querySelector('.defile');
  if (e.key === 'Escape') visionneuse.hidden = true;
  if (e.key === 'ArrowRight') defile.scrollBy({ left: defile.clientWidth, behavior: 'smooth' });
  if (e.key === 'ArrowLeft') defile.scrollBy({ left: -defile.clientWidth, behavior: 'smooth' });
});

/* ----------------------------------------------------------------- carte */
const base = new URL('.', location.href).href;

// Fond de carte "plan imprimé" : les couleurs du style Protomaps sont remplacées par des tons
// de papier, et les commerces disparaissent pour que seuls les lieux du carnet ressortent.
const PAPIER = {
  ...basemaps.namedFlavor('light'),
  background: '#efe6d2', earth: '#efe6d2',
  park_a: '#dcdcae', park_b: '#d3d5a2', wood_a: '#d3d5a2', wood_b: '#cbcf9a', scrub_a: '#dcdcae', scrub_b: '#d3d5a2',
  hospital: '#eadfcd', industrial: '#e8dec9', school: '#eae0c9', pedestrian: '#eadfc8', sand: '#eadfc0', beach: '#eadfc0',
  aerodrome: '#e6dcc6', runway: '#d9cdb3', zoo: '#dcdcae', military: '#e6dcc6', glacier: '#efe6d2',
  water: '#a9bdc1', pier: '#e2d6bc', buildings: '#e2d5ba',
  tunnel_other_casing: '#d8cbb0', tunnel_minor_casing: '#d8cbb0', tunnel_link_casing: '#d8cbb0', tunnel_major_casing: '#d8cbb0', tunnel_highway_casing: '#d8cbb0',
  tunnel_other: '#e8dec8', tunnel_minor: '#e8dec8', tunnel_link: '#e8dec8', tunnel_major: '#e8dec8', tunnel_highway: '#e8dec8',
  minor_service_casing: '#d2c4a6', minor_casing: '#d2c4a6', link_casing: '#c9b994', major_casing_late: '#c2b089', highway_casing_late: '#b59a63',
  other: '#f3ecdc', minor_service: '#f8f2e4', minor_a: '#f8f2e4', minor_b: '#fbf7ec', link: '#fbf7ec',
  major_casing_early: '#c2b089', major: '#fffaf0', highway_casing_early: '#b59a63', highway: '#f2d9a4',
  railway: '#b3a383', boundaries: '#b3a383',
  bridges_other_casing: '#c9b994', bridges_minor_casing: '#c9b994', bridges_link_casing: '#c9b994', bridges_major_casing: '#bca97f', bridges_highway_casing: '#b59a63',
  bridges_other: '#f3ecdc', bridges_minor: '#fbf7ec', bridges_link: '#fbf7ec', bridges_major: '#fffaf0', bridges_highway: '#f2d9a4',
  roads_label_minor: '#7a6748', roads_label_minor_halo: '#efe6d2', roads_label_major: '#5e4d33', roads_label_major_halo: '#efe6d2',
  ocean_label: '#5f7f86', subplace_label: '#8a7658', subplace_label_halo: '#efe6d2', city_label: '#3a2f20', city_label_halo: '#efe6d2',
  state_label: '#a8977a', state_label_halo: '#efe6d2', country_label: '#8a7658', address_label: '#a8977a', address_label_halo: '#efe6d2',
  pois: { blue: '#6b5a40', green: '#6b6a3a', lapis: '#6b5a40', pink: '#6b5a40', red: '#6b5a40', slategray: '#6b5a40', tangerine: '#6b5a40', turquoise: '#5f7f86' },
  landcover: { grassland: '#e2dfb8', barren: '#eadfc0', urban_area: '#eae0cb', farmland: '#e4e0bb', glacier: '#efe6d2', scrub: '#dcdcae', forest: '#d3d5a2' },
};
const couchesFond = basemaps.layers('protomaps', PAPIER, { lang: 'en' })
  .filter((c) => !['roads_shields', 'roads_oneway'].includes(c.id))
  .map((c) => (c.id !== 'pois' ? c : {
    ...c,
    // Parmi les points d'intérêt, on ne garde que les gares, utiles pour se repérer.
    filter: ['all', c.filter, ['==', ['get', 'kind'], 'station']],
    layout: { ...c.layout, 'icon-image': 'gare' },
  }));

const carte = new maplibregl.Map({
  container: 'carte',
  style: {
    version: 8,
    glyphs: `${base}polices/{fontstack}/{range}.pbf`,
    sources: {
      protomaps: {
        type: 'vector', tiles: [`${base}tuiles/{z}/{x}/{y}.pbf`], maxzoom: 15, bounds: [-0.56, 51.26, 0.36, 51.72],
        attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>',
      },
    },
    layers: couchesFond,
  },
  center: [-0.142, 51.512], zoom: 11.3, minZoom: 9, maxZoom: 19,
  maxBounds: [[-0.95, 51.08], [0.75, 51.9]],
  attributionControl: { compact: true },
  dragRotate: false, pitchWithRotate: false, touchPitch: false,
});

/* -------------------------------------------------------------- marqueurs */
// Les marqueurs sont dessinés par le code, à la demande : aucun fichier d'image à charger.
// Un lieu est une étiquette de vinyle dont le macaron porte la couleur de l'époque ;
// le macaron reste crème tant que le lieu est à visiter. Un événement est un ticket.
const PICTOS = {
  scene(c) { c.beginPath(); c.arc(0, -0.38, 0.34, 0, 7); c.fill(); c.beginPath(); c.moveTo(-0.14, 0); c.lineTo(0.14, 0); c.lineTo(0.08, 0.82); c.lineTo(-0.08, 0.82); c.closePath(); c.fill(); },
  studio(c) { c.lineWidth = 0.2; for (const x of [-0.42, 0.42]) { c.beginPath(); c.arc(x, -0.1, 0.3, 0, 7); c.stroke(); } c.beginPath(); c.moveTo(-0.42, 0.42); c.lineTo(0.42, 0.42); c.stroke(); },
  maison(c) { c.beginPath(); c.moveTo(-0.78, -0.02); c.lineTo(0, -0.74); c.lineTo(0.78, -0.02); c.closePath(); c.fill(); c.fillRect(-0.5, -0.04, 1, 0.74); },
  comptoir(c) { c.beginPath(); c.moveTo(-0.5, -0.68); c.lineTo(0.36, -0.68); c.lineTo(0.26, 0.72); c.lineTo(-0.4, 0.72); c.closePath(); c.fill(); c.lineWidth = 0.17; c.beginPath(); c.arc(0.38, -0.05, 0.3, -1.3, 1.3); c.stroke(); },
  image(c) { c.lineWidth = 0.2; c.strokeRect(-0.62, -0.62, 1.24, 1.24); c.beginPath(); c.arc(0, 0, 0.26, 0, 7); c.fill(); },
  memoire(c) { c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.36 : 0.86, a = -Math.PI / 2 + (i * Math.PI) / 5; c.lineTo(r * Math.cos(a), r * Math.sin(a)); } c.closePath(); c.fill(); },
  repere(c) { c.beginPath(); c.ellipse(-0.24, 0.48, 0.32, 0.25, -0.3, 0, 7); c.fill(); c.lineWidth = 0.17; c.beginPath(); c.moveTo(0.02, 0.46); c.lineTo(0.02, -0.72); c.lineTo(0.52, -0.5); c.stroke(); },
};
function toile(cote) {
  const t = document.createElement('canvas');
  t.width = t.height = cote * 2;
  const c = t.getContext('2d');
  c.scale(2, 2);
  return [t, c];
}
function dessinerDisque(famille, couleur, vu) {
  const S = 44, [t, c] = toile(S), m = S / 2;
  c.beginPath(); c.arc(m, m + 1.5, 19.5, 0, 7); c.fillStyle = 'rgba(21,18,15,.28)'; c.fill();
  c.beginPath(); c.arc(m, m, 19.5, 0, 7); c.fillStyle = ENCRE; c.fill();
  c.lineWidth = 1.6; c.strokeStyle = CREME; c.stroke();
  c.lineWidth = 0.7; c.strokeStyle = 'rgba(243,234,215,.22)';
  for (const r of [16.6, 14.4]) { c.beginPath(); c.arc(m, m, r, 0, 7); c.stroke(); }
  c.beginPath(); c.arc(m, m, 11.6, 0, 7); c.fillStyle = vu ? couleur : CREME; c.fill();
  if (!vu) { c.lineWidth = 2.4; c.strokeStyle = couleur; c.stroke(); }
  c.save(); c.translate(m, m); c.scale(7, 7);
  c.fillStyle = c.strokeStyle = vu ? CREME : ENCRE; c.lineCap = c.lineJoin = 'round';
  PICTOS[famille]?.(c);
  c.restore();
  return t;
}
function dessinerTicket() {
  const S = 44, [t, c] = toile(S);
  c.translate(S / 2, S / 2); c.rotate(-0.14);
  const l = 38, h = 24, r = 3;
  const forme = () => { c.beginPath(); c.roundRect(-l / 2, -h / 2, l, h, r); };
  c.save(); c.translate(0, 1.5); forme(); c.fillStyle = 'rgba(21,18,15,.28)'; c.fill(); c.restore();
  forme(); c.fillStyle = ROUGE; c.fill(); c.lineWidth = 1.6; c.strokeStyle = CREME; c.stroke();
  c.fillStyle = CREME;
  for (const y of [-h / 2, h / 2]) { c.beginPath(); c.arc(8, y, 3, 0, 7); c.fill(); }
  c.setLineDash([2, 2.4]); c.lineWidth = 1; c.beginPath(); c.moveTo(8, -h / 2 + 4); c.lineTo(8, h / 2 - 4); c.stroke(); c.setLineDash([]);
  c.save(); c.translate(-6, 0); c.scale(7.5, 7.5); PICTOS.memoire(c); c.restore();
  return t;
}
function dessinerPile() {
  const S = 52, [t, c] = toile(S), m = S / 2;
  for (const [dx, dy, a] of [[5, 5, 0.45], [2.5, 2.5, 0.7]]) {
    c.beginPath(); c.arc(m + dx, m + dy, 19, 0, 7); c.fillStyle = `rgba(21,18,15,${a})`; c.fill(); c.lineWidth = 1.2; c.strokeStyle = CREME; c.stroke();
  }
  c.beginPath(); c.arc(m - 2, m - 2, 19, 0, 7); c.fillStyle = ENCRE; c.fill(); c.lineWidth = 1.6; c.strokeStyle = CREME; c.stroke();
  c.lineWidth = 0.7; c.strokeStyle = 'rgba(243,234,215,.25)';
  c.beginPath(); c.arc(m - 2, m - 2, 16, 0, 7); c.stroke();
  return t;
}
function dessinerGare() {
  const S = 18, [t, c] = toile(S);
  c.fillStyle = '#6b5a40'; c.beginPath(); c.roundRect(2, 2, 14, 14, 3); c.fill();
  c.fillStyle = CREME; c.beginPath(); c.roundRect(5.5, 4.5, 7, 7, 1.5); c.fill();
  c.fillRect(5, 13, 2, 1.4); c.fillRect(11, 13, 2, 1.4);
  c.fillStyle = '#6b5a40'; c.fillRect(6.5, 9.2, 1.5, 1.2); c.fillRect(10, 9.2, 1.5, 1.2);
  return t;
}
carte.on('styleimagemissing', (e) => {
  const [genre, famille, epoque, vu] = e.id.split('|');
  let t = null;
  if (e.id === 'gare') t = dessinerGare();
  else if (e.id === 'pile') t = dessinerPile();
  else if (e.id === 'ticket') t = dessinerTicket();
  else if (genre === 'disque') t = dessinerDisque(famille, DECENNIES[epoque] ?? KRAFT, vu === '1');
  if (!t || carte.hasImage(e.id)) return;
  const c = t.getContext('2d');
  carte.addImage(e.id, c.getImageData(0, 0, t.width, t.height), { pixelRatio: 2 });
});
const icone = (l) => (l.nature === 'evenement' ? 'ticket' : `disque|${FAMILLES[l.type] ?? 'repere'}|${l.decennie ?? 0}|${visite(l) ? 1 : 0}`);
carte.touchZoomRotate.disableRotation();
window.carteRock = carte;

// Plusieurs lieux d'une même rue peuvent partager la même position (géocodage à la rue) :
// on les écarte légèrement en cercle pour qu'ils restent tous touchables.
function geojson(lieux) {
  const groupes = new Map();
  for (const l of lieux) {
    const cle = `${l.lat.toFixed(5)},${l.lon.toFixed(5)}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(l);
  }
  const features = [];
  for (const groupe of groupes.values()) {
    groupe.forEach((l, i) => {
      let { lat, lon } = l;
      if (groupe.length > 1) {
        const angle = (2 * Math.PI * i) / groupe.length, rayon = 0.00012 + 0.00001 * groupe.length;
        lat += rayon * Math.sin(angle);
        lon += (rayon * Math.cos(angle)) / Math.cos((lat * Math.PI) / 180);
      }
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { id: l.id, nom: l.nom, categorie: categorie(l), icone: icone(l) } });
    });
  }
  return { type: 'FeatureCollection', features };
}

function installerCouches() {
  carte.addSource('lieux', { type: 'geojson', data: geojson(lieuxFiltres()), cluster: true, clusterRadius: 40, clusterMaxZoom: 13 });
  carte.addSource('position', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  // Le nom de la couche "grappes" est gardé : les clics s'y rattachent.
  carte.addLayer({ id: 'grappes', type: 'symbol', source: 'lieux', filter: ['has', 'point_count'],
    layout: { 'icon-image': 'pile', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'icon-size': ['step', ['get', 'point_count'], 0.8, 5, 0.92, 15, 1.06, 40, 1.22],
      'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Medium'], 'text-size': 13,
      'text-offset': [-0.15, -0.12], 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': CREME } });
  carte.addLayer({ id: 'lieu-choisi', type: 'circle', source: 'lieux', filter: ['==', ['get', 'id'], ''], paint: {
    'circle-radius': 25, 'circle-color': ROUGE, 'circle-opacity': 0.14, 'circle-stroke-color': ROUGE, 'circle-stroke-width': 3,
  } });
  carte.addLayer({ id: 'lieux', type: 'symbol', source: 'lieux', filter: ['!', ['has', 'point_count']],
    layout: { 'icon-image': ['get', 'icone'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.62, 14, 0.82, 17, 1] } });
  carte.addLayer({ id: 'lieux-noms', type: 'symbol', source: 'lieux', minzoom: 13.6, filter: ['!', ['has', 'point_count']],
    layout: { 'text-field': ['get', 'nom'], 'text-font': ['Noto Sans Medium'], 'text-size': 12.5, 'text-max-width': 9,
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 1.55, 'text-optional': true },
    paint: { 'text-color': ENCRE, 'text-halo-color': '#f6efdf', 'text-halo-width': 1.8 } });
  // Zone de toucher plus large que le point, pour le doigt.
  carte.addLayer({ id: 'lieux-zone', type: 'circle', source: 'lieux', filter: ['!', ['has', 'point_count']],
    paint: { 'circle-radius': 22, 'circle-opacity': 0 } });

  carte.addLayer({ id: 'position-halo', type: 'circle', source: 'position', paint: {
    'circle-radius': 17, 'circle-color': '#d9a21b', 'circle-opacity': 0.3 } });
  carte.addLayer({ id: 'position-point', type: 'circle', source: 'position', paint: {
    'circle-radius': 7, 'circle-color': '#d9a21b', 'circle-stroke-color': ENCRE, 'circle-stroke-width': 2.5 } });

  carte.on('click', 'lieux-zone', (e) => {
    const plusProche = e.features
      .map((f) => ({ f, d: Math.hypot(...['x', 'y'].map((k) => carte.project(f.geometry.coordinates)[k] - e.point[k])) }))
      .sort((a, b) => a.d - b.d)[0];
    ouvrirFiche(plusProche.f.properties.id);
  });
  carte.on('click', 'grappes', async (e) => {
    const f = e.features[0];
    const zoom = await carte.getSource('lieux').getClusterExpansionZoom(f.properties.cluster_id);
    carte.easeTo({ center: f.geometry.coordinates, zoom: Math.min(zoom + 0.3, 17) });
  });
  for (const couche of ['lieux-zone', 'grappes']) {
    carte.on('mouseenter', couche, () => { carte.getCanvas().style.cursor = 'pointer'; });
    carte.on('mouseleave', couche, () => { carte.getCanvas().style.cursor = ''; });
  }
}

function margeBasse() {
  return innerWidth >= 820 || !etat.vue ? 0 : Math.round(innerHeight * 0.42);
}
function cadrer(lieux) {
  if (!lieux.length) return;
  const marge = { top: 130, bottom: margeBasse() + 50, left: innerWidth >= 820 ? 450 : 45, right: 45 };
  if (lieux.length === 1) {
    carte.easeTo({ center: [lieux[0].lon, lieux[0].lat], zoom: Math.max(carte.getZoom(), 15.5), padding: marge });
    return;
  }
  const lons = lieux.map((l) => l.lon), lats = lieux.map((l) => l.lat);
  carte.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: marge, maxZoom: 15.5 });
}

function rafraichir() {
  const visibles = lieuxFiltres();
  carte.getSource('lieux')?.setData(geojson(visibles));
  for (const cle of ['tous', 'visite', 'a_visiter', 'evenement']) {
    const n = etat.lieux.filter((l) => correspond(l, { sansCategorie: true }) && (cle === 'tous' || categorie(l) === cle)).length;
    $(`[data-compte="${cle}"]`).textContent = n;
    $(`[data-statut="${cle}"]`).hidden = cle !== 'tous' && cle !== 'visite' && n === 0 && etat.categorie !== cle;
  }
  document.querySelectorAll('.statuts button').forEach((b) => b.classList.toggle('actif', b.dataset.statut === etat.categorie));
  const n = nbFiltres();
  $('#pastille-filtres').hidden = n === 0;
  $('#pastille-filtres').textContent = n;
  $('#effacer').hidden = !etat.requete;
  return visibles;
}

/* --------------------------------------------------------------- panneau */
const panneau = $('#panneau');
function montrer(vue, html, niveau = 'mi') {
  etat.vue = vue;
  $('#contenu').innerHTML = html;
  $('#contenu').scrollTop = 0;
  panneau.hidden = false;
  requestAnimationFrame(() => { panneau.classList.remove('mi', 'plein'); panneau.classList.add(niveau); placerActions(); });
}
function fermer() {
  panneau.classList.remove('mi', 'plein');
  etat.vue = null;
  etat.lieuOuvert = null;
  carte.getLayer('lieu-choisi') && carte.setFilter('lieu-choisi', ['==', ['get', 'id'], '']);
  history.replaceState(null, '', location.pathname + location.search);
  placerActions();
}
function placerActions() {
  const actions = $('.actions');
  const mi = panneau.classList.contains('mi'), plein = panneau.classList.contains('plein');
  const etroit = innerWidth < 820;
  actions.style.transform = etroit && mi ? `translateY(-${Math.round(innerHeight * 0.42)}px)` : '';
  actions.style.visibility = etroit && plein ? 'hidden' : '';
}
$('#fermer').addEventListener('click', fermer);

// Poignée : un glissement vers le haut agrandit, vers le bas réduit puis ferme, un toucher bascule.
let departY = null;
$('#poignee').addEventListener('pointerdown', (e) => { departY = e.clientY; e.target.setPointerCapture?.(e.pointerId); });
$('#poignee').addEventListener('pointerup', (e) => {
  if (departY === null) return;
  const dy = e.clientY - departY;
  departY = null;
  const plein = panneau.classList.contains('plein');
  if (dy > 40) { if (plein) niveau('mi'); else fermer(); }
  else if (dy < -40) niveau('plein');
  else niveau(plein ? 'mi' : 'plein');
});
function niveau(n) { panneau.classList.remove('mi', 'plein'); panneau.classList.add(n); placerActions(); }

/* ----------------------------------------------------------------- fiche */
function texteEvenement(l) {
  const e = l.evenement;
  if (!e) return '';
  if (e.date_debut && e.date_fin) {
    const memeAnnee = e.date_debut.slice(0, 4) === e.date_fin.slice(0, 4);
    let texte = T.fiche.du(memeAnnee ? dateCourte(e.date_debut) : dateLongue(e.date_debut), dateLongue(e.date_fin));
    if (new Date(e.date_fin + 'T23:59:59') < new Date()) texte += T.fiche.termine;
    return texte;
  }
  return e.annee ? T.fiche.evenementDe(e.annee) : T.fiche.evenementTemporaire;
}

// Petit disque (ou ticket) repris dans les listes et le talon, aux couleurs de l'époque du lieu.
const pastille = (l) => `<i class="point ${categorie(l)}" style="--epoque:${couleurEpoque(l)}"></i>`;

function htmlFiche(l) {
  const cat = categorie(l);
  const statut = l.nature === 'evenement' ? (visite(l) ? T.evenementVisite : CATEGORIES.evenement) : CATEGORIES[cat];
  const photos = photosDe(l);
  const arch = archivesDe(l);
  const epoque = l.decennie ? nomEpoque(l) : '';

  // Couverture : la photo choisie, sinon un carton aux couleurs de l'époque.
  let h = `<article class="fiche" style="--epoque:${couleurEpoque(l)}">`;
  h += photos.length
    ? `<button class="couverture" data-photo="0" aria-label="${esc(T.fiche.agrandirPhoto(1))}">
        <img src="${srcPhoto(l, photos[0], 'a')}" alt="">${epoque ? `<span class="tampon-epoque">${esc(epoque)}</span>` : ''}</button>`
    : `<div class="couverture carton"><span class="sillons"></span>${epoque ? `<span class="tampon-epoque">${esc(epoque)}</span>` : ''}</div>`;

  h += `<h1>${esc(l.nom)}</h1>`;

  // Talon de ticket : l'essentiel du lieu en quatre cases.
  const adresse = [l.adresse, l.quartier, l.evenement?.lieu_hote].filter(Boolean).map(esc).join(', ');
  const cases = [];
  if (adresse) cases.push([T.talon.adresse, adresse, 'large']);
  cases.push([T.talon.genre, esc(TYPES[l.type] ?? l.type)]);
  if (epoque) cases.push([T.talon.epoque, esc(epoque)]);
  cases.push([T.talon.etat, `${pastille(l)}${esc(statut)}`]);
  if (etat.position) cases.push([T.talon.distance, esc(distanceLisible(distance(etat.position, l)))]);
  let colonne = 0;
  h += `<dl class="talon">${cases.map(([k, v, c]) => {
    const classe = c === 'large' ? (colonne = 0, 'large') : (colonne++ % 2 ? 'droite' : '');
    return `<div class="${classe}"><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
  }).join('')}</dl>`;

  const tampons = [];
  if (l.evenement) tampons.push([texteEvenement(l), '']);
  if (VERIFICATIONS[l.verification]) tampons.push([VERIFICATIONS[l.verification], 'alerte']);
  if (l.etat_selon_source === 'disparu') tampons.push([T.fiche.disparu, 'alerte']);
  if (l.etat_selon_source === 'transformé') tampons.push([T.fiche.transforme, '']);
  if (l.precision === 'rue') tampons.push([T.fiche.precisionRue, '']);
  if (l.precision === 'quartier') tampons.push([T.fiche.precisionQuartier, 'alerte']);
  if (tampons.length || l.artistes.length) {
    h += '<div class="etiquettes">';
    for (const a of l.artistes) h += `<button class="etiquette artiste" data-artiste="${esc(a)}">${esc(a)}</button>`;
    for (const [t, c] of tampons) h += `<span class="etiquette ${c}">${esc(t)}</span>`;
    h += '</div>';
  }

  // Itinéraire à pied dans l'une ou l'autre application de cartes, au choix.
  const plan = '<svg viewBox="0 0 24 24"><path d="M9 20 3 17V4l6 3 6-3 6 3v13l-6-3z"/><path d="M9 7v13M15 4v13"/></svg>';
  h += `<p class="sous-titre">${esc(T.fiche.itineraire)}</p><div class="boutons">
    <a class="bouton" href="https://maps.apple.com/?daddr=${l.lat},${l.lon}&dirflg=w" target="_blank" rel="noopener">${plan}${esc(T.fiche.plans)}</a>
    <a class="bouton" href="https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}&travelmode=walking" target="_blank" rel="noopener">${plan}${esc(T.fiche.googleMaps)}</a>
  </div>
  <div class="boutons"><button class="bouton second" data-zoom="${esc(l.id)}">${esc(T.fiche.voirDePres)}</button></div>`;

  // Titres à écouter : chaque titre ouvre une recherche dans le service de musique choisi.
  if (l.a_ecouter?.length) {
    const service = SERVICES.find((s) => s.id === serviceChoisi()) ?? SERVICES[0];
    h += `<h2>${esc(T.fiche.aEcouter)}</h2><ul class="titres">${l.a_ecouter.map((t) => `<li>
      <a href="${esc(service.url(encodeURIComponent(`${t.artiste ?? ''} ${t.titre}`.trim())))}" target="_blank" rel="noopener"><span class="lecture" aria-hidden="true"></span>
      <span><b>"${esc(t.titre)}"</b><small>${esc([t.artiste, t.album && `${t.album}${t.annee ? ` (${t.annee})` : ''}`].filter(Boolean).join(' · '))}</small></span></a></li>`).join('')}</ul>
      <p class="note">${esc(T.fiche.ouvrirAvec)}</p>
      <div class="groupe">${SERVICES.map((s) => `<button class="puce${s.id === service.id ? ' actif' : ''}" data-service="${s.id}">${esc(s.nom)}</button>`).join('')}</div>`;
  }

  // Emplacement de la capsule audio : visible en mode privé tant qu'elle n'est pas enregistrée.
  if (etat.mode === 'prive') {
    h += `<div class="capsule vide"><span class="lecture" aria-hidden="true"></span><div><b>${esc(T.fiche.audio)}</b><small>${esc(T.fiche.audioVide)}</small></div></div>`;
  }

  h += `<h2>${esc(T.fiche.histoire)}</h2>`;
  h += l.historique_court || l.historique_long
    ? `<div class="recit">${[l.historique_court, l.historique_long].filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join('')}</div>`
    : `<p class="vide">${esc(T.fiche.histoireVide)}</p>`;

  h += `<h2>${esc(T.fiche.photos)}</h2>`;
  if (photos.length) {
    h += `<div class="galerie tirages">${photos.map((p, i) => `<button class="vignette" data-photo="${i}" aria-label="${esc(T.fiche.agrandirPhoto(i + 1))}">
      <img src="${srcPhoto(l, p, 'v')}" alt="" loading="lazy" width="${p.largeur_v ?? ''}" height="${p.hauteur_v ?? ''}"><span class="tampon-photo">${esc(T.fiche.tampon)}</span></button>`).join('')}</div>`;
  } else if (l.nb_photos || l.nb_videos) {
    const stock = [l.nb_photos && pluriel(l.nb_photos, T.unites.photo), l.nb_videos && pluriel(l.nb_videos, T.unites.video)].filter(Boolean).join(T.unites.et);
    h += `<div class="galerie-vide">${esc(T.fiche.photosVides(stock))}</div>`;
  } else {
    h += `<div class="galerie-vide">${esc(T.fiche.aucunePhoto)}</div>`;
  }

  if (arch.length) {
    h += `<h2>${esc(T.fiche.archives)}</h2><div class="galerie archives">${arch.map((a, i) => `<button class="vignette" data-archive="${i}" aria-label="${esc(T.fiche.agrandirArchive(a.annee))}">
      <img src="${urlMedia(l.id, a.id, 'v')}" alt="" loading="lazy" width="${a.largeur_v ?? ''}" height="${a.hauteur_v ?? ''}"><span class="annee">${esc(a.annee)}</span></button>`).join('')}</div>
      <p class="note">${esc(T.fiche.archivesNote)}</p>`;
  }

  if (l.articles.length) {
    h += `<h2>${esc(T.fiche.site)}</h2><ul class="liens">`;
    for (const a of l.articles) {
      h += `<li><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.titre)}</a>
        <small>${esc(ARTICLES[a.type] ?? a.type)} · ${dateLongue(a.date)}</small></li>`;
    }
    h += '</ul>';
  }

  if (l.sources?.length) {
    h += `<h2>${esc(T.fiche.sources)}</h2><ul class="liens">`;
    for (const s of l.sources) {
      const ref = esc(s.reference ?? s.url ?? '');
      h += `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${ref}</a>` : `<b>${ref}</b>`}
        ${s.page ? `<small>${esc(T.fiche.page(s.page))}</small>` : ''}${s.faits && s.faits !== l.historique_court ? `<small>${esc(s.faits)}</small>` : ''}</li>`;
    }
    h += '</ul>';
  }

  if (l.jours_de_visite?.length) {
    h += `<h2>${esc(T.fiche.visites(l.jours_de_visite.length))}</h2><p class="dates">${l.jours_de_visite.map(dateLongue).join(' · ')}</p>`;
  }

  if (etat.mode === 'prive') {
    const notes = carnet.notes.get(l.id) ?? [];
    const enAttente = new Set(carnet.attente.map((o) => o.id));
    h += `<section class="carnet"><h2>${esc(T.fiche.carnet)}</h2>`;
    if (l.statut !== 'visite') {
      h += carnet.visites.has(l.id)
        ? `<p>${esc(T.fiche.visiteLe(dateHeure(carnet.visites.get(l.id))))} <button class="lien" data-carnet="annuler_visite">${esc(T.fiche.annuler)}</button></p>`
        : `<div class="boutons"><button class="bouton" data-carnet="visite">${esc(T.fiche.marquer)}</button></div>`;
    }
    if (notes.length) {
      h += `<ul class="liens notes">${notes.map((n) => `<li>${esc(n.texte)}<small>${dateHeure(n.date)}${enAttente.has(n.id) ? ` · ${esc(T.fiche.enAttente)}` : ''}</small></li>`).join('')}</ul>`;
    }
    h += `<textarea id="note" rows="3" placeholder="${esc(T.fiche.notePlaceholder)}"></textarea>
      <div class="boutons"><button class="bouton second" data-carnet="note">${esc(T.fiche.ajouterNote)}</button></div>`;
    if (carnet.attente.length) h += `<p class="note">${esc(T.fiche.carnetAttente(carnet.attente.length))}</p>`;
    const surPlace = photosTerrain(l);
    if (surPlace.length) {
      h += `<p class="sous-titre">${esc(T.fiche.photosSurPlace)}</p><div class="terrain">${surPlace.map((p) => `<figure>
        <img src="${srcPhoto(l, p, 'v')}" alt="" loading="lazy"><figcaption>${p.local ? `${esc(T.fiche.photoEnAttente)} · ` : ''}<button class="lien" data-retirer-photo="${esc(p.id)}">${esc(T.fiche.retirerPhoto)}</button></figcaption></figure>`).join('')}</div>`;
    }
    h += `<input type="file" id="fichiers-photos" accept="image/*" multiple hidden>
      <div class="boutons"><button class="bouton" data-ajouter-photos="1">${esc(T.fiche.ajouterPhotos)}</button></div>
      <p class="note">${esc(T.fiche.photosAide)}</p>`;
    h += '</section>';

    const travail = [];
    if (!l.coordonnees_validees) travail.push(T.fiche.positionNonValidee);
    if (!l.decennie) travail.push(T.fiche.decennieManquante);
    else if (!l.decennie_validee) travail.push(T.fiche.decennieProposee(nomEpoque(l)));
    for (const s of l.sources ?? []) if (s.recoupement) travail.push(T.fiche.recouper(s.recoupement));
    for (const v of l.a_verifier ?? []) travail.push(v);
    if (travail.length || l.faits_a_reprendre?.length) {
      h += `<h2>${esc(T.fiche.travail)}</h2>`;
      if (travail.length) h += `<details open><summary>${esc(T.fiche.aControler)}</summary><ul>${travail.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
      if (l.faits_a_reprendre?.length) h += `<details><summary>${esc(T.fiche.faits)}</summary><ul>${l.faits_a_reprendre.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
    }
  }
  return `${h}</article>`;
}

function ouvrirFiche(id, { centrer = true, garder = false } = {}) {
  const l = etat.lieux.find((x) => x.id === id);
  if (!l) return;
  etat.lieuOuvert = id;
  const haut = $('#contenu').scrollTop;
  montrer('fiche', htmlFiche(l), garder && panneau.classList.contains('plein') ? 'plein' : 'mi');
  if (garder) $('#contenu').scrollTop = haut;
  carte.setFilter('lieu-choisi', ['==', ['get', 'id'], id]);
  history.replaceState(null, '', `#${id}`);
  if (centrer) {
    carte.easeTo({ center: [l.lon, l.lat], zoom: Math.max(carte.getZoom(), 14.2),
      padding: { top: 110, bottom: margeBasse(), left: innerWidth >= 820 ? 420 : 0, right: 0 } });
  }
}

/* ---------------------------------------------------------------- listes */
function htmlListe(titre, lieux, { avecDistance = false, vide = T.liste.aucun } = {}) {
  let h = `<h1>${esc(titre)}</h1>`;
  if (!lieux.length) return `${h}<p class="vide">${esc(vide)}</p>`;
  h += '<ul class="resultats">';
  for (const l of lieux) {
    const sous = [TYPES[l.type], l.quartier, l.artistes.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    h += `<li><button data-lieu="${esc(l.id)}">${pastille(l)}
      <span><b>${esc(l.nom)}</b><small>${esc(sous)}</small></span>
      ${avecDistance && etat.position ? `<span class="distance">${distanceLisible(distance(etat.position, l))}</span>` : ''}</button></li>`;
  }
  return `${h}</ul>`;
}

function montrerRecherche() {
  const resultats = rafraichir();
  if (!etat.requete) { if (etat.vue === 'recherche') fermer(); return; }
  let h = htmlListe(T.liste.resultats(resultats.length), resultats, { avecDistance: true });
  if (!resultats.length && (nbFiltres() || etat.categorie !== 'tous')) {
    h += `<div class="boutons"><button class="bouton second" data-action="sans-filtres">${esc(T.liste.partout)}</button></div>`;
  }
  montrer('recherche', h, 'plein');
}

function montrerProches() {
  if (!etat.position) { demanderPosition(montrerProches); return; }
  const tries = lieuxFiltres()
    .map((l) => ({ l, d: distance(etat.position, l) }))
    .sort((a, b) => a.d - b.d).slice(0, 20).map((x) => x.l);
  montrer('proches', htmlListe(T.liste.proches, tries, { avecDistance: true }), 'mi');
}

/* --------------------------------------------------------------- filtres */
function compter(cle, valeurDe, options) {
  const comptes = new Map();
  for (const l of etat.lieux) {
    if (!correspond(l, options)) continue;
    for (const v of [].concat(valeurDe(l) ?? [])) comptes.set(v, (comptes.get(v) ?? 0) + 1);
  }
  return [...comptes.entries()];
}
function montrerFiltres() {
  const types = compter('type', (l) => l.type, { sansType: true }).sort((a, b) => b[1] - a[1]);
  const artistes = compter('artiste', (l) => l.artistes, { sansArtiste: true }).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const quartiers = compter('quartier', (l) => l.quartier, { sansQuartier: true }).sort((a, b) => a[0].localeCompare(b[0]));
  const puces = (liste, attribut, actif, nom = (v) => v) => liste.map(([v, n]) =>
    `<button class="puce ${actif(v) ? 'actif' : ''}" data-${attribut}="${esc(v)}">${esc(nom(v))} <small>${n}</small></button>`).join('');
  const n = lieuxFiltres().length;
  const legende = Object.entries(DECENNIES).map(([d, c]) => `<span><i class="point visite" style="--epoque:${c}"></i>${esc(T.decennies[d])}</span>`).join('');
  const h = `<h1>${esc(T.filtres.titre)}</h1>
    <h2>${esc(T.filtres.type)}</h2><div class="groupe">${puces(types, 'type', (v) => etat.types.has(v), (v) => TYPES[v] ?? v)}</div>
    <h2>${esc(T.filtres.artiste)}</h2><div class="groupe">${puces(artistes, 'artiste-filtre', (v) => etat.artiste === v)}</div>
    <h2>${esc(T.filtres.quartier)}</h2><div class="groupe">${puces(quartiers, 'quartier', (v) => etat.quartier === v)}</div>
    <h2>${esc(T.filtres.legende)}</h2><div class="legende-carte">${legende}</div><p class="note">${esc(T.filtres.legendeTexte)}</p>
    <div class="pied-filtres">
      <button class="bouton second" data-action="reinitialiser">${esc(T.filtres.effacer)}</button>
      <button class="bouton" data-action="voir">${esc(T.filtres.voir(n))}</button>
    </div>`;
  const haut = $('#contenu').scrollTop;
  montrer('filtres', h, 'plein');
  $('#contenu').scrollTop = haut;
}

/* -------------------------------------------------------------- position */
let suivi = null;
function demanderPosition(ensuite) {
  if (!navigator.geolocation) { message(T.position.indisponible); return; }
  if (suivi !== null) { if (etat.position) ensuite?.(); return; }
  let premier = true;
  suivi = navigator.geolocation.watchPosition((p) => {
    etat.position = { lat: p.coords.latitude, lon: p.coords.longitude };
    carte.getSource('position')?.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [etat.position.lon, etat.position.lat] } });
    $('#ma-position').classList.add('actif');
    if (premier) { premier = false; ensuite?.(); }
  }, (err) => {
    navigator.geolocation.clearWatch(suivi);
    suivi = null;
    message(err.code === 1 ? T.position.refusee : T.position.introuvable);
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
}
function allerAMaPosition() {
  const p = etat.position;
  if (!p) return;
  if (p.lon < -0.95 || p.lon > 0.75 || p.lat < 51.08 || p.lat > 51.9) { message(T.position.horsLondres); return; }
  carte.easeTo({ center: [p.lon, p.lat], zoom: Math.max(carte.getZoom(), 15), padding: { top: 110, bottom: margeBasse(), left: 0, right: 0 } });
}

/* ------------------------------------------------------------ événements */
$('#ma-position').addEventListener('click', () => (etat.position ? allerAMaPosition() : demanderPosition(allerAMaPosition)));
$('#pres-de-moi').addEventListener('click', montrerProches);
$('#ouvrir-filtres').addEventListener('click', () => (etat.vue === 'filtres' ? fermer() : montrerFiltres()));

$('#recherche').addEventListener('input', (e) => { etat.requete = e.target.value.trim(); montrerRecherche(); });
$('#recherche').addEventListener('focus', () => { if (etat.requete) montrerRecherche(); });
$('#recherche').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
$('#effacer').addEventListener('click', () => { $('#recherche').value = ''; etat.requete = ''; rafraichir(); if (etat.vue === 'recherche') fermer(); });

document.querySelector('.statuts').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  etat.categorie = b.dataset.statut;
  const visibles = rafraichir();
  if (etat.vue === 'filtres') montrerFiltres();
  else if (etat.vue === 'recherche') montrerRecherche();
  else if (etat.vue === 'proches') montrerProches();
  else cadrer(visibles);
});

$('#contenu').addEventListener('click', (e) => {
  const cible = e.target.closest('button');
  if (!cible) return;
  const d = cible.dataset;
  if (d.lieu) { $('#recherche').blur(); ouvrirFiche(d.lieu); return; }
  if (d.photo) { ouvrirVisionneuse(itemsPhotos(etat.lieux.find((x) => x.id === etat.lieuOuvert)), Number(d.photo)); return; }
  if (d.archive) { ouvrirVisionneuse(itemsArchives(etat.lieux.find((x) => x.id === etat.lieuOuvert)), Number(d.archive)); return; }
  if (d.service) {
    try { localStorage.setItem('service-musique', d.service); } catch { /* stockage indisponible */ }
    ouvrirFiche(etat.lieuOuvert, { centrer: false, garder: true });
    return;
  }
  if (d.ajouterPhotos) { $('#fichiers-photos').click(); return; }
  if (d.retirerPhoto) { if (confirm(T.fiche.confirmerRetrait)) retirerPhoto(etat.lieuOuvert, d.retirerPhoto); return; }
  if (d.carnet) {
    const texte = $('#note')?.value.trim();
    if (d.carnet === 'note' && !texte) { $('#note').focus(); return; }
    noter(etat.lieuOuvert, d.carnet, d.carnet === 'note' ? texte : undefined);
    if (d.carnet === 'note') $('#note').value = '';
    ouvrirFiche(etat.lieuOuvert, { centrer: false, garder: true });
    return;
  }
  if (d.zoom) {
    const l = etat.lieux.find((x) => x.id === d.zoom);
    carte.easeTo({ center: [l.lon, l.lat], zoom: 17, padding: { top: 110, bottom: margeBasse(), left: innerWidth >= 820 ? 420 : 0, right: 0 } });
    return;
  }
  if (d.artiste) {
    etat.artiste = d.artiste; etat.types.clear(); etat.quartier = null; etat.categorie = 'tous';
    const visibles = rafraichir();
    montrer('artiste', htmlListe(d.artiste, visibles, { avecDistance: true }), 'mi');
    cadrer(visibles);
    return;
  }
  if (d.type) { etat.types.has(d.type) ? etat.types.delete(d.type) : etat.types.add(d.type); }
  else if (d.artisteFiltre) { etat.artiste = etat.artiste === d.artisteFiltre ? null : d.artisteFiltre; }
  else if (d.quartier) { etat.quartier = etat.quartier === d.quartier ? null : d.quartier; }
  else if (d.action === 'reinitialiser') { etat.types.clear(); etat.artiste = null; etat.quartier = null; }
  else if (d.action === 'sans-filtres') { etat.types.clear(); etat.artiste = null; etat.quartier = null; etat.categorie = 'tous'; montrerRecherche(); return; }
  else if (d.action === 'voir') { const v = rafraichir(); fermer(); cadrer(v); return; }
  else return;
  rafraichir();
  montrerFiltres();
});

addEventListener('resize', placerActions);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && etat.vue && visionneuse.hidden) fermer(); });

/* ------------------------------------------------------------- démarrage */
const donnees = await (await fetch('data/lieux.json', { cache: 'no-cache' })).json();
etat.mode = donnees.mode;
etat.lieux = donnees.lieux.map((l) => ({
  ...l,
  index: sansAccent([l.nom, l.adresse, l.quartier, TYPES[l.type], l.evenement?.lieu_hote, ...l.artistes].filter(Boolean).join(' | ')),
}));

carnet.operations = memoire.lire('carnet');
carnet.attente = memoire.lire('carnet-attente');
recalculerCarnet();
if (etat.mode === 'prive') {
  synchroniserCarnet();
  chargerSelection();
  lireFile().then(envoyerPhotos);
  $('#contenu').addEventListener('change', (e) => {
    if (e.target.id !== 'fichiers-photos' || !e.target.files.length) return;
    ajouterPhotos(etat.lieuOuvert, [...e.target.files]);
    e.target.value = '';
  });
  addEventListener('online', () => { synchroniserCarnet(); envoyerPhotos(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { synchroniserCarnet(); envoyerPhotos(); } });
}

const pret = () => {
  installerCouches();
  rafraichir();
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) ouvrirFiche(id);
};
if (carte.loaded()) pret(); else carte.once('load', pret);
