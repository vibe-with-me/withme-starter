# withme-starter

[![CI](https://github.com/vibe-with-me/withme-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/vibe-with-me/withme-starter/actions/workflows/ci.yml)

Open-source NFC tap-to-connect reference implementation: two strangers tap a
tag and remain connected — and nothing more. No ranking, no recommendations,
no aggregation, no monetization hooks. This repo is the handshake.

## The stack (opinionated by design)

This is the production stack of a shipped product, open-sourced as-is:
**TanStack Start · Hono · ORPC · Cloudflare Workers · Supabase · Bun.**
End-to-end type safety flows from one contract package through the API, the
web app, and the SDK. The opinions are the point — framework-substitution
requests (Next.js ports, Express adapters, alternate databases) are out of
scope and will be closed. Fork freely; the opinions stay.

## How it works

```
NTAG213 tag ──encodes──▶ https://<your-domain>/t/{UID}
                              │
                  apps/web (Workers) SSR's "the card"
                              │ typed ORPC client
                  apps/api (Workers) Hono + ORPC
                              │ caller's JWT, never service-role
                  Supabase (Postgres + RLS + Auth)
```

The **UID is permanent; the destination is mutable server-side.** That
indirection is the core pattern: you encode a tag once, lock it, and what it
points at remains yours to change forever.

- `packages/contract` — the single source of truth: ORPC contracts + Zod
  schemas, including the typed destination union (`profile` and `gathering`
  today; `link | menu | vcard` can join without schema change). Two routers:
  `public` (resolve / claim / logScan — the SDK surface) and `app`
  (profile, photo and links, connect, block, gatherings, my tags, account —
  session-scoped).
- `apps/api` — the one backend every client talks to. Verifies Supabase JWTs
  (ES256 via JWKS), runs every query under the **caller's** RLS identity, and
  rate-limits per tag UID at the edge.
- `apps/web` — a thin TanStack Start client. Loaders call the API through the
  typed contract client; the web app owns no business logic and no data
  access. `/t/$uid` is the product: SSR'd, fast, unbreakable.
- `apps/mobile` — the Expo client: the same tabs (Events, Connections, Merch,
  Profile) and resolver over the same contract; NFC reading in development
  builds.
- `packages/db` — Supabase client, generated types, query helpers, and the
  RLS test suite (consumed by `apps/api` only).
- `packages/nfc-sdk` — `@withme/nfc`, the standalone redirect SDK. Its
  `client` entry (`resolve` / `claim` / `logScan`) wraps this API's typed
  contract.
- `supabase/` — migrations, RLS policies, seed.

## Safety semantics (enforced in the database, not the UI)

- **Blocks are absolute and invisible.** A blocked user can't view the
  blocker's profile, can't connect, and receives no signal — dropped requests
  ack identically to delivered ones, and even the rate limiter accounts
  attempts in a private ledger so it can't be used as an oracle.
- **No enumeration.** Profiles are reachable only via a tag scan (knowing the
  unguessable UID is the capability) or an existing connection. No browse, no
  search, no directory, no sequential IDs.
- **Mutual consent.** Connections exist only when a request is accepted.
  Requests expire after 7 days; either party can remove a connection
  unilaterally, without notification.
- **Gatherings are membership-scoped.** The one feature beyond the
  handshake: a host creates a gathering, points a tag at it, and a tap
  hands out the invitation. Only members see a gathering or each other's
  cards through it; a join refused by a block is indistinguishable from a
  gathering that does not exist; blocking evicts. There is no browse
  surface.
- **Privacy-default scans.** `tag_scans` stores a user-agent string and a
  timestamp. No GPS, no IP, no fingerprinting — the columns don't exist.
- **Links are for connections only.** The places you can be reached —
  Instagram, WhatsApp, a website, a phone number, one per platform from a
  fixed registry — live in `profile_links`, a sibling table whose select
  policy admits you and your accepted connections, with no block in either
  direction. They never ride the card: `resolve_tag` is untouched, and
  nobody holding your tag learns a handle. The stored shape is a database
  CHECK mirrored by the contract.
- **Avatars are paths, not URLs.** A photo is uploaded through the API into
  the uploader's own folder of a public bucket no one else can list;
  profiles store only `<user>/<file>` and every client builds the URL from
  its own Supabase URL, so an avatar can never point off-origin. The real
  boundary is the bucket's limits (JPEG or WebP, 1 MiB) plus the
  `profiles_avatar_path_shape` CHECK. The API's byte sniffing is a first
  gate that a direct Storage call with the user's own token can bypass,
  which stays safe because the bucket only ever holds and serves images. A
  photo's public URL works for anyone holding it until the photo changes
  (caches may keep serving it for up to an hour after that).
- **Deletion cascades.** Deleting an account (Profile → Account, which
  clears your photo files and then calls `delete_my_account()`) removes
  connections, requests, blocks, and the gatherings you host, resets
  claimed tags to unclaimed, and erases their scan history.

All of the above is RLS + security-definer functions, covered by 88 policy
tests (`packages/db/test`, Storage policies included) that run against
Supabase local. The tests are the spec.

## Quickstart

### Local, zero cloud accounts

Prereqs: [Bun](https://bun.sh), [Supabase CLI](https://supabase.com/docs/guides/cli)
2.118 or newer (older CLIs ship a PostgREST that sporadically rejects a fresh
sign-in's token as "issued at future"), Docker.

```sh
bun install
bun run db:start        # Supabase local on ports 553xx (includes Storage)
bun run db:seed         # demo users + tags
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.example apps/web/.env
bun run dev             # api on :8786, web on :3000
```

Then open `http://localhost:3000/t/04BBBBBBBBBBBB` (Ada's tag — her card,
inviting you to the gathering she hosts), `/t/04AAAAAAAAAAAA` (the claim
flow), or sign in as `ada@demo.withme.local` / `withme-demo-1` to see her
gathering and her pending request.

Tests: `bun run test` (unit + RLS), `bun run --cwd apps/web test:e2e`
(Playwright smoke: resolve → claim → connect, the signed-in shell, tap →
join a gathering, the Connections lists, and the profile: photo, my tags,
account deletion),
`bun run --cwd apps/api e2e` (API e2e against the local stack). The web
smoke runs against the production build and needs Supabase up first;
Playwright starts the API worker and the built web worker itself.

### Deploy (one platform: Cloudflare + Supabase)

1. Fork, then create a [Supabase project](https://supabase.com) and link it:
   `supabase link --project-ref <ref>` then `supabase db push`.
2. In the Supabase dashboard: set your site URL and
   `https://<your-web-domain>/auth/callback` as a redirect URL; enable the
   Google provider if you want OAuth.
3. API config — set as Worker **secrets** so deploys can never clobber them
   (run in `apps/api`, after `wrangler login`):

   ```sh
   wrangler secret put SUPABASE_URL              # https://<ref>.supabase.co
   wrangler secret put SUPABASE_PUBLISHABLE_KEY  # sb_publishable_…
   wrangler secret put CORS_ORIGIN               # your web origin
   ```

4. Web build config — create `apps/web/.env.production` (gitignored) with the
   `VITE_*` values from `.env.example` pointed at your deployed API and
   Supabase project. Vite bakes these in at build time.
5. `bun run deploy` — both Workers deploy via wrangler to one Cloudflare
   account, free tier friendly. The API deploys first (the web Worker's
   loaders reach it through a [service binding](apps/web/wrangler.jsonc);
   turborepo enforces the order). Single-platform deploy is a feature: there
   is exactly one place to look when something breaks.
6. Encode a tag (below), tap it, claim it. Target: under 30 minutes.

Note: `vite preview` of the production build needs the API worker running
locally for the service binding to connect; for local work use `bun run dev`,
which talks to the API over plain localhost fetch instead.

## Encoding NFC tags

Tags encode one **permanent URL**: `https://<your-domain>/t/{UID}`, where
`{UID}` is 14 uppercase hex chars naming a row in `public.tags`. By default
it is random (`04` and 12 more), generated by `bun run db:provision` rather
than read from the chip, because an unclaimed tag belongs to whoever
presents its UID first. The [`provision-tags`](.agents/skills/provision-tags/SKILL.md)
skill is the runbook: it creates the rows and the encode list, and its §5
covers using the chip's own 7-byte NTAG213 UID instead, and what that
costs. Use any NFC writer app (e.g. NXP TagWriter) to write the URL as an
NDEF URI record, then **lock the tag to read-only**. The heavy lookup happens in the API Worker —
the tag itself is just a pointer that never changes. Destinations stay
mutable server-side: claim, re-point, or turn off without touching the
physical tag again. Deleting an account releases its tags to unclaimed.

## Extending a fork

Growth beyond the handshake ships as agent-executable skills in
`.agents/skills/`, each built for real before it was written down and
bound by the slice and safety discipline in
[`docs/the-slice.md`](docs/the-slice.md):

- `design-direction` — a vertical but no brand yet: Claude's `/design` on the starter's own screens, reduced to make-it-yours' inputs with the contrast verified.
- `make-it-yours` — rebrand: tokens, fonts, wordmark, app identity, store URL.
- `customize-gathering` — the gathering's nouns and fields.
- `extend-profile` — vertical profile fields, card or connections-only, and completion gating.
- `add-destination-type` — grow what a tag can point at.
- `provision-tags` — batch tags, the encode list, a printable sheet.
- `go-live` — Supabase, Cloudflare Workers, EAS Update.

## Principled non-goals

Matching, discovery, recommendation, feeds, and event aggregation are
excluded **as off-thesis, not as withheld features**. Software that decides
who you should meet is a different product with different incentives. This
repo's entire job is to make the moment after a physical tap work — the
handshake — and to stay out of the way after that.

## Commercial boundary

Stated plainly, on day one: **the handshake layer is free and open,
permanently.** Tag fulfillment (printed, encoded, locked hardware) and
managed hosting are commercial, permanently. The boundary will not creep.

## Contributing notes

- Issues and PRs welcome; maintained on a best-effort basis, no support SLA.
- v0.x — breaking changes expected.
- `apps/api` runs on Cloudflare Workers: **Workers-compatible dependencies
  only**. Logging is [LogTape](https://logtape.org) — if you're arriving from
  Node/Express, note that Pino depends on Node streams and will not run here.
- Lint is `oxlint --deny-warnings`; CI runs lint, typecheck, build, and the
  RLS suite against Supabase local.

## License

MIT
