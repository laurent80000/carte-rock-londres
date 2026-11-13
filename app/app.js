import * as maplibregl from './vendor/maplibre-gl.mjs';

/* ------------------------------------------------------------ utilitaires */
const $ = (s, racine = document) => racine.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sansAccent = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const css = (nom) => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
const pluriel = (n, mot, mots = mot + 's') => `${n} ${n > 1 ? mots : mot}`;

const TYPES = {
  studio: 'Studio', salle: 'Salle de concert', domicile: 'Domicile', pochette: "Pochette d'album", plaque: 'Plaque',
  boutique: 'Boutique', pub: 'Pub', musee: 'Musée', exposition: 'Exposition', ecole: 'École', memorial: 'Mémorial',
  fresque: 'Fresque', rue: 'Rue', autre: 'Autre lieu',
};
const CATEGORIES = { visite: 'Visité', a_visiter: 'À visiter', evenement: 'Événement' };
const VERIFICATIONS = { a_verifier: 'À vérifier', a_identifier: 'À identifier' };
const ARTICLES = {
  'recit de visite': 'Récit de visite', 'recit de concert': 'Récit de concert', "recit d'evenement": "Récit d'événement",
  interview: 'Interview', "chronique d'album": "Chronique d'album", 'article anniversaire': 'Article anniversaire',
  'page Studio Experience': 'Studio Experience', annonce: 'Annonce', rencontre: 'Rencontre', dossier: 'Dossier',
};

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

/* ---------------------------------------------------------------- photos */
// Sélection faite sur le Mac (outils/medias.py) et rangée dans l'espace photos du site.
let selectionPhotos = { lieux: {} };
const urlMedia = (lieu, photo, taille) => `medias/lieux/${encodeURIComponent(lieu)}/${encodeURIComponent(photo)}-${taille}.jpg`;
function photosDe(l) {
  const s = selectionPhotos.lieux?.[l.id];
  if (!s?.photos?.length) return [];
  // La couverture passe en premier.
  return [...s.photos].sort((a, b) => (b.id === s.couverture) - (a.id === s.couverture));
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
visionneuse.innerHTML = '<div class="defile"></div><div class="legende"></div><button class="rond fermer-photo" aria-label="Fermer">&times;</button>';
document.body.append(visionneuse);
function ouvrirVisionneuse(l, depart) {
  const photos = photosDe(l);
  const defile = visionneuse.querySelector('.defile');
  defile.innerHTML = photos.map((p) => `<figure><img src="${urlMedia(l.id, p.id, 'a')}" alt="" loading="lazy"></figure>`).join('');
  const legende = () => {
    const i = Math.round(defile.scrollLeft / defile.clientWidth);
    const p = photos[i];
    visionneuse.querySelector('.legende').textContent = `${i + 1} / ${photos.length}${p?.date ? ` · ${dateLongue(p.date)}` : ''}`;
  };
  defile.onscroll = legende;
  visionneuse.hidden = false;
  defile.scrollLeft = depart * defile.clientWidth;
  legende();
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
const sombre = matchMedia('(prefers-color-scheme: dark)').matches;
const theme = sombre ? 'dark' : 'light';
const base = new URL('.', location.href).href;

const carte = new maplibregl.Map({
  container: 'carte',
  style: {
    version: 8,
    glyphs: `${base}polices/{fontstack}/{range}.pbf`,
    sprite: `${base}pictos/${theme}`,
    sources: {
      protomaps: {
        type: 'vector', tiles: [`${base}tuiles/{z}/{x}/{y}.pbf`], maxzoom: 15, bounds: [-0.56, 51.26, 0.36, 51.72],
        attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>',
      },
    },
    layers: basemaps.layers('protomaps', basemaps.namedFlavor(theme), { lang: 'en' }),
  },
  center: [-0.142, 51.512], zoom: 11.3, minZoom: 9, maxZoom: 19,
  maxBounds: [[-0.95, 51.08], [0.75, 51.9]],
  attributionControl: { compact: true },
  dragRotate: false, pitchWithRotate: false, touchPitch: false,
});
carte.touchZoomRotate.disableRotation();
window.carteRock = carte;

const geojson = (lieux) => ({
  type: 'FeatureCollection',
  features: lieux.map((l) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [l.lon, l.lat] },
    properties: { id: l.id, nom: l.nom, categorie: categorie(l) },
  })),
});

function installerCouches() {
  const couleur = ['match', ['get', 'categorie'], 'visite', css('--visite'), 'a_visiter', css('--a-visiter'), css('--evenement')];
  const bord = sombre ? '#17161a' : '#ffffff';
  carte.addSource('lieux', { type: 'geojson', data: geojson(lieuxFiltres()), cluster: true, clusterRadius: 36, clusterMaxZoom: 13 });
  carte.addSource('position', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  carte.addLayer({ id: 'grappes', type: 'circle', source: 'lieux', filter: ['has', 'point_count'], paint: {
    'circle-color': css('--encre'), 'circle-stroke-color': bord, 'circle-stroke-width': 2.5,
    'circle-radius': ['step', ['get', 'point_count'], 15, 5, 18, 15, 22, 40, 26],
  } });
  carte.addLayer({ id: 'grappes-nombre', type: 'symbol', source: 'lieux', filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Medium'], 'text-size': 13, 'text-allow-overlap': true },
    paint: { 'text-color': css('--fond') } });
  carte.addLayer({ id: 'lieu-choisi', type: 'circle', source: 'lieux', filter: ['==', ['get', 'id'], ''], paint: {
    'circle-radius': 17, 'circle-color': couleur, 'circle-opacity': 0.25, 'circle-stroke-color': couleur, 'circle-stroke-width': 2,
  } });
  carte.addLayer({ id: 'lieux', type: 'circle', source: 'lieux', filter: ['!', ['has', 'point_count']], paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6.5, 15, 9], 'circle-color': couleur,
    'circle-stroke-color': bord, 'circle-stroke-width': 2.5,
  } });
  carte.addLayer({ id: 'lieux-noms', type: 'symbol', source: 'lieux', minzoom: 13.2, filter: ['!', ['has', 'point_count']],
    layout: { 'text-field': ['get', 'nom'], 'text-font': ['Noto Sans Medium'], 'text-size': 12.5, 'text-max-width': 9,
      'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 1.05, 'text-optional': true },
    paint: { 'text-color': css('--encre'), 'text-halo-color': bord, 'text-halo-width': 1.6 } });
  // Zone de toucher plus large que le point, pour le doigt.
  carte.addLayer({ id: 'lieux-zone', type: 'circle', source: 'lieux', filter: ['!', ['has', 'point_count']],
    paint: { 'circle-radius': 22, 'circle-opacity': 0 } });

  carte.addLayer({ id: 'position-halo', type: 'circle', source: 'position', paint: {
    'circle-radius': 16, 'circle-color': '#2f7df6', 'circle-opacity': 0.18 } });
  carte.addLayer({ id: 'position-point', type: 'circle', source: 'position', paint: {
    'circle-radius': 7, 'circle-color': '#2f7df6', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } });

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
function lienItineraire(l) {
  const apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  return apple
    ? `https://maps.apple.com/?daddr=${l.lat},${l.lon}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}&travelmode=walking`;
}

function etiquetteEvenement(l) {
  const e = l.evenement;
  if (!e) return '';
  let texte;
  if (e.date_debut && e.date_fin) {
    const memeAnnee = e.date_debut.slice(0, 4) === e.date_fin.slice(0, 4);
    texte = `Du ${memeAnnee ? dateCourte(e.date_debut) : dateLongue(e.date_debut)} au ${dateLongue(e.date_fin)}`;
    if (new Date(e.date_fin + 'T23:59:59') < new Date()) texte += ', terminé';
  } else {
    texte = e.annee ? `Événement de ${e.annee}` : 'Événement temporaire';
  }
  return `<span class="etiquette">${esc(texte)}</span>`;
}

function htmlFiche(l) {
  const cat = categorie(l);
  const lignes = [l.adresse, l.quartier, l.evenement?.lieu_hote].filter(Boolean).map(esc);
  if (etat.position) lignes.push(`à ${distanceLisible(distance(etat.position, l))}`);
  const statut = l.nature === 'evenement' ? (visite(l) ? 'Événement visité' : 'Événement') : CATEGORIES[cat];

  let h = `<h1>${esc(l.nom)}</h1>`;
  if (lignes.length) h += `<div class="lieu-adresse">${lignes.join(' · ')}</div>`;
  h += '<div class="etiquettes">';
  h += `<span class="etiquette"><i class="point ${cat}"></i>${statut}</span>`;
  h += `<span class="etiquette">${esc(TYPES[l.type] ?? l.type)}</span>`;
  h += etiquetteEvenement(l);
  if (VERIFICATIONS[l.verification]) h += `<span class="etiquette alerte">${VERIFICATIONS[l.verification]}</span>`;
  for (const a of l.artistes) h += `<button class="etiquette artiste" data-artiste="${esc(a)}">${esc(a)}</button>`;
  h += '</div>';

  h += `<div class="boutons">
    <a class="bouton" href="${lienItineraire(l)}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24"><path d="M9 20 3 17V4l6 3 6-3 6 3v13l-6-3z"/><path d="M9 7v13M15 4v13"/></svg>Itinéraire</a>
    <button class="bouton second" data-zoom="${esc(l.id)}">Voir de près</button>
  </div>`;

  h += '<h2>Photos et vidéos</h2>';
  const photos = photosDe(l);
  if (photos.length) {
    h += `<div class="galerie">${photos.map((p, i) => `<button class="vignette" data-photo="${i}" aria-label="Agrandir la photo ${i + 1}">
      <img src="${urlMedia(l.id, p.id, 'v')}" alt="" loading="lazy" width="${p.largeur_v ?? ''}" height="${p.hauteur_v ?? ''}"></button>`).join('')}</div>`;
  } else if (l.nb_photos || l.nb_videos) {
    const stock = [l.nb_photos && pluriel(l.nb_photos, 'photo'), l.nb_videos && pluriel(l.nb_videos, 'vidéo')].filter(Boolean).join(' et ');
    h += `<div class="galerie-vide">${stock} dans le dossier de ce lieu.<br>La sélection reste à faire.</div>`;
  } else {
    h += '<div class="galerie-vide">Aucune photo pour l\'instant.</div>';
  }

  h += '<h2>Histoire</h2>';
  h += l.historique_court || l.historique_long
    ? [l.historique_court, l.historique_long].filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join('')
    : '<p class="vide">Historique à rédiger.</p>';

  if (l.articles.length) {
    h += '<h2>Sur laurentrieppi.com</h2><ul class="liens">';
    for (const a of l.articles) {
      h += `<li><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.titre)}</a>
        <small>${esc(ARTICLES[a.type] ?? a.type)} · ${dateLongue(a.date)}</small></li>`;
    }
    h += '</ul>';
  }

  if (l.sources?.length) {
    h += '<h2>Sources</h2><ul class="liens">';
    for (const s of l.sources) {
      const ref = esc(s.reference ?? s.url ?? '');
      h += `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${ref}</a>` : `<b>${ref}</b>`}
        ${s.page ? `<small>page ${esc(s.page)}</small>` : ''}</li>`;
    }
    h += '</ul>';
  }

  if (l.jours_de_visite?.length) {
    h += `<h2>${l.jours_de_visite.length > 1 ? 'Mes visites' : 'Ma visite'}</h2><p>${l.jours_de_visite.map(dateLongue).join(' · ')}</p>`;
  }

  if (etat.mode === 'prive') {
    const notes = carnet.notes.get(l.id) ?? [];
    const enAttente = new Set(carnet.attente.map((o) => o.id));
    h += '<h2>Carnet de terrain</h2>';
    if (l.statut !== 'visite') {
      h += carnet.visites.has(l.id)
        ? `<p>Visité le ${dateHeure(carnet.visites.get(l.id))}. <button class="lien" data-carnet="annuler_visite">Annuler</button></p>`
        : '<div class="boutons"><button class="bouton" data-carnet="visite">Marquer comme visité</button></div>';
    }
    if (notes.length) {
      h += `<ul class="liens">${notes.map((n) => `<li>${esc(n.texte)}<small>${dateHeure(n.date)}${enAttente.has(n.id) ? ' · en attente d\'envoi' : ''}</small></li>`).join('')}</ul>`;
    }
    h += `<textarea id="note" rows="3" placeholder="Une note rapide sur ce lieu"></textarea>
      <div class="boutons"><button class="bouton second" data-carnet="note">Ajouter la note</button></div>`;
    if (carnet.attente.length) h += `<p class="note">${pluriel(carnet.attente.length, 'élément')} du carnet en attente d'envoi.</p>`;

    const travail = [];
    if (!l.coordonnees_validees) travail.push('Position du point non validée : elle vient de l\'endroit où les photos ont été prises.');
    for (const s of l.sources ?? []) if (s.recoupement) travail.push(`Source à recouper : ${s.recoupement}`);
    for (const v of l.a_verifier ?? []) travail.push(v);
    if (travail.length || l.faits_a_reprendre?.length) {
      h += '<h2>Notes de travail</h2>';
      if (travail.length) h += `<details open><summary>À contrôler</summary><ul>${travail.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
      if (l.faits_a_reprendre?.length) h += `<details><summary>Faits à reprendre de mes articles</summary><ul>${l.faits_a_reprendre.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
    }
  }
  return h;
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
function htmlListe(titre, lieux, { avecDistance = false, vide = 'Aucun lieu ne correspond.' } = {}) {
  let h = `<h1>${esc(titre)}</h1>`;
  if (!lieux.length) return `${h}<p class="vide">${esc(vide)}</p>`;
  h += '<ul class="resultats">';
  for (const l of lieux) {
    const sous = [TYPES[l.type], l.quartier, l.artistes.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    h += `<li><button data-lieu="${esc(l.id)}"><i class="point ${categorie(l)}"></i>
      <span><b>${esc(l.nom)}</b><small>${esc(sous)}</small></span>
      ${avecDistance && etat.position ? `<span class="distance">${distanceLisible(distance(etat.position, l))}</span>` : ''}</button></li>`;
  }
  return `${h}</ul>`;
}

function montrerRecherche() {
  const resultats = rafraichir();
  if (!etat.requete) { if (etat.vue === 'recherche') fermer(); return; }
  let h = htmlListe(pluriel(resultats.length, 'résultat'), resultats, { avecDistance: true });
  if (!resultats.length && (nbFiltres() || etat.categorie !== 'tous')) {
    h += '<div class="boutons"><button class="bouton second" data-action="sans-filtres">Chercher dans tous les lieux</button></div>';
  }
  montrer('recherche', h, 'plein');
}

function montrerProches() {
  if (!etat.position) { demanderPosition(montrerProches); return; }
  const tries = lieuxFiltres()
    .map((l) => ({ l, d: distance(etat.position, l) }))
    .sort((a, b) => a.d - b.d).slice(0, 20).map((x) => x.l);
  montrer('proches', htmlListe('Les plus proches de moi', tries, { avecDistance: true }), 'mi');
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
  const h = `<h1>Filtres</h1>
    <h2>Type de lieu</h2><div class="groupe">${puces(types, 'type', (v) => etat.types.has(v), (v) => TYPES[v] ?? v)}</div>
    <h2>Artiste ou groupe</h2><div class="groupe">${puces(artistes, 'artiste-filtre', (v) => etat.artiste === v)}</div>
    <h2>Quartier</h2><div class="groupe">${puces(quartiers, 'quartier', (v) => etat.quartier === v)}</div>
    <div class="pied-filtres">
      <button class="bouton second" data-action="reinitialiser">Tout effacer</button>
      <button class="bouton" data-action="voir">Voir ${pluriel(n, 'lieu', 'lieux')}</button>
    </div>`;
  const haut = $('#contenu').scrollTop;
  montrer('filtres', h, 'plein');
  $('#contenu').scrollTop = haut;
}

/* -------------------------------------------------------------- position */
let suivi = null;
function demanderPosition(ensuite) {
  if (!navigator.geolocation) { message("La géolocalisation n'est pas disponible sur cet appareil."); return; }
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
    message(err.code === 1 ? "L'accès à la position a été refusé. Il se rétablit dans les réglages du navigateur." : 'Position introuvable pour le moment.');
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
}
function allerAMaPosition() {
  const p = etat.position;
  if (!p) return;
  if (p.lon < -0.95 || p.lon > 0.75 || p.lat < 51.08 || p.lat > 51.9) { message('Tu es en dehors de Londres : la carte reste sur la ville.'); return; }
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
  if (d.photo) { ouvrirVisionneuse(etat.lieux.find((x) => x.id === etat.lieuOuvert), Number(d.photo)); return; }
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
  addEventListener('online', synchroniserCarnet);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) synchroniserCarnet(); });
}

const pret = () => {
  installerCouches();
  rafraichir();
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) ouvrirFiche(id);
};
if (carte.loaded()) pret(); else carte.once('load', pret);
