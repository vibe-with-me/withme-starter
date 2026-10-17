# extend-profile — reference

The code the steps in `SKILL.md` point at, in the worked example's names
(`affiliation` for the card tier, `contact_handle` for the connections
tier). Rename both to your vertical's words and keep the shapes. A fork
with only one tier skips the other tier's blocks (`variants.md`).

## §1 Contract schemas

`packages/contract/src/schemas/profile.ts`, above `ProfileSchema`:

```ts
/**
 * Card tier: a free-text line on the card. Crosses the anonymous resolve
 * boundary. Plain text, like display_name: no control, bidi or invisible
 * characters. DB CHECKs mirror it.
 */
export const CardLineSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((v) => isPlainText(v), PLAIN_TEXT_MESSAGE);

/**
 * Connections tier: read only by the owner and accepted connections. Never
 * part of PublicProfileSchema, never on resolve, a pending request, or a
 * gathering member list. Plain text too. DB CHECKs mirror it.
 */
export const ProfileDetailsSchema = z.object({
  contact_handle: z
    .string()
    .min(1)
    .max(120)
    .refine((v) => isPlainText(v), PLAIN_TEXT_MESSAGE)
    .nullable(),
});

export type ProfileDetails = z.infer<typeof ProfileDetailsSchema>;
```

The completion rule, after the `Profile` type:

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

## §1 Contract tests

Append at the end of `packages/contract/test/schemas.test.ts`:

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

  it('rejects empty, oversized and spoofing values in either tier', () => {
    for (const affiliation of ['', 'x'.repeat(81), 'Riverside\u202EGC', 'River\u200Bside']) {
      expect(UpdateProfileInputSchema.safeParse({ affiliation }).success).toBe(false);
    }
    for (const contact_handle of ['', 'x'.repeat(121), '@ali\u202Ece', '@ali\u200Bce']) {
      expect(UpdateProfileInputSchema.safeParse({ details: { contact_handle } }).success).toBe(false);
    }
  });

  it('a connection always carries the details key, null without a details row', () => {
    const connection = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      created_at: '2026-10-11T00:00:00Z',
      profile: card,
      links: [],
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

## §2 `packages/db/test/profile-fields.test.ts`

```ts
// extend-profile: two visibility tiers. The card tier rides every card; the
// connections tier reaches the owner and accepted connections only. The
// negative space is the spec: every viewer profiles_select admits beyond a
// connection (pending-request recipient, blocker), a gathering co-member
// (not even admitted to the card) and anon read nothing from
// profile_details, and get no oracle trying.
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

  it('is length- and plain-text-checked at the database boundary', async () => {
    const alice = await createTestUser('Alice');
    for (const affiliation of ['', 'x'.repeat(81)]) {
      const { error } = await alice.client.from('profiles').update({ affiliation }).eq('id', alice.id);
      expect(error?.message).toContain('profiles_affiliation_length');
    }
    for (const affiliation of ['Riverside\u202EGC', 'River\u200Bside']) {
      const { error } = await alice.client.from('profiles').update({ affiliation }).eq('id', alice.id);
      expect(error?.message).toContain('profiles_affiliation_plain');
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

  it('a gathering co-member sees neither the card nor the details; a card viewer gets no details through an embed', async () => {
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

    // co-membership is not a card bridge (customize-gathering §3b)
    expect(await seesCard(bob, alice)).toBe(false);
    await expectNoDetails(bob, alice);

    // a viewer who does see the card (here: a pending-request recipient)
    // still cannot pull the details through an embed
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    expect(await seesCard(bob, alice)).toBe(true);
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
      .insert({ blocker_id: bob.id, blocked_id: alice.id, reveals_card: true });
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

  it('is length- and plain-text-checked at the database boundary', async () => {
    const alice = await createTestUser('Alice');
    await setDetails(alice, '@alice');
    for (const contact_handle of ['', 'x'.repeat(121)]) {
      const { error } = await alice.client
        .from('profile_details')
        .update({ contact_handle })
        .eq('profile_id', alice.id);
      expect(error?.message).toContain('profile_details_contact_handle_length');
    }
    for (const contact_handle of ['@ali\u202Ece', '@ali\u200Bce']) {
      const { error } = await alice.client
        .from('profile_details')
        .update({ contact_handle })
        .eq('profile_id', alice.id);
      expect(error?.message).toContain('profile_details_contact_handle_plain');
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

## §2 Additions to existing db tests

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

## §3 Migration

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
    check (affiliation is null or char_length(affiliation) between 1 and 80)
    constraint profiles_affiliation_plain
    check (private.is_plain_text(affiliation));

-- ======================================================== connections tier ==

create table public.profile_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  tenant_id uuid not null default private.current_tenant_id(),
  contact_handle text
    constraint profile_details_contact_handle_length
    check (contact_handle is null or char_length(contact_handle) between 1 and 120)
    constraint profile_details_contact_handle_plain
    check (private.is_plain_text(contact_handle)),
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

## §4 Queries

`packages/db/src/queries/handshake.ts`, right after `upsertOwnProfile`:

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

`listConnections`: embed the tier under each side's card, beside the
links embed it already has, and lift both out:

```ts
     a:profiles!connections_user_a_fkey(${CARD_COLUMNS}, ${LINK_EMBED}, details:profile_details(${DETAILS_COLUMNS})),
     b:profiles!connections_user_b_fkey(${CARD_COLUMNS}, ${LINK_EMBED}, details:profile_details(${DETAILS_COLUMNS}))`,
```

```ts
return (data ?? []).flatMap((row) => {
  const other = row.user_a === userId ? row.b : row.a;
  if (!other) return [];
  const { links, details, ...profile } = other;
  return [
    {
      id: row.id,
      created_at: row.created_at,
      profile,
      links: sortLinks(links),
      details: details ?? null,
    },
  ];
});
```

(The API casts these rows to `Connection[]`, so a dropped `links` key is
not a type error: it fails the contract's output check at runtime.)

and `ConnectionRow` gains `details: ProfileDetails | null`. (The primary
key is the foreign key, so PostgREST embeds one object or null; if your
generated types say array, the relationship lost `isOneToOne` — check the
migration, not the mapper.)

## §4 API handlers

`apps/api/src/routers/app.ts` (import `getOwnDetails`, `upsertOwnDetails`):

```ts
const getProfile = appProcedure.profile.get.handler(async ({ context }) => {
  const { userId } = context;
  const [profile, details] = await run(context, () =>
    Promise.all([getOwnProfile(context.db, userId), getOwnDetails(context.db, userId)]),
  );
  return { profile: profile as Profile | null, details };
});

const updateProfile = appProcedure.profile.update.handler(async ({ input, context }) => {
  const { userId } = context;
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

## §6 Web profile fields

In `IdentityForm` (`apps/web/src/routes/_app.profile.tsx`), after Bio, before the `TermsCheckbox`:

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

## §6 Web `PersonRow`

`apps/web/src/routes/_app.connections.tsx`:

```tsx
function PersonRow({
  profile,
  sub,
  detail,
  links,
  children,
}: {
  profile: PublicProfile;
  sub?: string | null;
  detail?: string | null;
  /** Connections only: the one list that carries them. */
  links?: ProfileLink[];
  children: ReactNode;
}) {
```

  and after its `{sub ? <span className="sub">{sub}</span> : null}`:

```tsx
        {detail ? <span className="sub">{detail}</span> : null}
```

## §7 Mobile gate

`apps/mobile/app/(tabs)/_layout.tsx`:

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

## §7 Mobile profile fields

`apps/mobile/app/(tabs)/profile.tsx`, after the Bio `Field` (`edit(…)` marks the
form dirty, so the reload on focus keeps what someone is typing):

```tsx
<Field
  label="Affiliation"
  value={affiliation}
  onChangeText={edit(setAffiliation)}
  maxLength={80}
  placeholder="Your club, team, or company"
/>
<Field
  label="Contact"
  value={contact}
  onChangeText={edit(setContact)}
  maxLength={120}
  autoCapitalize="none"
  placeholder="Phone, email, or handle"
/>
<Muted>Only your connections see your contact.</Muted>
```

## §7 Seed

`supabase/seed/index.ts`, after the two `createDemoUser` lines:

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

## §8 API e2e

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

## §8 `handshake.spec.ts`

After its last assertion (Bob sees Smoke Ada under `/connections`):

```ts
  // --- extend-profile: the connections tier reaches the new connection ------
  await ada.goto('/profile');
  await ada.getByLabel('Contact', { exact: true }).fill('@smoke.ada');
  // exact: a staged My tags row adds a "Save where … points" button
  await ada.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(ada.getByText('Saved.')).toBeVisible();
  await bob.goto('/connections'); // the Connections segment is the default
  await expect(bob.getByText('@smoke.ada')).toBeVisible();
  // the card tier rides the row too (cardLine), not only the tapped card
  await expect(bob.getByText('Smoke Club')).toBeVisible();
```
