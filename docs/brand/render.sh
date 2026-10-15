#!/usr/bin/env bash
# Renders every app icon from the two sources in this folder:
#   icon.svg       light icon (background rect + mark)
#   icon-dark.svg  dark icon, used for the dark splash and the web favicon
# Edit those, then run from the repo root:  docs/brand/render.sh
# Needs rsvg-convert and ImageMagick 7 (brew install librsvg imagemagick).
set -euo pipefail

brand="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$brand/../.." && pwd)"
assets="$root/apps/mobile/assets"
public="$root/apps/web/public"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$public"

# The mark alone, on transparent: the source minus its background rect.
sed '/<rect /d' "$brand/icon.svg" > "$tmp/mark.svg"
sed '/<rect /d' "$brand/icon-dark.svg" > "$tmp/mark-dark.svg"
# Small sizes crop the empty margin so the mark stays legible at 16px.
sed 's/viewBox="0 0 1024 1024"/viewBox="128 128 768 768"/' "$brand/icon.svg" > "$tmp/tight.svg"
# At 16px three arcs blur together: keep only the middle one, drawn thicker.
sed -e '/A180 /d' -e '/A320 /d' -e 's/stroke-width="32"/stroke-width="80"/' "$tmp/tight.svg" > "$tmp/tiny.svg"
bg="$(sed -n 's/.*<rect [^>]*fill="\([^"]*\)".*/\1/p' "$brand/icon.svg")"

# iOS + store icon: full bleed, no alpha.
rsvg-convert -w 1024 -h 1024 "$brand/icon.svg" | magick - -alpha off "$assets/icon.png"

# Android adaptive icon. The launcher masks to a circle or squircle, and only
# the center 66% is guaranteed visible, so the mark is scaled into it.
rsvg-convert -w 780 -h 780 "$tmp/mark.svg" |
  magick - -background none -gravity center -extent 1024x1024 "$assets/android-icon-foreground.png"
magick -size 1024x1024 "xc:$bg" "$assets/android-icon-background.png"
# Themed (Android 13+) icons use only the alpha channel; the color is ignored.
magick "$assets/android-icon-foreground.png" -fill white -colorize 100 "$assets/android-icon-monochrome.png"

# Splash: the mark on the splash backgroundColor set in app.json.
rsvg-convert -w 1024 -h 1024 "$tmp/mark.svg" -o "$assets/splash-icon.png"
rsvg-convert -w 1024 -h 1024 "$tmp/mark-dark.svg" -o "$assets/splash-icon-dark.png"

# Favicons.
rsvg-convert -w 48 -h 48 "$tmp/tight.svg" -o "$assets/favicon.png"
rsvg-convert -w 180 -h 180 "$brand/icon.svg" | magick - -alpha off "$public/apple-touch-icon.png"
rsvg-convert -w 16 -h 16 "$tmp/tiny.svg" -o "$tmp/fav-16.png"
for s in 32 48; do rsvg-convert -w $s -h $s "$tmp/tight.svg" -o "$tmp/fav-$s.png"; done
magick "$tmp/fav-16.png" "$tmp/fav-32.png" "$tmp/fav-48.png" "$public/favicon.ico"

echo "Rendered icons into apps/mobile/assets and apps/web/public."
echo "apps/web/public/favicon.svg is hand-written: update its colors to match."
