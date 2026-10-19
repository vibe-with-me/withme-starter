# design-direction — reference

## The brief

(From §1.) Fill in the Inputs and paste it as the prompt.

````text
Design a brand direction for a fork of this app: <vertical and audience>.
Mood: <three words>. Brand names: <wordmark / display name, or "propose".>
References: <none, or what was attached>.

Draw three artboards at 390×844, in light AND dark mode (six boards):
1. The resolver card — what a stranger sees after tapping a tag
   (apps/web/src/routes/t.$uid.tsx): a centered card with a round
   avatar (one initial when there is no photo), the person's name, a
   one-line bio, then the platforms they can be reached on as locked
   rows (a muted "Connect to unlock <name>'s links." line, then one
   full-width row per platform: its icon in ink, its label, a muted lock
   at the end; the seed's Ada has six), ONE primary button "Connect", a
   quiet "Report" under it, and the wordmark as a footer below the card.
   A person with no links has no rows and no line.
2. The signed-in shell (apps/web/src/components/AppShell.tsx): a 56px
   header with the wordmark, a page title, two gathering cards, and a
   60px bottom tab bar (Events, Connections, Merch, Profile) with a
   56px round QR button (Your code) raised out of its middle, between
   Connections and Merch; on a wide screen it floats bottom-right. The
   active tab and the button are drawn in ink, not in the accent. Draw Merch even when there is
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

## The sheet template

(From §3.) Write it as `docs/brand-direction.md` in the fork.

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

Display sizes (make-it-yours step 1): <"starter's" (web `--text-title` 2rem, `--text-lg` 1.25rem; mobile `displaySize` title 30, section 20, wordmark 20), or the raised values for a face that sets small>.

## Copy (make-it-yours step 3 and 7)

| screen | file | line |
| --- | --- | --- |
| landing promise | apps/web/src/routes/index.tsx | <Find your people …> |
| Merch card | apps/web/src/routes/_app.merch.tsx, apps/mobile/app/(tabs)/merch.tsx | <Tags and gear from the store.> |
| NFC permission | apps/mobile/app.json nfcPermission | <Read Acme tags to connect with people.> |
| photo permission | apps/mobile/app.json photosPermission | <Choose a photo for your profile.> |

## Artwork (make-it-yours step 8)

- The mark: <described in words>.
- `icon.svg` (light) and `icon-dark.svg` (dark), drawn in `docs/brand/render.sh`'s layout, which make-it-yours step 8 copies over the starter's `docs/brand/` sources and renders: <"kept outside the repo until step 8" (no local path), "recolor the starter mark", or "none yet">.

## Not this

<Three lines on what the direction refuses: the second accent that was tempting, the gradient, the typeface that failed the package check. Plus one line per change the owner made to the boards, if the boards were not updated.>
````

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
Copy: "Find your people on the wall."; Merch "Chalk, tags
and gear from the desk."; NFC "Read Crux tags to connect with people."
Refused on the way: a second, orange accent for "hosting" badges (the
one-accent rule), and a hold-shaped tinted card background (surfaces
stay neutral).
