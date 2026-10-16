---
name: design-direction
description: Use when a withme-starter fork has a vertical (a run club, a climbing gym, a wine bar) but no brand yet — runs Claude's /design on the starter's own screens, inside the starter's design system, and reduces the chosen direction to the exact inputs make-it-yours consumes, with the contrast pairs verified. Direction only; no code changes.
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
it is keeping as is: then fill make-it-yours' Inputs directly.

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
  `prefers-color-scheme: dark` block, type scale, radii 24/14/pill,
  spacing, the 44px tap target, one motion token) and
  `apps/mobile/lib/tokens.ts` (the same eight colors as `light` and
  `dark`, plus `fonts`, `radius`, `space`). `/design` reads the first
  one when it runs from the fork root.
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
    accent). Merch renders only when a store URL is set, but the boards
    always draw it;
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
- Whether a store exists, or is planned (the Merch tab and the landing
  page's "Get tags" button render only with a store URL; the sheet
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
block as the prompt, with the Inputs filled in.

If `/design` is not available where you are (it is a research-preview
skill and often is not), the agent takes the same brief and draws the
boards itself, as **one self-contained HTML file**: a section per
direction with its six boards at 390×844, the eight tokens per mode as
swatches, the two families, the mark as inline SVG, and the one-line
fit. The page may load Google Fonts; nothing else external. The owner
views it as a private Artifact, and that Artifact's link is the canvas
link in step 2. The sheet in step 3 is the contract either way, and the
script checks it regardless of how the values were found.

````text
Design a brand direction for a fork of this app: <vertical and audience>.
Mood: <three words>. Brand names: <wordmark / display name, or "propose".>
References: <none, or what was attached>.

Draw three artboards at 390×844, in light AND dark mode (six boards):
1. The resolver card — what a stranger sees after tapping a tag
   (apps/web/src/routes/t.$uid.tsx): a centered card with a round
   avatar (one initial when there is no photo), the person's name, a
   one-line bio, a muted line naming the gathering they host, ONE
   primary button "Join this gathering" and no secondary action, and
   the wordmark as a footer below the card.
2. The signed-in shell (apps/web/src/components/AppShell.tsx): a 56px
   header with the wordmark, a page title, two gathering cards, and a
   60px bottom tab bar (Events, Connections, Merch, Profile). The active
   tab is drawn in ink, not in the accent. Draw Merch even when there is
   no store yet, labelled "appears once a store URL is set", so the owner
   decides about it now instead of discovering it at launch.
3. The landing page (apps/web/src/routes/index.tsx): the wordmark, the
   one-line promise under it, a neutral "Sign in" button (ink on
   surface, not the accent), and a quiet "Get tags" button only if
   there is a store.

Content the starter card does not have (a handicap, a home club) may
be drawn as a proposal; label it as such. It is the fork's profile
content, implemented later by extend-profile, not by the rebrand.

Rules that do not move — this is the app's design system, read it in
apps/web/src/styles/tokens.css:
- Near-monochrome neutrals (bg, surface, ink, ink-muted, a hairline
  border) and EXACTLY ONE vivid accent, used only on the primary button.
  No accent on links, tabs, borders, chrome, or headings. No second
  accent, no gradients, no tinted cards.
- The accent on its button text ≥ 4.5:1 in both modes; ink-muted on
  surface ≥ 4.5:1; the input border (an rgba of ink over surface) ≥ 3:1.
- Layout, radii (24px cards, 14px controls), spacing and the 44px tap
  target stay as drawn in the files. Vary the look, not the structure.
- Fonts: a display face and a body face that are on Google Fonts under
  the OFL (both clients self-host them). Name the exact families.
- No emoji, no photography placeholders, no illustration unless a
  reference was attached.

What you may vary: the temperature of the neutrals, the accent hue, the
display face and its weight, the wordmark's treatment (case, tracking
and weight, as one setting for the whole word: no split weights), the
avatar placeholder's colors, the icon direction (a mark for a 1024px
app icon, described in words or drawn as a flat shape). A new treatment
inside the card (ruled cells, two-initial avatars, a split-weight
wordmark) is a code change beyond the token swap: draw it only if
flagged as one, so the owner can accept or drop it.

Give 2–3 named directions, each with its six boards, and for each list:
the eight token values per mode (bg, surface, border, border-input,
ink, ink-muted, accent, accent-ink), the two font families, and one
sentence on why it fits the vertical. Do not implement anything in the
codebase.
````

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

Write `docs/brand-direction.md` in the fork from this template. Every
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

````markdown
# Brand direction — <wordmark> (<Display name>)

Direction: <name>, chosen <date> from <the canvas, described (a private link is marked "private link, owner only"), or "no canvas">.
Vertical: <one sentence>. Mood: <three words>.

## Names

| wordmark | display name | reverse-domain id | scheme |
| --- | --- | --- | --- |
| <acme> | <Acme> | <com.acme.app> | <acme> |

## Colors (make-it-yours step 1: tokens.css `:root` / `tokens.ts` `light`, and the dark block / `dark`)

| token | light | dark |
| --- | --- | --- |
| bg | #…… | #…… |
| surface | #…… | #…… |
| border | rgba(…, 0.09) | rgba(…, 0.1) |
| border-input | rgba(…, 0.5) | rgba(…, 0.5) |
| ink | #…… | #…… |
| ink-muted | #…… | #…… |
| accent | #…… | #…… |
| accent-ink | #…… | #…… |

Splash and adaptive-icon backgrounds (`apps/mobile/app.json`): light bg, dark bg, as above.

Contrast, as `contrast.ts` reported it on <date>: <paste its output>.

## Fonts (make-it-yours step 2)

| role | family | web package | mobile package |
| --- | --- | --- | --- |
| display | <Family, or "Space Grotesk (starter)"> | @fontsource-variable/<font> | @expo-google-fonts/<font> |
| body | <Family, or "Inter (starter)"> | … | … |

A fresh starter ships Space Grotesk for display and Inter for body. Each row names the family make-it-yours step 2 will end with; "(starter)" means that step is skipped for the row. The comparison is always to the starter, never to a brand the fork had before.

## Copy (make-it-yours step 3 and 7)

| screen | file | line |
| --- | --- | --- |
| landing promise | apps/web/src/routes/index.tsx | <Tap a tag. …> |
| Merch card | apps/web/src/routes/_app.merch.tsx, apps/mobile/app/(tabs)/merch.tsx | <Tags and gear from the store.> |
| NFC permission | apps/mobile/app.json nfcPermission | <Read Acme tags to connect with people.> |
| photo permission | apps/mobile/app.json photosPermission | <Choose a photo for your profile.> |

## Artwork (make-it-yours step 8)

- `apps/mobile/assets/icon.png` 1024×1024, no alpha: <the mark, described>.
- `apps/mobile/assets/android-icon-foreground.png`: <the same mark on transparent, inside the central 66%, in a color that reads on the light bg>.
- Optional `apps/web/public/favicon.ico`.
- Source files live at <a repo-relative path such as `docs/brand/`, "kept outside the repo" (no local path), or "none yet">.

## Not this

<Three lines on what the direction refuses: the second accent that was tempting, the gradient, the typeface that failed the package check. Plus one line per change the owner made to the boards, if the boards were not updated.>
````

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

Then render the artwork from the chosen mark, drawn as two SVGs:
`icon.svg` (the mark on a full-bleed accent or bg square) and
`android-icon-foreground.svg` (the mark alone on a transparent
background, every painted point inside the central 66% — a circle of
radius 338 in a 1024 viewBox — in a color that reads on the light bg,
which make-it-yours sets as the adaptive-icon background; that may
invert the icon's colors). `rsvg-convert` and `magick` (Homebrew
`librsvg`, `imagemagick`) do the rest; keep the sources and PNGs outside
`apps/` until make-it-yours step 8 copies them in:

```sh
rsvg-convert -w 1024 -h 1024 icon.svg | magick png:- -background '<icon bg>' -alpha remove -alpha off icon.png
rsvg-convert -w 1024 -h 1024 android-icon-foreground.svg -o android-icon-foreground.png
magick icon.png -define icon:auto-resize=48,32,16 favicon.ico
sips -g hasAlpha -g pixelWidth -g pixelHeight icon.png   # hasAlpha: no, 1024 × 1024
```

iOS rejects an app icon with an alpha channel, so `icon.png` must
report `hasAlpha: no`; the Android foreground keeps its alpha. Look at
the foreground composited on the light bg with the safe-zone circle
drawn before you call it done.

## 4. Hand off to make-it-yours

Run `make-it-yours` with the sheet open: its Inputs are the sheet's
Names and Colors, step 2 takes the Fonts rows, step 3 the Copy rows,
step 7 the store, step 8 the Artwork. Commit the sheet with the rebrand.

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
- Eight color tokens, no more. A new token key is a design-system
  change, not a rebrand, and it is out of this skill's scope.
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

- Adds no app code: this folder holds a SKILL.md and one script; the
  fork gains one markdown file.
- The canvas is private to whoever ran it; the sheet is what the repo
  keeps, so a fork can be rebranded again without the canvas.
- Timing, from the built run (one agent, three boards, the sheet, no
  human rounds): about ten minutes. Budget the owner's choosing on top.
- Re-run when the vertical changes, not when the copy does; copy edits
  go straight to make-it-yours step 3.

## Worked example: Crux, a bouldering gym

Built once before this text was written. Vertical: a bouldering gym
whose members tap a tag at the desk; mood "chalk, rope, Tuesday night";
wordmark `crux`, display name `Crux`. Direction "Chalk and cobalt":
cool chalk-grey neutrals instead of the starter's warm ones, a cobalt
accent for the one button, Bricolage Grotesque for display over the starter's Inter for body.

| token | light | dark |
| --- | --- | --- |
| bg | #eef0ec | #15181a |
| surface | #fafbf8 | #1f2326 |
| border | rgba(27, 31, 28, 0.09) | rgba(236, 238, 233, 0.1) |
| border-input | rgba(27, 31, 28, 0.5) | rgba(236, 238, 233, 0.5) |
| ink | #1b1f1c | #eceee9 |
| ink-muted | #5c635e | #9ba39d |
| accent | #2447c9 | #8db2ff |
| accent-ink | #ffffff | #0a1a4f |

The script's verdict on its twelve pairs: accent 7.45:1 light and
7.81:1 dark, ink-muted on surface 5.94:1 and 6.12:1, the input border
3.22:1 and 4.48:1, all `ok`, exit 0. Fonts: `@fontsource-variable/bricolage-grotesque`
5.3.0 and `@expo-google-fonts/bricolage-grotesque` 0.4.1 both exist.
Copy: "Tap a tag. Meet a climber. Stay connected."; Merch "Chalk, tags
and gear from the desk."; NFC "Read Crux tags to connect with people."
Refused on the way: a second, orange accent for "hosting" badges (the
one-accent rule), and a hold-shaped tinted card background (surfaces
stay neutral).

Two things the same script found in the starter itself, which a fork
inherits until make-it-yours replaces the values: `tokens.css` cites
4.8:1 for the light accent pair, and the pair is 5.18:1; the light
input border is 2.97:1 against the surface, just under 3:1 (both are
known and not yet fixed in the starter's tokens).
