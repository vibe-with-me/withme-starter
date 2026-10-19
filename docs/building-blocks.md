# Building blocks

What each part of the repo does, what a tap actually passes through, and
the one pattern everything follows. Read this before the skills if you
want to know *why* they touch the files they touch.

## The one pattern: types first, then everything derives

```
packages/contract  ──types──▶  apps/api
        │                        ▲
        ├──types──▶ apps/web ────┤  (typed oRPC client)
        ├──types──▶ apps/mobile ─┤
        └──parity──▶ packages/nfc-sdk
```

`packages/contract` holds Zod schemas (what a profile, a tag, a gathering
look like) and oRPC route definitions (what you can ask the API to do).
Every other package imports its types from there. The API *implements*
the contract; web and mobile *call* it through a typed client; the SDK
mirrors the public half structurally with a compile-time parity test.

The practical effect: add a field to a schema and `bun run typecheck`
tells you every place that has to change. That is the mechanism the
skills lean on when they say "the typecheck fails until you do this".

## A tap, start to finish

1. A phone taps a tag and opens `https://<your-domain>/t/04BBBBBBBBBBBB`.
2. The web Worker (`apps/web/src/routes/t.$uid.tsx`) renders server-side.
   Its loader normalizes the UID and calls `api.public.resolve({ uid })`
   through the typed client. In production that call goes over a service
   binding to the API Worker; locally it is a plain `fetch` to port 8786.
   It also fires `logScan` and never lets that call fail the page.
3. The API Worker (`apps/api/src/routers/public.ts`) rate-limits the
   anonymous request at the edge (keyed on UID plus caller IP, never
   stored) and calls the `resolve_tag` database function with an
   anonymous client.
4. `resolve_tag` (a security-definer function in `supabase/migrations/`)
   answers one of three things: `unclaimed`, `claimed` (with the card and,
   for a gathering tag, a gathering summary), or `disabled`. A viewer the
   owner has blocked gets `disabled`, indistinguishable from a tag that was
   turned off.
5. The page renders a card. "Connect" or "Join this gathering" is the one
   accent-colored button. Unclaimed tags redirect to `/claim/$uid`.

Signed-in actions follow the same path through the `app` router
(`apps/api/src/routers/app.ts`), with one difference: the API verifies the
caller's Supabase JWT and makes a per-request database client that
carries it, so every query runs as that user and row-level security
decides what they can see.

## The parts

### `packages/contract`: the source of truth

- `src/schemas/`: one file per concept. `destination.ts` (the typed union
  a tag points at), `tag.ts`, `profile.ts` (the owner's profile, the public
  card, the avatar path rules), `link.ts` (the Links platform registry and
  the stored shape per platform), `connection.ts`, `gathering.ts`.
- `src/contract/public.ts`: `resolve`, `claim`, `logScan`. Anonymous
  except `claim`. This is what the SDK wraps.
- `src/contract/app.ts`: profile (get, update, upload and remove avatar,
  delete account), links (list mine, replace), connect requests (send, list
  pending, accept, decline),
  connections (list, remove), blocks (block, unblock, list), gatherings
  (create, get, join, leave, update, delete, point tags), my tags (list,
  update).
- `test/schemas.test.ts`: pins schema behavior, including negative cases.
  Unknown destination types must fail to parse.

### `apps/api`: the one backend

Hono on Cloudflare Workers, implementing the contract with
`implement(contract)`.

- `src/routers/public.ts` and `src/routers/app.ts`: thin handlers. Every
  `app.*` procedure requires a signed-in caller through `appProcedure`'s
  middleware, which hands the handler `context.userId`; `public.ts` calls
  `requireUser` where it needs one. Then either a typed query from
  `packages/db` or an RPC call, with Postgres error codes mapped to oRPC
  codes.
- JWT verification is ES256 against Supabase's JWKS. Every handler runs on
  `context.db`, a per-request client with the caller's token. The API
  never uses the service-role key.
- Avatar uploads come through the API too (`uploadAvatar` sniffs the
  bytes for JPEG or WebP before writing to Storage with the caller's
  token).
- Logging is [LogTape](https://logtape.org). Workers have no Node streams,
  so Node-only loggers such as Pino will not run here.
- `e2e/handshake.e2e.ts` drives the published SDK through the Worker into
  Supabase, including the silent-drop and blocked-viewer assertions.

### `apps/web`: the thin web client

TanStack Start, deployed as a Worker. File routes in `src/routes/`:

- `t.$uid.tsx`: the resolver. Server-rendered, fast, unbreakable.
- `claim.$uid.tsx`, `login.tsx`, `auth.callback.tsx`, `index.tsx`:
  focused public pages outside the shell.
- `_app.tsx`: the signed-in shell. Owns the session guard, the one
  profile fetch, and the chrome. Children are `_app.gatherings.tsx`,
  `_app.gatherings_.new.tsx`, `_app.gatherings_.$id.tsx`, `_app.connections.tsx`, `_app.merch.tsx`
  (present only when a store URL is set), `_app.profile.tsx`, and
  `_app.share.tsx` (Your code, opened from the tab bar's raised button;
  not a tab).
- `src/components/`: `AppShell.tsx` (header, tab bar, `navItems`, the
  Your code button), `ShareCode.tsx` (the QR image),
  `ProfileCard.tsx`, `MyTags.tsx`, `AvatarField.tsx`, `Links.tsx` (the
  Profile → Links editor and a connection's link chips), `AccountSection.tsx`,
  the list and shell state ladders (`ListStates.tsx`, `CalmStates.tsx`).
- `src/styles/tokens.css`: the design system. Eight color tokens in light
  and dark, a type scale, radii, spacing, one motion token. Every style
  references a token. `make-it-yours` edits this file and its mobile
  mirror together.

The web app owns no data access. Even re-pointing your own tag goes
through `app.tags.update`, never a browser Supabase query.

### `apps/mobile`: the Expo client

Expo Router screens mirror the web routes wherever the surface is shared:
`app/t/[uid].tsx` ↔ `t.$uid.tsx`, `app/(tabs)/` ↔ `_app.*`,
`app/gathering/[id].tsx` ↔ `_app.gatherings_.$id.tsx`. `scan.tsx` is
mobile-only and reads the chip in a development build
(`react-native-nfc-manager`); in Expo Go it falls back to manual entry.

- `lib/tokens.ts` mirrors `tokens.css` value for value.
- `components/ui.tsx` holds the card primitives every screen composes.
- Auth gating happens once in `app/_layout.tsx`.
- Sessions are encrypted at rest (`lib/session-storage.ts`), because they
  exceed the secure store's size limit.

[`apps/mobile/README.md`](../apps/mobile/README.md) covers running it,
NFC in development builds, and publishing with EAS Update.

### `packages/db`: queries, types, and the RLS suite

- `src/queries/`: typed query helpers the API calls (`handshake.ts`,
  `tags.ts`, `gatherings.ts`, `avatars.ts`, `links.ts`).
- `src/types/supabase.ts`: generated from the local database
  (`bun run db:types`). Commit it after a migration.
- `test/`: the row-level security suite, run with `bun test` against the
  live local stack. Each file is a boundary: `enumeration.test.ts`,
  `blocks.test.ts`, `requests.test.ts`, `tags.test.ts`,
  `gatherings.test.ts`, `avatars.test.ts`, `account.test.ts`,
  `cascade.test.ts`. The tests act through real per-user clients; the
  service-role client is for setup only.

The tests are the spec. When behavior is ambiguous, read them before the
implementation.

### `packages/nfc-sdk`: `@vibewithme/nfc`

Two things in one package:

- A standalone redirect SDK: register UIDs, resolve them to destination
  URLs, log scans, bring your own storage. If you only want "tag → URL",
  this is enough on its own, with a Hono router adapter for the usual
  `GET /t/:uid` redirect. See its [README](../packages/nfc-sdk/README.md).
- A `client` entry that wraps this API's public contract (`resolve`,
  `claim`, `logScan`) for anyone building another client.

### `supabase/`: the schema and the operator scripts

- `migrations/`: one additive migration per change. The initial schema
  (`20260610120000_initial_handshake_schema.sql`) is the pattern book:
  tenant seam on every table, RLS enabled everywhere, per-command
  policies, CHECK constraints that mirror the Zod schemas, column-level
  grants, security-definer functions with `search_path = ''`.
- `seed/index.ts`: the demo (Ada, Lin, three tags, one gathering, one
  pending request). Local-only unless you set `SEED_ALLOW_REMOTE=1`.
- `seed/provision.ts`: batch-creates unclaimed tag rows and writes the
  encode list. The `provision-tags` skill is its runbook.
- `config.toml`: the local stack (ports 553xx).

## Where a new feature goes

Every change moves through the same order: contract → migration + RLS →
RLS tests → API → web → mobile → e2e. [the-slice.md](the-slice.md) names
the real file that plays each role today and the discipline each layer
keeps. The skills are that slice applied to one concern each, which is
why `customize-gathering` and `extend-profile` list the same seven layers
in the same order.
