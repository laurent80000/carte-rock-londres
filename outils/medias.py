#!/usr/bin/env python3
"""Choisir et envoyer les photos de la carte rock de Londres, depuis le Mac.

    python3 medias.py

Le script :
  1. demande le mot de passe de la carte et se connecte au site ;
  2. lit ~/Pictures/Londres Rock/index.csv et les photos de "01 Lieux rock",
     sans jamais rien écrire, déplacer ou supprimer dans ce dossier ;
  3. ouvre dans le navigateur une page de sélection, lieu par lieu ;
  4. pour chaque lieu validé, prépare une vignette et une image d'affichage
     sans aucune métadonnée (ni position GPS, ni date, ni appareil), les envoie
     sur le site et met à jour la sélection.

Les photos de "02 Autres lieux" ne sont jamais lues.

Prérequis, une seule fois :  python3 -m pip install --user pillow pillow-heif
(pillow-heif n'est utile que pour les quelques originaux .heic ; à défaut,
l'outil sips de macOS prend le relais.)

Options :
  --dossier CHEMIN   dossier des photos (par défaut ~/Pictures/Londres Rock)
  --site URL         adresse de la carte
  --port N           port de la page de sélection (par défaut 8765)
  --forcer           renvoie les photos même si elles sont déjà en ligne
"""
import argparse
import csv
import getpass
import hashlib
import http.client
import io
import json
import os
import subprocess
import sys
import tempfile
import threading
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Il manque la bibliothèque Pillow. Tape d'abord :\n  python3 -m pip install --user pillow pillow-heif")
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIF = True
except ImportError:
    HEIF = False

SITE = "https://carte-rock-londres.laurent-rieppi.workers.dev"
CAT_ROCK = "01 Lieux rock"
AFFICHAGE = 1600   # plus grand côté de l'image d'affichage, en pixels
VIGNETTE = 480     # plus grand côté de la vignette
CHOIX = 300        # plus grand côté des aperçus de la page de sélection


# ---------------------------------------------------------------- site distant
class Site:
    """Accès au site protégé par mot de passe, avec le cookie de connexion."""

    def __init__(self, url):
        self.url = urllib.parse.urlsplit(url.rstrip("/"))
        self.cookie = ""

    def _connexion(self):
        if self.url.scheme == "https":
            return http.client.HTTPSConnection(self.url.netloc, timeout=120)
        return http.client.HTTPConnection(self.url.netloc, timeout=120)

    def requete(self, methode, chemin, corps=None, entetes=None):
        c = self._connexion()
        e = {"Cookie": self.cookie, "User-Agent": "carte-rock-londres-medias"}
        e.update(entetes or {})
        if corps is not None:
            e["Content-Length"] = str(len(corps))
        c.request(methode, self.url.path + chemin, body=corps, headers=e)
        r = c.getresponse()
        donnees = r.read()
        c.close()
        return r, donnees

    def se_connecter(self, mot_de_passe):
        corps = urllib.parse.urlencode({"mot_de_passe": mot_de_passe}).encode()
        r, _ = self.requete("POST", "/connexion", corps, {"Content-Type": "application/x-www-form-urlencoded"})
        cookie = r.getheader("Set-Cookie") or ""
        if r.status != 303 or not cookie.startswith("acces="):
            return r.status
        self.cookie = cookie.split(";")[0]
        return 0

    def json(self, methode, chemin, objet=None):
        corps = None if objet is None else json.dumps(objet).encode()
        r, donnees = self.requete(methode, chemin, corps, {"Content-Type": "application/json"} if corps else None)
        if r.status >= 400:
            raise RuntimeError(f"{methode} {chemin} : erreur {r.status} {donnees[:200]!r}")
        return json.loads(donnees)

    def envoyer_image(self, cle, octets):
        r, donnees = self.requete("PUT", "/api/medias/" + urllib.parse.quote(cle), octets, {"Content-Type": "image/jpeg"})
        if r.status >= 400:
            raise RuntimeError(f"envoi de {cle} : erreur {r.status} {donnees[:200]!r}")

    def supprimer(self, cle):
        self.requete("DELETE", "/api/medias/" + urllib.parse.quote(cle))


# ---------------------------------------------------------------- photos locales
def dossier_cache():
    base = Path.home() / "Library/Caches" if sys.platform == "darwin" else Path(tempfile.gettempdir())
    d = base / "carte-rock-londres"
    d.mkdir(parents=True, exist_ok=True)
    return d


class Photos:
    """Lecture seule du dossier des photos, limitée à "01 Lieux rock"."""

    def __init__(self, dossier, lieux_site):
        self.racine = Path(dossier).expanduser().resolve()
        self.rock = (self.racine / CAT_ROCK).resolve()
        index = self.racine / "index.csv"
        if not index.exists():
            sys.exit(f"index.csv introuvable dans {self.racine}")
        id_par_dossier = {l["dossier"]: l["id"] for l in lieux_site if l.get("dossier")}
        self.par_lieu = {}
        self.ignores = set()
        with open(index, encoding="utf-8-sig", newline="") as f:
            for ligne in csv.DictReader(f):
                if ligne["categorie"] != CAT_ROCK:
                    continue
                if "_obsolete" in ligne["fichier"] or "_avant_reclassement" in ligne["fichier"]:
                    continue
                lieu = id_par_dossier.get(ligne["lieu"])
                if not lieu:
                    self.ignores.add(ligne["lieu"])
                    continue
                photo = Path(ligne["nom_original"]).stem
                self.par_lieu.setdefault(lieu, {})[photo] = {
                    "id": photo,
                    "fichier": ligne["fichier"],
                    "video": ligne["photo_ou_video"] == "video",
                    "date": ligne["date"][:10],
                    "heure": ligne["date"][11:16],
                    "horodatage": ligne["date"],
                }
        for lieu in self.par_lieu.values():
            for p in lieu.values():
                p["present"] = self.chemin(p) is not None

    def chemin(self, photo):
        """Chemin du fichier, seulement s'il est bien dans "01 Lieux rock"."""
        p = (self.racine / photo["fichier"]).resolve()
        if self.rock not in p.parents or not p.is_file():
            return None
        return p

    def ouvrir(self, photo):
        chemin = self.chemin(photo)
        if chemin is None:
            raise FileNotFoundError(photo["fichier"])
        if chemin.suffix.lower() in (".heic", ".heif") and not HEIF:
            # Sans pillow-heif, sips (fourni avec macOS) convertit dans le cache, jamais à côté de l'original.
            sortie = dossier_cache() / f"{photo['id']}.jpg"
            if not sortie.exists():
                subprocess.run(["sips", "-s", "format", "jpeg", str(chemin), "--out", str(sortie)],
                               check=True, capture_output=True)
            chemin = sortie
        with open(chemin, "rb") as f:
            image = Image.open(io.BytesIO(f.read()))
            image.load()
        image = ImageOps.exif_transpose(image)
        return image.convert("RGB")


def jpeg(image, cote, qualite):
    """Réduit sans agrandir et enregistre sans aucune métadonnée."""
    copie = image.copy()
    copie.thumbnail((cote, cote), Image.LANCZOS)
    tampon = io.BytesIO()
    copie.save(tampon, "JPEG", quality=qualite, optimize=True, progressive=True)
    return tampon.getvalue(), copie.size


# ---------------------------------------------------------------- application
class Application:
    def __init__(self, site, photos, lieux_site, forcer):
        self.site = site
        self.photos = photos
        self.lieux = [l for l in lieux_site if l["id"] in photos.par_lieu]
        self.forcer = forcer
        self.verrou = threading.Lock()
        self.selection = site.json("GET", "/api/medias/selection")
        self.en_ligne = set(site.json("GET", "/api/medias/liste")["cles"])

    def etat(self):
        lieux = []
        for l in self.lieux:
            stock = self.photos.par_lieu[l["id"]]
            s = self.selection.get("lieux", {}).get(l["id"], {})
            lieux.append({
                "id": l["id"], "nom": l["nom"], "dossier": l["dossier"],
                "nb_photos": sum(not p["video"] for p in stock.values()),
                "nb_videos": sum(p["video"] for p in stock.values()),
                "choisies": [p["id"] for p in s.get("photos", [])],
                "couverture": s.get("couverture"),
            })
        return {"lieux": lieux, "heic": HEIF}

    def liste(self, lieu):
        return sorted(self.photos.par_lieu[lieu].values(), key=lambda p: (p["horodatage"], p["id"]))

    def apercu(self, lieu, photo):
        p = self.photos.par_lieu[lieu][photo]
        cache = dossier_cache() / "choix" / f"{hashlib.sha1(p['fichier'].encode()).hexdigest()}.jpg"
        if not cache.exists():
            cache.parent.mkdir(parents=True, exist_ok=True)
            octets, _ = jpeg(self.photos.ouvrir(p), CHOIX, 70)
            cache.write_bytes(octets)
        return cache.read_bytes()

    def envoyer(self, lieu, ids, couverture):
        """Prépare et envoie les photos retenues d'un lieu, retire celles qui ne le sont plus."""
        stock = self.photos.par_lieu[lieu]
        ids = [i for i in ids if i in stock and not stock[i]["video"]]
        if couverture not in ids:
            couverture = ids[0] if ids else None
        rapport = {"envoyees": 0, "deja_en_ligne": 0, "retirees": 0, "erreurs": []}
        retenues = []
        for i in ids:
            p = stock[i]
            cles = {t: f"lieux/{lieu}/{i}-{t}.jpg" for t in ("a", "v")}
            try:
                image = self.photos.ouvrir(p)
                affichage, (la, ha) = jpeg(image, AFFICHAGE, 82)
                vignette, (lv, hv) = jpeg(image, VIGNETTE, 76)
                if self.forcer or not all(c in self.en_ligne for c in cles.values()):
                    self.site.envoyer_image(cles["a"], affichage)
                    self.site.envoyer_image(cles["v"], vignette)
                    self.en_ligne.update(cles.values())
                    rapport["envoyees"] += 1
                else:
                    rapport["deja_en_ligne"] += 1
                retenues.append({"id": i, "date": p["date"], "largeur": la, "hauteur": ha, "largeur_v": lv, "hauteur_v": hv})
            except Exception as erreur:  # une photo illisible ne bloque pas les autres
                rapport["erreurs"].append(f"{p['fichier']} : {erreur}")
        gardees = {f"lieux/{lieu}/{r['id']}-{t}.jpg" for r in retenues for t in ("a", "v")}
        for cle in sorted(c for c in self.en_ligne if c.startswith(f"lieux/{lieu}/") and c not in gardees):
            self.site.supprimer(cle)
            self.en_ligne.discard(cle)
            rapport["retirees"] += 1
        rapport["retirees"] //= 2
        with self.verrou:
            selection = self.site.json("GET", "/api/medias/selection")
            if retenues:
                selection.setdefault("lieux", {})[lieu] = {"couverture": couverture, "photos": retenues}
            else:
                selection.setdefault("lieux", {}).pop(lieu, None)
            self.selection = self.site.json("PUT", "/api/medias/selection", selection)
        return rapport


def gestionnaire(app):
    page = PAGE.encode("utf-8")

    class Gestionnaire(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def repondre(self, statut, octets, type_contenu, cache=False):
            self.send_response(statut)
            self.send_header("Content-Type", type_contenu)
            self.send_header("Content-Length", str(len(octets)))
            self.send_header("Cache-Control", "max-age=86400" if cache else "no-store")
            self.end_headers()
            self.wfile.write(octets)

        def json(self, objet, statut=200):
            self.repondre(statut, json.dumps(objet, ensure_ascii=False).encode(), "application/json; charset=utf-8")

        def do_GET(self):
            url = urllib.parse.urlsplit(self.path)
            q = dict(urllib.parse.parse_qsl(url.query))
            try:
                if url.path == "/":
                    self.repondre(200, page, "text/html; charset=utf-8")
                elif url.path == "/api/etat":
                    self.json(app.etat())
                elif url.path == "/api/photos":
                    self.json(app.liste(q["lieu"]))
                elif url.path == "/apercu":
                    self.repondre(200, app.apercu(q["lieu"], q["photo"]), "image/jpeg", cache=True)
                else:
                    self.json({"erreur": "inconnu"}, 404)
            except Exception as erreur:
                self.json({"erreur": str(erreur)}, 500)

        def do_POST(self):
            if self.path != "/api/envoyer":
                return self.json({"erreur": "inconnu"}, 404)
            try:
                d = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                self.json(app.envoyer(d["lieu"], d["photos"], d.get("couverture")))
            except Exception as erreur:
                self.json({"erreur": str(erreur)}, 500)

    return Gestionnaire


def main():
    ap = argparse.ArgumentParser(description="Choisir et envoyer les photos de la carte rock de Londres.")
    ap.add_argument("--dossier", default="~/Pictures/Londres Rock")
    ap.add_argument("--site", default=SITE)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--forcer", action="store_true")
    ap.add_argument("--sans-navigateur", action="store_true", help=argparse.SUPPRESS)
    args = ap.parse_args()

    site = Site(args.site)
    mot_de_passe = os.environ.get("CARTE_MOT_DE_PASSE") or getpass.getpass("Mot de passe de la carte : ")
    erreur = site.se_connecter(mot_de_passe)
    if erreur:
        sys.exit("Connexion refusée (mot de passe incorrect ?)." if erreur == 401 else f"Connexion impossible (erreur {erreur}).")
    lieux_site = site.json("GET", "/data/lieux.json")["lieux"]
    try:
        site.json("GET", "/api/medias/selection")
    except RuntimeError:
        sys.exit("L'espace photos du site n'est pas encore en place.")
    photos = Photos(args.dossier, lieux_site)
    app = Application(site, photos, lieux_site, args.forcer)
    if photos.ignores:
        print("Dossiers sans fiche sur la carte, laissés de côté :", ", ".join(sorted(photos.ignores)))
    if not HEIF:
        print("pillow-heif absent : les originaux .heic passeront par sips.")

    serveur = ThreadingHTTPServer(("127.0.0.1", args.port), gestionnaire(app))
    adresse = f"http://127.0.0.1:{args.port}/"
    print(f"Page de sélection : {adresse}")
    print("Ferme cette fenêtre de Terminal (ou tape Ctrl+C) quand tu as fini.")
    if not args.sans_navigateur:
        webbrowser.open(adresse)
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nTerminé.")


PAGE = r"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photos de la carte</title>
<style>
:root{--fond:#f7f3ec;--surface:#fff;--encre:#17161a;--doux:#5f5b66;--trait:#e3ddd2;--accent:#c8102e;--ok:#0b8f76}
@media (prefers-color-scheme:dark){:root{--fond:#17161a;--surface:#222026;--encre:#f4f1ea;--doux:#a9a4b2;--trait:#36333c;--accent:#ff5a6e;--ok:#35c9a8}}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{display:grid;grid-template-columns:300px 1fr;background:var(--fond);color:var(--encre);font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
button{font:inherit;color:inherit;cursor:pointer}
nav{overflow-y:auto;border-right:1px solid var(--trait);background:var(--surface)}
nav h1{font-size:17px;margin:0;padding:16px 16px 4px}nav p{margin:0;padding:0 16px 12px;color:var(--doux);font-size:13px}
nav button{display:flex;width:100%;gap:8px;align-items:baseline;padding:9px 16px;border:0;border-top:1px solid var(--trait);background:none;text-align:left}
nav button.actif{background:var(--fond);font-weight:650}
nav small{margin-left:auto;color:var(--doux);white-space:nowrap}nav .fait small{color:var(--ok);font-weight:650}
main{overflow-y:auto;padding:18px 22px 110px}
header{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}header h2{margin:0;font-size:22px}header span{color:var(--doux)}
.grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-top:16px}
.photo{position:relative;border:3px solid transparent;border-radius:10px;overflow:hidden;background:var(--surface);aspect-ratio:3/4;padding:0}
.photo img{width:100%;height:100%;object-fit:cover;display:block}
.photo.choisie{border-color:var(--ok)}
.photo .coche{position:absolute;top:6px;left:6px;width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;display:grid;place-items:center;font-size:15px}
.photo.choisie .coche{background:var(--ok)}
.photo .etoile{position:absolute;top:4px;right:4px;border:0;background:rgba(0,0,0,.45);color:#fff;border-radius:14px;padding:2px 9px;font-size:13px}
.photo.couverture .etoile{background:var(--accent)}
.photo .date{position:absolute;left:0;right:0;bottom:0;padding:14px 8px 5px;background:linear-gradient(transparent,rgba(0,0,0,.6));color:#fff;font-size:12px;text-align:left}
.photo.video{opacity:.5;cursor:not-allowed}.photo.video .coche{display:none}
.barre{position:fixed;left:300px;right:0;bottom:0;display:flex;gap:10px;align-items:center;padding:14px 22px;background:var(--surface);border-top:1px solid var(--trait)}
.barre span{color:var(--doux);margin-right:auto}
.bouton{border:0;border-radius:10px;padding:11px 18px;background:var(--encre);color:var(--fond);font-weight:650}
.bouton.second{background:var(--fond);color:var(--encre);border:1px solid var(--trait)}
.bouton:disabled{opacity:.5;cursor:wait}
.vide{color:var(--doux);margin-top:40px}
</style></head><body>
<nav><h1>Photos de la carte</h1><p>Clique sur une photo pour la retenir, sur l'étoile pour en faire la couverture.</p><div id="lieux"></div></nav>
<main id="principal"><p class="vide">Choisis un lieu dans la liste.</p></main>
<div class="barre" hidden id="barre"><span id="etat"></span>
<button class="bouton second" id="aucune">Tout retirer</button><button class="bouton" id="envoyer">Enregistrer et envoyer</button></div>
<script>
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let donnees, lieu = null, photos = [], choisies = new Set(), couverture = null, modifie = false;
const dateFr = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', {day:'numeric', month:'long', year:'numeric'});

async function charger() {
  donnees = await (await fetch('/api/etat')).json();
  $('#lieux').innerHTML = donnees.lieux.map((l) => `<button data-lieu="${l.id}" class="${l.choisies.length ? 'fait' : ''} ${l.id === lieu?.id ? 'actif' : ''}">
    ${esc(l.nom)}<small>${l.choisies.length ? l.choisies.length + ' retenue' + (l.choisies.length > 1 ? 's' : '') : l.nb_photos + ' photo' + (l.nb_photos > 1 ? 's' : '')}</small></button>`).join('');
}
function compter() {
  const n = choisies.size;
  $('#etat').textContent = (n ? `${n} photo${n > 1 ? 's' : ''} retenue${n > 1 ? 's' : ''}` : 'Aucune photo retenue') + (modifie ? ' · modifications non envoyées' : '');
}
function dessiner() {
  $('#principal').querySelectorAll('.photo').forEach((b) => {
    b.classList.toggle('choisie', choisies.has(b.dataset.photo));
    b.classList.toggle('couverture', b.dataset.photo === couverture);
  });
  compter();
}
async function ouvrir(id) {
  if (modifie && !confirm('Les modifications de ce lieu ne sont pas envoyées. Les abandonner ?')) return;
  lieu = donnees.lieux.find((l) => l.id === id);
  photos = await (await fetch('/api/photos?lieu=' + encodeURIComponent(id))).json();
  choisies = new Set(lieu.choisies); couverture = lieu.couverture; modifie = false;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('actif', b.dataset.lieu === id));
  const videos = photos.filter((p) => p.video).length;
  $('#principal').innerHTML = `<header><h2>${esc(lieu.nom)}</h2><span>${esc(lieu.dossier)} · ${lieu.nb_photos} photos${videos ? `, ${videos} vidéos en attente de leur original` : ''}</span></header>
    <div class="grille">${photos.map((p) => `<button class="photo ${p.video ? 'video' : ''}" data-photo="${p.id}" ${p.video || !p.present ? 'disabled' : ''}>
      ${p.present ? `<img loading="lazy" src="/apercu?lieu=${encodeURIComponent(id)}&photo=${encodeURIComponent(p.id)}" alt="">` : ''}
      <span class="coche">✓</span>${p.video ? '' : '<span class="etoile" data-etoile="1">★</span>'}
      <span class="date">${dateFr(p.date)} ${p.heure}${p.video ? ' · vidéo' : ''}${p.present ? '' : ' · fichier absent'}</span></button>`).join('')}</div>`;
  $('#barre').hidden = false;
  dessiner();
}
$('#lieux').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ouvrir(b.dataset.lieu); });
$('#principal').addEventListener('click', (e) => {
  const b = e.target.closest('.photo'); if (!b || b.disabled) return;
  const id = b.dataset.photo;
  if (e.target.dataset.etoile) { couverture = id; choisies.add(id); }
  else if (choisies.has(id)) { choisies.delete(id); if (couverture === id) couverture = null; }
  else choisies.add(id);
  modifie = true; dessiner();
});
$('#aucune').addEventListener('click', () => { choisies.clear(); couverture = null; modifie = true; dessiner(); });
$('#envoyer').addEventListener('click', async () => {
  const bouton = $('#envoyer'); bouton.disabled = true; $('#etat').textContent = 'Préparation et envoi en cours…';
  const ordre = photos.map((p) => p.id).filter((id) => choisies.has(id));
  try {
    const r = await (await fetch('/api/envoyer', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({lieu: lieu.id, photos: ordre, couverture})})).json();
    if (r.erreur) throw new Error(r.erreur);
    modifie = false; await charger();
    lieu = donnees.lieux.find((l) => l.id === lieu.id); couverture = lieu.couverture; dessiner();
    let msg = `Envoyé : ${r.envoyees} nouvelle(s), ${r.deja_en_ligne} déjà en ligne, ${r.retirees} retirée(s).`;
    if (r.erreurs.length) msg += ` ${r.erreurs.length} erreur(s) : ` + r.erreurs.join(' ; ');
    $('#etat').textContent = msg;
  } catch (err) { $('#etat').textContent = 'Échec : ' + err.message; }
  bouton.disabled = false;
});
addEventListener('beforeunload', (e) => { if (modifie) e.preventDefault(); });
charger();
</script></body></html>
"""

if __name__ == "__main__":
    main()
