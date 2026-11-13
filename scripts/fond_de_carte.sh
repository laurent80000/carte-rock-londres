#!/usr/bin/env bash
# Télécharge le fond de carte de Londres (tuiles Protomaps issues d'OpenStreetMap),
# les polices et les pictogrammes, pour que la carte n'appelle aucun service extérieur.
# Usage : scripts/fond_de_carte.sh [AAAAMMJJ]   (date de la version Protomaps, aujourd'hui par défaut)
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${1:-$(date +%Y%m%d)}"
EMPRISE="-0.56,51.26,0.36,51.72"   # Grand Londres, de Feltham à Dartford
ZOOM_MAX=15
ACTIFS="https://protomaps.github.io/basemaps-assets"

command -v pmtiles >/dev/null || { echo "Outil pmtiles introuvable : go install github.com/protomaps/go-pmtiles@latest (puis le renommer en pmtiles)"; exit 1; }

mkdir -p app/tuiles app/polices app/pictos
pmtiles extract "https://build.protomaps.com/${VERSION}.pmtiles" app/tuiles/londres.pmtiles \
  --bbox="$EMPRISE" --maxzoom="$ZOOM_MAX" > /dev/null 2>&1
ls -lh app/tuiles/londres.pmtiles

for police in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  mkdir -p "app/polices/$police"
  for debut in 0 256 512 768 1024 7680 8192 8448; do
    plage="${debut}-$((debut + 255))"
    curl -fsS -o "app/polices/$police/$plage.pbf" "$ACTIFS/fonts/${police// /%20}/$plage.pbf"
  done
done
for theme in light dark; do
  for f in "$theme.json" "$theme.png" "$theme@2x.json" "$theme@2x.png"; do
    curl -fsS -o "app/pictos/$f" "$ACTIFS/sprites/v4/$f"
  done
done
echo "Fond de carte prêt (version $VERSION)."
