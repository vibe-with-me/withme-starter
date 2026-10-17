#!/usr/bin/env bash
# Renders every app icon from the two sources in this folder:
#   icon.svg       light icon (background rect + mark)
#   icon-dark.svg  dark icon, used only for the dark splash
# The favicons and store icons come from icon.svg. apps/web/public/favicon.svg
# is hand-written and switches colors itself: update it separately
# (make-it-yours sets its colors in step 1 and its shapes in step 8).
# Edit those, then run from the repo root:  docs/brand/render.sh
# Needs rsvg-convert and ImageMagick 7 (brew install librsvg imagemagick).
#
# The variants below are made with sed, not an SVG parser, so both sources
# must keep this text layout (the script stops if they don't):
#   - viewBox="0 0 1024 1024" exactly
#   - the background is one <rect ... fill="#rrggbb"/> on a line of its own,
#     and it is the only <rect>
# The 16px favicon also drops the arcs whose paths contain "A180 " / "A320 "
# and thickens stroke-width="32". A redrawn mark without them gets the
# full mark at 16px instead.
set -euo pipefail
# ImageMagick stamps a create/modify date into PNGs; leave it out so a
# re-run only changes files whose pixels changed.
strip=(-define png:exclude-chunks=date,time)

brand="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$brand/../.." && pwd)"
assets="$root/apps/mobile/assets"
public="$root/apps/web/public"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$public"

die() { echo "render.sh: $*" >&2; exit 1; }
for src in "$brand/icon.svg" "$brand/icon-dark.svg"; do
  grep -q 'viewBox="0 0 1024 1024"' "$src" || die "${src##*/}: needs viewBox=\"0 0 1024 1024\""
  [ "$(grep -c '<rect ' "$src")" = 1 ] && grep -Eq '^[[:space:]]*<rect [^>]*/>[[:space:]]*$' "$src" ||
    die "${src##*/}: needs exactly one <rect .../>, alone on its line (the background)"
done

# The mark alone, on transparent: the source minus its background rect.
sed '/<rect /d' "$brand/icon.svg" > "$tmp/mark.svg"
sed '/<rect /d' "$brand/icon-dark.svg" > "$tmp/mark-dark.svg"
# Small sizes crop the empty margin so the mark stays legible at 16px.
sed 's/viewBox="0 0 1024 1024"/viewBox="128 128 768 768"/' "$brand/icon.svg" > "$tmp/tight.svg"
# At 16px three arcs blur together: keep only the middle one, drawn thicker.
if grep -q 'A180 ' "$tmp/tight.svg" && grep -q 'A320 ' "$tmp/tight.svg" && grep -q 'stroke-width="32"' "$tmp/tight.svg"; then
  sed -e '/A180 /d' -e '/A320 /d' -e 's/stroke-width="32"/stroke-width="80"/' "$tmp/tight.svg" > "$tmp/tiny.svg"
else
  echo "render.sh: no starter arcs found; the 16px favicon uses the full mark" >&2
  cp "$tmp/tight.svg" "$tmp/tiny.svg"
fi
bg="$(sed -n 's/.*<rect [^>]*fill="\(#[0-9A-Fa-f]\{3,8\}\)".*/\1/p' "$brand/icon.svg")"
[ -n "$bg" ] || die "icon.svg: the background <rect> needs a hex fill, e.g. fill=\"#f3efe8\""

# iOS + store icon: full bleed, no alpha.
rsvg-convert -w 1024 -h 1024 "$brand/icon.svg" | magick - -alpha off "${strip[@]}" "$assets/icon.png"

# Android adaptive icon. The launcher masks to a circle or squircle, and only
# the center 66% is guaranteed visible, so the mark is scaled into it.
rsvg-convert -w 780 -h 780 "$tmp/mark.svg" |
  magick - -background none -gravity center -extent 1024x1024 "${strip[@]}" "$assets/android-icon-foreground.png"
magick -size 1024x1024 "xc:$bg" "${strip[@]}" "$assets/android-icon-background.png"
# Themed (Android 13+) icons use only the alpha channel; the color is ignored.
magick "$assets/android-icon-foreground.png" -fill white -colorize 100 "${strip[@]}" "$assets/android-icon-monochrome.png"

# Splash: the mark on the splash backgroundColor set in app.json.
rsvg-convert -w 1024 -h 1024 "$tmp/mark.svg" -o "$assets/splash-icon.png"
rsvg-convert -w 1024 -h 1024 "$tmp/mark-dark.svg" -o "$assets/splash-icon-dark.png"

# Favicons.
rsvg-convert -w 48 -h 48 "$tmp/tight.svg" -o "$assets/favicon.png"
rsvg-convert -w 180 -h 180 "$brand/icon.svg" | magick - -alpha off "${strip[@]}" "$public/apple-touch-icon.png"
rsvg-convert -w 16 -h 16 "$tmp/tiny.svg" -o "$tmp/fav-16.png"
for s in 32 48; do rsvg-convert -w $s -h $s "$tmp/tight.svg" -o "$tmp/fav-$s.png"; done
magick "$tmp/fav-16.png" "$tmp/fav-32.png" "$tmp/fav-48.png" "$public/favicon.ico"

# GitHub social preview card. Uploaded by hand: see make-it-yours step 8.
rsvg-convert -w 1280 -h 640 "$brand/social-preview.svg" | magick - -alpha off "${strip[@]}" "$brand/social-preview.png"

echo "Rendered icons into apps/mobile/assets, apps/web/public and docs/brand."
echo "apps/web/public/favicon.svg is hand-written: copy a changed mark's shapes into it."
