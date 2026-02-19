#!/bin/sh
# Copia ícones de radar de assets/images para RadarBot/RadarImages (paridade com Android copyRadarIconsToDrawable)
set -e
ASSETS_SRC="${SRCROOT}/../assets/images"
# RadarBot ou MapboxNavigationExample (dependendo do projeto)
if [ -d "${SRCROOT}/RadarBot" ]; then
  DEST="${SRCROOT}/RadarBot/RadarImages"
elif [ -d "${SRCROOT}/MapboxNavigationExample" ]; then
  DEST="${SRCROOT}/MapboxNavigationExample/RadarImages"
else
  echo "copy-radar-icons: pasta do app não encontrada."
  exit 0
fi
if [ ! -d "$ASSETS_SRC" ]; then
  echo "copy-radar-icons: assets/images não encontrado, ignorando."
  exit 0
fi
mkdir -p "$DEST"
# Placas placa20..placa160 (+ placa0, placa10)
for i in 0 10 20 30 40 50 60 70 80 90 100 110 120 130 140 150 160; do
  src="$ASSETS_SRC/placa${i}.png"
  if [ ! -f "$src" ] && [ "$i" -lt 20 ]; then src="$ASSETS_SRC/placa20.png"; fi
  if [ -f "$src" ]; then
    cp "$src" "$DEST/placa${i}.png"
  fi
done
# radar_fixo = placa60 (como no Android)
if [ -f "$ASSETS_SRC/placa60.png" ]; then
  cp "$ASSETS_SRC/placa60.png" "$DEST/radar_fixo.png"
fi
# radar_movel, radar_semaforico (snake_case para Mapbox style)
for name in radarMovel radarSemaforico; do
  src="$ASSETS_SRC/${name}.png"
  if [ -f "$src" ]; then
    case "$name" in
      radarMovel) dest="radar_movel.png" ;;
      radarSemaforico) dest="radar_semaforico.png" ;;
      *) dest="${name}.png" ;;
    esac
    cp "$src" "$DEST/$dest"
  fi
done
# Também copiar com nome original (camelCase) para UIImage(named:)
[ -f "$ASSETS_SRC/radarMovel.png" ] && cp "$ASSETS_SRC/radarMovel.png" "$DEST/radarMovel.png"
[ -f "$ASSETS_SRC/radarSemaforico.png" ] && cp "$ASSETS_SRC/radarSemaforico.png" "$DEST/radarSemaforico.png"
echo "copy-radar-icons: concluído."
