---
name: design-direction
description: Use when a withme-starter fork has a vertical (a run club, a climbing gym, a wine bar) but no brand yet, or wants its existing brand refreshed, before make-it-yours runs.
---

# design-direction — a look for the domain before the token swap

`make-it-yours` is a token swap, and a token swap needs values: an accent
pair per mode with the contrast already checked, neutrals, two fonts both
clients can self-host, a wordmark, copy in the vertical's voice, icon
artwork. A forker who arrives with a vertical and nothing else has
nothing to type into its Inputs. This skill produces them.

It uses Claude's `/design` (Claude Design's artboard workflow inside
Claude Code, which reads a project's tokens before it draws), but it
holds `/design` to the starter's design system and keeps its output
where it belongs: **a direction, not code.** The starter's look lives in
exactly two files, `apps/web/src/styles/tokens.css` and
`apps/mobile/lib/tokens.ts`, and `make-it-yours` is the only path into
them. Nothing an artboard contains is ever pasted into `apps/`.

The output is one committed file in the fork, `docs/brand-direction.md`
(the sheet), checked by the script beside this file.

**REQUIRED BACKGROUND:** `make-it-yours` steps 1–3 and 8, which consume
the sheet, and their rules: the one-accent rule, the WCAG pairs, the
self-hosted fonts. A direction that needs a second accent, a gradient, a
new token, or a different layout is not a direction for this starter;
see "What must not move".

Run it before `make-it-yours`. Skip it if the fork already has a brand
it is keeping as is: then fill make-it-yours' Inputs directly. Direction
only: this skill changes no code.

**Checkpoints.** Every step ends with one: run its command or check and
read the result before you call the step done (`docs/the-slice.md` →
Checkpoints). Never edit `contrast.ts` or loosen its thresholds to make a
pair pass; change the color. When a checkpoint fails, follow "When a
checkpoint fails" in the same section: root cause first, one change at a
time, and after two failed attempts stop and tell the owner.

`.agents/skills/design-direction/reference.md` beside this file holds the
brief to paste (§1), the sheet template (§3), and a worked example.

**Uplift of an existing brand.** A fork that has a brand but wants it
refreshed runs the skill anyway. The existing palette, fonts, product
brief and any design critique go in as the brief's References; the
names may be fixed (say so, and let only their treatment vary). Put the
legacy values through `contrast.ts` first, on a scratch Colors table:
that output is the "before" every direction is compared with. At least
one direction must evolve the existing palette rather than replace it,
so the owner can keep what people already recognise.

## What is already in the starter (the map)

- The design system, in two files kept value-identical:
  `apps/web/src/styles/tokens.css` (eight color tokens in `:root` and a
  `prefers-color-scheme: dark` block, plus `--color-scrim`, derived from
  the ink and never on the sheet, type scale, radii 24/14/pill,
  spacing, the 44px tap target, one motion token) and
  `apps/mobile/lib/tokens.ts` (the same eight colors as `light` and
  `dark`, plus `fonts`, `radius`, `space`, and `displaySize`, the mirror
  of the two display sizes). `/design` reads the first one when it runs
  from the fork root.
- The icon sources, `docs/brand/icon.svg` and `icon-dark.svg`, and
  `docs/brand/render.sh`, which makes every app icon, splash and favicon
  PNG from those two. They are the starter's own artwork until
  make-it-yours step 8 replaces them; this skill draws the replacements
  but does not write them there.
- The palette rule, in both files' header comments: near-monochrome
  neutrals with **exactly one vivid accent**, on the primary action of a
  screen only (Connect, Accept, Claim tag, Join, "Read NFC tag"). Links,
  chrome, borders and the active tab are ink.
- The three surfaces a direction must be drawn on, because they are
  what a person sees first:
  - the resolver card, `apps/web/src/routes/t.$uid.tsx` — a stranger's
    first screen after a tap: avatar (one initial when there is no
    photo), name, bio, the gathering line, one accent button ("Join this
    gathering") and no secondary action, the wordmark footer;
  - the signed-in shell, `apps/web/src/components/AppShell.tsx` — the
    header wordmark, a list of gathering cards, the bottom tab bar
    (Events, Connections, Merch, Profile; active tab in ink, never
    accent) with the round QR button (Your code) raised out of its
    middle, between Connections and Merch; on wide web screens the same
    button floats bottom-right instead. The button is solid ink with a
    surface-colored icon, never the accent: it is chrome, not a screen's
    primary action. Users see Merch only when a store URL is set (a
    development build shows it as a setup card without one), and the
    boards always draw it;
  - the landing page, `apps/web/src/routes/index.tsx` — the wordmark,
    the one-line promise under it ("Tap a tag. Meet a person. Stay
    connected."), a neutral "Sign in" button (ink on surface, no
    accent), and a quiet "Get tags" button only when a store URL is
    set. Its starter hints are make-it-yours' to rewrite or delete; do
    not draw them.
- Fonts: self-hosted variable woff2 on web (`apps/web/src/fonts/`,
  `@font-face` in `app.css`), `@expo-google-fonts/*` packages on mobile.
  A display face is usable only if `@fontsource-variable/<font>` and
  `@expo-google-fonts/<font>` both exist, which is true of Google Fonts
  under the OFL. `/design` may propose anything; the sheet may only carry
  a face that passes that check.
- `contrast.ts`, beside this file: WCAG 2.x contrast for `#hex` and
  `rgba()` values (an rgba foreground is composited over the background
  first, the way the input border is drawn). Given the sheet, it reads
  the table under `## Colors` and nothing else, requires all eight tokens in both modes, and checks
  the twelve pairs make-it-yours relies on, computed from the values
  that will be copied; the sheet holds no second table that could
  drift from them.

## Inputs to collect before you start

- The vertical and its audience, in a sentence: "a bouldering gym;
  members who tap a tag at the desk and on the mats".
- Three words for the mood. Not a palette, not a font: "chalk, rope,
  Tuesday night".
- The brand names if they exist (make-it-yours' lowercase **wordmark**
  and prose **display name**). If not, ask `/design` to propose them
  with the direction; the owner picks.
- Optional references: photos of the place, an existing logo or store
  page, a competitor to steer away from. A logo is copied, never
  redrawn by an artboard.
- Whether a store exists, or is planned (users see the Merch tab and
  the landing page's "Get tags" button only with a store URL; a
  development build shows the tab as a setup card without one; the sheet
  carries their
  copy either way).
- The vertical's nouns, if already known ("round", not "gathering";
  "Rounds", not "Events"). Draw the boards with them. The skills run
  in an order: `customize-gathering` applies the nouns to the code
  later, so until it runs the app still says "gathering" while the
  boards do not. If the nouns are not decided, draw the starter's.

Both color modes always matter: the app ships light and dark, and the
accent must hold its contrast in each.

## 1. The brief

Run this from the fork root so `/design` finds `tokens.css`. Paste the
brief in `.agents/skills/design-direction/reference.md` → The brief as
the prompt, with the Inputs filled in.

If `/design` is not available where you are (it is a research-preview
skill and often is not), the agent takes the same brief and draws the
boards itself, as **one self-contained HTML file**: a section per
direction with its six boards at 390×844, the eight tokens per mode as
swatches, the two families, the mark as inline SVG, and the one-line
fit. The page may load Google Fonts; nothing else external. The owner
views it as a private Artifact, and that Artifact's link is the canvas
link in step 2. The sheet in step 3 is the contract either way, and the
script checks it regardless of how the values were found.

**Checkpoint:** `/design` has produced at least two named directions
with the resolver card in both modes, and has not edited a file. If it
offers to implement or export code, decline: the implementation is
make-it-yours.

## 2. Choose

Iterate on the canvas, at most three rounds: tighten a hue, swap a
face, kill anything the rules exclude (a tinted card, an accent tab).
The owner picks one direction and names it. Record the canvas and the
direction's name in the sheet; the canvas is private unless the owner
shares it, so the sheet describes it or marks its link "private link,
owner only" (§3). If the owner changes the pick (removes an element,
drops a flagged treatment), update the boards and republish the
Artifact, or record the difference as one line under "Not this", so
the canvas and the sheet do not silently disagree.

**Checkpoint:** one direction chosen, with its light and dark boards of
the resolver card, and a list of token values per mode.

## 3. Reduce to the sheet

Write `docs/brand-direction.md` in the fork from
`.agents/skills/design-direction/reference.md` → The sheet template. Every
value is a literal make-it-yours will copy; nothing is "about". The
Colors table is what `contrast.ts` parses: keep the `## Colors` heading,
its three columns and the eight token names exactly, one row each, and
write every value as `#rgb`, `#rrggbb` or `rgba(r, g, b, a)`. The script
reads only that section (a sheet without the heading is an error), so the
other tables are free to use any headers.

The sheet is committed to the fork, so it holds no local absolute paths
and no private links: write file paths repo-relative (`docs/brand/…`, or
"kept outside the repo" with no path), and describe the canvas in words
instead of linking a private Artifact (or mark the link "private link,
owner only").

Then check it:

```sh
bun run .agents/skills/design-direction/contrast.ts --sheet docs/brand-direction.md
npm view @fontsource-variable/<font> version
npm view @expo-google-fonts/<font> version
```

**Checkpoint:** the script prints twelve `ok` lines (six pairs per
mode: accent-ink on accent, ink on surface, ink on bg, ink-muted on
surface, ink-muted on bg at 4.5:1, border-input on surface at 3:1) and
exits 0. A `FAIL` line names the pair and its ratio: darken or lighten
until it passes, then update the artboard too, so the canvas and the
sheet agree. A missing or duplicated token row is an error before any
pair is checked. Paste the output under the Colors table. Both
`npm view` lines print a version; a 404 means the face cannot be
self-hosted on one platform and must change. One pair on its own is
handy while adjusting: `bun run .agents/skills/design-direction/contrast.ts '#2447c9' '#ffffff'`.

Look at the display face at the starter's display sizes on the resolver
board. A face that sets small there (a script, a low x-height) needs
larger ones: record them on the sheet's Display sizes line, raised on
web and mobile alike, and make-it-yours step 1 sets them.

Then draw the artwork from the chosen mark as the two sources
make-it-yours step 8 renders with `docs/brand/render.sh`: `icon.svg`
(light) and `icon-dark.svg` (dark, used for the dark splash). Each is
the mark on a full-bleed background square in that mode's colors, in
the text layout the script edits with `sed`:

- `viewBox="0 0 1024 1024"` exactly;
- the background is one `<rect ... fill="#rrggbb"/>`, alone on its line
  and the only `<rect>` in the file;
- the mark centered with about 150px of margin;
- no `<text>`: outline any letter in the brand face to `<path>`s, since
  the renderer would otherwise set it in whatever font the machine has
  (make-it-yours step 8 has the how).

The script makes every PNG from these two, including the Android
foreground (the mark without the rect, scaled into the launcher's safe
zone) and the alpha-free iOS icon, so draw nothing else. `docs/brand/`
still holds the starter's sources, which make-it-yours step 8 replaces:
keep the new pair outside the repo until then. A preview needs only
`rsvg-convert` (Homebrew `librsvg`):

```sh
rsvg-convert -w 1024 -h 1024 icon.svg -o icon-preview.png
sed '/<rect /d' icon.svg | rsvg-convert -w 1024 -h 1024 -o mark-preview.png
```

Look at the mark on its own as well as on the square: it is also the
splash and the Android foreground.

## 4. Hand off to make-it-yours

Run `make-it-yours` with the sheet open: its Inputs are the sheet's
Names and Colors, step 1 takes the Display sizes line, step 2 the Fonts
rows, step 3 the Copy rows, step 7 the store, step 8 the Artwork.
Commit the sheet with the rebrand.

**Checkpoint:** make-it-yours' final visual check (its step 8) shows the
resolver card with the sheet's accent on "Join this gathering" and
nowhere else, in the sheet's display face. Differences from the
artboard are token values and copy, never layout: if a layout
difference shows, the artboard drifted from the rules and the app is
right.

## 5. Optional: give the fork its own design system

Later `/design` runs in the fork (customize-gathering's screens,
extend-profile's fields, a marketing site) should start from the fork's
brand, not the starter's. After make-it-yours lands, `/design-sync`
pushes the fork's tokens into a claude.ai design-system project, which
`/design` then attaches by default. It needs a claude.ai login; it
counts toward the plan's usage and bills nothing extra. On an
organization account, check who can open design-system projects before
pushing a brand that is not public yet. Skip this step for a one-off
rebrand.

## What must not move

The starter's design discipline is the same before and after this
skill:

- One accent, on primary actions only; never on navigation, links,
  chrome, borders, or headings. A direction that needs two is a
  different product.
- Eight color tokens, no more. Derived values (`--color-scrim`, the ink
  at 40%) are not brand tokens and follow the eight on their own. A new
  token key is a design-system change, not a rebrand, and it is out of
  this skill's scope.
- Neutrals near-monochrome; no gradients, no tinted surfaces.
- Layout, radii, spacing, tap targets, the card idiom, the motion
  budget: untouched. Artboards vary the look, not the structure.
- Fonts self-hosted; no font CDN `<link>` in the app (the artboards may
  load Google Fonts; the app may not).
- No Tailwind, no NativeWind, no generated CSS from a canvas. The two
  token files are the only implementation.
- No artboard markup, exported HTML, or "implement this design" output
  enters `apps/`.

## Scope notes

- Adds no app code: this folder holds the runbook, its reference and one
  script; the fork gains one markdown file.
- The canvas is private to whoever ran it; the sheet is what the repo
  keeps, so a fork can be rebranded again without the canvas.
- Timing, from the built run (one agent, three boards, the sheet, no
  human rounds): about ten minutes. Budget the owner's choosing on top.
- Re-run when the vertical changes, not when the copy does; copy edits
  go straight to make-it-yours step 3.
