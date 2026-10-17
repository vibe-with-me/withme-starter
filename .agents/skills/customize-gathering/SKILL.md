---
name: customize-gathering
description: Use when a withme-starter fork wants its gathering to speak the vertical's language — rename the user-facing nouns (round, tailgate, table, meetup), add fields (course, venue, capacity), or adjust the create form — without touching the safety semantics that ship in core.
---

# customize-gathering — make the core gathering yours

The gathering ships in the starter: a host creates one, everyone signed in
to the domain sees it in the Events tab ("Happening": title, time, place, a
headcount), and a tap on a member's tag is still the invitation. Who's
going is connections-only: a member list carries the viewer's own row and
their accepted connections' rows, never a stranger's card. It was the one
feature every derivation built by hand (golf-with-me "rounds" first; every
vertical since wants the same entity), so it is core code now and this
skill customizes it instead of building it.

Two kinds of change are yours: **nouns** (what users read, and the URLs they
see) and **fields** (what a gathering records). Internal identifiers — table
names, contract keys, types, policy names, the `gathering` destination type —
stay `gathering`, the same rule make-it-yours applies to `@withme/*`
packages. Safety semantics are NOT yours to redesign; §3 lists what must not
move.

**REQUIRED BACKGROUND:** `docs/the-slice.md`. Fields follow the slice in
order (contract → migration → tests → API → web → mobile → e2e).

## What is in core (the map)

| Layer | Files |
| --- | --- |
| Contract | `packages/contract/src/schemas/gathering.ts`; `schemas/destination.ts` (`GatheringDestinationSchema`); `contract/app.ts` (`gatherings.*`, `tags.*`); `contract/public.ts` (`gathering` summary on resolve) |
| Migration | `supabase/migrations/20261008120000_add_gatherings.sql`, then `20261014220000_gatherings_domain_wide.sql` (the listing, the connections-only member policy, the headcount, the symmetric join check) |
| RLS tests | `packages/db/test/gatherings.test.ts` (26); `account.test.ts`, `blocks.test.ts`, `links.test.ts` and `plain-text.test.ts` also create gatherings |
| Queries / API | `packages/db/src/queries/gatherings.ts`, `queries/tags.ts`; `apps/api/src/routers/app.ts` |
| SDK mirror | `packages/nfc-sdk/src/client.ts` (`Destination`, `GatheringSummary`) |
| Web | `apps/web/src/routes/_app.gatherings.tsx`, `_app.gatherings_.$id.tsx`, the branch in `t.$uid.tsx`, `lib/format-time.ts`, `lib/my-tags.ts`, `lib/going.ts` ("N going", "With …"), `components/AppShell.tsx` (`navItems[0]`) |
| Mobile | `apps/mobile/app/(tabs)/gatherings.tsx`, `app/gathering/[id].tsx`, the branch in `app/t/[uid].tsx`, `lib/format-time.ts`, `lib/my-tags.ts`, `lib/going.ts`, `lib/gathering-link.ts`, `(tabs)/_layout.tsx` |
| E2E | `apps/api/e2e/handshake.e2e.ts` §12–17; `apps/web/e2e/gatherings.spec.ts`; `profile.spec.ts` and `helpers.ts` also visit or create one |
| Seed | `supabase/seed/index.ts` (Ada hosts one, her live tag points at it; Lin hosts one Ada has not joined, so the feed shows) |

Every caller of the create RPC, whichever layer it sits in (a new
argument must reach all of them):

```sh
grep -rn --exclude-dir={node_modules,dist,.turbo,.expo,.wrangler} \
  'create_gathering\|gatherings\.create' packages apps supabase/seed
```

In core that prints six db test files (`gatherings.test.ts`: five calls
plus the anon test's expected message; `account.test.ts` and
`plain-text.test.ts`: two calls each; one in `blocks.test.ts` and in
`links.test.ts`; and `grants.test.ts`, whose hit is the function's name in
a list, not a call), the API handler, both create screens, the API e2e
(§12 and §17), the seed, and the generated
`packages/db/src/types/supabase.ts` (rewritten by `db:types`). Every call
among them fails with `PGRST202` until it passes a new required argument.

## 1. Nouns

Decide the singular/plural ("round"/"rounds"), the tab label (the starter
says "Events"), and the URL segment (`/rounds`).

**Copy.** The user-facing word is "gathering" everywhere except the tab
label. Sweep with
`grep -rn -i 'gathering' apps/web/src apps/web/e2e apps/mobile/app apps/mobile/components apps/mobile/lib --include='*.tsx' --include='*.ts' | grep -v routeTree.gen.ts`
and replace only inside string literals and JSX text — never identifiers
(`api.app.gatherings`, `GatheringSchema`, the `'/gathering/[id]'` pathname
are code). Most hits are identifiers and comments; the copy is in the
routes, the components, and both apps' `lib/my-tags.ts` (the Profile
tab's My tags lines, e.g. "A tap invites people to a gathering.").
The tab label lives in `AppShell.tsx` (`label: 'Events'`) and
`(tabs)/_layout.tsx` (`title: 'Events'`); page titles are each route's
`head()` (the list's is `'Events — <wordmark>'`, `'Events — withme'`
before make-it-yours; the detail's `'Gathering — <wordmark>'`). The
Playwright files select by copy, including the tab label, so update their
strings in the same sweep: every file under `apps/web/e2e`, the shared
`helpers.ts` included, not only `shell.spec.ts` and `gatherings.spec.ts`
(`profile.spec.ts` clicks "Create gathering").
`grep -rn 'Events' apps/web/src apps/web/e2e apps/mobile/app` lists every
use of the tab label.

**URLs (optional).** To make `/rounds` the path:
- Web: `git mv` `_app.gatherings.tsx` → `_app.rounds.tsx` and
  `_app.gatherings_.$id.tsx` → `_app.rounds_.$id.tsx`; change the
  `createFileRoute('/_app/gatherings…')` ids, every `to="/gatherings…"`
  (`AppShell.tsx`, `index.tsx`, `login.tsx`, `auth.callback.tsx`,
  `t.$uid.tsx`, the list's row link, the detail's leave/delete
  navigations), the `startsWith('/gatherings/')` check behind the login
  page's invitation line, the `NavItem.to` union, and every URL in the
  Playwright files — `grep -rn '/gatherings' apps/web/e2e` (the
  `shell.spec.ts` and `gatherings.spec.ts` assertions, `profile.spec.ts`'s
  `goto`, and the `waitForURL` in `helpers.ts`'s `signUpWithProfile`,
  which other specs share);
  then `cd apps/web && bunx vite build` regenerates `routeTree.gen.ts`.
- Mobile: rename `(tabs)/gatherings.tsx` → `(tabs)/rounds.tsx` and
  `gathering/[id].tsx` → `round/[id].tsx` (`git mv` does not create the
  folder: `mkdir -p apps/mobile/app/round` first, then
  `rmdir apps/mobile/app/gathering`, which the move leaves empty, after);
  update the `Tabs.Screen` name,
  the root `Stack.Screen` name, and every `pathname` / `href` /
  `dismissTo('/gatherings')` / `redirect` string (`index.tsx`, `login.tsx`,
  `(tabs)/merch.tsx`, `t/[uid].tsx`, the detail, and the renamed list
  screen itself, whose rows `router.push({ pathname: '/gathering/[id]' })`), the
  `startsWith('/gathering/')` check behind the login screen's invitation
  line, and the `/gathering/` prefix that `gatheringHref` in
  `lib/gathering-link.ts` builds for redirects, and the same prefix in its
  test, `lib/gathering-link.test.ts`, which asserts `/gathering/…` hrefs
  (`bun run test` fails on it until it says `/round/…`).
- Docs: `docs/the-slice.md` cites the detail files as the idioms to copy
  (web `_app.gatherings_.$id.tsx`, "the real one"; mobile
  `gathering/[id].tsx`, among the stack screens). Point both at the
  renamed files (`_app.rounds_.$id.tsx`, `round/[id].tsx`) so the fork's
  slice names files that exist:
  `grep -n 'gatherings_\|gathering/\[id\]' docs/the-slice.md` lists them.
- Links already shared. The rename moves `/gatherings/<id>` with no
  redirect, which is fine before launch (tags encode `/t/<uid>`, never a
  gathering URL). A fork with live users keeps the old links working: a
  `/gatherings/$id` route on web that redirects to `/rounds/$id`, and on
  mobile a `gathering/[id].tsx` that `<Redirect>`s to `round/[id]`.

**Copy the sweep cannot catch.** Some starter copy is vertical-specific
without containing "gathering"; rewrite it for your vertical too:
- the create form's title placeholder, `"e.g. Rooftop listening session"`,
  in `apps/web/src/routes/_app.gatherings.tsx` and
  `apps/mobile/app/(tabs)/gatherings.tsx` (or the files you renamed);
- the form labels, in the create form and in the detail's `EditForm`
  (`_app.gatherings_.$id.tsx`, mobile `gathering/[id].tsx`): the title
  label `Title`; the start label, one `Starts` field on web, two fields
  `Date` and `Time` on mobile; `Location (optional)`, and the location
  placeholder `"Where to find it"` (create forms only);
- the members heading `Who's going` and the hint under it on the detail
  screen (web `_app.gatherings_.$id.tsx`, mobile `gathering/[id].tsx`),
  the `Happening` / `Yours` section titles and their empty states on the
  list, the `Hosting` / `Going` marks, and the `N going` / `With …` lines
  (`lib/going.ts` on both platforms);
- the seed's gathering, in `supabase/seed/index.ts`: its `p_title`
  (`'Rooftop listening session'`), its `p_location`
  (`'The roof, 14 Loom St'`), and the console text it prints
  ("hosts a gathering Lin joined", "inviting you to her gathering"). §2
  step 2 edits the same `create_gathering` call when a field is added,
  so the title and location can change there in the same edit.

A relabel can make a Playwright selector ambiguous: `getByLabel` matches
a case-insensitive substring, so a title labelled "Round name" also
matches the profile step's `getByLabel('Name')`, and during a route
transition the fill can land in the wrong field (a disabled Save, a
timeout). After relabelling, `grep -rn "getByLabel(" apps/web/e2e` and
give every selector that could now match two fields `{ exact: true }`
(e.g. `getByLabel('Name', { exact: true })`), the shared `helpers.ts`
included. The specs also fill fields by their old labels, so for every
label you changed, `grep -rn "getByLabel('<old label>'" apps/web/e2e` and
update what it prints (`gatherings.spec.ts` fills
`getByLabel('Location (optional)')`; a missed one times the spec out
waiting for a field that no longer exists).

The API's REST paths (`/gatherings…` in `packages/contract/src/contract/app.ts`)
are internal identifiers: leave them.

The `/t/<uid>` resolver URL and the `gathering` destination type do not
change: tags already in the field keep working.

**Checkpoint:** `bun run lint && bun run typecheck`, then
`bun run db:reset && bun run db:seed` (the local stack's state is
otherwise unknown, and the Playwright specs sign in as the seeded users),
then `cd apps/web && bunx playwright test` in a shell with
`SUPABASE_SERVICE_ROLE_KEY` exported (`docs/local-development.md#the-service-role-key`;
without it Playwright stops before running a spec).

## 2. Fields

Worked example: a required `course_name` (the golf fork) — the host fills it
in, rows and the detail header show it, and the resolver summary carries it.
In slice order:

1. **Contract.** `schemas/gathering.ts`: add it to `GatheringSchema`,
   `CreateGatheringInputSchema`, `UpdateGatheringInputSchema` (optional
   there, and in its `.refine`, which requires at least one field to
   update), and — only if a tapper should see it before joining — to
   `GatheringSummarySchema`'s `pick`. "Required" binds the inputs, not
   the outputs: the inputs take
   `z.string().trim().min(1).max(120).refine(plain, PLAIN_TEXT_MESSAGE)`
   (`.optional()` on the update), while `GatheringSchema` takes
   `z.string().max(120).refine(plain, PLAIN_TEXT_MESSAGE)` with no `min`.
   The refine is the plain-text rule every gathering text field carries
   (`title` and `location` already do; `plain` is defined at the top of
   the file): it refuses control, bidi and invisible characters, and step
   2's CHECK refuses the same set in SQL. No `min` on the output, because the migration's
   `default ''` (step 2) gives every row that predates the column `''`,
   and the API validates what it returns against `GatheringSchema`.
   Screens show nothing for `''`.
   In `packages/contract/test/schemas.test.ts`, add a negative case
   (missing, blank, oversized, and a spoofing character such as
   `'Ad\u202Ea'`, as the existing "a title or location refuses control,
   bidi and invisible characters" test does), and add the field to the existing
   fixtures and expectations that build a whole gathering, a summary, or a
   create input — a required key breaks them. `grep -n starts_at
   packages/contract/test/schemas.test.ts` finds them (in core: the
   resolve output's `gathering`, the `gathering` fixture, the summary-keys
   list, and the create-trim `toEqual`).
   The summary crosses the anonymous resolve boundary: never put private
   data in it.
2. **Migration (additive).** New file:
   ```sql
   alter table public.gatherings
     add column course_name text not null default ''
       check (char_length(course_name) <= 120),
     add constraint gatherings_course_name_plain
       check (private.is_plain_text(course_name));
   ```
   The second CHECK is the plain-text rule `title` and `location` carry
   (`20261015140100_link_and_text_validation.sql`), so a direct PostgREST
   write cannot store what step 1's refine refuses.
   Keep the default: it lets existing rows pass, `create_gathering`
   always supplies the value, and the contract requires it on every
   create (step 1). An update may omit it (the update schema is
   optional); the edit form sends it anyway, because the field is on
   the form. Then rebuild `public.create_gathering`. The signature
   changes, and `create or replace function` cannot change one: run
   `drop function public.create_gathering(text, timestamptz, text);`
   then
   `create function public.create_gathering(p_title text, p_starts_at timestamptz, p_course_name text, p_location text default null)`
   with `p_course_name` BEFORE `p_location` (Postgres refuses a required
   parameter after a defaulted one). Copy the whole body of its **newest**
   definition,
   `grep -lE 'create (or replace )?function public\.create_gathering' supabase/migrations/*.sql | sort | tail -1`,
   not the gatherings migration's: in core the newest is
   `20261016120000_abuse_limits_and_erasure.sql`, whose body holds the
   per-host limits (the `gathering_create_attempts` ledger, 5 creations an
   hour, 20 upcoming at once). The older body has neither, and copying it
   drops both without a word. Restate every attribute:
   `returns jsonb language plpgsql volatile security definer set search_path = ''`.
   The contract's `min(1)` does not bind the RPC: anyone signed in can
   call it over PostgREST with the publishable key, as the limit tests do.
   So after the profile check, refuse a blank value in the body:
   ```sql
   if coalesce(p_course_name, '') !~ '[^ \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]' then
     raise exception 'course name required' using errcode = '22023';
   end if;
   ```
   The class is the whitespace the contract's `.trim()` removes that the
   plain-text CHECK does not already refuse; `btrim` alone strips only
   ASCII spaces, so a value of one no-break space would pass it. (Not a
   CHECK: the rows that predate the column hold `''`, and a CHECK would
   refuse any later edit to them.)
   Insert the column (`trim(p_course_name)`, as the body trims the title),
   add it to the `jsonb_build_object` the function
   returns (the API validates that object against `GatheringSchema`), and
   re-issue the grants for the new signature:
   `revoke execute on function public.create_gathering(text, timestamptz, text, text) from public, anon;`
   `grant execute on function public.create_gathering(text, timestamptz, text, text) to authenticated;`.
   Core's default privileges (`20261015140000_default_function_privileges.sql`)
   already keep a new function closed to `anon` and `public`, so the revoke
   is belt and braces; keep it, so the grant says who may call the function
   even on a database whose defaults differ. The body's
   `'authentication required'` check stays as the second gate.
   If the summary carries the field, also
   `create or replace function public.resolve_tag(p_uid text) returns jsonb`
   (copy the whole body of its **newest** definition,
   `grep -lE 'create (or replace )?function public\.resolve_tag' supabase/migrations/*.sql | sort | tail -1`,
   not the gatherings migration's: the older bodies emit `avatar_url`, a
   column the avatars migration dropped, and miss any card field a later
   migration added, such as extend-profile's. Add the field to
   `v_gathering_json`, and restate every attribute:
   `language plpgsql stable security definer set search_path = ''`; the
   same signature keeps its existing grants). Re-issue the whole host column grant:
   `grant update (title, starts_at, location, course_name) on public.gatherings to authenticated;`.
   Before seeding, give the seed the new argument:
   `supabase/seed/index.ts` calls `create_gathering` by named arguments,
   so add `p_course_name: '…'` there now (without it the seed fails with
   `PGRST202 Could not find the function public.create_gathering(…)`).
   Then `bun run db:reset && bun run db:seed && bun run db:types` and commit
   `packages/db/src/types/supabase.ts`. `db:types` pipes the generator
   through the repo's pinned prettier, so the file keeps one format
   whatever the CLI emits (2.120.0 emits it unformatted and prints
   "Generated TypeScript is unformatted"), and a new column is a small
   diff that merges cleanly with the starter's later changes. Check that
   what changed is the new column (`Row`/`Insert`/`Update`) and the new
   `p_` argument (`grep -n course_name` on the file). A newer generator
   may also add something to every table alike: harmless.
3. **Tests.** Every db test that calls the RPC passes the new argument —
   the caller grep under the map lists them, and every one answers
   `PGRST202` until it does (PostgREST resolves a function by its named
   arguments). In core: `gatherings.test.ts`'s `createGathering()` helper
   and its other direct calls, the anon call in 'anon can neither create
   nor join' included; `account.test.ts`'s two calls;
   `plain-text.test.ts`'s two; and one each in `blocks.test.ts` and
   `links.test.ts`. The anon test already asserts the grant's refusal
   (`permission denied for function create_gathering`), which step 2's
   re-issued revoke keeps: pass it the new argument and nothing else
   changes. A field with a CHECK gets a rejected-at-the-boundary case
   (create and host edit, with a positive control). For the worked
   example, in `gatherings.test.ts`: a blank `p_course_name` (`''`,
   `'   '` and `'\u00A0'`) answers `22023`, 121 characters answers `23514`, and 120 is
   created; and in `plain-text.test.ts`, the spoof loop covers the new
   column too, on create (`{ p_title: 'Tee time', p_starts_at: tomorrow(), p_course_name: value }`
   answers `23514`) and on edit (`{ course_name: value }`). Adding an
   assertion for the new field to an existing test (e.g. the anonymous
   resolve summary) is fine. Beyond the new argument, the existing tests
   pass untouched — if one does not, you moved a safety mechanism.
4. **Queries / API.** `queries/gatherings.ts` (`GatheringPatch`);
   `routers/app.ts` (`gatheringsCreate` passes the new `p_` argument).
   The two detail screens each declare their own local
   `interface GatheringPatch` (web `_app.gatherings_.$id.tsx`, mobile
   `gathering/[id].tsx`, or the files you renamed in §1); step 6 adds the
   field to both.
5. **SDK.** If the summary changed, mirror it in
   `packages/nfc-sdk/src/client.ts` `GatheringSummary`.
   `bun run --cwd packages/nfc-sdk typecheck` fails until you do; the vitest
   run would not catch it (type-level assertions).
6. **Screens.** Web: a `field` in the create form and `EditForm`, the row
   `sub` line, the detail header; the resolver line comes from
   `gatheringLine()` in `lib/format-time.ts`. Mobile mirrors in
   `(tabs)/gatherings.tsx`, `gathering/[id].tsx` (or the files you renamed
   in §1), `lib/format-time.ts`. The display lines are composed in both
   apps' `lib/format-time.ts`: rows and the detail
   header call `whenAndWhere()` ("when · where"), and the resolver card
   calls `gatheringLine()` ("Title · when · where"). Join the field there,
   not in each screen. For the worked example: add
   `courseWhenAndWhere(g)` =
   `[g.course_name, whenAndWhere(g)].filter(Boolean).join(' · ')`
   ("Course · when · where"; `''` shows nothing), call it from the rows
   and the detail header, and have `gatheringLine()` use it, so the tag
   card reads "Title · Course · when · where".
   The join preview ("Join this gathering?") does not fetch the gathering:
   it shows display-only hints, `title` and `starts_at`, that the tag
   screen passes along. Web: `t.$uid.tsx`'s Join `Link` `search`, read by
   the detail route's `Hints` / `validateSearch`. Mobile: `GatheringHints`
   and `gatheringHref()` in `lib/gathering-link.ts`, read by the detail
   screen's `useLocalSearchParams` and passed again on its redirect. If a
   tapper should see the field before joining, add it to those hints and
   to the preview's hint line on both platforms.
7. **E2E.** `apps/api/e2e/handshake.e2e.ts`: every
   `gatherings.create` the caller grep lists (§12 and §17 in core) passes
   the field, and §12 asserts it on the created gathering and on the
   anonymous summary. In `apps/web/e2e`, a required field needs a fill in
   every Playwright step that creates a gathering, or the create fails:
   a grep for the title field's label, or the label you gave it in §1
   (`grep -rn "getByLabel('Title')" apps/web/e2e` in core), finds them
   (`gatherings.spec.ts` and `profile.spec.ts` in core). The seed was
   done in step 2, and that edit can carry §1's new seed title too.

Now run the root `bun run typecheck`, not only the packages': the API e2e
imports the built `@vibewithme/nfc/client`, and the root task's `^build`
rebuilds it (until then the e2e sees the old `GatheringSummary`). Run
earlier, it is red in the expected places: the mobile create screen until
step 6, and `handshake.e2e.ts` until step 7.

Then the verification gate from `docs/the-slice.md`.

## 3. What must not move

The mechanisms of `20261014220000_gatherings_domain_wide.sql`, each
re-stated by `gatherings.test.ts`:

a. `gatherings_select` admits every signed-in user of the tenant, minus a
   block **either way** with the host. A viewer the host blocked, and a
   viewer who blocked the host, read the gathering as nonexistent. Never
   add a clause that reads `gathering_members` here: `gathering_members`'s
   own policy reads `gatherings`, and Postgres would recurse forever.
b. `gathering_members_select` admits the viewer's own row and their
   accepted connections' rows, on a gathering the viewer can see — the
   host included. Co-membership never reveals a card: `profiles_select` has no gathering
   clause (it reads `private.sees_card` since
   `20261015120000_block_reveals_only_known_cards.sql`), and there is no
   `shares_gathering`.
   Hosting must not become a way to collect strangers' cards.
c. `public.gathering_member_counts` is the headcount: a definer read whose
   `where` re-states (a), so a hidden gathering has no count. Any new
   definer read over `gathering_members` restates (a) the same way.
d. `join_gathering` raises `'gathering not found'` (P0003) for a missing
   id, a viewer the host blocked, AND a viewer who blocked the host (a
   gathering you cannot see is one you cannot join); the messages stay
   byte-identical. No insert policies: creation and joining are RPCs.
   `private.on_block_created` evicts the pair-hosted membership in both
   directions.

Also: `resolve_tag` degrades a dangling destination, or one whose tag owner
is no longer a member, to the profile card, and so does a tap by a viewer
the host has blocked, whoever owns the tag (`private.is_gathering_member`
serves the resolver; keep it); the `tags_destination_shape` CHECK keeps
its `coalesce(…, false)`; `list` and `listMine` stay bare RLS-scoped
selects in start-time order — no search, ranking, "nearby", or any list
of people, ever; a host cannot leave their own gathering
(`gathering_members_delete_own` excludes the host's row; deleting the
gathering is how a host leaves). A new field that changes who may see what
needs its own RLS test before it ships.

A listed gathering exposes its `host_id` to the tenant. That is not a
card; what it allows is one consent-gated `send_connect_request`. If your
vertical wants private gatherings, add a `visibility` column
(`'listed' | 'invite_only'`, default `'listed'`), one `or visibility =
'listed'` clause beside the host test in (a) and (c), and an RLS test that
a stranger does not read an invite-only one.

## Scope notes

- Membership is flat: no roles beyond host, no invites, no capacity caps.
  Add those in your fork with the same discipline (every new read path asks:
  what does the blocked party see?).
- "Happening" is the domain in start-time order. Nearby sorting would need
  a location model the starter does not have (location is free text); a
  fork that adds one keeps the list a bare select — nothing ranks.
- Date entry on mobile is two plain fields (`Date`, `Time`) by design — no
  picker dependency. Swap in `@react-native-community/datetimepicker` if the
  vertical wants one; `parseLocalDateTime` in `lib/format-time.ts` is the
  one seam.
