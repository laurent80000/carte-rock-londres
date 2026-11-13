#!/bin/bash
# Lance la sélection des photos de la carte rock de Londres sur le Mac.
# Première fois : coller dans le Terminal
#   curl -fsSL https://carte-rock-londres.laurent-rieppi.workers.dev/outils/photos.sh | bash
# Ensuite : double-clic sur "Photos carte rock" sur le Bureau.
set -e
SITE="${CARTE_SITE:-https://carte-rock-londres.laurent-rieppi.workers.dev}"
DOSSIER="$HOME/Library/Application Support/carte-rock-londres"
mkdir -p "$DOSSIER"

if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "import venv" >/dev/null 2>&1; then
  echo "Python n'est pas encore installé. Le Mac va proposer d'installer les outils de développement :"
  echo "accepte, attends la fin, puis relance."
  xcode-select --install 2>/dev/null || true
  exit 1
fi

# Environnement Python propre au projet, créé une seule fois.
if [ ! -x "$DOSSIER/python/bin/python3" ]; then
  echo "Première utilisation : installation des outils d'image (une minute environ)…"
  python3 -m venv "$DOSSIER/python"
fi
if ! "$DOSSIER/python/bin/python3" -c "import PIL, pillow_heif" >/dev/null 2>&1; then
  "$DOSSIER/python/bin/python3" -m pip install --quiet --upgrade pip pillow pillow-heif
fi

# Toujours la dernière version du script.
curl -fsSL "$SITE/outils/medias.py" -o "$DOSSIER/medias.py"

# Raccourci sur le Bureau pour les fois suivantes.
RACCOURCI="$HOME/Desktop/Photos carte rock.command"
if [ ! -f "$RACCOURCI" ]; then
  printf '#!/bin/bash\ncurl -fsSL %s/outils/photos.sh | bash\n' "$SITE" > "$RACCOURCI"
  chmod +x "$RACCOURCI"
  echo "Raccourci créé sur le Bureau : \"Photos carte rock\"."
fi

exec "$DOSSIER/python/bin/python3" "$DOSSIER/medias.py" --site "$SITE" < /dev/tty
