// Worker de la carte rock de Londres.
// 1. Protection d'accès : un mot de passe, puis un cookie signé valable six mois.
// 2. Carnet de terrain : journal des visites et des notes prises sur place (/api/carnet).
// Secrets attendus : MOT_DE_PASSE et SECRET_SESSION. Espace KV : CARNET. Fichiers du site : ASSETS.
// Les tuiles, polices, pictogrammes et bibliothèques sont servis sans passer par ce Worker (wrangler.jsonc).

const DUREE = 60 * 60 * 24 * 180;
const ESSAIS_MAX = 8;
const encodeur = new TextEncoder();

async function signer(secret, texte) {
  const cle = await crypto.subtle.importKey('raw', encodeur.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cle, encodeur.encode(texte));
  return [...new Uint8Array(sig)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

// Comparaison à durée constante, pour ne rien laisser deviner du mot de passe.
async function identiques(secret, a, b) {
  const [x, y] = await Promise.all([signer(secret, a), signer(secret, b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function page(erreur = '') {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Carte rock de Londres</title>
<style>
  @font-face{font-family:Anton;src:url(/vendor/polices/anton-latin-400-normal.woff2) format("woff2");font-display:swap}
  @font-face{font-family:"Archivo Narrow";font-weight:700;src:url(/vendor/polices/archivo-narrow-latin-700-normal.woff2) format("woff2");font-display:swap}
  @font-face{font-family:"Source Serif 4";src:url(/vendor/polices/source-serif-4-latin-400-normal.woff2) format("woff2");font-display:swap}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#15120f;color:#15120f;font:17px/1.45 "Source Serif 4",Georgia,serif;
    background-image:radial-gradient(circle at 1px 1px,rgba(243,234,215,.09) 1.2px,transparent 1.5px);background-size:10px 10px}
  form{position:relative;width:min(88vw,360px);padding:26px 24px 24px;background:#f3ead7;border-radius:8px;box-shadow:6px 6px 0 #c8102e}
  form::before{content:"";position:absolute;right:22px;top:-26px;width:52px;height:52px;border-radius:50%;
    background:radial-gradient(circle,#f3ead7 0 7%,#d9a21b 8% 36%,#15120f 38%);box-shadow:0 0 0 3px #f3ead7}
  h1{margin:0 0 4px;font:400 34px/1.02 Anton,"Arial Narrow",Impact,sans-serif;text-transform:uppercase;letter-spacing:.01em}
  p{margin:0 0 20px;color:#6b5a40;font-style:italic}
  input,button{width:100%;height:50px;border-radius:6px;font:inherit;box-sizing:border-box}
  input{padding:0 14px;border:2px solid #15120f;background:#fbf5e6;color:inherit;margin-bottom:10px}
  button{border:0;background:#15120f;color:#f3ead7;font:700 15px "Archivo Narrow","Arial Narrow",Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}
  .erreur{color:#c8102e;margin:14px 0 0;font-style:normal;font-weight:600}
</style></head><body><form method="post" action="/connexion">
<h1>Carte rock<br>de Londres</h1><p>Carnet de route de Laurent Rieppi. Accès privé.</p>
<input type="password" name="mot_de_passe" placeholder="Mot de passe" autocomplete="current-password" autofocus required>
<button>Entrer</button>${erreur ? `<p class="erreur">${erreur}</p>` : ''}
</form></body></html>`;
}
const html = (corps, statut) => new Response(corps, { status: statut, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

/* ---------------------------------------------------------------- carnet */
const CLE = 'carnet';
const TYPES = new Set(['visite', 'annuler_visite', 'note']);
const json = (objet, statut = 200) => new Response(JSON.stringify(objet), { status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

async function lire(env) {
  return (await env.CARNET.get(CLE, 'json')) || { operations: [] };
}

async function lireCarnet(env) {
  if (!env.CARNET) return json({ erreur: 'espace CARNET absent' }, 500);
  return json(await lire(env));
}

async function ecrireCarnet(request, env) {
  if (!env.CARNET) return json({ erreur: 'espace CARNET absent' }, 500);
  let recues;
  try { recues = (await request.json()).operations; } catch { return json({ erreur: 'JSON illisible' }, 400); }
  if (!Array.isArray(recues) || recues.length > 500) return json({ erreur: 'liste d\'opérations attendue' }, 400);

  const carnet = await lire(env);
  const connues = new Set(carnet.operations.map((o) => o.id));
  for (const o of recues) {
    if (!o || typeof o.id !== 'string' || typeof o.lieu !== 'string' || !TYPES.has(o.type) || connues.has(o.id)) continue;
    carnet.operations.push({
      id: o.id.slice(0, 64), lieu: o.lieu.slice(0, 120), type: o.type,
      date: String(o.date || new Date().toISOString()).slice(0, 30),
      ...(o.type === 'note' ? { texte: String(o.texte || '').slice(0, 4000) } : {}),
    });
    connues.add(o.id);
  }
  await env.CARNET.put(CLE, JSON.stringify(carnet));
  return json(carnet);
}

/* ---------------------------------------------------------------- médias */
// Photos choisies sur le Mac (outils/medias.py), rangées dans l'espace R2 MEDIAS :
//   lieux/<lieu>/<photo>-v.jpg   vignette
//   lieux/<lieu>/<photo>-a.jpg   image d'affichage
//   selection.json               couverture et photos retenues pour chaque lieu
const CLE_MEDIA = /^lieux\/[a-z0-9-]{1,120}\/[A-Za-z0-9-]{1,80}-[va]\.jpg$/;
const TAILLE_MAX = 15 * 1024 * 1024;

async function servirMedia(request, env, cle) {
  if (!env.MEDIAS) return new Response('Espace photos non configuré', { status: 404 });
  const objet = await env.MEDIAS.get(cle, { onlyIf: request.headers });
  if (!objet) return new Response('Photo introuvable', { status: 404 });
  const entetes = new Headers();
  objet.writeHttpMetadata(entetes);
  entetes.set('ETag', objet.httpEtag);
  // Le nom d'un fichier ne change jamais de contenu : le téléphone peut le garder.
  entetes.set('Cache-Control', 'private, max-age=31536000, immutable');
  return new Response('body' in objet ? objet.body : null, { status: 'body' in objet ? 200 : 304, headers: entetes });
}

// Photos ajoutées sur place depuis le téléphone : rangées sous la clé "terrain" de chaque lieu,
// à part de la sélection faite sur le Mac, qui ne les touche pas.
const ID_LIEU = /^[a-z0-9-]{1,120}$/;
const ID_TERRAIN = /^t[a-z0-9]{6,40}$/;
async function gererTerrain(request, env) {
  let lieu, id, photo;
  if (request.method === 'POST') {
    try { ({ lieu, photo } = await request.json()); } catch { return json({ erreur: 'JSON illisible' }, 400); }
    id = photo?.id;
  } else if (request.method === 'DELETE') {
    const q = new URL(request.url).searchParams;
    lieu = q.get('lieu'); id = q.get('id');
  } else return json({ erreur: 'méthode non prévue' }, 405);
  if (!ID_LIEU.test(lieu || '') || !ID_TERRAIN.test(id || '')) return json({ erreur: 'identifiant refusé' }, 400);

  const objet = await env.MEDIAS.get('selection.json');
  const selection = objet ? await objet.json() : { version: 1, lieux: {} };
  const fiche = selection.lieux[lieu] ?? (selection.lieux[lieu] = {});
  const terrain = (fiche.terrain ?? []).filter((p) => p.id !== id);
  if (request.method === 'POST') {
    const nombre = (v) => Math.max(0, Math.min(10000, Math.round(Number(v)) || 0));
    terrain.push({
      id, date: String(photo.date || new Date().toISOString()).slice(0, 30),
      largeur_v: nombre(photo.largeur_v), hauteur_v: nombre(photo.hauteur_v),
      largeur_a: nombre(photo.largeur_a), hauteur_a: nombre(photo.hauteur_a),
    });
  } else {
    await env.MEDIAS.delete([`lieux/${lieu}/${id}-a.jpg`, `lieux/${lieu}/${id}-v.jpg`]);
  }
  if (terrain.length) fiche.terrain = terrain; else delete fiche.terrain;
  if (!Object.keys(fiche).length) delete selection.lieux[lieu];
  selection.maj = new Date().toISOString();
  await env.MEDIAS.put('selection.json', JSON.stringify(selection), { httpMetadata: { contentType: 'application/json' } });
  return json(selection);
}

async function gererMedias(request, env, chemin) {
  if (!env.MEDIAS) return json({ erreur: 'espace photos MEDIAS absent' }, 503);
  if (chemin === 'selection') {
    if (request.method === 'GET') {
      const objet = await env.MEDIAS.get('selection.json');
      return json(objet ? await objet.json() : { version: 1, lieux: {} });
    }
    if (request.method === 'PUT') {
      let selection;
      try { selection = await request.json(); } catch { return json({ erreur: 'JSON illisible' }, 400); }
      if (!selection || typeof selection.lieux !== 'object') return json({ erreur: 'sélection attendue' }, 400);
      selection.maj = new Date().toISOString();
      await env.MEDIAS.put('selection.json', JSON.stringify(selection), { httpMetadata: { contentType: 'application/json' } });
      return json(selection);
    }
    return json({ erreur: 'méthode non prévue' }, 405);
  }
  if (chemin === 'liste') {
    const cles = [];
    let suiteListe;
    do {
      const page = await env.MEDIAS.list({ prefix: 'lieux/', cursor: suiteListe });
      cles.push(...page.objects.map((o) => o.key));
      suiteListe = page.truncated ? page.cursor : undefined;
    } while (suiteListe);
    return json({ cles });
  }
  if (chemin === 'terrain') return gererTerrain(request, env);
  if (!CLE_MEDIA.test(chemin)) return json({ erreur: 'nom de fichier refusé' }, 400);
  if (request.method === 'PUT') {
    const taille = Number(request.headers.get('Content-Length'));
    if (!taille || taille > TAILLE_MAX) return json({ erreur: 'taille refusée' }, 413);
    await env.MEDIAS.put(chemin, request.body, { httpMetadata: { contentType: 'image/jpeg' } });
    return json({ ok: chemin });
  }
  if (request.method === 'DELETE') {
    await env.MEDIAS.delete(chemin);
    return json({ supprime: chemin });
  }
  return json({ erreur: 'méthode non prévue' }, 405);
}

/* ---------------------------------------------------------------- accès */
async function suite(request, env, url) {
  if (url.pathname.startsWith('/medias/') && request.method === 'GET') {
    return servirMedia(request, env, decodeURIComponent(url.pathname.slice('/medias/'.length)));
  }
  if (url.pathname.startsWith('/api/medias/')) {
    const reponse = await gererMedias(request, env, decodeURIComponent(url.pathname.slice('/api/medias/'.length)));
    reponse.headers.set('Cache-Control', 'no-store');
    return reponse;
  }
  if (url.pathname === '/api/carnet') {
    let reponse;
    if (request.method === 'GET') reponse = await lireCarnet(env);
    else if (request.method === 'POST') reponse = await ecrireCarnet(request, env);
    else reponse = json({ erreur: 'méthode non prévue' }, 405);
    reponse.headers.set('Cache-Control', 'no-store');
    return reponse;
  }
  if (url.pathname.startsWith('/api/')) return json({ erreur: 'adresse inconnue' }, 404);
  const reponse = await env.ASSETS.fetch(request);
  const privee = new Response(reponse.body, reponse);
  privee.headers.set('Cache-Control', 'private, no-cache');
  return privee;
}

export default {
  async fetch(request, env) {
    if (!env.MOT_DE_PASSE || !env.SECRET_SESSION) {
      return new Response('Configuration incomplète : MOT_DE_PASSE et SECRET_SESSION doivent être définis.', { status: 500 });
    }
    const url = new URL(request.url);
    // État technique, sans aucune donnée : permet de vérifier un déploiement sans se connecter.
    if (url.pathname === '/etat-technique') {
      return json({ carnet: Boolean(env.CARNET), medias: Boolean(env.MEDIAS) });
    }

    const cookie = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)acces=(\d+)\.([0-9a-f]+)/);
    if (cookie && Number(cookie[1]) > Date.now() / 1000
        && await identiques(env.SECRET_SESSION, cookie[2], await signer(env.SECRET_SESSION, cookie[1]))) {
      if (url.pathname === '/connexion') return Response.redirect(new URL('/', url), 303);
      return suite(request, env, url);
    }

    if (url.pathname === '/connexion' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
      const cleEssais = `essais:${ip}`;
      const essais = Number(await env.CARNET?.get(cleEssais)) || 0;
      if (essais >= ESSAIS_MAX) return html(page('Trop d\'essais. Réessaie dans un quart d\'heure.'), 429);
      const saisie = String((await request.formData()).get('mot_de_passe') || '');
      if (await identiques(env.SECRET_SESSION, saisie, env.MOT_DE_PASSE)) {
        const fin = String(Math.floor(Date.now() / 1000) + DUREE);
        return new Response(null, { status: 303, headers: {
          Location: '/',
          'Set-Cookie': `acces=${fin}.${await signer(env.SECRET_SESSION, fin)}; Path=/; Max-Age=${DUREE}; HttpOnly; Secure; SameSite=Lax`,
        } });
      }
      await env.CARNET?.put(cleEssais, String(essais + 1), { expirationTtl: 900 });
      return html(page('Mot de passe incorrect.'), 401);
    }

    if (url.pathname.startsWith('/api/')) return json({ erreur: 'non connecté' }, 401);
    return html(page(), 401);
  },
};
