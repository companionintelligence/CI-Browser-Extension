#!/usr/bin/env bash
# Renders generated SVGs to PNG (rsvg-convert) and assembles the demo GIF.
set -euo pipefail
cd "$(dirname "$0")"
BG="#1a1a1a"

echo "== embed logo (regenerated, not committed) =="
{ printf 'export const LOGO_B64 = "data:image/png;base64,'; base64 -i ../public/logo.png | tr -d '\n'; printf '";\n'; } > src/logo.mjs

echo "== generate SVGs =="
node src/generate.mjs

echo "== popup frames -> PNG (2x) =="
for f in frames/popup-*.svg; do
  base=$(basename "$f" .svg)
  rsvg-convert -z 2 "$f" -o "frames/${base}.png"
done

echo "== store SVGs -> PNG =="
for f in out/*.svg; do
  base=$(basename "$f" .svg)
  rsvg-convert "$f" -o "out/${base}.png"
done

echo "== normalize popup frames onto fixed canvas for GIF =="
# tallest frame determines canvas; pad others (north gravity) on dark bg
MAXH=0
for p in frames/popup-loggedOut.png frames/popup-loggedIn.png frames/popup-syncing.png frames/popup-synced.png frames/popup-ignored.png; do
  h=$(magick identify -format "%h" "$p")
  (( h > MAXH )) && MAXH=$h
done
W=$(magick identify -format "%w" frames/popup-loggedIn.png)
echo "canvas ${W}x${MAXH}"
for st in loggedOut loggedIn syncing synced ignored; do
  magick frames/popup-${st}.png -background "$BG" -gravity north -extent ${W}x${MAXH} frames/canvas-${st}.png
done

echo "== assemble GIF (downscaled to 420px wide) =="
# delays in centiseconds; hold synced (success) and ignored a touch longer
magick -loop 0 -dispose previous \
  -delay 150 frames/canvas-loggedOut.png \
  -delay 165 frames/canvas-loggedIn.png \
  -delay 140 frames/canvas-syncing.png \
  -delay 200 frames/canvas-synced.png \
  -delay 190 frames/canvas-ignored.png \
  -resize 420x \
  -layers Optimize \
  out/demo.gif

echo "== sizes =="
ls -la out/*.gif out/*.png | awk '{print $5, $9}'
echo "done"
