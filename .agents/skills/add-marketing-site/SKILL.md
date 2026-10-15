---
name: add-marketing-site
description: Use when a withme-starter fork needs a public website beside the app — what the tag does, how to get one, and the privacy and support pages the App Store and Google Play ask for. Scaffolds apps/site (Astro, static, on the fork's Cloudflare account) in the app's own design system.
---

# add-marketing-site — a static site that wears the app's brand

The app's landing page is a sign-in card. A fork that sells tags or ships
to the app stores needs more: a page that says what the tag does, a
privacy policy URL and a support URL for the store listings, and a place
the "Get tags" link can live. This skill adds `apps/site`, a static Astro
site deployed as its own Worker on the same Cloudflare account.

Built once in a throwaway fork of the starter, then written down from what
worked: the build, the type check, the CI sequence, the turbo cache, the
served routes, and a real deploy to `workers.dev` (the starter's own,
2026-10-15) were all run. The custom-domain route in step 7 has been
config-checked (`wrangler deploy --dry-run`) but not yet attached to a
real zone. The pages ship as working files in `site/` next to this
document; you copy them and rewrite the words.

**REQUIRED BACKGROUND:** `docs/nfc-tags.md` § "The domain is forever"
(step 1 depends on it) and `docs/safety-model.md` (every promise the site
makes comes from there).

## Why Astro, and why only this much of it

The stack is opinionated (`docs/stack.md`), and the site follows suit: one
framework, so this runbook stays short and testable. Astro because a
marketing site is several pages sharing a header and footer (the privacy
and support pages are not optional for a store listing), and Astro's
layouts give that with no JavaScript in the output. It is used narrowly:

- `output: 'static'` and **no adapter**. `dist/` is HTML, CSS, and fonts;
  `wrangler.jsonc` has no `main`, so no Worker code runs and there is
  nothing to secure.
- **No Tailwind, no React islands, no UI kit.** The layout imports the web
  app's `tokens.css` and `app.css`, so the site uses the app's card and
  buttons, and make-it-yours restyles both at once.
- **No analytics, no tracking pixels, no cookie banner.** The starter's
  no-telemetry stance covers the site.

## The rules this skill will not bend

1. **The site reads nothing.** No API calls, no Supabase client, no
   gathering list, no headcounts, no "people near you". It is copy and
   links. The app is where data lives, behind RLS.
2. **No real person appears.** The sample card is invented. No
   testimonial names or faces unless the person gave written permission.
3. **Every promise is true of this fork.** Each line of "What we promise"
   and the privacy page maps to `docs/safety-model.md` or the fork's
   migrations. A fork that added a tracker, a provider, or a field updates
   the page or drops the line; it never keeps a claim the code broke.
4. **The accent stays where the app keeps it.** The only accent on the
   site is the sample card's Connect. Calls to action use `.btn--ink`
   (ink on surface, the contrast pair design-direction already checked).
5. **Tokens only.** `site.css` references `var(--*)`; it never declares a
   color, font, or radius of its own.

## Inputs to collect before you start

From `docs/brand-direction.md` if design-direction ran, otherwise from the
owner and make-it-yours' values:

- The **wordmark** and **display name**, identical to the app's.
- The **landing promise** (the app's `apps/web/src/routes/index.tsx` line)
  and one plain sentence of what the app does, for the meta description.
- A **contact email** a person reads. The support and privacy pages print
  it; Google Play's account-deletion requirement needs it.
- The vertical's nouns: what a gathering is called (customize-gathering's
  rename), and an invented person and bio for the sample card.
- The **hostnames** (step 1) and, if one exists, the store URL (the same
  value as the app's `VITE_STORE_URL`).
- Which sign-in methods and providers the fork uses (email, phone through
  Twilio, a custom SMTP provider), and whether extend-profile added fields.

## 1. Decide the hostnames before anything is encoded

Tags carry one origin for life, and the web app's resolver (`/t/{UID}`,
`/claim/{UID}`) must answer there forever. The site and the app are two
Workers, so they need two hostnames. Settle this with the owner first:

- **No tags encoded yet (recommended):** the site takes the apex
  (`example.com`), the app takes a subdomain (`app.example.com`), and the
  tags encode the app's hostname: `https://app.example.com/t/{UID}`. Nobody
  reads an NFC URL, so the subdomain costs nothing, and the site can be
  rebuilt or moved without touching a tag.
- **Tags already encode the app's hostname:** leave the app where it is.
  The site takes another hostname (the apex if the app is on a subdomain,
  `www.` or a second domain if the app holds the apex).
- **Only if the owner insists the site take a hostname the tags already
  encode:** the app moves to a new hostname, and the site forwards the
  resolver paths with a `_redirects` file (step 6). Every tap then takes
  one extra 302, and that file becomes part of "the domain is forever":
  deleting it breaks every tag. Write that into the fork's README.

Moving the app's hostname means go-live's Auth URLs (Supabase Site URL and
Redirect URLs), the API's `CORS_ORIGIN` secret, and `VITE_*` values change
with it. That is go-live's work, done before this skill deploys.

**Checkpoint:** the owner has written down the site hostname, the app
hostname, and the hostname the tags encode (or will encode).

## 2. Scaffold `apps/site`

From the repo root:

```sh
cp -R .agents/skills/add-marketing-site/site apps/site
```

Then wire it into the monorepo. Each of these was a real failure in the
build:

- **`turbo.json`** — add a package task. Without it, turbo's cache replays
  a stale site after a token change in `apps/web` (outside the package) or
  a `PUBLIC_*` change (the global `env` lists `VITE_*` only, and `.env`
  files are gitignored, so turbo does not hash them):

  ```json
  "@withme/site#build": {
    "dependsOn": ["^build"],
    "env": ["PUBLIC_*"],
    "inputs": ["$TURBO_DEFAULT$", ".env*", "../web/src/styles/**", "../web/src/fonts/**"],
    "outputs": ["dist/**"]
  }
  ```

- **`.gitignore`** — add `.astro` (Astro's generated types).
- **`.oxlintrc.json`** — add `"**/.astro/**"` to `ignorePatterns`.
  `bun run lint` otherwise fails CI on `apps/site/.astro/types.d.ts`.
- If the fork renamed its workers (make-it-yours step 6), rename
  `"name": "withme-site"` in `apps/site/wrangler.jsonc` to match
  (`<wordmark>-site`).

```sh
bun install
```

`site/package.json` pins `astro` with `~` to the minor this was built on.
Take a newer minor only by re-running the checkpoints below. It also
declares `vite`, which `astro.config.mjs` imports for `loadEnv`: Bun's
isolated linker does not let the config reach Astro's own copy. Keep its
range in step with `apps/web`'s `vite`.

**Checkpoint:** from the repo root, `bun run lint`, `bun run typecheck`,
and `bun run build` all pass, the CI sequence. `apps/site/dist/` holds
`index.html`, `privacy.html`, `support.html`, `404.html`, and `_astro/`
with the two font files; `grep -c '<script' apps/site/dist/*.html` prints
`0` for every page.

## 3. The brand words

Edit `apps/site/src/brand.ts`: `WORDMARK`, `DISPLAY_NAME`, `PROMISE`,
`DESCRIPTION`, `CONTACT_EMAIL`. Colors and fonts are not there and must
not be added: they arrive from the app's stylesheets.

**Checkpoint:** `WORDMARK` equals the `<h1 className="wordmark">` in
`apps/web/src/routes/index.tsx`, and `PROMISE` equals the line under it.
`grep -rn 'example.com' apps/site/src` prints nothing.

## 4. The home page, for this vertical

Rewrite `apps/site/src/pages/index.astro`'s words, keeping its structure:

- **The lede:** the tag in the vertical's terms (a bib, a bag tag, a
  collar tag), still saying that connecting needs both people.
- **The sample card:** an invented name, initials, and a one-line bio in
  the vertical's voice; one `.btn--connect` reading the app's own verb.
  If extend-profile added a card-tier field, show it the way
  `ProfileCard.tsx` renders it. The card is `aria-hidden` with a
  `figcaption`: it is a picture of the app, not a control.
- **How it works:** keep the three steps (tap, connect, stay connected);
  change nouns only.
- **The gatherings section:** use the renamed noun ("runs", "rounds"). It
  may say gatherings are listed to everyone signed in and who is going is
  connections-only: that is `gatherings_select` and
  `gathering_members_select`. If the fork changed either policy (an
  `invite_only` column, say), rewrite the paragraph to match the policy.
- **What we promise:** four promises drawn from `docs/safety-model.md`.
  Check each against the fork before keeping it (rule 3).

The "Get tags" and "Open the app" buttons need no edits: they appear only
when `PUBLIC_STORE_URL` / `PUBLIC_APP_URL` are set at build time.

**Checkpoint:** every sentence on the page is true of this fork today. The
sample card's name is invented. `grep -n 'color-\|#[0-9a-fA-F]\{3,8\}\b'
apps/site/src/pages/index.astro` prints nothing.

## 5. Privacy and support

Both pages ship as true statements about a fresh starter. Reconcile them
with the fork:

- **`privacy.astro` "What we store":** one line per table a user's data
  lands in. extend-profile's card-tier column goes under "Your card"; a
  `profile_details` field gets its own line under connections-only. Read
  the fork's `supabase/migrations/` rather than trusting this list.
- **"Who processes it":** Supabase and Cloudflare always. Twilio only if
  phone sign-in is configured (go-live §1). Add the custom SMTP provider
  if one sends the confirmation mail. Add any provider the fork added.
- **"What we don't do":** delete "no analytics" if the fork added any.
- **`UPDATED`:** today's date.
- **`support.astro`:** the menu paths (Profile → My tags → Turn off;
  Connections → Block; Profile → Account → Delete account) must match the
  fork's labels. customize-gathering may have renamed tabs.

Tell the owner plainly: these pages are a starting point drawn from the
code, not legal advice, and they review them before launch.

**Checkpoint:** the owner has read both pages. Every provider the fork
sends user data to is named on the privacy page.

## 6. Preview the built site

```sh
cd apps/site
cp .env.example .env    # optional: uncomment PUBLIC_APP_URL / PUBLIC_STORE_URL
bun run build && bunx wrangler dev --port 8799
```

`astro dev` (`bun run dev`, port 4321) is for editing; `wrangler dev`
serves `dist/` the way the deploy will, including the 404 handling.

If step 1 chose the forwarding layout, create
`apps/site/public/_redirects` now (`mkdir -p apps/site/public` first: the
template has no `public/`), with the app's hostname, then rebuild:

```text
/t/* https://app.example.com/t/:splat 302
/claim/* https://app.example.com/claim/:splat 302
```

**Checkpoint** (from a second shell):

```sh
for p in / /privacy /support /nope; do printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "localhost:8799$p"; done
```

prints `200`, `200`, `200`, `404`, and `/nope` shows the site's "Nothing
here" page. With `_redirects`: `curl -sI localhost:8799/t/04BBBBBBBBBBBB`
answers `302` with `location: https://<app host>/t/04BBBBBBBBBBBB`.

Then look at it: light and dark (`prefers-color-scheme`), and at 375px
wide with no horizontal scroll. The accent appears once, on the sample
card's Connect, in the app's display face.

## 7. Deploy (the owner's OK first)

A deploy publishes to the owner's Cloudflare account. Ask before running
it.

1. If `wrangler whoami` lists more than one account, add
   `"account_id": "<account id>"` to `apps/site/wrangler.jsonc`, the same
   pin go-live puts in the other two configs.
2. Write `apps/site/.env.production` (gitignored; nothing in it is
   secret):

   ```env
   PUBLIC_SITE_URL=https://example.com
   PUBLIC_APP_URL=https://app.example.com
   # PUBLIC_STORE_URL=https://shop.example.com   # same value as VITE_STORE_URL
   ```

3. Attach the site's hostname. The zone must be on the same Cloudflare
   account. Add a custom domain route to `apps/site/wrangler.jsonc`;
   Cloudflare creates the DNS record and the certificate on deploy:

   ```jsonc
   "routes": [{ "pattern": "example.com", "custom_domain": true }],
   ```

   Skip this to start on `workers.dev`, and leave `PUBLIC_SITE_URL` as
   that URL until the domain is attached.

```sh
cd apps/site && bun run build && bunx wrangler deploy
```

Cloudflare's API intermittently returns 502/504/524. Retry with backoff,
as in go-live §2.

**Checkpoint:** the step 6 `curl` loop against the live hostname prints
the same four codes (send a browser `User-Agent` if you check bodies from
Python; go-live §3 explains why). `view-source` shows
`<link rel="canonical" href="https://<site host>/">`, not localhost.

## 8. Hand-off to the store listings

- **App Store Connect:** Privacy Policy URL `https://<site>/privacy`,
  Support URL `https://<site>/support`.
- **Google Play Console:** privacy policy `https://<site>/privacy`; the
  account-deletion URL (Data safety) `https://<site>/support#delete-account`.
  It names the app, gives the in-app steps, and offers email deletion for
  someone who cannot sign in.
- The app's landing page can link to the site once it is live. That is a
  one-line edit in `apps/web/src/routes/index.tsx`, not part of this skill.

## Redeploys and keeping it true

`cd apps/site && bun run build && bunx wrangler deploy`. A token or font
change in the app reaches the site only on its next build: redeploy the
site whenever make-it-yours runs again. Re-read step 5 whenever a
migration adds a column holding user data or a provider is added.

## Not covered

App Store and Play badges (no fork has needed them yet), more languages, a
blog, a sitemap, and anything that sells (the store stays a link, per
`docs/merch.md`).

## Gotcha index

| Symptom | Cause |
|---|---|
| Site keeps the old accent after a token change | No `@withme/site#build` task in `turbo.json`; turbo replayed a cached build (step 2) |
| A new `PUBLIC_*` value does not show up | The same: turbo neither hashes `.env` files nor lists `PUBLIC_*` without the package task |
| `bun run lint` fails on `apps/site/.astro/types.d.ts` | `.astro` missing from `.oxlintrc.json` `ignorePatterns` and `.gitignore` |
| `/privacy` answers 307 to `/privacy/` | `build.format: 'file'` was removed from `astro.config.mjs` |
| Canonical link says `/index` or `.html` | The `canonical` line in `Base.astro` was changed |
| Canonical link says `localhost` in production | `PUBLIC_SITE_URL` missing from `apps/site/.env.production`, or `astro.config.mjs` reads `process.env` directly (the config runs before Astro loads `.env` files; keep the `loadEnv` call) |
| `Cannot find module 'vite' imported from …/astro.config.mjs` | `vite` dropped from `apps/site/package.json` devDependencies |
| Taps on old tags 404 after the site took their hostname | The site took the tags' hostname without `public/_redirects` (step 1) |
| "Open the app" or "Get tags" missing | The button is dormant: set `PUBLIC_APP_URL` / `PUBLIC_STORE_URL` and rebuild |
| Deploy lands on another account | No `account_id` pinned in `apps/site/wrangler.jsonc` |
