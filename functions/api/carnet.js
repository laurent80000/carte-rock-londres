// Carnet de terrain : journal des visites et des notes prises sur place.
// Le journal ne fait que s'allonger. Chaque opération porte un identifiant unique,
// ce qui permet au téléphone de renvoyer sans risque ce qu'il n'a pas pu envoyer hors connexion.

const CLE = 'carnet';
const TYPES = new Set(['visite', 'annuler_visite', 'note']);
const json = (objet, statut = 200) => new Response(JSON.stringify(objet), { status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

async function lire(env) {
  return (await env.CARNET.get(CLE, 'json')) || { operations: [] };
}

export async function onRequestGet({ env }) {
  if (!env.CARNET) return json({ erreur: 'espace CARNET absent' }, 500);
  return json(await lire(env));
}

export async function onRequestPost({ request, env }) {
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
