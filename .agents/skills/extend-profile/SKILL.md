---
name: extend-profile
description: Use when a withme-starter fork needs vertical profile fields — a team, a club, a handicap on the card, or contact details only connections may see — or wants signed-in users to finish their profile before using the app. Covers both visibility tiers and the completion gate, contract to mobile.
---

# extend-profile — vertical fields, in two visibility tiers

Every derivation extends the profile (golf-with-me: handicap and home club;
a tailgate vertical wants team and signature dish). Those forks put every
field on the card. Most verticals also want a second kind of field — a
phone number, a handle — that only people you accepted may read. That
second tier is the part a fork gets wrong alone, so it was built for real,
RLS tests first, before this was written down.

**REQUIRED BACKGROUND:** `docs/the-slice.md`. Both tiers follow the slice
(contract → RLS tests → migration → API → web → mobile → e2e), with one
deliberate swap: the RLS tests come before the migration, so the boundary
is written down before the policy that enforces it. The safety discipline
there binds every step here.

## Pick a tier for every field, first

| | Card tier | Connections tier |
| --- | --- | --- |
| Who reads it | anyone holding your tag (anonymous resolve), the recipient of your pending request, your gathering co-members, someone who blocked you, your connections | you, and your accepted connections while neither has blocked the other |
| Where it lives | a column on `public.profiles` | `public.profile_details`, one row per profile |
| Examples | team, home club, handicap, role | phone, email, social handle |

A field that must not reach a stranger holding your tag is connections
tier. A field nobody else should read is neither: do not collect it.

**Why the connections tier is not a column on `profiles`.** RLS decides
rows, not columns: every viewer `profiles_select` admits reads every column
of the row. In the build this skill was distilled from, a `contact_handle`
column on `profiles` was readable — through PostgREST, with the publishable
key — by a gathering co-member, by the recipient of a pending request, and
by someone who had blocked the owner. No edit to `profiles_select` closes
that without taking away the card those viewers are meant to see.
`profiles_select` stays byte-identical (customize-gathering §3b); the
connections tier gets its own table and its own, narrower policy.

The worked example: a card-tier `affiliation` ("Riverside GC", "Chiefs",
"Acme Corp"; 1–80 chars; required for completion) and a connections-tier
`contact_handle` (1–120 chars; optional). Rename both to your vertical's
words before you start and keep the shapes. A fork with only one tier skips
the other tier's lines. Connections-only: still redefine
`accept_connect_request` (for `details`), skip `resolve_tag`. Card-only:
skip `details` everywhere, as below.

**A card-only fork** (golf-with-me: handicap and home club) keeps both
card builders and skips every `details` line:

- §1: no `ProfileDetailsSchema`, no `details` on `UpdateProfileInputSchema`
  or `ConnectionSchema`, and `contract/app.ts` untouched (its
  `getProfile` / `updateProfile` outputs change only to carry `details`).
  "A connection always carries the details key" drops, and so do the
  `contact_handle` lines in the other tests: the checkpoint is four more
  than before, plus the fork's own field tests, not five.
- §2: only the `card tier` describe (one CHECK test per card field). The
  red checkpoint is that describe's tests, each on `PGRST204`, not the
  fourteen; no change to `enumeration.test.ts`, `cascade.test.ts`, or
  `account.test.ts` (each addition there is connections tier). §3's
  green checkpoint is the same count over the baseline.
- §3: no `profile_details` table, trigger, grants, or policies, and no
  `v_details` block in `accept_connect_request`.
- §4: `CARD_COLUMNS`, `ProfileCard`, `upsertOwnProfile` only. No
  `DETAILS_COLUMNS`, `getOwnDetails`, `upsertOwnDetails`, or
  `listConnections` change, and the API router is unchanged:
  `updateProfile` already passes its input whole to `upsertOwnProfile`.
- §6, §7: no Contact field; `PersonRow` (web and mobile) and both
  Connections screens unchanged. The seed updates the card fields only,
  and the simulator's "connected accounts see each other's contact" check
  does not apply.
- §8: the API e2e asserts the card tier on every card surface (update and
  get, resolve, the pending request, accept, a connection) in place of the
  `details` asserts; the `handshake.spec.ts` block checks the card line on
  Bob's view of Ada's tag in place of Contact under `/connections`.

**No required vertical field.** When every new field is optional,
`REQUIRED_PROFILE_FIELDS = ['display_name']`, and:

- §1: "completion needs every required field" becomes a name alone
  completes and a blank one does not; "a typed required value counts …
  even 0" drops (keep it only when a typed field is required).
- §6, §7: the claim pages stay as they are (the name alone, "First, your
  name", the name error copy), and Save's `disabled` stays
  `busy || !displayName.trim()` on both Profile forms.
- §7: the seeded users are already complete. The seed edit is for the
  card only; the "would send Lin to 'Finish your profile'" check does
  not apply.
- §8: no Playwright fill changes; only the new `handshake.spec.ts` block.
- Install both gates anyway. With only the name required, the mobile gate
  is a has-a-profile gate, and that still changes mobile: a signed-in
  account with no profile is now sent to Profile when the tabs mount
  (before, only Connect and Join pushed `/profile`). That is intended: it
  matches web's `ShellRoute`.

**A field with a format rule** (a pace like `5:30/km`, a postcode) swaps
the example's length rule for a pattern at every layer; nothing else moves.

- Contract (§1): its own schema in place of `CardLineSchema`, used
  wherever the example uses that one — for a pace, a
  `PaceSchema = z.string().regex(/^[0-9]{1,2}:[0-5][0-9]\/(km|mi)$/)`.
- SQL (§3): a format CHECK instead of the length CHECK, named for it
  (`profiles_pace_format check (pace is null or pace ~ '^…$')`), whose
  pattern matches the zod regex's character classes and anchors. A
  JavaScript-only escape drops out in SQL: the `\/` inside the regex
  literal is a plain `/` in the SQL string
  (`'^[0-9]{1,2}:[0-5][0-9]/(km|mi)$'`). Spell the
  classes out (`[0-9]`, not `\d`; no `\w` or `\b`): Postgres's regex
  dialect and JavaScript's differ on shorthand, and both rules must reject
  the same strings.
- Tests: each length test becomes a format test. §1's "rejects empty and
  oversized" checks `''` and malformed values (`'5:60/km'`, `'123:30/km'`,
  `'5:30/mile'`) plus valid values that must parse (`'5:30/km'`,
  `'12:05/mi'`); §2's card-tier length test loops over `''` and a
  malformed value and expects the format CHECK's name. Wherever the
  example writes a value (`'Riverside GC'`, `'E2E Club'`), use a valid one.
- Forms (§6, §7): `maxLength` of the longest valid value, and a
  `placeholder` that shows the format (`5:30/km or 8:45/mi`). On mobile,
  a format that needs lowercase (or any exact case, like `km`) also wants
  `autoCapitalize="none"` on its `Field` in both the profile and claim
  screens, or the keyboard capitalizes the first letter (the starter's
  `Field` already turns `autoCorrect` off). A malformed
  value reaches the API and comes back as the form's generic save error
  ("Could not save. Check the fields and try again."); field-level
  messages are the fork's to add.

**A typed field** (a numeric handicap) needs a step a string does not: the
forms post text, so turning text into the value is code. The regex
mirroring above does not apply; this does.

- Contract (§1): next to the field's schema
  (`HandicapSchema = z.number().min(-10).max(54).multipleOf(0.1)`), two
  pure functions both clients import: `parseHandicap(text: string):
  number | null | undefined` (blank is `null` and clears the field, a
  valid entry is the value, `undefined` is refused; it range-checks with
  the schema itself) and `formatHandicap(value: number): string`
  (golf-with-me stores a plus handicap negative and prints `+2.4`, never
  a minus). Their contract tests include a round-trip over the whole
  stored range (every step from -10.0 to 54.0: format, parse, schema),
  which is also the evidence that `multipleOf(0.1)` is float-safe.
- SQL (§3): `numeric(p,s)` rounds on insert before the CHECK runs (8.45 is
  stored as 8.5), so the CHECK enforces the range
  (`profiles_handicap_range check (handicap is null or handicap between
  -10.0 and 54.0)`) and precision is zod's alone. §2's test is "is
  range-checked": one past each end refused, both ends accepted. The card
  builders' `jsonb_build_object` carries it as a JSON number, so card
  types are `number | null`.
- Forms (§6, §7): keep the field as text, seeded with `formatHandicap`.
  Save parses first; on `undefined` it shows a field message and sends
  nothing. Never put an `undefined` key into the patch: the input schema's
  `.optional()` drops it silently, the API saves everything else, and the
  form says "Saved." over a value it threw away. After a save, re-print
  the field with `formatHandicap`. On mobile, `keyboardType="decimal-pad"`
  has no `+` or `-` key: a signed value needs
  `keyboardType="numbers-and-punctuation"` (on web, skip
  `inputMode="decimal"` for the same reason).

## The map

| Layer | Card tier | Connections tier |
| --- | --- | --- |
| Contract | `packages/contract/src/schemas/profile.ts` (`ProfileSchema`, `PublicProfileSchema`, `UpdateProfileInputSchema`) | `schemas/profile.ts` (`ProfileDetailsSchema`), `schemas/connection.ts` (`ConnectionSchema.details`), `contract/app.ts` (`profile.get` / `profile.update` outputs) |
| SQL | `public.profiles`; every function that builds a card (`resolve_tag`, `accept_connect_request`) | `public.profile_details` and its policies; `accept_connect_request` |
| RLS tests | `packages/db/test/profile-fields.test.ts` (both tiers), `enumeration.test.ts`, `cascade.test.ts`, `account.test.ts` | same |
| Queries | `CARD_COLUMNS`, `ProfileCard`, `upsertOwnProfile` in `packages/db/src/queries/handshake.ts` | `DETAILS_COLUMNS`, `getOwnDetails`, `upsertOwnDetails`, `listConnections` (same file) |
| API | `apps/api/src/routers/app.ts`: `getProfile`, `updateProfile` | same; `acceptRequest` and `connectionsList` pass it through |
| SDK | `PublicProfileCard` in `packages/nfc-sdk/src/client.ts` | never |
| Web (`apps/web/src/`) | `components/ProfileCard.tsx`, `routes/_app.profile.tsx`, `routes/claim.$uid.tsx` | `routes/_app.profile.tsx`, `routes/_app.connections.tsx` (its local `PersonRow`) |
| Mobile (`apps/mobile/`) | `app/t/[uid].tsx`, `app/(tabs)/profile.tsx`, `app/claim/[uid].tsx` | `app/(tabs)/profile.tsx`, `app/(tabs)/connections.tsx`, `PersonRow` in `components/ui.tsx` |
| Gate | `isProfileComplete` (contract) → web `routes/_app.tsx` (`ShellRoute`), mobile `app/(tabs)/_layout.tsx` | — |
| Seed / e2e | `supabase/seed/index.ts`; `apps/api/e2e/handshake.e2e.ts`; every profile-creating step in `apps/web/e2e/` (`helpers.ts`, `handshake.spec.ts`, `gatherings.spec.ts`, `shell.spec.ts`) | same seed block and API e2e; `apps/web/e2e/handshake.spec.ts` |

Outside the tabs, mobile `gathering/[id].tsx` (join) and `t/[uid].tsx`
(connect) and web `t.$uid.tsx` (connect) check only `!profile` before
acting: the gate is for entering the shell, and an incomplete profile is
still a valid card. Leave them as they are (`const { profile } = …` still
works). The claim pages ask for the required fields themselves (§6, §7).
(If you ran customize-gathering's URL step, `gathering/[id].tsx` here and
`gatherings.spec.ts` in the table carry your vertical's word instead.)

## 1. Contract

`packages/contract/src/schemas/profile.ts`, above `ProfileSchema` (which
uses `CardLineSchema`):

```ts
/** Card tier: a free-text line on the card. Crosses the anonymous resolve boundary. DB CHECK mirrors it. */
export const CardLineSchema = z.string().min(1).max(80);

/**
 * Connections tier: read only by the owner and accepted connections. Never
 * part of PublicProfileSchema, never on resolve, a pending request, or a
 * gathering member list. DB CHECK mirrors it.
 */
export const ProfileDetailsSchema = z.object({
  contact_handle: z.string().min(1).max(120).nullable(),
});

export type ProfileDetails = z.infer<typeof ProfileDetailsSchema>;
```

- `ProfileSchema` (the owner's own row): add
  `affiliation: CardLineSchema.nullable()`.
- `PublicProfileSchema`'s `pick`: add `affiliation: true`. Nothing from
  `ProfileDetailsSchema` ever joins this pick.
- `UpdateProfileInputSchema`: add
  `affiliation: CardLineSchema.nullable().optional()` and
  `details: ProfileDetailsSchema.optional()`. Its doc comment opens "Name
  and bio."; make it name the new fields too: "Name, bio, and the vertical
  fields (the card tier's columns; `details`, the connections tier)."
- The completion rule, after the `Profile` type:

```ts
/**
 * Fields a profile needs before the signed-in shell opens. A UX gate, never
 * a safety boundary: the columns stay nullable, and no policy or RPC reads
 * completion. Both clients import this one definition.
 */
export const REQUIRED_PROFILE_FIELDS = ['display_name', 'affiliation'] as const satisfies readonly (keyof Profile)[];

export function isProfileComplete(profile: Profile | null | undefined): profile is Profile {
  if (!profile) return false;
  return REQUIRED_PROFILE_FIELDS.every((field) => {
    const value: unknown = profile[field];
    return typeof value === 'string' ? value.trim() !== '' : value !== null && value !== undefined;
  });
}
```

A string counts once it is not blank; any other type (a numeric handicap,
an enum) counts once it is set, so a handicap of 0 completes.

`packages/contract/src/schemas/connection.ts` (add `ProfileDetailsSchema`
to its import from `./profile.ts`): `ConnectionSchema` gains
`details: ProfileDetailsSchema.nullable()` — a connection is the one place
the other person's details travel. It is `null` when they have no
`profile_details` row, and `{ contact_handle: null }` when their row holds
no handle (every Profile-page save writes the row, §6); clients read
`details?.contact_handle`, so the two look the same.

`packages/contract/src/contract/app.ts` (add `ProfileDetailsSchema` to its
import from `../schemas/profile.ts`): `getProfile`'s output becomes
`z.object({ profile: ProfileSchema.nullable(), details: ProfileDetailsSchema.nullable() })`,
and `updateProfile`'s becomes
`z.object({ profile: ProfileSchema, details: ProfileDetailsSchema.nullable() })`.

`packages/contract/test/schemas.test.ts`. Before you touch it, `cd
packages/contract && bun test` is red on the existing card fixtures: in the
starter, four fail (both `ResolveOutputSchema` claimed parses, "exposes only
card-safe fields", and the `ConnectRequestSchema` parse) and the rest pass.
That is the required-nullable key doing its job. Then:

- add `affiliation: null` to every profile-card fixture (five in the
  starter, under `ResolveOutputSchema` and `ConnectRequestSchema`; the key
  is required-nullable, so every existing fixture fails to parse without it);
- add `'affiliation'` to the expected keys in "exposes only card-safe fields"
  (the test sorts them with `.toSorted()`, so the expected list is sorted
  too, with your field in its alphabetical place — for `affiliation`,
  `['affiliation', 'avatar_path', 'bio', 'display_name', 'id']`);
- append, at the end of the file (a format field adapts the second test as
  in "A field with a format rule" above):

```ts
describe('profile tiers', () => {
  const card = {
    id: '9b2c8f43-1b1a-4f7e-9d3c-2a6c1e5b8d90',
    display_name: 'Alex',
    avatar_path: null,
    bio: null,
    affiliation: null,
  };

  it('the card carries the card tier and never the connections tier', () => {
    const keys = Object.keys(PublicProfileSchema.shape);
    expect(keys).toContain('affiliation');
    expect(keys).not.toContain('contact_handle');
    expect(keys).not.toContain('details');
  });

  it('rejects empty and oversized fields in either tier', () => {
    expect(UpdateProfileInputSchema.safeParse({ affiliation: '' }).success).toBe(false);
    expect(UpdateProfileInputSchema.safeParse({ affiliation: 'x'.repeat(81) }).success).toBe(false);
    expect(UpdateProfileInputSchema.safeParse({ details: { contact_handle: '' } }).success).toBe(false);
    expect(
      UpdateProfileInputSchema.safeParse({ details: { contact_handle: 'x'.repeat(121) } }).success,
    ).toBe(false);
  });

  it('a connection always carries the details key, null without a details row', () => {
    const connection = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      created_at: '2026-10-11T00:00:00Z',
      profile: card,
    };
    expect(ConnectionSchema.safeParse(connection).success).toBe(false);
    expect(ConnectionSchema.safeParse({ ...connection, details: null }).success).toBe(true);
  });

  it('completion needs every required field, not just a row', () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(isProfileComplete({ display_name: 'Alex', affiliation: null } as Profile)).toBe(false);
    expect(isProfileComplete({ display_name: 'Alex', affiliation: '  ' } as Profile)).toBe(false);
    expect(isProfileComplete({ display_name: 'Alex', affiliation: 'Riverside GC' } as Profile)).toBe(true);
  });

  it('a typed required value counts when present, even 0', () => {
    // A fork's numeric field (a handicap) in REQUIRED_PROFILE_FIELDS completes at 0.
    expect(isProfileComplete({ display_name: 'Alex', affiliation: 0 } as unknown as Profile)).toBe(true);
  });
});
```

(add `ConnectionSchema`, `isProfileComplete`, and `type Profile` to the
file's import from `'../src/index.ts'`; `PublicProfileSchema` and
`UpdateProfileInputSchema` are already there).

**Checkpoint:** `cd packages/contract && bun test` — all green, five more
than before.

## 2. RLS tests, red first

New file `packages/db/test/profile-fields.test.ts`:

```ts
// extend-profile: two visibility tiers. The card tier rides every card; the
// connections tier reaches the owner and accepted connections only. The
// negative space is the spec: every viewer profiles_select admits beyond a
// connection (pending-request recipient, gathering co-member, blocker) and
// anon read nothing from profile_details, and get no oracle trying.
import { beforeAll, describe, expect, it } from 'bun:test';
import {
  admin,
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
  pendingRequestId,
  provisionTag,
  type TestUser,
} from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

async function setDetails(user: TestUser, contact_handle: string): Promise<void> {
  const { error } = await user.client
    .from('profile_details')
    .insert({ profile_id: user.id, contact_handle });
  expect(error).toBeNull();
}

/** Invisible means an empty, error-free select: a policy error is not invisibility. */
async function expectNoDetails(viewer: TestUser, owner: TestUser): Promise<void> {
  const { data, error } = await viewer.client
    .from('profile_details')
    .select('contact_handle')
    .eq('profile_id', owner.id);
  expect(error).toBeNull();
  expect(data).toEqual([]);
}

async function seesCard(viewer: TestUser, owner: TestUser): Promise<boolean> {
  const { data, error } = await viewer.client.from('profiles').select('id').eq('id', owner.id);
  expect(error).toBeNull();
  return (data ?? []).length === 1;
}

describe('card tier', () => {
  it('rides the anonymous resolve', async () => {
    const alice = await createTestUser('Alice');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });
    const { error } = await alice.client
      .from('profiles')
      .update({ affiliation: 'Riverside GC' })
      .eq('id', alice.id);
    expect(error).toBeNull();

    const { data } = await anonClient().rpc('resolve_tag', { p_uid: uid });
    const resolved = data as { status: string; profile: { affiliation: string | null } };
    expect(resolved.status).toBe('claimed');
    expect(resolved.profile.affiliation).toBe('Riverside GC');
  });

  it('is length-checked at the database boundary', async () => {
    const alice = await createTestUser('Alice');
    for (const affiliation of ['', 'x'.repeat(81)]) {
      const { error } = await alice.client.from('profiles').update({ affiliation }).eq('id', alice.id);
      expect(error?.message).toContain('profiles_affiliation_length');
    }
  });

  it('rides the card accept returns', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const { error: updateError } = await alice.client
      .from('profiles')
      .update({ affiliation: 'Riverside GC' })
      .eq('id', alice.id);
    expect(updateError).toBeNull();
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    const { data, error } = await bob.client.rpc('accept_connect_request', {
      p_request_id: await pendingRequestId(alice, bob),
    });
    expect(error).toBeNull();
    expect((data as { profile: { affiliation: string | null } }).profile.affiliation).toBe(
      'Riverside GC',
    );
  });
});

describe('connections tier', () => {
  it('the owner writes and reads their own row, which carries the tenant seam', async () => {
    const alice = await createTestUser('Alice');
    await setDetails(alice, '@alice');
    const { data: updated, error } = await alice.client
      .from('profile_details')
      .update({ contact_handle: '@alice2' })
      .eq('profile_id', alice.id)
      .select('contact_handle');
    expect(error).toBeNull();
    expect(updated).toEqual([{ contact_handle: '@alice2' }]);
    const { data: row } = await admin
      .from('profile_details')
      .select('tenant_id')
      .eq('profile_id', alice.id)
      .single();
    expect(row?.tenant_id).toBeTruthy();
  });

  it('an accepted connection reads it, both ways', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice');
    await setDetails(bob, '@bob');
    await connectUsers(alice, bob);
    const { data: aliceSees } = await alice.client
      .from('profile_details')
      .select('contact_handle')
      .eq('profile_id', bob.id);
    const { data: bobSees } = await bob.client
      .from('profile_details')
      .select('contact_handle')
      .eq('profile_id', alice.id);
    expect(aliceSees).toEqual([{ contact_handle: '@bob' }]);
    expect(bobSees).toEqual([{ contact_handle: '@alice' }]);
  });

  it('a stranger and anon read nothing', async () => {
    const alice = await createTestUser('Alice');
    const stranger = await createTestUser('Stranger');
    await setDetails(alice, '@alice');
    await expectNoDetails(stranger, alice);
    const { data, error } = await anonClient().from('profile_details').select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('a pending-request recipient sees the card, not the details', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice');
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    expect(await seesCard(bob, alice)).toBe(true);
    await expectNoDetails(bob, alice);
  });

  it('a gathering co-member sees the card, not the details, even through an embed', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice');
    // If customize-gathering changed create_gathering's arguments, pass them here too.
    const { data: gathering, error } = await alice.client.rpc('create_gathering', {
      p_title: 'Rooftop listening session',
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(error).toBeNull();
    const { error: joinError } = await bob.client.rpc('join_gathering', {
      p_gathering_id: (gathering as { id: string }).id,
    });
    expect(joinError).toBeNull();

    expect(await seesCard(bob, alice)).toBe(true);
    await expectNoDetails(bob, alice);
    const { data: embedded } = await bob.client
      .from('profiles')
      .select('id, details:profile_details(contact_handle)')
      .eq('id', alice.id);
    expect(embedded).toEqual([{ id: alice.id, details: null }]);
  });

  it('a block ends access both ways, and the blocker does not inherit it', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice');
    await setDetails(bob, '@bob');
    await connectUsers(alice, bob);
    const { error } = await bob.client
      .from('blocks')
      .insert({ blocker_id: bob.id, blocked_id: alice.id });
    expect(error).toBeNull();

    // the blocker still sees the blocked card (their block list) ...
    expect(await seesCard(bob, alice)).toBe(true);
    // ... but neither reads the other's details any more
    await expectNoDetails(bob, alice);
    await expectNoDetails(alice, bob);
  });

  it('resolve_tag never carries it, not even for a connection', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice.private');
    await connectUsers(alice, bob);
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });
    for (const client of [anonClient(), bob.client]) {
      const { data, error } = await client.rpc('resolve_tag', { p_uid: uid });
      expect(error).toBeNull();
      expect(JSON.stringify(data)).not.toContain('@alice.private');
    }
  });

  it('accept hands the new connection the requester details, null without a details row', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    await setDetails(alice, '@alice');
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    const { data, error } = await bob.client.rpc('accept_connect_request', {
      p_request_id: await pendingRequestId(alice, bob),
    });
    expect(error).toBeNull();
    expect((data as { details: unknown }).details).toEqual({ contact_handle: '@alice' });

    await carol.client.rpc('send_connect_request', { p_recipient: bob.id });
    const { data: bare } = await bob.client.rpc('accept_connect_request', {
      p_request_id: await pendingRequestId(carol, bob),
    });
    expect((bare as { details: unknown }).details).toBeNull();
  });

  it("writing another profile's details is refused the same way whether or not a row exists", async () => {
    const alice = await createTestUser('Alice');
    const carol = await createTestUser('Carol');
    const mallory = await createTestUser('Mallory');
    await setDetails(alice, '@alice'); // alice has a row; carol does not; the third id is nobody

    const refusals: Array<{ code?: string; message?: string }> = [];
    for (const profile_id of [alice.id, carol.id, crypto.randomUUID()]) {
      const { error } = await mallory.client
        .from('profile_details')
        .insert({ profile_id, contact_handle: '@mallory' });
      refusals.push({ code: error?.code, message: error?.message });
    }
    expect(refusals[0]?.code).toBe('42501');
    expect(refusals[1]).toEqual(refusals[0]);
    expect(refusals[2]).toEqual(refusals[0]);

    // an update aimed at someone else's row changes nothing, silently
    const { data: touched, error } = await mallory.client
      .from('profile_details')
      .update({ contact_handle: '@mallory' })
      .eq('profile_id', alice.id)
      .select('contact_handle');
    expect(error).toBeNull();
    expect(touched).toEqual([]);
    const { data: kept } = await admin
      .from('profile_details')
      .select('contact_handle')
      .eq('profile_id', alice.id)
      .single();
    expect(kept?.contact_handle).toBe('@alice');
  });

  it('profile_id and tenant_id are immutable through the client', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice');
    const { error: rekey } = await alice.client
      .from('profile_details')
      .update({ profile_id: bob.id })
      .eq('profile_id', alice.id);
    expect(rekey?.code).toBe('42501');
    const { error: retenant } = await alice.client
      .from('profile_details')
      .update({ tenant_id: crypto.randomUUID() })
      .eq('profile_id', alice.id);
    expect(retenant?.code).toBe('42501');
  });

  it('is length-checked at the database boundary', async () => {
    const alice = await createTestUser('Alice');
    await setDetails(alice, '@alice');
    for (const contact_handle of ['', 'x'.repeat(121)]) {
      const { error } = await alice.client
        .from('profile_details')
        .update({ contact_handle })
        .eq('profile_id', alice.id);
      expect(error?.message).toContain('profile_details_contact_handle_length');
    }
  });
});
```

**What the block test proves.** Inserting the block fires the
`on_block_created` trigger, which deletes the pair's connection (and any
pending request), and `accept_connect_request` refuses a blocked pair. So
after a block there is no connection left for the policy's `exists` to
find: the test exercises the trigger. The policy's two `is_blocked`
clauses are defense in depth, for a connection row that outlives a block
some other way; keep them.

Three existing files grow. Every addition checks `error`: a `data ?? []`
assertion passes against a table that does not exist, which is a false
red-phase green.

- `enumeration.test.ts`, "anon cannot select any rows from any handshake
  table": do not add `'profile_details'` to the loop's list. After the
  loop, add:

  ```ts
      // Connections tier: anon holds Supabase's default select grant and no
      // policy, so RLS answers with an empty, error-free result. A permission
      // error would also hide the rows, but it is not what this schema does;
      // an error here means the table is missing or a grant changed.
      const { data: details, error: detailsError } = await anon.from('profile_details').select('*');
      expect(detailsError).toBeNull();
      expect(details).toEqual([]);
  ```

- `cascade.test.ts` (deletion through the auth admin API,
  `admin.auth.admin.deleteUser`): after the four users are created, before
  the "Alice: claims a tag …" setup, give her a row and check it landed:

  ```ts
      const { error: detailsError } = await alice.client
        .from('profile_details')
        .insert({ profile_id: alice.id, contact_handle: '@alice' });
      expect(detailsError).toBeNull();
  ```

  and after the deletion, between the profile check and "Connections:
  gone" (the test already declares `error`, so these are renamed):

  ```ts
      // Connections tier: gone with the profile (foreign-key cascade).
      const { data: details, error: detailsReadError } = await admin
        .from('profile_details')
        .select('*')
        .eq('profile_id', alice.id);
      expect(detailsReadError).toBeNull();
      expect(details).toEqual([]);
  ```

- `account.test.ts` (deletion as the account holder does it:
  `delete_my_account()`, a definer function that deletes the caller's
  `auth.users` row, so the same foreign-key cascade runs). In the first
  test, "removes the caller and cascades: …", insert the same row right
  after the four users are created, with the same error check, and among
  the assertions after `delete_my_account`, right after the `profiles`
  one, add, with the file's own helper:

  ```ts
      expectEmpty(await admin.from('profile_details').select('*').eq('profile_id', alice.id));
  ```

  Keep both deletion paths: the cascade test pins the foreign key, the
  account test the route a real user takes. No change to
  `delete_my_account`, the `app.profile.deleteAccount` comment, or either
  client's `DELETE_COPY` (`components/AccountSection.tsx`): the details
  row is part of "your profile" and goes with it.

Have the local stack up (`bun run db:start`), then `bun run db:reset`.

**Checkpoint (red):** `cd packages/db && bun test` — the fourteen new
tests, the cascade test, the first `delete_my_account` test in
`account.test.ts`, and the enumeration test "anon cannot select any rows
from any handshake table" fail, each on the missing table or column,
which PostgREST reports from its schema cache:

- a missing table is `PGRST205` "Could not find the table
  'public.profile_details' in the schema cache";
- a missing column is `PGRST204` "Could not find the 'affiliation' column
  of 'profiles' in the schema cache" (the card-tier length test shows it
  as a message that does not contain `profiles_affiliation_length`).

Not Postgres's `42P01` / `42703`: the request never reaches the database.
A failure on a data assertion instead (`Received: undefined`, say) means a
write upstream went unchecked: check its `error`. A new test that passes
now asserts nothing: fix it before going on. `bunx turbo run typecheck
--continue` is red for `@withme/db` until §3 regenerates the types, and
may already be red for `@withme/api` and `@withme/nfc` from §1's contract
change (§4 and §5 close those).

A format-checked card field: the card-tier "is length-checked" test
becomes "is format-checked", looping over `''` and a malformed value and
expecting the format CHECK's name (see "A field with a format rule").

## 3. Migration — both tiers, one additive file

New file `supabase/migrations/<UTC-timestamp>_extend_profile.sql`
(`date -u +%Y%m%d%H%M%S`; it must sort after every existing migration:
in the starter the newest is `20261011130000_delete_my_account.sql`, but a
fork that ran another skill first, such as customize-gathering, has a
newer one, so check `ls supabase/migrations | tail -1`):

```sql
-- extend-profile: vertical fields in two visibility tiers.
--
--   Card tier: columns on public.profiles. They ride every card (the
--   anonymous resolve, a pending request, a gathering member list, a block
--   list, a connection), so everyone profiles_select admits reads them.
--
--   Connections tier: public.profile_details, one row per profile, readable
--   by the owner and by accepted connections with no block in either
--   direction. Never columns on profiles: RLS decides rows, and every viewer
--   of a profiles row reads every column of it.
--
-- profiles_select is not touched. The CHECKs mirror @withme/contract.

-- =============================================================== card tier ==

alter table public.profiles
  add column affiliation text
    constraint profiles_affiliation_length
    check (affiliation is null or char_length(affiliation) between 1 and 80);

-- ======================================================== connections tier ==

create table public.profile_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  tenant_id uuid not null default private.current_tenant_id(),
  contact_handle text
    constraint profile_details_contact_handle_length
    check (contact_handle is null or char_length(contact_handle) between 1 and 120),
  updated_at timestamptz not null default now()
);

create trigger profile_details_set_updated_at
  before update on public.profile_details
  for each row execute function private.set_updated_at();

alter table public.profile_details enable row level security;

-- The owner writes their own row. profile_id and tenant_id are immutable
-- through the client (the tags column-grant idiom). No delete policy:
-- account deletion cascades through the foreign key.
revoke insert, update on public.profile_details from authenticated;
grant insert (profile_id, contact_handle) on public.profile_details to authenticated;
grant update (contact_handle) on public.profile_details to authenticated;

-- The owner, or an accepted connection with no block either way. Nothing
-- else: not a pending request, not a shared gathering, not the blocker.
create policy profile_details_select on public.profile_details
  for select to authenticated
  using (
    tenant_id = private.current_tenant_id()
    and (
      profile_id = (select auth.uid())
      or (
        not private.is_blocked((select auth.uid()), profile_id)
        and not private.is_blocked(profile_id, (select auth.uid()))
        and exists (
          select 1 from public.connections c
          where (c.user_a = (select auth.uid()) and c.user_b = profile_details.profile_id)
             or (c.user_b = (select auth.uid()) and c.user_a = profile_details.profile_id)
        )
      )
    )
  );

create policy profile_details_insert_own on public.profile_details
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and tenant_id = private.current_tenant_id());

create policy profile_details_update_own on public.profile_details
  for update to authenticated
  using (profile_id = (select auth.uid()) and tenant_id = private.current_tenant_id())
  with check (profile_id = (select auth.uid()) and tenant_id = private.current_tenant_id());
```

A format-checked card field replaces the length CHECK with a format CHECK
whose pattern is the zod regex, class for class (see "A field with a
format rule").

**Every function that builds a card** gets the card tier. Find them:

```sh
grep -ln "'display_name', v_profile.display_name" supabase/migrations/*.sql
```

It lists every file that ever defined a card builder, not only the newest
(in the starter: the initial schema, `add_gatherings`, and `avatars`). To
read the function names, list each hit with the function definitions
around it; every `'display_name'` line belongs to the nearest
`function public.…` line above it:

```sh
grep -nE "create (or replace )?function public\.|'display_name', v_profile\.display_name" \
  $(grep -l "'display_name', v_profile.display_name" supabase/migrations/*.sql)
```

In the starter the functions are `public.resolve_tag` and
`public.accept_connect_request`. Find each one's **newest** definition,
the last file that defines it:

```sh
grep -lE 'create (or replace )?function public\.resolve_tag' supabase/migrations/*.sql | grep -v _extend_profile | sort | tail -1
grep -lE 'create (or replace )?function public\.accept_connect_request' supabase/migrations/*.sql | grep -v _extend_profile | sort | tail -1
```

In the starter both print `supabase/migrations/20261011120000_avatars.sql`.
After customize-gathering, `resolve_tag`'s newest may be that skill's
migration instead (it redefines `resolve_tag`), which is why the grep,
not a file name, decides; copy each function from its own newest file.
The `grep -v` matters when you redo this migration, after a rebase for
instance: it already defines both functions and would otherwise be its own
newest. Copy each newest definition whole into this migration, at the end,
as `create or replace function`, restating every attribute (`language
plpgsql`, `stable` or `volatile`, `security definer`, `set search_path =
''`), under a comment naming the file it came from (`-- Newest:
20261011120000_avatars.sql.`), so the next redo knows its source. Then:

- in the `'profile', jsonb_build_object(…)` add
  `'affiliation', v_profile.affiliation`;
- in `accept_connect_request` only: declare `v_details jsonb := null;`, add
  after the `select * into v_profile …` line

  ```sql
    -- The pair is connected now (inserted above), so the requester's
    -- connections tier is the new connection's to read. No row: stays null.
    select jsonb_build_object('contact_handle', d.contact_handle) into v_details
      from public.profile_details d
     where d.profile_id = v_req.requester_id
       and d.tenant_id = v_req.tenant_id;
  ```

  (A definer function bypasses RLS, so it states the tenant seam itself.)

  and add `'details', v_details` beside `'profile'` in the returned object.

`resolve_tag` never reads `profile_details`. Same signatures keep their
grants. Diff each copy against its source: the only changes are the ones
above. An older body would silently undo a later migration: in the
starter, the earlier bodies still emit `avatar_url`, a column `avatars`
dropped.

```sh
bun run db:reset && bun run db:seed && bun run db:types
```

**Checkpoint (green):** `db:reset` prints `Finished supabase db reset`
(some CLI versions add `on branch …`; outside a terminal, a JSON line with
`"Reset local database."` follows it);
`cd packages/db && bun test` is all green, fourteen more than before;
`git diff packages/db/src/types/supabase.ts` shows `affiliation` and a
`profile_details` table with a one-to-one `profile_details_profile_id_fkey`
relationship — commit it. `bunx turbo run typecheck --continue` is now red
only in `@withme/api` (`src/routers/app.ts`) and `@withme/nfc` (the
`PublicProfileCard` parity test); §4 and §5 close those. (Plain `bun run
typecheck` stops at the first failing package, so it cannot show which
others are red.)

## 4. Queries and API

`packages/db/src/queries/handshake.ts`:

- `CARD_COLUMNS`: append `, affiliation`. `ProfileCard`: add
  `affiliation: string | null`. Gathering member lists and block lists use
  the same constant, so they carry the card tier with no further change.
  Showing it is optional: the Requests and Blocked rows (§6, §7) and a
  gathering's member list may or may not display the card-tier field, and
  no check depends on it.
- `upsertOwnProfile`: its patch type is
  `{ display_name?: string; bio?: string | null }`; add
  `affiliation?: string | null`. In the first-create `.insert({ id, display_name, bio })`,
  add `affiliation: patch.affiliation ?? null` after `bio`. The update path
  and the `23505` race retry send `patch` whole, so they need nothing. (The
  avatar is not in this patch: `setOwnAvatarPath` in `queries/avatars.ts`
  owns it.)
- The connections tier, as a block right after `upsertOwnProfile`:

```ts
/** Connections tier. Never part of CARD_COLUMNS: RLS lets only the owner and connections read it. */
export const DETAILS_COLUMNS = 'contact_handle';

export interface ProfileDetails {
  contact_handle: string | null;
}

export async function getOwnDetails(db: Db, userId: string): Promise<ProfileDetails | null> {
  const { data, error } = await db
    .from('profile_details')
    .select(DETAILS_COLUMNS)
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Update, then insert. Not .upsert(): PostgREST's ON CONFLICT DO UPDATE sets
 * every payload column, profile_id included, and the column grant forbids
 * updating it, so Postgres refuses every upsert (42501), the first save
 * included. The profile row must exist first (foreign key).
 */
export async function upsertOwnDetails(
  db: Db,
  userId: string,
  details: ProfileDetails,
): Promise<ProfileDetails> {
  const update = () =>
    db
      .from('profile_details')
      .update(details)
      .eq('profile_id', userId)
      .select(DETAILS_COLUMNS)
      .maybeSingle();
  const { data: updated, error } = await update();
  if (error) throw error;
  if (updated) return updated;
  const { data, error: insertError } = await db
    .from('profile_details')
    .insert({ profile_id: userId, ...details })
    .select(DETAILS_COLUMNS)
    .single();
  if (insertError) {
    // Lost a create race (two first saves): the row exists now, update it.
    if (insertError.code === '23505') {
      const { data: raced, error: retryError } = await update();
      if (retryError) throw retryError;
      if (raced) return raced;
    }
    throw insertError;
  }
  return data;
}
```

- `listConnections`: embed the tier under each side's card, and lift it out:

```ts
       a:profiles!connections_user_a_fkey(${CARD_COLUMNS}, details:profile_details(${DETAILS_COLUMNS})),
       b:profiles!connections_user_b_fkey(${CARD_COLUMNS}, details:profile_details(${DETAILS_COLUMNS}))`,
```

```ts
  return (data ?? []).flatMap((row) => {
    const other = row.user_a === userId ? row.b : row.a;
    if (!other) return [];
    const { details, ...profile } = other;
    return [{ id: row.id, created_at: row.created_at, profile, details: details ?? null }];
  });
```

  and `ConnectionRow` gains `details: ProfileDetails | null`. (The primary
  key is the foreign key, so PostgREST embeds one object or null; if your
  generated types say array, the relationship lost `isOneToOne` — check the
  migration, not the mapper.)

`apps/api/src/routers/app.ts` (import `getOwnDetails`, `upsertOwnDetails`):

```ts
const getProfile = appProcedure.profile.get.handler(async ({ context }) => {
  const userId = requireUser(context);
  const [profile, details] = await run(context, () =>
    Promise.all([getOwnProfile(context.db, userId), getOwnDetails(context.db, userId)]),
  );
  return { profile: profile as Profile | null, details };
});

const updateProfile = appProcedure.profile.update.handler(async ({ input, context }) => {
  const userId = requireUser(context);
  const { details, ...patch } = input;
  // Two writes, not a transaction, by design: a failure surfaces and a retry
  // is idempotent. Never "fix" it with a definer RPC that loosens the grants.
  // The profile first: the details row references it.
  const profile = await run(context, () =>
    Object.keys(patch).length > 0
      ? upsertOwnProfile(context.db, userId, patch)
      : getOwnProfile(context.db, userId),
  );
  if (!profile) throw new ORPCError('BAD_REQUEST', { message: 'Profile required' });
  const saved = await run(context, () =>
    details ? upsertOwnDetails(context.db, userId, details) : getOwnDetails(context.db, userId),
  );
  return { profile: profile as Profile, details: saved };
});
```

`acceptRequest` and `connectionsList` need no change: the RPC's `details`
and the query's rows pass straight through, and the contract validates
them. `uploadAvatar`, `removeAvatar`, and `deleteAccount` need none either:
the photo endpoints keep returning `{ profile }` alone.

**Checkpoint:** `bunx turbo run typecheck --continue` — `@withme/api` and
`@withme/db` green; `@withme/nfc` red until §5.

## 5. SDK mirror (card tier only)

`packages/nfc-sdk/src/client.ts`: `PublicProfileCard` gains
`affiliation: string | null;`. The connections tier never appears in the
SDK — nothing it resolves may carry it.

**Checkpoint:** `bun run --cwd packages/nfc-sdk typecheck` — clean (it must
be the typecheck: the parity assertions are type-level).

## 6. Web

- `apps/web/src/components/ProfileCard.tsx`: `CardProfile` gains
  `affiliation: string | null`; under the name,
  `{profile.affiliation ? <p className="hint">{profile.affiliation}</p> : null}`.
- **The gate**, `apps/web/src/routes/_app.tsx`. The loader passes the
  details through, and `ShellRoute` — the layout's component, which already
  sends a session without a profile to `/profile` with a `<Navigate>` —
  widens its `!profile` check. Keep it in the component: the comment above
  `ShellRoute` explains why a `throw redirect` from the loader blanks the
  page. Import `isProfileComplete` from `@withme/contract`, then the two
  edits below, and make that comment's opening line ("A session without a
  profile is sent to create one") say "without a complete profile
  (`isProfileComplete`)" and "create or finish one":

```ts
  loader: async () => {
    const { profile, details } = await asSignedInAccount(() => api.app.profile.get());
    return { profile, details };
  },
```

```tsx
  if (!isProfileComplete(profile) && pathname !== '/profile') {
```

- `apps/web/src/routes/_app.profile.tsx`. The page is `IdentityForm`
  (one `<form className="card">`: the heading, `AvatarField` once a profile
  exists, Name, Bio, the `role="status"` line, Save), then `MyTags`, then
  `AccountSection`. Only `ProfilePage`'s read and `IdentityForm` change. `ProfilePage` reads
  `const { profile, details } = useLoaderData({ from: '/_app' });` and
  renders `<IdentityForm profile={profile} details={details} />`;
  `IdentityForm` takes `details: ProfileDetails | null` (the file's
  `import type { Profile } from '@withme/contract'` becomes
  `import { isProfileComplete, type Profile, type ProfileDetails } from '@withme/contract'`)
  and adds

```tsx
const [affiliation, setAffiliation] = useState(profile?.affiliation ?? '');
const [contact, setContact] = useState(details?.contact_handle ?? '');
```

  the `api.app.profile.update` payload in `save` gains

```ts
  affiliation: affiliation.trim() === '' ? null : affiliation.trim(),
  details: { contact_handle: contact.trim() === '' ? null : contact.trim() },
```

  (`details` is always sent, so the first save here creates the
  `profile_details` row even with Contact empty. From then on accept and
  the connections list return `{ contact_handle: null }` for that person,
  not `null`. Both render nothing: every reader goes through
  `details?.contact_handle`. Do not special-case the empty field.)

  the `<h1>` becomes
  `{!profile ? 'Create your profile' : isProfileComplete(profile) ? 'Your profile' : 'Finish your profile'}`,
  Save's `disabled` becomes `busy || !displayName.trim() || !affiliation.trim()`,
  and the fields go after Bio, before the status line (labels, ids, and
  placeholders in your vertical's words; a format field takes the
  `maxLength` and `placeholder` from "A field with a format rule"):

```tsx
<div className="field">
  <label htmlFor="affiliation">Affiliation</label>
  <input
    id="affiliation"
    required
    maxLength={80}
    placeholder="Your club, team, or company"
    value={affiliation}
    onChange={(e) => setAffiliation(e.target.value)}
  />
</div>
<div className="field">
  <label htmlFor="contact_handle">Contact</label>
  <input
    id="contact_handle"
    maxLength={120}
    placeholder="Phone, email, or handle"
    aria-describedby="contact_handle-hint"
    value={contact}
    onChange={(e) => setContact(e.target.value)}
  />
  <p className="hint" id="contact_handle-hint">Only your connections see this.</p>
</div>
```

- `apps/web/src/routes/claim.$uid.tsx`, the inline first-profile form: every
  place that creates a profile asks for the required fields. Add an
  `affiliation` state and the same Affiliation field after Name, send
  `{ display_name: displayName.trim(), affiliation: affiliation.trim() }`
  (Continue cannot fire with it empty, so no `null` mapping), disable
  Continue with `busy || !displayName.trim() || !affiliation.trim()`, and
  retitle the form "First, your card". Its catch still says "Could not
  save your name. Try again." over two fields: make it "Could not save
  your profile. Try again." No test reads that string.
- `apps/web/src/routes/_app.connections.tsx`. Every list renders the
  file's local `PersonRow` (`profile`, `sub`, children), which shows one
  `sub` line. Give it a second, optional line:

```tsx
function PersonRow({
  profile,
  sub,
  detail,
  children,
}: {
  profile: CardProfile;
  sub?: string | null;
  detail?: string | null;
  children: ReactNode;
}) {
```

  and after its `{sub ? <span className="sub">{sub}</span> : null}`:

```tsx
        {detail ? <span className="sub">{detail}</span> : null}
```

  Then only the Connections segment (the default, no `?tab`) passes it:
  `detail={connection.details?.contact_handle}` on its `PersonRow`. The
  Requests and Blocked segments may pass the card tier as `detail`
  (`request.requester.affiliation`, `block.user.affiliation`); they never
  show details (they do not have them).

No new CSS: `.hint`, `.sub`, and `.field` exist. Tokens only.

**Checkpoint:** `bun run lint && bun run typecheck`.

## 7. Mobile

- `apps/mobile/app/t/[uid].tsx`, both card branches, after `<Title>`:
  `{result.profile.affiliation ? <Muted>{result.profile.affiliation}</Muted> : null}`.
- **The gate**, `apps/mobile/app/(tabs)/_layout.tsx` (web's is `ShellRoute`
  in `routes/_app.tsx`): once per signed-in account, on entering the tabs.

```tsx
import { isProfileComplete } from '@withme/contract';
import { router, Tabs, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/use-session';

// inside TabsLayout, before the return:
const { session } = useSession();
const userId = session?.user.id;
// Like web's `pathname !== '/profile'`: navigating to the screen you are on
// replaces its params and would drop `redirect`. A ref, so the async check
// reads the current path.
const pathname = usePathname();
const pathRef = useRef(pathname);
pathRef.current = pathname;
// A failed check never locks anyone out: the screens' own states handle errors.
useEffect(() => {
  if (!userId) return;
  let live = true;
  api.app.profile
    .get()
    .then(({ profile }) => {
      if (live && !isProfileComplete(profile) && pathRef.current !== '/profile') {
        router.navigate('/profile');
      }
    })
    .catch(() => undefined);
  return () => {
    live = false;
  };
}, [userId]);
```

Like web's `pathname !== '/profile'`: navigating to the screen you are on
replaces its params and would drop `redirect`. Connect (`t/[uid].tsx`) and
Join (`gathering/[id].tsx`, renamed if you ran customize-gathering's URL
step) push `/profile` with a `redirect` for a user
with no profile; when the tabs were not mounted yet, that push mounts them,
the gate fires, and without the path check Save stays on Profile instead
of returning to the tag.

- `apps/mobile/app/(tabs)/profile.tsx`. The screen is one identity `Card`
  (`Title`, `AvatarPicker` once a profile exists, the Name and Bio
  `Field`s, the status and error lines, the Save `Button`), then
  `<MyTags />`, then `<AccountSection />`; only the `Card` changes.
  - Imports: `import { isProfileComplete, type Profile, type ProfileDetails } from '@withme/contract'`;
    `Muted` joins the `../../components/ui` import.
  - State: `affiliation` and `contact` (strings), and
    `const [current, setCurrent] = useState<Profile | null>(null);` for the
    loaded or saved row. Not named `profile`: `load`'s destructure and
    `AvatarPicker`'s `onChange={(profile) => …}` would shadow it, and
    `oxlint --deny-warnings` fails on `no-shadow`. Leave `exists` alone:
    `AvatarPicker` and `MyTags` still key on it.
  - `load` reads
    `({ profile, details }: { profile: Profile | null; details: ProfileDetails | null })`;
    inside its `if (profile)`, `setCurrent(profile)` and
    `setAffiliation(profile.affiliation ?? '')`; after it,
    `setContact(details?.contact_handle ?? '')`.
  - `save`: `const saved = await api.app.profile.update({ … })` with the
    same payload as web, then `setCurrent(saved.profile)` on the next
    line, before the `redirect` branch and its `dismissTo` return, so it
    runs on both paths.
  - `Title`:
    `{!current ? 'Create your profile' : isProfileComplete(current) ? 'Your profile' : 'Finish your profile'}`.
  - Save: `disabled={busy || !displayName.trim() || !affiliation.trim()}`.
  - After the Bio `Field` (labels, placeholders, and the `Muted` line in
    your vertical's words; a format field as on web):

```tsx
<Field
  label="Affiliation"
  value={affiliation}
  onChangeText={setAffiliation}
  maxLength={80}
  placeholder="Your club, team, or company"
/>
<Field
  label="Contact"
  value={contact}
  onChangeText={setContact}
  maxLength={120}
  autoCapitalize="none"
  placeholder="Phone, email, or handle"
/>
<Muted>Only your connections see your contact.</Muted>
```

- `apps/mobile/app/claim/[uid].tsx`: an `affiliation` state and the
  Affiliation `Field` (same props as above) after Name in the first-profile
  form, sent with the name as on web; Continue disabled until both are
  filled; the `Title` "First, your name" becomes "First, your card", and
  `createProfile`'s "Could not save your name. Try again." becomes "Could
  not save your profile. Try again.", both as on web.
- `PersonRow` in `apps/mobile/components/ui.tsx` (`name`, `path`, `sub`,
  children) gains `detail?: string | null`, rendered after the `sub` `Text`
  as a second `Text` with the same `numberOfLines={2}` and
  `[styles.personSub, { color: t.inkMuted }]`, when non-null. In
  `apps/mobile/app/(tabs)/connections.tsx`, the Connections segment's
  `PersonRow` passes `detail={connection.details?.contact_handle}`; the
  Requests and Blocked segments may pass the card tier's `affiliation`,
  never details.

**Checkpoint (static):** `bun run lint && bun run typecheck`.

**The seed, before the simulator pass.** Without the new fields the demo
users are incomplete: the pass below would send Lin to "Finish your
profile" and show Ada's card without the card tier.
`supabase/seed/index.ts`, after the two `createDemoUser` lines (rename the
comment's words to your vertical's):

```ts
// extend-profile: both demo users fill both tiers. They are not connected
// (Lin's request is pending, and they share a gathering), so each sees the
// other's affiliation and neither sees the other's contact — the boundary,
// in the demo.
for (const [user, affiliation, contact_handle] of [
  [ada, 'Loom St Listening Club', '@ada.listens'],
  [lin, 'Riverside Readers', '@lin.reads'],
] as const) {
  const { error: cardError } = await user.client
    .from('profiles')
    .update({ affiliation })
    .eq('id', user.id);
  if (cardError) throw cardError;
  const { error: detailsError } = await user.client
    .from('profile_details')
    .insert({ profile_id: user.id, contact_handle });
  if (detailsError) throw detailsError;
}
```

Then `bun run db:reset && bun run db:seed`: both demo users are now
complete, with both tiers filled.

**Checkpoint (simulator):** a simulator pass
(`cd apps/mobile && bunx expo start --ios --clear`, API dev server up): a
new account lands on Profile and cannot be left incomplete without being
sent back on the next tabs mount; two connected accounts see each other's
contact in Connections; a tag resolve shows the affiliation and no contact;
and, cold, Connect returns to the tag: signed out, open a tag link whose
card shows Connect (`/t/<uid>`), tap Connect, sign up, and back on the tag
tap Connect again; Profile opens, and Save after filling it lands on the
tag again, not on Profile. The seed has no tag that shows Connect: first
sign in as Lin (complete now, so she lands in the tabs) and claim
`04AAAAAAAAAAAA` (`/t/04AAAAAAAAAAAA` opens the claim flow), then sign out
and use that tag; its card shows Lin's affiliation. The seeded `04BBBBBBBBBBBB` points at Ada's gathering, so it
shows Join (and Ada's affiliation), which takes the same path through
`gathering/[id].tsx`: sign-up lands on its "Join this gathering?" screen
rather than the tag, Join opens Profile, and Save returns to "Join this
gathering?", not to Profile. (If you ran customize-gathering's URL step,
the screen and its copy carry your vertical's word, e.g. "Join this run?".)

On the local stack a brand-new sign-up can land on Events instead. The
first API calls made within a second of sign-up can hit PostgREST's
`PGRST303` ("JWT issued at future"; the API logs "unexpected database
error"), and the gate fails open by design. Relaunch and the account is
sent to Profile. Every tab's first call can fail the same way, so it does
not come from the gate.

## 8. e2e

(The seed edit is in §7, before the simulator pass.)

`apps/api/e2e/handshake.e2e.ts`:

- after the `// 8. profile get/update round-trip` block:

```ts
// 8b. extend-profile: the card tier rides every card, the connections tier only a connection
const extended = await bobApp.profile.update({
  affiliation: 'E2E Club',
  details: { contact_handle: '@e2e.bob' },
});
assert(extended.profile.affiliation === 'E2E Club', 'profile.update writes the card tier');
assert(extended.details?.contact_handle === '@e2e.bob', 'profile.update writes the connections tier');
assert(
  (await bobApp.profile.get()).details?.contact_handle === '@e2e.bob',
  'profile.get returns own details',
);
await aliceApp.profile.update({ details: { contact_handle: '@e2e.alice' } });
```

- in the `// 9. consent flow: bob -> alice, alice accepts` block, after
  the inbox assertions:

```ts
assert(inbox.requests[0]?.requester.affiliation === 'E2E Club', 'the requester card carries the card tier');
assert(!JSON.stringify(inbox).includes('@e2e.bob'), 'a pending request never carries the connections tier');
```

- in the same `// 9.` block, after `accepted` and the two lists:

```ts
assert(accepted.connection.details?.contact_handle === '@e2e.bob', 'accept hands the new connection the details');
assert(bobConns.connections[0]?.details?.contact_handle === '@e2e.alice', 'a connection reads the other side\'s details');
assert(!JSON.stringify(await anon.resolve(uid)).includes('@e2e.alice'), 'resolve never carries the connections tier');
```

`apps/web/e2e/`: affiliation is required for completion, so every step
that creates a profile — `grep -rn "getByLabel('Name'" apps/web/e2e`,
on the Profile form and the claim page's first-profile form, including the
shared `signUpWithProfile` and `claimFreshTag` in `helpers.ts` — fills
`getByLabel('Affiliation')` right after (steps that only assert a Name
value need nothing). The grep stops at the quote so it also finds
`getByLabel('Name', { exact: true })`, which a fork that ran
customize-gathering's relabel fix writes on every Name call. In the
starter it finds seventeen: five `toHaveValue` asserts in `shell.spec.ts`
and twelve fills, all profile-creating: `handshake.spec.ts` 2, `helpers.ts` 2,
`gatherings.spec.ts` 2 (renamed if you ran customize-gathering's URL
step), `shell.spec.ts` 6; each gets
`.getByLabel('Affiliation').fill('Smoke Club')` on the same page. A
Playwright failure later on a profile-creating step is a fill this grep
missed. Then extend `handshake.spec.ts`, after its last
assertion (Bob sees Smoke Ada under `/connections`):

```ts
  // --- extend-profile: the connections tier reaches the new connection ------
  await ada.goto('/profile');
  await ada.getByLabel('Contact', { exact: true }).fill('@smoke.ada');
  // exact: a staged My tags row adds a "Save where … points" button
  await ada.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(ada.getByText('Saved.')).toBeVisible();
  await bob.goto('/connections'); // the Connections segment is the default
  await expect(bob.getByText('@smoke.ada')).toBeVisible();
```

## 9. The gate

The verification gate from `docs/the-slice.md`, then
`cd apps/api && bun run e2e` (API dev server in another shell) ending
`handshake e2e: all checks passed`, with the new extend-profile lines
among the checks, and `cd apps/web && bun run test:e2e`. The counts depend
on the tiers. In the build this was distilled from (both tiers): db
fourteen and contract five over the baseline, eight new API e2e lines, and
every Playwright spec green on the first run. Golf-with-me (card-only, two
card fields, one typed, nothing required beyond the name): db four,
contract seven, API e2e seven.

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
   either way completion is UX, never a boundary.
8. The new table carries the tenant seam, and every policy predicates on it.
9. Any later migration that redefines `resolve_tag` or
   `accept_connect_request` copies the newest definition (this migration
   once it exists). An older body silently drops the card tier and the
   `details` hand-off.

## Scope notes

- Typed fields (a numeric handicap, an enum) take the same steps; the CHECK
  mirrors the zod rule (golf-with-me used a numeric range CHECK), and the
  text-to-value step is in "A typed field" above.
  `isProfileComplete` already accepts a set non-string value.
- A required field (in `REQUIRED_PROFILE_FIELDS`) also needs its input and
  its `disabled` condition in both Profile forms and both claim forms;
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
