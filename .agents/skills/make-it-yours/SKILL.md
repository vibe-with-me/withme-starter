---
name: make-it-yours
description: Use when rebranding a withme-starter fork or pointing it at a new vertical — new name, colors, fonts, app identity, or store/EAS ownership. Configuration only; no feature changes.
---

# make-it-yours — rebrand the fork through its dormant seams

The starter was built so a rebrand is a token swap, not a redesign. Every
brand-bearing value sits behind a seam this skill walks: design tokens
(web + mobile in lockstep), self-hosted fonts, the wordmark and copy, app
identity, and deploy names. Nothing here scaffolds features — if you came
to add functionality, see `docs/the-slice.md` and the other skills.

**REQUIRED BACKGROUND:** the safety discipline in `docs/the-slice.md`. A rebrand moves no boundary: if a copy or config change seems to need a policy, an RPC, or a new card field, stop, because that is another skill's work.

Execution rules for the whole skill:

- **Never rename the `@withme/*` workspace packages** or their imports
  (`@withme/contract`, `@withme/db`, …), or the published SDK
  `@vibewithme/nfc`. They are infrastructure, invisible to users;
  renaming them breaks every import for zero brand value.
- Steps 1–7 are independent of each other. Skip any seam you're keeping.
- Run the final checkpoint (step 8) once at the end regardless.

## Inputs to collect before you start

No brand yet, only a vertical? `.agents/skills/design-direction/SKILL.md`
produces every value below, plus the copy and artwork steps 3 and 8 ask
for, as `docs/brand-direction.md` with the contrast pairs already
verified. Run it first, then fill this list from the sheet.

- Brand name in two forms: the lowercase **wordmark** (e.g. `acme`) —
  used wherever the brand renders as a mark (headings, page titles,
  slugs, user-agent strings) — and the **display name** (e.g. `Acme`) —
  used in prose sentences (the app's display name, permission strings,
  README prose). Check it against `TRADEMARKS.md` first: "Vibe With Me,"
  "VWM," and "Vibe Tags" are reserved, and a "[Something] With Me" name
  is allowed only with the non-affiliation disclaimer that file gives.
  If the user keeps the pattern, put that disclaimer in the README in
  step 3, and remind them it belongs on store listings too.
- Accent color for light and dark mode, each with an on-accent ink color.
  Required contrast (WCAG AA): accent vs. accent-ink ≥ 4.5:1 in both
  modes — verify with any WCAG contrast checker before editing. If the
  user has only one accent, derive the dark variant by lightening until
  contrast holds against dark surfaces.
- Optional: background/surface/ink neutrals, display + body fonts (must
  be self-hostable — OFL or similarly licensed), reverse-domain id
  (e.g. `com.acme.app`), URL scheme (e.g. `acme`).
- Optional: a store URL for the Merch tab and the landing page's "Get
  tags" link — step 7.
- Optional: your fork's repository URL, for the root README's CI badge —
  step 3.
- Where people report a vulnerability in your app, and who reviews your
  pull requests: a GitHub repository with private vulnerability reporting
  turned on (GitHub offers it only on public repositories), or a security
  email; and your GitHub handle or team. Step 8's contact-points pass uses
  them.

Also do this now (a fresh clone ships only `.example` files, and the
final boot check needs the real ones):

```sh
cp apps/web/.env.example apps/web/.env
cp apps/mobile/.env.example apps/mobile/.env
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

And give the local stack its own name, before anything else touches the
database. `supabase/config.toml` → `project_id` names the Docker
containers and volumes, and a fork that keeps `withme-starter` shares
them with every other checkout of the starter on this machine: its
`db:start` can come up on another checkout's database ("Starting
database from backup", migrations behind), and the two cannot run side
by side even on different ports. Pick an id no other checkout uses
(the wordmark, usually):
`docker ps -a --format '{{.Names}}' | grep -c "^supabase_db_<new id>$"`
must print 0 (otherwise the reset below lands on that checkout's stack).
Stop the running stack first, while `config.toml` still names it:
`bun run db:stop` (with the id still `withme-starter`, that also stops
any other checkout of the starter here). Then rename. Then
`bun run db:start`, then `bun run db:reset && bun run db:seed`: the
renamed project starts on new, empty volumes.

## 1. Design tokens — web and mobile move in lockstep

The same palette lives twice and the two files MUST stay value-identical:

- `apps/web/src/styles/tokens.css` — CSS variables, `:root` (light) +
  `@media (prefers-color-scheme: dark)` blocks.
- `apps/mobile/lib/tokens.ts` — the `light` and `dark` `Tokens` objects.

Edit both in one sitting. Every *color* key is strictly 1:1
(`--color-bg` ↔ `bg`, `--color-ink-muted` ↔ `inkMuted`, …) — copy the
same literal values into both. The non-color tokens (radii, spacing,
fonts, display sizes) also exist in both files but in platform-shaped
form (`radius`/`space`/`fonts`/`displaySize` consts on mobile); keep them
in agreement if you change them. The display sizes are the one type
setting a rebrand may need: `--text-title` and `--text-lg` set only
display text (names, titles, section headers, the header wordmark), and
mobile mirrors them as `displaySize` (`title`, and `section`/`wordmark`
for `--text-lg`). A display face that sets small (a script, a low
x-height) needs them raised: change the two web tokens and the three
mobile values together. Body text sizes are mobile literals that stay
with the body face. The shell's heights are layout, not brand, but a new
display font or a taller wordmark can outgrow them. `--shell-nav-height`
(the header, 56px) is mirrored on mobile as `SHELL.headerHeight` in
`lib/tokens.ts`: the two move together. `--shell-tab-height` (the web
bottom bar, 60px) is web-only; the mobile tab bar
(`apps/mobile/components/TabBar.tsx`) sizes its tabs itself (a 49pt
minimum, like React Navigation's default) and raises the 56pt Your code
button 20pt above the bar. `--shell-max-width` is the content column.
The 720px nav breakpoint is the literal `@media (max-width: 719.98px)` in
`apps/web/src/styles/app.css`, documented in the `tokens.css` comment
(CSS variables cannot drive media queries): change both or neither.

Two more places echo `--color-bg` and must be updated to the new light
and dark background values or the native splash will flash the old brand:

- `apps/mobile/app.json` → `expo.android.adaptiveIcon.backgroundColor`
  (light bg) and the `expo-splash-screen` plugin entry's
  `backgroundColor` (light bg) + `dark.backgroundColor` (dark bg).

The web favicon carries three tokens, in both modes:

- `apps/web/public/favicon.svg` → the `.bg`, `.ink` and `.accent` fills
  in its `<style>` block: the light bg, ink and accent, and the same three
  dark values in its `prefers-color-scheme: dark` block. Step 8 redraws its
  shapes if the mark changes; its colors change here, with the tokens.

And one place copies the light `--color-surface`:

- `apps/web/src/lib/avatar.ts` → `PHOTO_FILL`, the fill baked under a
  transparent photo when an avatar is cropped. Set it to the new light
  surface value (light only: every viewer sees the same file).

**The one-accent rule.** The palette is near-monochrome with exactly one
vivid accent, and the accent appears only on the primary action of a
screen: Connect, Accept, Claim tag, and Join (the resolver's "Join this
gathering" and the gathering's own Join), plus mobile's "Read NFC tag".
That is the `btn--connect` class on web and `kind="connect"` on mobile.
Do not introduce a second accent, and keep the accent off links, chrome,
and any border outside that primary-action button — restraint is the
design system. Keep the WCAG notes in `tokens.css` honest: accent/accent-ink
≥ 4.5:1, `--color-border-input` ≥ 3:1 against `--color-surface` (WCAG
1.4.11), in both light and dark — measure with a contrast checker and
cite four ratios in the comments: the accent pair (accent vs. accent-ink)
in each theme, and the input border against the surface in each theme.
Don't leave stale numbers. The
starter ships its input border at 3.32:1 light and 4.43:1 dark; a new
neutral set must keep both at or above 3:1.

**Checkpoint:**

```sh
grep -rn --exclude-dir={node_modules,dist,.expo,.wrangler,.turbo} \
  '#c2410c\|#ff6a3d' apps/
```

returns nothing (old accent fully evicted from both token files and the
favicon; the exclusions matter — stale build output under `dist/` still contains the
old values and would false-fail this). Repeat for each old neutral you
replaced, over the same `apps/` tree so it reaches `app.json` and
`avatar.ts` too (the starter's light surface `#fffefb` is also
`PHOTO_FILL`). Then `bun run lint && bun run typecheck` — both green.
If you changed the header height,
`grep -n 'shell-nav-height:' apps/web/src/styles/tokens.css` and
`grep -n 'headerHeight' apps/mobile/lib/tokens.ts` show the same number.

## 2. Fonts — self-hosted, no CDNs

Skip if keeping Space Grotesk + Inter. Both platforms load fonts from
local files; keep it that way (no `<link>` to font CDNs).

Web (`apps/web`):
1. Obtain latin variable woff2 files for your fonts. Easiest source:
   `cd apps/web && bun add -d @fontsource-variable/<font>`, then copy
   the `wght` file under the shipped files' naming pattern,
   `<font>-var-latin.woff2` (still in `apps/web`):

   ```sh
   cp node_modules/@fontsource-variable/<font>/files/<font>-latin-wght-normal.woff2 \
     src/fonts/<font>-var-latin.woff2
   ```

   (then `bun remove` the package — only the file ships). If the
   package also ships files for other axes (Archivo has `wdth` and
   `standard` files too), copy only the `wght` one: the app varies
   weight and nothing else. Delete the old
   `space-grotesk-var-latin.woff2` / `inter-var-latin.woff2` once
   unreferenced.
2. Update the two `@font-face` blocks at the top of
   `apps/web/src/styles/app.css`: family name,
   `src: url('../fonts/<font>-var-latin.woff2') format('woff2')` (keep
   the existing `format('woff2')` hint), and the `font-weight` range
   your variable file actually covers (read it from the `@font-face` in
   `node_modules/@fontsource-variable/<font>/index.css` before removing
   the package).
3. Update `--font-display` and `--font-body` stacks in
   `apps/web/src/styles/tokens.css` to the new family names (keep
   system-font fallbacks).

Mobile (`apps/mobile`):
1. `cd apps/mobile && bun add @expo-google-fonts/<font>` (exists for
   every Google Font; for non-Google fonts use `expo-font`'s
   `useFonts({ Name: require(...) })` with bundled files instead) and
   `bun remove` the old `@expo-google-fonts/*` packages.
2. Update the imports and the `useFonts({ … })` map in
   `apps/mobile/app/_layout.tsx`.
3. Update the `fonts` map in `apps/mobile/lib/tokens.ts` to the exact
   exported style names (e.g. `Manrope_600SemiBold`).

**Checkpoint:** `bun run typecheck` — green (a wrong import name in
`_layout.tsx` fails mobile tsc; the `fonts` map in `lib/tokens.ts` is
plain strings tsc can NOT validate — compare its values against the
`useFonts` keys by eye, a typo there silently falls back at runtime).
`ls apps/web/src/fonts/` lists exactly the files referenced by
`app.css`, every one named `<font>-var-latin.woff2`.

## 3. Wordmark and copy

The brand renders in these places. Use the **wordmark** in the first
eight (they render it as a mark) and in the README title, and the
**display name** inside prose sentences (the `nfcPermission` string, and
any README sentence that names the product — the starter's README prose
names no brand, so there only the title and badge change):

- `apps/web/src/routes/index.tsx` — the `<h1 className="wordmark">`.
- `apps/web/src/components/AppShell.tsx` — the header wordmark link.
- `apps/web/src/components/CalmStates.tsx` — the "withme home" link on
  the not-found and error cards (two places).
- `apps/web/src/routes/login.tsx` — the `<p className="hint">withme</p>`
  above the sign-in heading (besides its page title).
- `apps/web/src/routes/t.$uid.tsx` — `WordmarkFooter`, the only brand
  mark a stranger who tapped a tag sees.
- Page titles: `apps/web/src/routes/__root.tsx`, `login.tsx`,
  `claim.$uid.tsx`, `_app.connections.tsx`, `_app.gatherings.tsx`,
  `_app.gatherings_.$id.tsx` (or your renamed route files),
  `_app.profile.tsx`, `_app.merch.tsx`, `_app.share.tsx` (each route's
  `head()`).
- `apps/mobile/components/Header.tsx` — the wordmark `<Text>`.
- `apps/mobile/app/t/[uid].tsx` — the `user_agent` prefix
  (`withme-mobile/…`).
- `apps/mobile/app.json` — the `react-native-nfc-manager` plugin's
  `nfcPermission` string ("Read withme tags…" → "Read Acme tags…").
- `apps/mobile/app.json` — the `expo-camera` plugin's `cameraPermission`
  string ("Scan someone's code to open their card."), repeated in the
  `expo-image-picker` plugin's because both write the same iOS key. It
  carries no brand; rewrite both together, only for voice.
- The Your code button (the round QR button in the tab bar) is not a
  tab: it opens `/share`, and the tab entries never count it. A fork that
  does not want QR sharing removes it in one place per client:
  `<ShareButton />` in `apps/web/src/components/AppShell.tsx` and the
  share `Pressable` in `apps/mobile/components/TabBar.tsx` (the halves
  then simply meet). The share and scan screens stay reachable from the
  scan screen and by URL; delete `_app.share.tsx`, `app/share.tsx` and
  `app/scan-qr.tsx` too to remove the feature entirely.
- `apps/mobile/app.json` — the `expo-image-picker` plugin's
  `photosPermission` string ("Choose a photo for your profile."), the
  iOS prompt before the photo library opens. It carries no brand;
  rewrite it only for voice.
- `apps/web/src/routes/index.tsx` — the landing card's hint, "This is
  the starter app — tags resolve at `/t/<uid>`." It names no brand, so
  no sweep catches it, but your fork is no longer the starter app:
  rewrite it in your voice, or delete the `<p className="hint">`.
- `apps/site/src/brand.ts`, only in a fork that ran `add-marketing-site`:
  `WORDMARK`, `DISPLAY_NAME`, `PROMISE` (the landing line above). The
  site's colors and fonts come from `tokens.css` and `app.css` on its
  next build; nothing to edit there, but redeploy the site.
- The demo seed identity: `supabase/seed/demo.ts` holds the demo emails
  (`*@demo.withme.local`) and `supabase/seed/index.ts` the local-only
  password (`withme-demo-1`; a hosted project needs its own
  `SEED_DEMO_PASSWORD`, see go-live), which surface in the seed's console
  output, the README, and the `VITE_DEMO_CREDENTIALS` landing-page hint.
  Rebrand them or keep them —
  but whatever the seed creates is what the README and
  `VITE_DEMO_CREDENTIALS` must say. That hint has a commented example
  line in `apps/web/.env.example` AND in the `apps/web/.env` you copied
  from it up front: edit the line in both files (the step 8 sweep greps
  both).
- `README.md` and `apps/mobile/README.md`, if you keep them — but not by
  blind substitution: the root README's `withme` occurrences include the
  title (`# withme-starter` becomes the wordmark, `# acme`), the
  upstream repo URL in the CI badge (needs your **fork's
  URL**), `@withme/*` and `@vibewithme/nfc` package names which stay, and the demo-credentials
  line which must match the seed (previous bullet).
  `apps/mobile/README.md`'s occurrences are all `@withme/*` names — no
  change there.
- `LICENSE` — line 3 names the starter's copyright holder,
  `Vibe With Me LLC`. MIT requires you to keep that notice for the code you
  inherited; add your own line under it for your changes
  (`Copyright (c) <year> <your name or org>`) rather than replacing it.

**Wordmark treatment.** Set the weight and tracking from the sheet's
Wordmark row, the same on web and mobile. Case is the wordmark string
itself (above); add no `text-transform`. Web: the `.wordmark` rule in
`apps/web/src/styles/app.css` (the AppShell header link, the landing
`<h1 className="wordmark">`, and the resolver footer;
`.shell-header .wordmark` sets only size).
The landing h1 also matches `.card h1` (weight 600), which outranks
`.wordmark`: write the selector as `.wordmark, .card h1.wordmark`.
The resolver footer (`WordmarkFooter` in `apps/web/src/routes/t.$uid.tsx`)
ships without the class, so it renders in body type: give its link
`className="wordmark"` (`<Link to="/" className="wordmark">`). It keeps
its own size and takes the sheet's face, weight and tracking.
Mobile: `styles.wordmark` in `apps/mobile/components/Header.tsx`, the
only mobile wordmark. Mobile fonts are static weights: add a
`wordmark` key to the `fonts` map in `apps/mobile/lib/tokens.ts` naming
the nearest weight the package exports (a half step rounds down: 750 →
`Archivo_700Bold`), load it in `_layout.tsx`'s `useFonts` (step 2), and
set `letterSpacing` to the tracking in em times the `fontSize`
(-0.035em at 20 → -0.7). The other marks (the login hint and the
CalmStates links) render in body type; leave them.

**Caution:** if you also rewrite *action* copy (button labels like
"Connect", "Claim tag", "Accept", the "Name" field label), the Playwright
specs select by those strings — update every match of
`grep -rn "getByRole\|getByLabel\|getByText" apps/web/e2e`, the shared
steps in `apps/web/e2e/helpers.ts` included, or e2e will fail.

**Checkpoint:**

```sh
grep -rni withme apps/web/src apps/mobile/app apps/mobile/components \
  supabase/seed apps/web/.env.example apps/web/.env \
  README.md apps/mobile/README.md | grep -vE '@(vibe)?withme/' \
  | sed -E 's/^([^:]*\.env[^:]*:[0-9]+):.*/\1/'
```

returns nothing (if you deliberately kept the seed identity or an
upstream attribution link, those are the only acceptable matches; the
last line prints a `.env*` match as `file:line` only, so a secret value
never reaches the output), and
`grep -n nfcPermission apps/mobile/app.json` shows your new copy.
If your new brand itself contains the string `withme` (e.g.
`golfwithme`), this and every later brand sweep needs an extra filter
for your own strings — `| grep -viE '<wordmark>|<display name>'`, e.g.
`| grep -viE 'golfwithme|golf with me'`, inserted before the `sed` line
(after it, a `.env` match no longer carries the text to filter) — the checkpoints are about
OLD-brand residue, not the substring.
`app.json` is deliberately NOT in the bulk grep here — its remaining
`withme` values (name/slug/scheme/bundle ids) are step 4's job; the
final sweep in step 8 catches everything.

## 4. App identity (mobile)

In `apps/mobile/app.json`, set: `expo.name` (display name), `expo.slug`,
`expo.scheme` (deep-link scheme — physical tags deep-link via
`<scheme>://t/<uid>`), `expo.ios.bundleIdentifier` and
`expo.android.package` (reverse-domain, immutable after store
submission — choose carefully).

`expo.slug` is the wordmark, lowercase, with any space or other
character outside `a-z0-9` turned into a hyphen (`acme` → `acme`;
a wordmark `run club` → `run-club`). It names the EAS project step 5
creates.

Until step 5 runs, `expo.owner`, `expo.extra.eas.projectId` and
`expo.updates.url` still point at the upstream project, which does not
match your new slug: run no `eas` command between this step and step 5.

**Checkpoint:** `cd apps/mobile && bunx expo config --type public`
prints the new name/slug/scheme without schema errors (it still prints
the upstream `owner` and `projectId`; step 5 replaces them).

## 5. EAS re-ownership (requires the fork owner's Expo account)

The starter's EAS project belongs to the upstream org; a fork must claim
its own:

1. In `apps/mobile/app.json`, set `expo.owner` to the fork's Expo
   account (the org's name, or your username), and delete
   `expo.extra.eas.projectId` and `expo.updates.url` — and remove the
   `extra.eas` / `updates` objects they leave empty. Set the owner rather
   than delete it: a login that belongs to more than one account (your
   own and an org) gets the personal one from `eas init` when `owner` is
   absent.
2. `cd apps/mobile && bunx eas init` (logged in as a member of that
   account) — creates `@<owner>/<slug>` and writes the new `projectId`.
   Read `git diff app.json` after it: it can also write an
   `android.permissions` list naming `android.permission.NFC` twice; keep
   one.
3. `bunx eas update:configure` — restores `updates.url` pointing at the
   new project, and adds a `channel` to each build profile in
   `eas.json`. Keep the channels: EAS Update routes a build's updates
   by them.

A fork reusing an EAS project it already has links it instead of
creating one: see go-live §4, step 1.

**Checkpoint:** `app.json` carries the fork owner's `owner` and a
`projectId` ≠ `cf56d2f1-eaec-406b-be9c-972519a6be84`, and `updates.url`
ends with that new projectId.

## 6. Deploy names and environment

- `apps/api/wrangler.jsonc` → `name` (e.g. `acme-api`).
- `apps/web/wrangler.jsonc` → `name`, AND `services[0].service` must
  equal the new api worker name — the web worker reaches the API through
  this binding; a mismatch deploys a web app that cannot resolve tags
  server-side.
- `supabase/config.toml` → `project_id` was renamed before step 1
  (Inputs); check it no longer says `withme-starter`.
- The `.env` files you created up front are *stack* config, not brand:
  local values stay as the `.example` files ship them (after step 3,
  `apps/web/.env` still matches `apps/web/.env.example` line for line).
  Production URLs/keys are deploy-time secrets. `VITE_DEMO_CREDENTIALS`
  (web) renders the landing-page demo hint — unset it or keep it in sync
  with your seed identity (step 3).

- `apps/site/wrangler.jsonc` → `name` (e.g. `acme-site`), only in a fork
  that ran `add-marketing-site`.

**Checkpoint:** `grep -n 'withme' apps/api/wrangler.jsonc apps/web/wrangler.jsonc`
returns nothing, and the web `services` entry matches the api `name`.

## 7. Merch store pointer (optional)

The Merch tab and the landing page's "Get tags" link exist only when a
store URL is set: a pointer to where your tags are sold, never commerce.
Skip this step if you have no store yet; the tab stays absent.

- Local: uncomment and set `VITE_STORE_URL=https://…` in `apps/web/.env`
  and `EXPO_PUBLIC_STORE_URL=https://…` in `apps/mobile/.env`, the same URL
  in both. Restart the dev servers (Vite and Metro read env at start;
  start Metro with `--clear`, then relaunch the app — a running Expo Go
  keeps its old bundle until it is reopened).
- Production: the same lines in `apps/web/.env.production` and
  `apps/mobile/.env.production` (go-live §3 and §4). Both bundlers inline
  the value at build time: changing it means a rebuild and redeploy on
  web and an `eas update` on mobile.
- The value is public — it is baked into both bundles. Use the plain
  storefront URL, https only, with no tokens or tracking parameters you
  would not print on a flyer.
- Copy: the card reads "Tags and gear from the store." in
  `apps/web/src/routes/_app.merch.tsx` and `apps/mobile/app/(tabs)/merch.tsx`;
  the tab label is `Merch` in `AppShell.tsx` and `(tabs)/_layout.tsx`.
  Rewrite it in your voice; keep one card and one "Open store" action.
- Leave `VITE_STORE_URL: ''` in `apps/web/playwright.config.ts` alone: the
  smoke pins the tab absent on purpose (`shell.spec.ts`).

**Checkpoint:** `grep -n '^VITE_STORE_URL=https://' apps/web/.env` and
`grep -n '^EXPO_PUBLIC_STORE_URL=https://' apps/mobile/.env` each print one
line, with the same URL. With both dev servers up, `/merch` shows the card,
"Open store" opens the store in a new tab, and the landing page shows
"Get tags".

## 8. Icons + final gate

Every icon is rendered from two SVGs in `docs/brand/`: `icon.svg` (light)
and `icon-dark.svg` (dark). Each is a background `<rect>` plus the mark,
on a 1024 canvas, with colors copied from `tokens.css`. A sheet from
`design-direction` brings both, drawn in this format: copy them over the
starter's. Otherwise recolor the starter mark to the new tokens or draw a
new one with the same structure:
one `<rect>` for the background, the mark centered with ~150px of margin.
The script edits the SVGs as text, so keep `viewBox="0 0 1024 1024"` and
the background `<rect ... fill="#hex"/>` on its own line, the only `<rect>`
in the file. It stops with an error if either is missing (its header
lists the rest of the format).
`rsvg-convert` draws `<text>` with whatever fonts the machine running it
has installed, so a letter mark or wordmark set in the brand's display
face renders in a fallback face. Outline brand-face text to `<path>`s
before rendering, in the icons and in `social-preview.svg` (below), which
ships its name and tagline as `<text>`: Inkscape's Object to Path, or
opentype.js's `font.getPath(text, x, y, size).toPathData()` on the face's
font file (`@fontsource/<font>` has it).
Then run `docs/brand/render.sh` from the repo root (it needs `rsvg-convert`
and ImageMagick 7: `brew install librsvg imagemagick`). It writes:

- `apps/mobile/assets/icon.png`: `expo.icon`, full bleed, no alpha.
- `android-icon-foreground.png` + `android-icon-monochrome.png`:
  `adaptiveIcon.foregroundImage` / `monochromeImage`. The mark is scaled
  into the launcher's 66% safe zone. `android-icon-background.png` is
  rendered too but unwired: `adaptiveIcon.backgroundColor` (step 2) is
  what the launcher shows.
- `splash-icon.png` + `splash-icon-dark.png`: the `expo-splash-screen`
  entry's `image` and `dark.image`.
- `favicon.png`: `expo.web.favicon`.
- `apps/web/public/favicon.ico` + `apple-touch-icon.png`, linked from
  `apps/web/src/routes/__root.tsx`.

- `docs/brand/social-preview.png`: the 1280×640 card GitHub shows when the
  repo link is shared. It is rendered from `docs/brand/social-preview.svg`:
  set its name and tagline to the fork's (and swap in the new mark) before
  rendering. GitHub has no API for it, and the setting only appears once the
  repository is public: upload the PNG by hand under **Settings → General →
  Social preview → Edit → Upload an image**.

`apps/web/public/favicon.svg` is hand-written (it switches colors with the
browser's color scheme): copy the new mark's shapes into it. Its light and
dark colors were set in step 1.

### Contact points

A fork's users report its bugs and vulnerabilities through these files,
and as shipped they all point at the upstream starter, which does not run
your app and cannot fix it. Rewrite each one with your own contacts, or
delete it:

- `SECURITY.md`: keep the "What counts" list (your app keeps the same
  promises) and replace "How to report" and "What to expect" with your
  own channel and response time. Turn on private vulnerability reporting
  in your repository's Settings → Code security, or name a security email.
  GitHub offers private reporting only on public repositories (the
  setting is absent, and its API answers 404, on a private one), so
  until you go public name a security email here, and switch to private
  reporting at the flip.
  Drop "forks pick up fixes by merging from upstream" unless you do.
- `.github/ISSUE_TEMPLATE/config.yml`: both `contact_links` URLs go to
  your repository (`…/<your-repo>/discussions`, or delete that entry if
  Discussions are off, and `…/<your-repo>/security/advisories/new`). On a
  private repository the advisory link 404s: point that entry at your
  `SECURITY.md` (`…/<your-repo>/blob/main/SECURITY.md`) until you go
  public.
- `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml` and
  `.github/PULL_REQUEST_TEMPLATE.md`: the `docs/…` and `CONTRIBUTING` links
  point at your repository's copy (bug.yml's demo sign-in follows the seed
  identity, step 3).
- `.github/CODEOWNERS`: your own handle or team, not `@alex-eisele`.
  Leaving the upstream maintainer there asks them to review your pull
  requests, and fails to request your own reviewers.
- `CONTRIBUTING.md`: your issues link, or delete the file if the fork does
  not take outside contributions.
- `.github/workflows/release.yml` publishes `@vibewithme/nfc` and runs only in
  `vibe-with-me/withme-starter` (its `if:`), so a fork never publishes it
  by accident. Leave it, or delete the file; a fork that publishes the SDK
  under its own name changes the `if:` to its own repository.
- `.github/workflows/demo-migrate.yml` pushes new migrations to the
  starter's hosted demo and runs only in `vibe-with-me/withme-starter`
  (its `if:`). Delete it, or migrate your own hosted project with it:
  change the `if:` to your repository and create a `demo` environment
  with the three secrets it names. It pushes on every merge with no
  approval, which suits a seed-only demo. If the project has real
  users, add a required reviewer to the environment or remove the
  `push` trigger first (`go-live`, Redeploys).

Then run the full verification gate from `docs/the-slice.md`:

```sh
bun run lint && bun run typecheck && bun run test
```

all green, plus the final brand sweep — with the identity steps done,
this now covers everything step 3's checkpoint deferred. It also looks
for the upstream org, `vibe-with-me` (hyphenated, so `withme` alone
misses it), and the upstream maintainer, `alex-eisele`, in the contact
points above as well as the app, and reads your `.env` files under `apps/`
(printed as `file:line` only, as in step 3):

```sh
grep -rniE --exclude-dir={node_modules,dist,.expo,.wrangler,.turbo} \
  'withme|vibe-with-me|alex-eisele' apps/ packages/ supabase/ .github/ \
  README.md SECURITY.md CONTRIBUTING.md \
  | grep -vE '@(vibe)?withme/' \
  | grep -v "^\.github/workflows/release\.yml:[0-9]*:.*github\.repository == 'vibe-with-me/withme-starter'" \
  | grep -v "^\.github/workflows/demo-migrate\.yml:[0-9]*:.*github\.repository == 'vibe-with-me/withme-starter'" \
  | grep -v '^supabase/migrations/' \
  | grep -v '^packages/nfc-sdk/' \
  | grep -viE '<wordmark>|<display name>' \
  | sed -E 's/^([^:]*\.env[^:]*:[0-9]+):.*/\1/'
```

returns nothing. Fill in the `<wordmark>` line when your wordmark or display
name contains `withme` (e.g. `'golfwithme|golf with me'`): without it
every line of your own brand prints, because `withme` matches inside it.
If neither contains `withme`, delete that line. What the other filters
drop, and why a fork leaves it:

- `supabase/migrations/` — the first migration's header comment names
  `withme-starter`. Migrations are history: never edit an applied one.
- `release.yml`'s `if:` line — the guard that keeps a fork from
  publishing `@vibewithme/nfc` (Contact points, above). It names the
  upstream on purpose.
- `demo-migrate.yml`'s `if:` line — the same guard, keeping a fork from
  trying to migrate the starter's demo (Contact points, above).
- `packages/nfc-sdk/` — the SDK (`@vibewithme/nfc`) names the upstream in
  its `package.json` `repository.url` and in doc comments. A fork that
  does not publish the SDK leaves them. If you publish it under your
  own name, drop that filter and fix what it then prints.

The only other acceptable matches, each one a choice you made
deliberately: the seed identity if you kept it (step 3, and then the
README demo line and the `.env` example lines with it), and an upstream
attribution link in the README.

Not acceptable: `"owner": "vibe-with-me"` in `apps/mobile/app.json`
while `extra.eas.projectId` is still `cf56d2f1-…`. It means step 5 is
undone, so the app still points at the upstream EAS project; the sweep
stays red until step 5 runs.

A fork in the same GitHub org as the starter (`vibe-with-me/<your-repo>`)
has more correct matches: every link to the fork's own repository (the
README CI badge from step 3, and the contact points above, which now say
`github.com/vibe-with-me/<your-repo>/…` in the issue and PR templates and
`CONTRIBUTING.md`), and `"owner": "vibe-with-me"` once step 5 has given
`app.json` the fork's own `projectId`. Append this to the sweep, with
`<your-repo>` filled in; it drops the fork's own links in every file, and
the owner line only after step 5:

```sh
  | grep -vE 'github\.com/vibe-with-me/<your-repo>([^A-Za-z0-9_-]|$)' \
  | if grep -q cf56d2f1-eaec-406b-be9c-972519a6be84 apps/mobile/app.json; \
    then cat; else grep -v '^apps/mobile/app.json:[0-9]*: *"owner": "vibe-with-me",$'; fi
```

If the starter's maintainer really does review the fork's pull requests,
`.github/CODEOWNERS` keeps `@alex-eisele` and prints too: a deliberate
match, like the seed identity.

Finally the visual check. The RLS suite leaves its fixtures behind (test
users' gatherings fill the Events feed), so after the gate run
`bun run db:reset && bun run db:seed` first. It needs BOTH dev servers: in one shell
`cd apps/api && bun run dev` (the web loaders call the API Worker on
port 8786 — without it the resolver page errors), in another
`cd apps/web && bun run dev`. The landing page shows your wordmark in
your fonts, and the resolver card (`/t/04BBBBBBBBBBBB` after
`bun run db:seed`: Ada's card, inviting you to her gathering) settles
with your accent on its one primary action, "Join this gathering", and
nowhere else. That tag shows no Connect button; Connect and Accept carry
the same accent (step 1).
