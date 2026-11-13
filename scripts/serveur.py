#!/usr/bin/env python3
"""Petit serveur local pour essayer la carte : python3 scripts/serveur.py [port]

Le serveur standard de Python ne sait pas répondre aux requêtes partielles
dont le fond de carte (fichier .pmtiles) a besoin. Celui-ci le fait.
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Gestionnaire(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript", ".pbf": "application/x-protobuf"}

    def send_head(self):
        plage = re.fullmatch(r"bytes=(\d+)-(\d*)", self.headers.get("Range", ""))
        chemin = self.translate_path(self.path)
        if not plage or not os.path.isfile(chemin):
            return super().send_head()
        taille = os.path.getsize(chemin)
        debut = int(plage.group(1))
        fin = min(int(plage.group(2)) if plage.group(2) else taille - 1, taille - 1)
        if debut > fin:
            self.send_error(416)
            return None
        f = open(chemin, "rb")
        f.seek(debut)
        self.plage_restante = fin - debut + 1
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(chemin))
        self.send_header("Content-Range", f"bytes {debut}-{fin}/{taille}")
        self.send_header("Content-Length", str(self.plage_restante))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        return f

    def copyfile(self, source, sortie):
        restant = getattr(self, "plage_restante", None)
        if restant is None:
            return super().copyfile(source, sortie)
        while restant > 0:
            bloc = source.read(min(65536, restant))
            if not bloc:
                break
            sortie.write(bloc)
            restant -= len(bloc)
        self.plage_restante = None

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    app = Path(__file__).resolve().parent.parent / "app"
    print(f"Carte disponible sur http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), partial(Gestionnaire, directory=str(app))).serve_forever()
