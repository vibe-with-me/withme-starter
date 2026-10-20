---
name: extend-profile
description: Use when a withme-starter fork needs profile fields of its own (a team, a club, a handicap on the card, a detail only connections may read), or wants signed-in users to finish their profile before they can use the app.
---

# extend-profile — vertical fields, in two visibility tiers

Every derivation extends the profile (golf-with-me: handicap and home club;
a tailgate vertical wants team and signature dish). Most put every field on
the card. Some also want a second kind of field that only people you
accepted may read. That second tier is the part a fork gets wrong alone, so
it was built for real, RLS tests first, before this was written down.

**REQUIRED BACKGROUND:** `docs/the-slice.md`. Both tiers follow the slice
(contract → RLS tests → migration → API → web → mobile → e2e), with one
deliberate swap: the RLS tests come before the migration, so the boundary
is written down before the policy that enforces it. The safety discipline
there binds every step here.

**Checkpoints.** Every step ends with one: run its command and read the
output before you call the step done (`docs/the-slice.md` → Checkpoints).
Never edit, skip or loosen a test to make a checkpoint pass; a failing
checkpoint means the step is not done. When one fails, follow "When a
checkpoint fails" in the same section: root cause first, one change at a
time, and after two failed attempts stop and tell the owner.

Files beside this one:

- `.agents/skills/extend-profile/reference.md`: every long code block the
  steps name (schemas, tests, migration, queries, handlers, forms, seed,
  e2e), in the worked example's names.
- `.agents/skills/extend-profile/variants.md`: card only, connections
  only, no required field, a field with a format rule, a typed field.
  Read the ones that fit before §1.

## Pick a tier for every field, first

| | Card tier | Connections tier |
| --- | --- | --- |
| Who reads it | anyone holding your tag (anonymous resolve), the recipient of your pending request, someone who blocked you, your connections | you, and your accepted connections while neither has blocked the other |
| Where it lives | a column on `public.profiles` | `public.profile_details`, one row per profile |
| Examples | team, home club, handicap, role | shirt size, dietary note, postcode |

A field that must not reach a stranger holding your tag is connections
tier. A field nobody else should read is neither: do not collect it.

**Check Links first.** The starter already ships one connections-tier
table: `public.profile_links` (Profile → Links), one row per platform from
the registry in `packages/contract/src/schemas/link.ts` (Instagram,
WhatsApp, a phone number, an email, a website, and more). A handle on a
service, or a way to reach someone, belongs there: add the platform to
`LINK_PLATFORMS` and to `private.is_link_value` in a new migration, and
skip this skill's connections tier. Use `profile_details` for what is not
a link.

**Why the connections tier is not a column on `profiles`.** RLS decides
rows, not columns: every viewer `profiles_select` admits reads every column
of the row. A `contact_handle` column on `profiles` was readable, through
PostgREST with the publishable key, by the recipient of a pending request
and by someone who had blocked the owner. No edit to `profiles_select`
closes that without taking away the card those viewers are meant to see.
`profiles_select` stays byte-identical (customize-gathering §3b); the
connections tier gets its own table and its own, narrower policy.

**The worked example:** a card-tier `affiliation` ("Riverside GC",
"Chiefs", "Acme Corp"; 1–80 chars; required for completion) and a
connections-tier `contact_handle` (1–120 chars; optional). Rename both to
your vertical's words before you start and keep the shapes.

## The map

| Layer | Card tier | Connections tier |
| --- | --- | --- |
| Contract | `packages/contract/src/schemas/profile.ts` (`ProfileSchema`, `PublicProfileSchema`, `UpdateProfileInputSchema`) | `schemas/profile.ts` (`ProfileDetailsSchema`), `schemas/connection.ts` (`ConnectionSchema.details`), `contract/app.ts` (`profile.get` / `profile.update` outputs) |
| SQL | `public.profiles`; every function that builds a card (§3 finds them) | `public.profile_details` and its policies; `accept_connect_request` |
| RLS tests | `packages/db/test/profile-fields.test.ts` (both tiers) | same, plus `enumeration.test.ts`, `cascade.test.ts`, `account.test.ts` |
| Queries | `CARD_COLUMNS`, `ProfileCard`, `upsertOwnProfile`, and `listBlocks`' stand-in card in `packages/db/src/queries/handshake.ts` (asserted in `packages/db/test/blocks.test.ts`) | `DETAILS_COLUMNS`, `getOwnDetails`, `upsertOwnDetails`, `listConnections` (same file) |
| API | `apps/api/src/routers/app.ts`: `getProfile`, `updateProfile` | same; `acceptRequest` and `connectionsList` pass it through |
| SDK | `PublicProfileCard` in `packages/nfc-sdk/src/client.ts` | never |
| Web (`apps/web/src/`) | `components/ProfileCard.tsx`, `lib/card-line.ts`, `routes/_app.profile.tsx`, `routes/claim.$uid.tsx` | `routes/_app.profile.tsx`, `routes/_app.connections.tsx` (its local `PersonRow`) |
| Mobile (`apps/mobile/`) | `app/t/[uid].tsx`, `lib/card-line.ts`, `app/(tabs)/profile.tsx`, `app/claim/[uid].tsx` | `app/(tabs)/profile.tsx`, `app/(tabs)/connections.tsx`, `PersonRow` in `components/ui.tsx` |
| Gate | `isProfileComplete` (contract) → `shellGate` (contract) in web `routes/_app.tsx` (`ShellRoute`), mobile `app/(tabs)/_layout.tsx` | — |
| Seed / e2e | `supabase/seed/index.ts`; `apps/api/e2e/handshake.e2e.ts`; every profile-creating step in `apps/web/e2e/` (§8 finds them) | same seed block and API e2e; `apps/web/e2e/handshake.spec.ts` |

Outside the tabs, mobile `gathering/[id].tsx` (join) and `t/[uid].tsx`
(connect) and web `t.$uid.tsx` (connect) check only `!profile` before
acting: the gate is for entering the shell, and an incomplete profile is
still a valid card. Leave them as they are. The claim pages ask for the
required fields themselves (§6, §7). (After customize-gathering's URL
step, `gathering/[id].tsx` and `gatherings.spec.ts` carry your vertical's
word instead.)

## 1. Contract

Before you edit, record the baseline: `cd packages/contract && bun test`
is green in the starter. Then:

- `packages/contract/src/schemas/profile.ts`, above `ProfileSchema`: add
  `CardLineSchema` and `ProfileDetailsSchema` (reference.md → §1 Contract
  schemas). `isPlainText` and `PLAIN_TEXT_MESSAGE` are already imported
  there, for `display_name` and `bio`; the SQL twin is
  `private.is_plain_text` (§3). Every free-text field a person can set
  carries both, so a direct PostgREST write cannot store a name or a line
  that reads as someone else's.
- `ProfileSchema` (the owner's own row): add
  `affiliation: CardLineSchema.nullable()`.
- `PublicProfileSchema`'s `pick`: add `affiliation: true`. Nothing from
  `ProfileDetailsSchema` ever joins this pick.
- `UpdateProfileInputSchema`: add
  `affiliation: CardLineSchema.nullable().optional()` and
  `details: ProfileDetailsSchema.optional()`. Its doc comment opens "Name
  and bio."; make it "Name, bio, and the vertical fields (the card tier's
  columns; `details`, the connections tier)."
- After the `Profile` type: `REQUIRED_PROFILE_FIELDS` and
  `isProfileComplete` (reference.md, same section). A string counts once
  it is not blank; any other type counts once it is set.
- `packages/contract/src/schemas/connection.ts` (import
  `ProfileDetailsSchema` from `./profile.ts`): `ConnectionSchema` gains
  `details: ProfileDetailsSchema.nullable()`, the one place the other
  person's details travel. It is `null` when they have no
  `profile_details` row and `{ contact_handle: null }` when their row
  holds no handle; clients read `details?.contact_handle`, so the two
  look the same.
- `packages/contract/src/contract/app.ts` (import `ProfileDetailsSchema`
  from `../schemas/profile.ts`): `getProfile`'s output becomes
  `z.object({ profile: ProfileSchema.nullable(), details: ProfileDetailsSchema.nullable() })`,
  and `updateProfile`'s becomes
  `z.object({ profile: ProfileSchema, details: ProfileDetailsSchema.nullable() })`.

Now rerun `bun test`. It is red, and the failures are exactly the tests
that parse a profile card fixture or a connection: the new keys are
required-nullable, so every existing fixture fails without them. That is the key doing its job.
In `packages/contract/test/schemas.test.ts`:

- add `affiliation: null` to every profile-card fixture the failing tests
  parse (`grep -n "display_name:" packages/contract/test/schemas.test.ts`
  lists the candidates);
- in "a connection always carries links, and the card never does", the
  positive case parses a connection, which now requires `details` too:
  make it `{ ...connection, links: [], details: null }`. The assertion is
  unchanged; the fixture gains the new key;
- add `'affiliation'` to the expected keys in "exposes only card-safe
  fields", in its alphabetical place (the test sorts with `.toSorted()`):
  `['affiliation', 'avatar_path', 'bio', 'display_name', 'id']`;
- append the `profile tiers` describe (reference.md → §1 Contract tests),
  and add `isProfileComplete` and `type Profile` to the file's import
  from `'../src/index.ts'` (it already imports `ConnectionSchema`).

**Checkpoint:** `cd packages/contract && bun test` prints `0 fail`, and
its pass count is the baseline plus the tests you appended.

## 2. RLS tests, red first

- New file `packages/db/test/profile-fields.test.ts`: reference.md →
  §2 `packages/db/test/profile-fields.test.ts`. Its last paragraph says
  what the block test proves; keep the policy's `is_blocked` clauses it
  explains.
- Grow three existing files, `enumeration.test.ts`, `cascade.test.ts` and
  `account.test.ts`, as reference.md → "§2 Additions to existing db
  tests" says. Every addition checks `error`: a `data ?? []` assertion
  passes against a table that does not exist, which is a false red-phase
  green. Keep both deletion paths, and change nothing in
  `delete_my_account` or either client's `DELETE_COPY`.

With the local stack up (`bun run db:start`), run `bun run db:reset`.

**Checkpoint (red):** `cd packages/db && bun test`. The failing tests are
exactly: every test in `profile-fields.test.ts`, the cascade test, the
first `delete_my_account` test in `account.test.ts`, and the enumeration
test "anon cannot select any rows from any handshake table". Each fails
on the missing table or column, which PostgREST reports from its schema
cache:

- a missing table is `PGRST205` "Could not find the table
  'public.profile_details' in the schema cache";
- a missing column is `PGRST204` "Could not find the 'affiliation' column
  of 'profiles' in the schema cache" (the card-tier length test shows it
  as a message that does not contain `profiles_affiliation_length`).

Not Postgres's `42P01` / `42703`: the request never reaches the database.
A failure on a data assertion instead (`Received: undefined`, say) means a
write upstream went unchecked: check its `error`. A new test that passes
now asserts nothing: fix it before going on. Typecheck may be red for
`@withme/db`, `@withme/api` and `@vibewithme/nfc` until §3–§5.

## 3. Migration — both tiers, one additive file

New file `supabase/migrations/<timestamp>_extend_profile.sql`. Its
timestamp must sort after the newest existing migration, which
`ls supabase/migrations | tail -1` prints. Start from
`date -u +%Y%m%d%H%M%S`, but the starter stamps migrations by hand and
some sit later in the day than the clock: when the clock's value does not
sort after the newest file, use the newest file's timestamp plus one
minute (`20261017200000` → `20261017200100`).

1. The card column, the `profile_details` table, its trigger, grants and
   policies: reference.md → §3 Migration, verbatim apart from your
   names.
2. **Every function that builds a card** gets the card tier. Find them:

   ```sh
   grep -nE "create (or replace )?function public\.|'display_name', v_[a-z_]+\.display_name" \
     $(grep -lE "'display_name', v_[a-z_]+\.display_name" supabase/migrations/*.sql)
   ```

   Every `'display_name'` line belongs to the nearest
   `function public.…` line above it; those are the card builders. In the
   starter: `resolve_tag` and `accept_connect_request` (the card as
   `v_profile`), and `report_user`, whose `reports.snapshot` is the card
   as the reporter saw it (`v_target`), so a moderator reads what was on
   it. For each one, find its **newest** definition:

   ```sh
   grep -lE 'create (or replace )?function public\.<name>' supabase/migrations/*.sql | grep -v _extend_profile | sort | tail -1
   ```

   The grep decides, never a file name you remember: another skill
   (customize-gathering redefines `resolve_tag`) may have written a newer
   body. The `grep -v` matters when you redo this migration: it already
   defines these functions and would otherwise be its own newest.
3. Copy each newest definition whole to the end of this migration, as
   `create or replace function`, restating every attribute (`language
   plpgsql`, `stable` or `volatile`, `security definer`, `set search_path =
   ''`), under a comment naming its source (`-- Newest: <file>.`). Then:
   - in the `'profile', jsonb_build_object(…)` add
     `'affiliation', v_profile.affiliation`;
   - in `report_user`, in the `snapshot`'s `jsonb_build_object(…)` add
     `'affiliation', v_target.affiliation` (the card tier only: the
     snapshot never carries `profile_details`), and add
     `affiliation: null` to the exact snapshot in
     `packages/db/test/reports.test.ts` ("stores the report with a
     snapshot of the card", the `toEqual` that names `'Original bio'`);
   - in `accept_connect_request` only: declare `v_details jsonb := null;`,
     add after the `select * into v_profile …` line

     ```sql
       -- The pair is connected now (inserted above), so the requester's
       -- connections tier is the new connection's to read. No row: stays null.
       select jsonb_build_object('contact_handle', d.contact_handle) into v_details
         from public.profile_details d
        where d.profile_id = v_req.requester_id
          and d.tenant_id = v_req.tenant_id;
     ```

     (a definer function bypasses RLS, so it states the tenant seam
     itself), and add `'details', v_details` beside `'profile'` in the
     returned object. Keep its `'links'` key: `ConnectionSchema` requires
     it.
4. `resolve_tag` never reads `profile_details`. Same signatures keep their
   grants. Diff each copy against its source (save both bodies to scratch
   files and `diff` them): the only changes are the ones above. An older body silently undoes a
   later migration (an early `resolve_tag` still emits `avatar_url`, a
   column `avatars` dropped).

```sh
bun run db:reset && bun run db:seed && bun run db:types
```

**Checkpoint (green):** `db:reset` prints `Finished supabase db reset`
(some CLI versions add `on branch …`); `cd packages/db && bun test`
prints `0 fail`, every test §2 left red now passing;
`git diff packages/db/src/types/supabase.ts` shows `affiliation` and a
`profile_details` table with a one-to-one
`profile_details_profile_id_fkey` relationship (commit it).
`bunx turbo run typecheck --continue` is red only in `@withme/api`
(`src/routers/app.ts`) and `@vibewithme/nfc` (the `PublicProfileCard`
parity test); §4 and §5 close those. (Plain `bun run typecheck` stops at
the first failing package, so it cannot show which others are red.)

## 4. Queries and API

`packages/db/src/queries/handshake.ts`:

- `CARD_COLUMNS`: append `, affiliation`. `ProfileCard`: add
  `affiliation: string | null`. Gathering member lists and block lists use
  the same constant, so they carry the card tier with one exception:
  `listBlocks` builds a stand-in `ProfileCard` for a blocked person whose
  card the block hides (`display_name: BLOCKED_USER_NAME`). Add
  `affiliation: null` to it, and to the expected `user` in
  `packages/db/test/blocks.test.ts` (the `toEqual` that names
  `BLOCKED_USER_NAME`).
- `upsertOwnProfile`: add `affiliation?: string | null` to its patch type,
  and `affiliation: patch.affiliation ?? null` after `bio` in the
  first-create `.insert(…)`. The update path and the `23505` race retry
  send `patch` whole.
- The connections tier, right after `upsertOwnProfile`: `DETAILS_COLUMNS`,
  `ProfileDetails`, `getOwnDetails`, `upsertOwnDetails` (reference.md →
  §4 Queries). Never `.upsert()`: its doc comment says why.
- `listConnections`: embed `details` beside the links embed and lift it
  out; `ConnectionRow` gains `details: ProfileDetails | null` (same
  reference section).

`apps/api/src/routers/app.ts`: `getProfile` and `updateProfile` as in
reference.md → §4 API handlers. `acceptRequest`, `connectionsList` and the
photo endpoints need no change.

**Checkpoint:** `bunx turbo run typecheck --continue` shows `@withme/api`
and `@withme/db` passing, and only `@vibewithme/nfc` failing.

## 5. SDK mirror (card tier only)

`packages/nfc-sdk/src/client.ts`: `PublicProfileCard` gains
`affiliation: string | null;`. The connections tier never appears in the
SDK: nothing it resolves may carry it.

**Checkpoint:** `bun run --cwd packages/nfc-sdk typecheck` exits 0 with
no errors (it must be the typecheck: the parity assertions are
type-level).

## 6. Web

- `apps/web/src/components/ProfileCard.tsx`: `CardProfile` gains
  `affiliation: string | null`; under the name,
  `{profile.affiliation ? <p className="hint">{profile.affiliation}</p> : null}`.
- **The gate**, `apps/web/src/routes/_app.tsx`. Import
  `isProfileComplete` from `@withme/contract`. The loader returns the
  details too:

  ```ts
    loader: async () => {
      const { profile, details } = await asSignedInAccount(() => api.app.profile.get());
      return { profile, details };
    },
  ```

  and `ShellRoute` (the layout's component) passes the completion rule to
  the gate it already calls: `shellGate(profile, pathname)` becomes
  `shellGate(profile, pathname, isProfileComplete)`. Do not write your
  own `if` around it: `shellGate` (contract, `schemas/terms.ts`) orders
  the profile gate before the terms gate so an incomplete profile on old
  terms reaches `/terms`, then `/profile`, instead of bouncing between
  them (its tests in `packages/contract/test/reports-terms.test.ts`
  already cover a stricter completion rule). Keep the redirect in the
  component: the comment above
  `ShellRoute` explains why a `throw redirect` from the loader blanks the
  page. Make that comment's opening line say "without a complete profile
  (`isProfileComplete`)" and "create or finish one".
- `apps/web/src/routes/_app.profile.tsx`. Only `ProfilePage`'s read and
  `IdentityForm` change. `ProfilePage` reads
  `const { profile, details } = useLoaderData({ from: '/_app' });` and
  renders `<IdentityForm profile={profile} details={details} />`.
  `IdentityForm` takes `details: ProfileDetails | null` (import
  `isProfileComplete, type Profile, type ProfileDetails` from
  `@withme/contract`), and:
  - state: `const [affiliation, setAffiliation] = useState(profile?.affiliation ?? '');`
    and `const [contact, setContact] = useState(details?.contact_handle ?? '');`
  - the `api.app.profile.update` payload gains
    `affiliation: affiliation.trim() === '' ? null : affiliation.trim(),`
    and `details: { contact_handle: contact.trim() === '' ? null : contact.trim() },`.
    `details` is always sent, so the first save creates the row even with
    Contact empty; every reader goes through `details?.contact_handle`, so
    do not special-case the empty field. Keep the
    `await router.invalidate({ sync: true })` that follows the mutation:
    `shellGate` reads the refreshed `/_app` loader, and a save that
    completes the profile must reach it before `navigate`.
  - the `<h1>`:
    `{!profile ? 'Create your profile' : isProfileComplete(profile) ? 'Your profile' : 'Finish your profile'}`
  - Save's `disabled` gains `|| !affiliation.trim()` and keeps the
    terms agreement:
    `busy || !displayName.trim() || !affiliation.trim() || (creating && !agreed)`.
    The payload keeps its `...(creating ? { terms_version: TERMS_VERSION } : {})`.
  - the fields after Bio, before the `TermsCheckbox`: reference.md → §6
    Web profile fields (labels, ids and placeholders in your words).
- `apps/web/src/routes/claim.$uid.tsx`, the inline first-profile form:
  every place that creates a profile asks for the required fields. Add an
  `affiliation` state and the same Affiliation field after Name, add
  `affiliation: affiliation.trim()` to the update beside `display_name`
  and `terms_version` (creating a profile without `terms_version` is
  refused), disable Continue with
  `busy || !displayName.trim() || !affiliation.trim() || !agreed`,
  retitle the form "First, your card", and make its catch say "Could not
  save your profile. Try again."
- `apps/web/src/lib/card-line.ts`: `cardLine` returns the card tier as one
  line, `return profile.affiliation;` (drop the `void profile;`). Every
  list of people already prints `cardLine(profile)` under the name (the
  Requests, Connections and Blocked rows, a gathering's member list). A
  fork with several card fields joins them here, once, formatting each
  and dropping only the empty ones:
  `[p.handicap === null ? null : formatHandicap(p.handicap), p.home_course].filter((v) => v !== null && v !== '').join(' · ')`
  (`formatHandicap` from variants.md, "A typed field"). Not
  `.filter(Boolean)`: it drops a handicap of `0`. Return `null` when the
  join is empty, so the row prints no blank line.
- `apps/web/src/routes/_app.connections.tsx`, connections tier only: the
  local `PersonRow` gains an optional `detail` line (reference.md → §6 Web
  `PersonRow`), and only the Connections segment passes
  `detail={connection.details?.contact_handle}`. Requests and Blocked
  never show details.

No new CSS: `.hint`, `.sub`, and `.field` exist. Tokens only.

**Checkpoint:** `bun run lint && bun run typecheck` both exit 0 (lint
reports zero findings).

## 7. Mobile

- `apps/mobile/app/t/[uid].tsx`, both card branches, after `<Title>`:
  `{result.profile.affiliation ? <Muted>{result.profile.affiliation}</Muted> : null}`.
- **The gate**, `apps/mobile/app/(tabs)/_layout.tsx`: reference.md → §7
  Mobile gate, inside `TabsLayout` before the return. It checks once per
  signed-in account on entering the tabs, skips the redirect when already
  on `/profile` (navigating to the screen you are on drops its
  `redirect` param, so Save after Connect or Join would stay on Profile),
  and fails open: a failed check never locks anyone out.
  **Once per tabs mount is the design, not a gap.** Reviewers flag that an
  incomplete account can tab away from Profile. That is intended:
  completion is UX, never a boundary (What must not move, 7), and
  re-checking on every focus would bounce someone out of Connections for
  a field no safety rule reads. A fork that wants a hard gate re-checks on
  tab focus and owns that UX.
- `apps/mobile/app/(tabs)/profile.tsx`. Only the identity `Card` changes.
  - Imports: `isProfileComplete` and `type ProfileDetails` join the
    `@withme/contract` import (`TERMS_VERSION` and `type Profile` stay:
    `save` still sends the terms on first create);
    `Muted` joins the `../../components/ui` import.
  - State: `affiliation` and `contact` (strings), and
    `const [current, setCurrent] = useState<Profile | null>(null);`. Not
    named `profile`: `load`'s destructure and `AvatarPicker`'s
    `onChange={(profile) => …}` would shadow it, and
    `oxlint --deny-warnings` fails on `no-shadow`. Leave `exists` alone.
  - `load` reads
    `({ profile, details }: { profile: Profile | null; details: ProfileDetails | null })`;
    inside its `if (profile)`, `setCurrent(profile)`, and inside that
    branch's `if (!keepDraft)`, `setAffiliation(profile.affiliation ?? '')`;
    after the whole `if`/`else`,
    `if (!keepDraft) setContact(details?.contact_handle ?? '')`. The
    screen reloads on every focus, and `keepDraft` stops that from wiping
    what someone is typing, so each new field's `Field` takes
    `onChangeText={edit(setAffiliation)}` (`edit(setContact)` for the
    contact).
  - `save`: `const saved = await api.app.profile.update({ … })` with the
    web payload (its `terms_version` spread kept), then
    `setCurrent(saved.profile)` on the next line, before the `redirect`
    branch, so it runs on both paths.
  - `Title`:
    `{!current ? 'Create your profile' : isProfileComplete(current) ? 'Your profile' : 'Finish your profile'}`.
  - Save: `disabled={busy || !displayName.trim() || !affiliation.trim() || (!exists && !agreed)}`
    (the terms condition stays).
  - The fields after Bio: reference.md → §7 Mobile profile fields.
- `apps/mobile/app/claim/[uid].tsx`: an `affiliation` state and the
  Affiliation `Field` after Name, sent with the name and `terms_version`
  as on web; Continue gains `|| !affiliation.trim()` beside its `!agreed`;
  the `Title` becomes "First, your card",
  and `createProfile`'s error becomes "Could not save your profile. Try
  again."
- `apps/mobile/lib/card-line.ts`: the same `cardLine` as web. Every list
  of people already passes it as `PersonRow`'s `line`.
- Connections tier only: `PersonRow` in `apps/mobile/components/ui.tsx`
  gains `detail?: string | null`, rendered after the `sub` `Text` as
  another `Text` with the same `numberOfLines={2}` and
  `[styles.personSub, { color: t.inkMuted }]`, when non-null. In
  `apps/mobile/app/(tabs)/connections.tsx` only the Connections segment
  passes `detail={connection.details?.contact_handle}`.

**Checkpoint (static):** `bun run lint && bun run typecheck` both exit 0.

**The seed.** Without the new fields the demo users are incomplete.
Add the block from reference.md → §7 Seed to `supabase/seed/index.ts`,
then `bun run db:reset && bun run db:seed`.

**Checkpoint (simulator):** with the API dev server up,
`cd apps/mobile && bunx expo start --ios --clear`, then check each:

- a new account lands on Profile, and an incomplete one is sent back there
  on the next tabs mount;
- two connected accounts see each other's contact in Connections;
- a tag resolve shows the affiliation and no contact;
- cold, Connect returns to the tag. Signed out, open
  `/t/04BBBBBBBBBBBB` (Ada's tag shows Connect), tap Connect, sign up,
  tap Connect again on the tag: Profile opens, and Save lands on the tag
  again, not on Profile;
- the same through Join: sign in as Ada, point `04BBBBBBBBBBBB` at her
  gathering from her tags, and sign out. Sign-up now lands on the
  gathering's page (its title, "Who's going", and a Join button:
  gatherings are listed to every signed-in user), Join opens Profile, and
  Save returns to that page (your vertical's word after
  customize-gathering's URL step). The "Join this gathering?" card shows
  only when the gathering is not found (blocked or missing).

A brand-new sign-up that lands on Events instead, with `PGRST303` in the
API log, is the local stack's PostgREST, not the gate:
`docs/local-development.md` → When something goes wrong.

## 8. e2e

- `apps/api/e2e/handshake.e2e.ts`: the three blocks in reference.md → §8
  API e2e.
- `apps/web/e2e/`: affiliation is required for completion, so every step
  that creates a profile fills it. Find them:

  ```sh
  grep -rn "getByLabel('Name'" apps/web/e2e
  ```

  The pattern stops at the quote so it also finds
  `getByLabel('Name', { exact: true })`. Each hit that fills a Name on the
  Profile form or the claim page (the shared `signUpWithProfile` and
  `claimFreshTag` in `helpers.ts` included) gets
  `.getByLabel('Affiliation').fill('Smoke Club')` right after, on the same
  page. A hit that only asserts a value (`toHaveValue`) needs nothing.
  A Playwright failure later on a profile-creating step is a fill this
  grep missed.
- `apps/web/e2e/handshake.spec.ts`: append the block in reference.md →
  §8 `handshake.spec.ts`.

**Checkpoint:** both harnesses run in §9.

## 9. The gate

**Checkpoint:** the verification gate from `docs/the-slice.md`: `bun run lint &&
bun run typecheck && bun run test`, all three exit 0. Then
`cd apps/api && bun run e2e` (API dev server in another shell) ends
`handshake e2e: all checks passed` with your new lines among the checks,
and `cd apps/web && bun run test:e2e` reports every spec passed.

## What must not move

1. `profiles_select` stays byte-identical, and `profiles` keeps no anon
   policy. Never widen either to deliver a field.
2. A connections-tier field never lives on `profiles`, and never appears in
   `CARD_COLUMNS`, `PublicProfileSchema`, the SDK's `PublicProfileCard`,
   `resolve_tag`, a pending request, a gathering member list, or a block
   list.
3. `profile_details_select` admits the owner, or an accepted connection
   with no block in either direction — nothing else, and no policy
   `to anon` or `to public` on `profile_details`. A gathering, request, or
   "nearby" clause makes the field card tier: move the field instead.
4. Writes are the owner's own row only; `profile_id` and `tenant_id` stay
   out of the update grant; there is no delete policy (account deletion
   cascades through the foreign key). Never `.upsert()` `profile_details`,
   and never widen the update grant to make it work.
5. Exactly one definer function reads `profile_details`:
   `accept_connect_request`, after it has inserted the connection.
   `resolve_tag` never does.
6. Writing someone else's details fails the same way whether or not they
   have a row, and for an id that is nobody's: no existence oracle.
7. Completion is UX: no policy, RPC, or constraint reads it, and the
   columns stay nullable, so the claim flow's first profile and every
   pre-existing row stay valid. `isProfileComplete` is the only definition;
   both clients import it from the contract. The mobile gate checks once per
   user per tabs mount, while web's `ShellRoute` re-checks on every render;
   the mobile difference is deliberate (§7).
8. The new table carries the tenant seam, and every policy predicates on it.
9. Any later migration that redefines `resolve_tag`,
   `accept_connect_request` or `report_user` copies the newest definition
   (this migration once it exists). An older body silently drops the card
   tier, the `details` hand-off, and accept's `links`.
10. Every new free-text column carries the plain-text CHECK, and its zod
    schema the `isPlainText` refine.

## Scope notes

- A required field (in `REQUIRED_PROFILE_FIELDS`) needs its input and its
  `disabled` condition in both Profile forms and both claim forms;
  otherwise the gate sends people to a form that cannot complete them.
- On a fork with live users, every existing account lands on "Finish your
  profile" once after the deploy that makes a new field required. If that
  is unwelcome, backfill the column in the migration, or ship the field
  optional first and add it to `REQUIRED_PROFILE_FIELDS` in a later
  release.
- Per-field visibility toggles — the owner choosing a tier per field — are a
  third tier with their own policy and tests; not in this skill.
- A multi-step onboarding flow: point the gate at a focused route outside
  the shell (like `claim.$uid.tsx`) instead of `/profile`. The gate stays
  one function.
- Search or filtering by a field value ("everyone at Riverside GC") is an
  enumeration surface: never.
