# The stack, and why

The starter is the production stack of a shipped product, open-sourced as
it is. Every choice below was made for that product and kept because it
earned its place. The choices are opinionated and fixed for this repo:
ports to other frameworks or databases are out of scope here, because the
skills, the tests, and the deploy runbook all assume them. A fork can do
what it likes.

This page explains what each choice buys you, what it costs, and the
constraints it brings so none of them surprise you.

## Bun workspaces + Turborepo

**What it buys.** One `bun install`, one lockfile, one `bun run dev` that
starts the API and the web app together. Turborepo runs tasks in
dependency order (the contract builds before anything that imports it;
the API deploys before the web worker).

**Constraints.** Metro (the mobile bundler) relies on Bun's hoisting; a
single copy of each `expo-*` package is required, so the root
`package.json` pins `expo`, `react`, and `react-dom` in `overrides`. Bump
those and the mobile package's pins together. Bun's isolated linker can
resolve some `@types` packages through `node_modules/.bun`, so a worktree
needs its own install.

## TypeScript + Zod + oRPC

**What it buys.** The contract package is the single source of truth.
Zod schemas validate at runtime and infer types at compile time; oRPC
turns them into typed routes that the API implements and the clients
call. Change a schema and `bun run typecheck` names every client that has
to change. This is the mechanism the skills rely on when a step says "the
typecheck fails until you do this".

**Constraints.** Validation in Zod is not a security boundary: owners can
write some tables directly through PostgREST with their own token. Every
rule that matters is also a SQL CHECK constraint or a policy.

## Hono on Cloudflare Workers (the API)

**What it buys.** A small, fast server that starts cold in milliseconds
and deploys to one Cloudflare account alongside the web app. The free
tier covers a demo and a small club; paid plans are inexpensive. One
platform means one place to look when something breaks.

**Constraints.** Workers are not Node. Dependencies must be
Workers-compatible: no Node streams, no filesystem, no native modules.
The practical consequence most people hit first is logging: the starter
uses [LogTape](https://logtape.org) because Pino depends on Node streams
and will not run here. JWT verification uses `jose` for the same reason.

## TanStack Start (the web app)

**What it buys.** Server-rendered pages with typed file routes, deployed
as a Worker. The resolver page (`/t/$uid`) is the product, and it has to
be fast and unbreakable on a phone that just tapped a sticker or scanned a
code: SSR gets
the card on screen before the JavaScript arrives. Loaders call the API
through the typed client, so the web app owns no business logic and no
data access.

**Constraints.** In production the web Worker reaches the API through a
service binding, so the API must deploy first (Turborepo enforces it). A
`vite preview` of the production build also needs the API Worker running
locally; `bun run dev` uses plain `fetch` to localhost instead.

## Expo + Expo Router (the mobile app)

**What it buys.** The mobile app mirrors the web routes file for file,
on the same contract. EAS Update publishes a shareable build by QR code
without an app-store round trip, which is how a fork demos to a club
before it ships. NFC reading uses `react-native-nfc-manager` in a
development build.

**Constraints.** NFC is a native module, so Expo Go cannot read tags;
the scan screen falls back to manual entry there. The committed
`app.json` belongs to the upstream Expo project; a fork runs `eas init`
once to own its own (`make-it-yours` step 5). Before distributing
development builds with native modules, switch `runtimeVersion` to the
fingerprint policy (`apps/mobile/README.md` explains why).

## Supabase (Postgres + Auth + Storage)

**What it buys.** Postgres with row-level security, so the privacy
promises live in the database and hold no matter which client is
talking. Auth with email, phone (a texted code, through Twilio), and
OAuth providers. Storage for photos, with
bucket-level limits. And a local stack in Docker, so the RLS suite and
the e2e harnesses run against the real database on your machine and in
CI.

**Constraints.**

- The Supabase CLI must be 2.118 or newer. Older CLIs ship a PostgREST
  that sporadically rejects a fresh sign-in's token as "issued in the
  future"; it looks like clock skew and is not.
- The local stack is several Docker images. Stale images from old CLI
  versions fill the Docker VM over time; prune them when `db:start` fails
  with disk errors.
- Free-plan hosted projects pause after about a week idle. Fine for a
  demo, wrong for production; a paid org is roughly $10 a month and
  always on.
- Hosted signups require email confirmation, and the default SMTP only
  delivers to org members. Configure SMTP or seed demo credentials.

## Twilio Verify (phone sign-in codes)

**What it buys.** Phone sign-in without passwords: Supabase Auth asks
Twilio Verify to text a 6-digit code and to check it. Verify owns the
codes, the rate limits and the SMS fraud guard, and it sends from
Twilio's own numbers, so there is no number to buy and, in the US, no
A2P 10DLC registration.

**Constraints.**

- The provider stays enabled in `supabase/config.toml` even locally,
  because the CLI turns phone login off without one. Locally the
  credentials are unset placeholders: the test number +1 555-555-0100
  takes code `123456` without reaching Twilio, and any other number fails
  to send.
- On a hosted project, phone sign-in is configured in the dashboard
  (Authentication → Sign In / Providers → Phone): Twilio Verify, the
  Account SID, the Verify Service SID (`VA…`), the Auth Token. Leave the
  test number out there.
- A new Twilio account is a trial: it texts only verified numbers until
  you upgrade it.

## Astro (a fork's marketing site)

The starter ships no marketing site; the `add-marketing-site` skill adds
one to a fork as `apps/site`. It is opinionated like the rest: Astro,
because a site is several pages sharing a header and footer (the privacy
and support pages are required for a store listing) and Astro's layouts
give that with no JavaScript in the output.

**What it buys.** `astro build` writes plain HTML and CSS. The Worker
serves them as static assets with no code of its own, so there is nothing
to secure and nothing to hydrate. The layout imports the web app's
`tokens.css` and `app.css`, so the site wears the fork's brand and card
idiom without a second set of styles.

**Constraints.** Static output only: no adapter, no server routes, no
data from the API. No Tailwind, no React islands, no analytics. Turbo
needs a package task for the site's build, because the site reads files
outside its package (the web app's styles) and `PUBLIC_*` variables that
the global task does not hash. The skill adds it.

## What it costs to run

For a club-sized fork:

| Service | Free tier | When you pay |
| --- | --- | --- |
| Cloudflare Workers (API + web) | 100k requests/day | Beyond that, a few dollars a month. |
| Cloudflare static assets (the marketing site) | Requests for static assets are free | Not billed as Worker requests: the site runs no code. |
| Supabase | Two projects per free org, paused after ~1 week idle | ~$10/month for an always-on project. |
| Twilio Verify | Trial credit, verified numbers only | About $0.05 per successful sign-in, plus the SMS fee. Only if you turn phone sign-in on. |
| Expo EAS | Updates and a limited number of builds | Builds beyond the free allotment. |
| Expo push service | Free | Not billed. iOS pushes need the Apple Developer membership a store app needs anyway. |
| A domain | — | Required. The domain you encode on tags is forever. |

`go-live` has the exact commands and the potholes for each.

## What is deliberately not in the stack

- **No analytics or telemetry.** The no-telemetry stance is part of the
  starter's identity. PostHog and friends ship their own instrumentation
  skills if a fork wants them.
- **No engagement pushes.** The mobile app gets three transactional
  pushes (request received, request accepted, people joined your
  gathering), sent by the database through Expo's free push service.
  Nothing else, ever: no reminders, digests, or "you haven't opened the
  app". No web push or email either; a fork adds those if it wants them.
- **No commerce.** The Merch tab is a pointer to a store URL. No cart,
  no products, no Shopify API.
- **No background jobs.** Request expiry is a timestamp comparison, not a
  cron.
