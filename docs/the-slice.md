# The slice — how every extension enters this codebase

Every feature this starter grows — by hand or via a skill in `.agents/skills/`
— ships as one vertical slice, built in the order below. The handshake itself
is the worked example: each layer cites the real file that plays that role
today. This is a map, not a tutorial; read the cited files when you build.

The V1 invariant still binds extensions: nothing that ranks, recommends,
aggregates, or monetizes. Dormant seams (tenant, theming) stay dormant —
extend through them, never around them.

## The slice, in order

**1. Contract.** Types come first and live in one place:
`packages/contract`. Zod schemas in `src/schemas/` (one file per concept —
see `destination.ts`, `tag.ts`, `profile.ts`, `connection.ts`), wired into
oRPC routers in `src/contract/public.ts` (tag-scoped; anonymous + the SDK
wraps it) and `src/contract/app.ts` (session-scoped; verified JWT only),
exported through `src/index.ts`. Everything downstream — API, web, mobile,
SDK — derives its types from here. Schema behavior is pinned by
`packages/contract/test/schemas.test.ts`, including *negative* cases:
unknown variants must fail to parse.

**2. Migration + RLS.** One additive migration per change in
`supabase/migrations/` (`<UTC-timestamp>_<name>.sql`). The initial schema
(`20260610120000_initial_handshake_schema.sql`) is the pattern book:

- every public table carries `tenant_id uuid not null default
  private.current_tenant_id()`, and every policy predicates on it;
- `enable row level security` on every table, policies written per-command
  and per-role — no `for all to public`;
- data shape is enforced in the database, not just in zod: see the
  `tags_destination_shape` CHECK (exact jsonb match — no extra keys) and
  `tags_state_consistent`;
- clients get column-level grants, not table-wide ones (`revoke update on
  public.tags` then `grant update (destination, status)`) — immutable
  columns stay immutable even through RLS-passing rows;
- helpers live in the `private` schema; anything `security definer` also
  sets `search_path = ''`;
- function grants are explicit: `revoke execute ... from public, anon`,
  then grant to exactly `anon` / `authenticated` as intended. Since
  `20261015140000_default_function_privileges.sql` a new function starts
  closed to anon and public anyway (and a new `private` helper to
  authenticated too, so a policy helper needs its grant); the explicit
  revoke keeps the intent readable where defaults differ. `grants.test.ts` pins what anon can execute;
  a new anon-facing function joins its list on purpose;
- storage follows the same rules (`20261011120000_avatars.sql`): per-user
  folder policies on `storage.objects`, a CHECK-shaped path column instead
  of a URL, no select policy for anyone but the owner (a listable bucket is
  a directory), bucket-level MIME and size limits, and no update policy
  (objects are immutable).

**3. RLS tests.** `packages/db/test/*.test.ts` (bun test against the live
local stack — `assertStackRunning` guards it). The behavior under test
acts through real per-user JWT clients (`createTestUser`) and
`anonClient()`; the service-role `admin` client is for setup
(provisioning tags), storage assertions, and auth-admin operations with
no client path — never for exercising the boundary being tested.
Cover the negative space: what a stranger, a non-owner, a blocked user, and
anon must NOT see. `enumeration.test.ts` and `blocks.test.ts` are the model.
`avatars.test.ts` is the model for Storage: act through each user's own
client, and give every negative case a positive control so it cannot pass
red.

**4. API handlers.** `apps/api/src/routers/{public,app}.ts` implement the
contract via `implement(contract)` (`src/lib/orpc.ts`). Every `app.*`
procedure is signed-in only: `appProcedure`'s middleware refuses an
anonymous caller with UNAUTHORIZED and hands the handler a typed
`context.userId`, so a new handler cannot forget the check (the one
signed-in `public.*` procedure, `claim`, calls `requireUser` itself).
Handlers are thin: a typed query from
`packages/db/src/queries/` or an `rpc()` call, with `throwFromDbError`
mapping PG error codes to oRPC codes. Every handler runs on `context.db`,
a per-request client carrying the caller's JWT — the API never bypasses
RLS. Anonymous endpoints take an edge rate limit keyed on UID + caller IP
(and resolve one on caller IP alone; `public.ts`); the IP is a rate-limit
key only, never stored. Edge limits are advisory: a direct
`/rest/v1/rpc/...` call with the publishable key skips the Worker, so a
limit that must hold for everyone is a ledger inside the RPC
(`claim_tag`, `create_gathering`, `send_connect_request`).
A handler that writes to Storage does it through `context.db` too (the
caller's JWT; the Storage helpers are in
`packages/db/src/queries/avatars.ts`) and checks uploaded bytes itself
(`uploadAvatar` sniffs the magic number); a write that spans Storage and
Postgres compensates instead of pretending to be one transaction.

**5. Web route.** File routes in `apps/web/src/routes/`. Tab pages live
under the pathless `_app` layout — `_app.tsx`, no URL segment of its own
— as `_app.<name>.tsx`: the layout owns the session guard, the one
profile fetch, and the chrome — a child route has neither `beforeLoad`
auth nor `ssr: false` of its own. Every child spreads `shellStates` from
`src/components/CalmStates.tsx` into its route options so a slow or
failed loader renders a card inside the shell, never a second `<main>`.
A new top-level section registers exactly one entry in `navItems`
(`src/components/AppShell.tsx`, widening its `to` union); that is the
whole tab. Config-gated tabs follow the Merch entry: present only when
the env value is set. Detail pages un-nest with the underscore
(`_app.gatherings_.$id.tsx` is the real one) so a list page never becomes
a layout.
Public and focused flows (`login.tsx`, `claim.$uid.tsx`) stay outside
the shell: the resolver (`t.$uid.tsx`) is the idiom — loader does the
data work, the page renders a single card on a calm background, and it
is unbreakable. All styling references `var(--*)` tokens from
`src/styles/tokens.css`; no hardcoded colors, fonts, radii, or spacing.
The accent never marks navigation state: active tabs are ink. The web
app owns no data access, even for single-row owner CRUD: re-pointing your
own tag goes through `app.tags.update`, never a browser Supabase query —
the My tags precedent. Uploads are no exception: the photo goes to
`app.profile.uploadAvatar` as a `File`, never `supabase.storage` from the
browser.
Lists climb the ladder in `src/components/ListStates.tsx` (loading → error
with retry → typed empty → content); a loader with several lists
`settled()`s each one (`src/lib/loaded.ts`) so a failed list never fails
the page. In-page segments are links with a search param
(`_app.connections.tsx`).

**6. Mobile screen.** Expo Router screens mirror the web routes wherever
the surface is shared (`t/[uid].tsx` ↔ `t.$uid.tsx`; `scan.tsx` is
platform-specific). Signed-in top-level screens live in
`apps/mobile/app/(tabs)/` and register one `Tabs.Screen` in
`(tabs)/_layout.tsx` (Feather icon, title); detail and focused screens
stay in `app/` as stack screens so they push over the bar
(`gathering/[id].tsx`, `claim/[uid].tsx`, `scan.tsx`). A config-gated
tab follows the Merch screen: `href: null` when its env value is unset,
so it is both hidden and unreachable. Screens compose the card primitives from `components/ui.tsx`
(`Card`, `Title`, `Muted`, `Button` (`inline` inside rows), `Avatar`,
`PersonRow`, `SegmentedTabs`, `ListLadder`, `EmptyState`,
`SectionHeader`) and read colors through
`useTokens()` from `lib/tokens.ts` — the mobile mirror of `tokens.css`.
Auth gating happens once, via `Stack.Protected` in `app/_layout.tsx`, not
per-screen. A detail screen returns to the tabs with `router.dismissTo`,
never by pushing a second `(tabs)` shell.

**7. E2E.** Two harnesses, both against the real local stack:
`apps/api/e2e/handshake.e2e.ts` drives the published SDK through the API
Worker into Supabase (including the silent-drop and blocked-viewer
assertions), and the Playwright smoke in `apps/web/e2e/` runs against the
production build (`vite build && vite preview`): `handshake.spec.ts` (two
strangers tap one tag and end up connected), `shell.spec.ts` (the
signed-in shell), `gatherings.spec.ts` (tap the host's tag, join, see the
headcount and not the host, connect, see the host), `connections.spec.ts`
(the list ladder), and
`profile.spec.ts` (photo, my tags, account deletion), all sharing `e2e/helpers.ts`. Extend whichever
one your slice touches; a slice nobody can walk end-to-end is not done.

## The safety discipline

These properties hold across every layer. They are why the slice is built
in this order — each one is enforced at the database and *re-stated* by a
test, not promised by UI code.

- **Tenant seam on every table.** New tables copy the `tenant_id` column +
  default verbatim, and every new policy includes `tenant_id =
  private.current_tenant_id()`. V1 never varies the tenant; the seam exists
  so multi-tenancy later is a function swap, not a migration storm.
- **No enumeration.** There is no path to list people you haven't met.
  Profiles are reachable only via capability (knowing a tag UID —
  `resolve_tag`) or relationship (connection, live incoming request). No
  anon select policy on `profiles` exists, deliberately. New features must
  not create a browse/search/list-strangers surface — that includes
  indirect oracles (FK errors, distinguishable error codes, rate-limit
  responses that reveal whether a row exists). Gatherings are the one
  deliberate list: every signed-in user of the tenant reads every
  gathering (`gatherings_select`), because a scene needs to know where it
  is congregating — but `gathering_members_select` admits only the
  viewer's own row and their accepted connections' rows, the headcount is
  a definer function that re-states the gathering's visibility, and
  co-membership never reveals a card. A listed gathering does expose its
  `host_id`; that id is not a card, and what it allows is one consent-gated
  connect request. A host's block is what refuses someone:
  `join_gathering` answers `'gathering not found'`, as it does for an id
  that does not exist, and the feed shows a blocked viewer nothing.
- **Block-respecting visibility.** Blocks are absolute and invisible:
  checked via `private.is_blocked()` inside policies and RPCs, never in UI.
  A blocked viewer gets the same response shape as "nothing there" (a
  blocked `resolve_tag` returns `disabled`; a blocked send returns the same
  bare ack as a stored one). Any new read or write path must ask: what does
  the blocked party see? The answer must be: exactly what a stranger sees.
- **Two tiers of profile data.** A profile field is either card tier — a
  column on `profiles`, readable by anyone holding the owner's tag and by
  every viewer `profiles_select` admits — or connections tier: a sibling
  table whose select policy admits the owner and accepted connections
  only, with no block in either direction. Never put a connections-tier
  field on `profiles`: RLS is per row, so the pending-request recipient
  and the blocker would read it.
  `.agents/skills/extend-profile/` is the recipe; `public.profile_links`
  (`20261014190000_profile_links.sql`, Profile → Links) is the shipped
  example of the connections tier.
- **Security-definer RPCs for multi-step writes.** Anything involving a
  check-then-write, two tables, or a privacy-sensitive branch is a
  `security definer` function (`set search_path = ''`, `private.lock_pair`
  for pair races, explicit grants) — `claim_tag`, `send_connect_request`,
  and `accept_connect_request` are the models. Plain table policies are for
  single-row owner CRUD only.
- **Tests are the spec.** Every safety property above exists twice: once in
  SQL, once as a test that fails if it regresses. A migration that changes
  a policy without a test asserting the new boundary is half a change. When
  behavior is ambiguous, the test files are the authority — read them
  before the implementation.

## The verification gate

A slice is done when, from the repo root (local stack up via
`bun run db:start`, then `bun run db:reset && bun run db:seed`):

```sh
bun run lint        # oxlint --deny-warnings: zero findings
bun run typecheck   # every workspace typecheck passes
bun run test        # contract + db (RLS) + nfc-sdk suites, all green
```

and the e2e harness you extended passes: `cd apps/api && bun run dev`
(separate shell), then `bun run e2e`; for web flows, `cd apps/web &&
bun run test:e2e`. The db suite and both e2e harnesses need the
local service-role key exported in the shell (the seed finds it itself)
([the one line](local-development.md#the-service-role-key)). The RLS
suite also leaves its test users and their gatherings in the local
database: before a visual check in the app, `bun run db:reset && bun run
db:seed` again.
