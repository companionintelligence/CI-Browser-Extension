#!/usr/bin/env bash
# Renders generated SVGs to PNG (rsvg-convert) and assembles the demo GIF.
set -euo pipefail
cd "$(dirname "$0")"
# GIF canvas padding — matches the popup's canonical --background (dark theme)
# so shorter frames pad seamlessly. Keep in sync with T.bg in src/popup.mjs.
BG="#020618"

# out/ and frames/ are gitignored intermediates — ensure they exist on a
# fresh checkout before generate.mjs writes into them.
mkdir -p out frames

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

echo "== publish to the committed asset dirs =="
# out/ is a gitignored intermediate; these are the paths STORE-LISTING.md and
# the README reference, so copying was previously a manual step people forgot.
mkdir -p shared chrome safari
cp out/hero.png            shared/hero.png
cp out/demo.gif            shared/demo.gif
for f in out/screenshot-*.png; do cp "$f" "shared/$(basename "$f")"; done
cp out/promo-small.png     chrome/promo-tile-440x280.png
cp out/promo-marquee.png   chrome/promo-marquee-1400x560.png
cp out/app-icon-1024.png   safari/app-icon-1024.png
echo "published $(ls shared/screenshot-*.png | wc -l | tr -d ' ') screenshots + hero, gif, 2 promos, app icon"
