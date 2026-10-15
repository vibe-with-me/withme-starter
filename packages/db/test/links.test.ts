// Profile links: connections tier. The owner writes the whole list through
// set_my_links; accepted connections read it both ways. The negative space
// is the spec: every viewer profiles_select admits beyond a connection (the
// pending-request recipient, a blocker), a gathering co-member (who is not
// even admitted to the card), a stranger and anon read nothing — empty and
// error-free — and resolve_tag never carries a link. Shape is checked at
// the database boundary.
import { beforeAll, describe, expect, it } from 'bun:test';
import {
  ANON_KEY,
  SUPABASE_URL,
  admin,
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
  pendingRequestId,
  provisionTag,
  type TestUser,
} from '../src/test-utils/index.ts';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/supabase.ts';

beforeAll(assertStackRunning);

type Link = {
  platform: string;
  value: string;
};

const ADA: Link[] = [
  { platform: 'instagram', value: 'ada' },
  { platform: 'website', value: 'https://ada.example' },
];

/** The owner's own write path: the whole list, in order. */
async function setLinks(user: TestUser, links: Link[]): Promise<Link[]> {
  const { data, error } = await user.client.rpc('set_my_links', { p_links: links });
  expect(error).toBeNull();
  return (data ?? []).map(({ platform, value }) => ({ platform, value }));
}

/** What `viewer` reads of `owner`'s links. Invisible means empty and error-free. */
async function linksSeenBy(viewer: TestUser, owner: TestUser): Promise<Link[]> {
  const { data, error } = await viewer.client
    .from('profile_links')
    .select('platform, value')
    .eq('profile_id', owner.id)
    .order('sort_order', { ascending: true });
  expect(error).toBeNull();
  return data ?? [];
}

async function seesCard(viewer: TestUser, owner: TestUser): Promise<boolean> {
  const { data, error } = await viewer.client.from('profiles').select('id').eq('id', owner.id);
  expect(error).toBeNull();
  return (data ?? []).length === 1;
}

describe('the owner', () => {
  it('sets the whole list in order, replaces it, and clears it', async () => {
    const alice = await createTestUser('Alice');
    expect(await setLinks(alice, ADA)).toEqual(ADA);
    expect(await linksSeenBy(alice, alice)).toEqual(ADA);

    // a platform left out is removed; a listed one is updated in place
    const next = [{ platform: 'website', value: 'https://ada.example/new' }];
    expect(await setLinks(alice, next)).toEqual(next);
    expect(await linksSeenBy(alice, alice)).toEqual(next);

    expect(await setLinks(alice, [])).toEqual([]);
    expect(await linksSeenBy(alice, alice)).toEqual([]);
  });

  it('rows carry the tenant seam', async () => {
    const alice = await createTestUser('Alice');
    await setLinks(alice, ADA);
    const { data } = await admin
      .from('profile_links')
      .select('tenant_id')
      .eq('profile_id', alice.id);
    expect(data?.map((row) => row.tenant_id)).toEqual([
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
    ]);
  });

  it('needs a profile first', async () => {
    const email = `${crypto.randomUUID()}@rls.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: 'rls-test-password-1!',
      email_confirm: true,
    });
    expect(error).toBeNull();
    const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: 'rls-test-password-1!',
    });
    expect(signInError).toBeNull();
    expect(data.user).not.toBeNull();

    const { error: setError } = await client.rpc('set_my_links', { p_links: ADA });
    expect(setError?.code).toBe('23503');
  });
});

describe('visibility', () => {
  it('an accepted connection reads them, both ways, in order', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setLinks(alice, ADA);
    await setLinks(bob, [{ platform: 'phone', value: '+15551234567' }]);
    await connectUsers(alice, bob);
    expect(await linksSeenBy(bob, alice)).toEqual(ADA);
    expect(await linksSeenBy(alice, bob)).toEqual([{ platform: 'phone', value: '+15551234567' }]);
  });

  it('a stranger and anon read nothing', async () => {
    const alice = await createTestUser('Alice');
    const stranger = await createTestUser('Stranger');
    await setLinks(alice, ADA);
    expect(await linksSeenBy(stranger, alice)).toEqual([]);
    const { data, error } = await anonClient().from('profile_links').select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('a pending-request recipient sees the card, not the links', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setLinks(alice, ADA);
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    expect(await seesCard(bob, alice)).toBe(true);
    expect(await linksSeenBy(bob, alice)).toEqual([]);
  });

  it('a gathering co-member sees neither the card nor the links; a card viewer gets no links through an embed', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setLinks(alice, ADA);
    const { data: gathering, error } = await alice.client.rpc('create_gathering', {
      p_title: 'Rooftop listening session',
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(error).toBeNull();
    const { error: joinError } = await bob.client.rpc('join_gathering', {
      p_gathering_id: (gathering as { id: string }).id,
    });
    expect(joinError).toBeNull();

    // co-membership is not a card bridge (gatherings_domain_wide (c))
    expect(await seesCard(bob, alice)).toBe(false);
    expect(await linksSeenBy(bob, alice)).toEqual([]);

    // a viewer who does see the card (here: a pending-request recipient)
    // still cannot pull the links through an embed
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    expect(await seesCard(bob, alice)).toBe(true);
    const { data: embedded, error: embedError } = await bob.client
      .from('profiles')
      .select('id, links:profile_links(platform)')
      .eq('id', alice.id);
    expect(embedError).toBeNull();
    expect(embedded).toEqual([{ id: alice.id, links: [] }]);
  });

  it('a block ends access both ways, and the blocker does not inherit it', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setLinks(alice, ADA);
    await setLinks(bob, [{ platform: 'x', value: 'bob' }]);
    await connectUsers(alice, bob);
    const { error } = await bob.client
      .from('blocks')
      .insert({ blocker_id: bob.id, blocked_id: alice.id, reveals_card: true });
    expect(error).toBeNull();

    // the blocker still sees the blocked card (their block list) ...
    expect(await seesCard(bob, alice)).toBe(true);
    // ... but neither reads the other's links any more
    expect(await linksSeenBy(bob, alice)).toEqual([]);
    expect(await linksSeenBy(alice, bob)).toEqual([]);
  });

  it('resolve_tag never carries a link, not even for a connection', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setLinks(alice, [{ platform: 'instagram', value: 'ada.private' }]);
    await connectUsers(alice, bob);
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });
    for (const client of [anonClient(), bob.client]) {
      const { data, error } = await client.rpc('resolve_tag', { p_uid: uid });
      expect(error).toBeNull();
      expect(JSON.stringify(data)).not.toContain('ada.private');
      expect(JSON.stringify(data)).not.toContain('links');
    }
  });

  it('accept hands the new connection the requester links, [] without any', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    await setLinks(alice, ADA);
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    const { data, error } = await bob.client.rpc('accept_connect_request', {
      p_request_id: await pendingRequestId(alice, bob),
    });
    expect(error).toBeNull();
    expect((data as { links: unknown }).links).toEqual(ADA);

    await carol.client.rpc('send_connect_request', { p_recipient: bob.id });
    const { data: bare } = await bob.client.rpc('accept_connect_request', {
      p_request_id: await pendingRequestId(carol, bob),
    });
    expect((bare as { links: unknown }).links).toEqual([]);
  });
});

describe('the boundary', () => {
  it("another profile's links cannot be written, whether or not a row exists", async () => {
    const alice = await createTestUser('Alice');
    const carol = await createTestUser('Carol');
    const mallory = await createTestUser('Mallory');
    await setLinks(alice, ADA); // alice has rows; carol has none; the third id is nobody

    const refusals: Array<{ code?: string; message?: string }> = [];
    for (const profile_id of [alice.id, carol.id, crypto.randomUUID()]) {
      const { error } = await mallory.client
        .from('profile_links')
        .insert({ profile_id, platform: 'x', value: 'mallory' });
      refusals.push({ code: error?.code, message: error?.message });
    }
    expect(refusals[0]?.code).toBe('42501');
    expect(refusals[1]).toEqual(refusals[0]);
    expect(refusals[2]).toEqual(refusals[0]);

    // an update aimed at someone else's row changes nothing, silently
    const { data: touched, error } = await mallory.client
      .from('profile_links')
      .update({ value: 'mallory' })
      .eq('profile_id', alice.id)
      .select('value');
    expect(error).toBeNull();
    expect(touched).toEqual([]);
    expect(await linksSeenBy(alice, alice)).toEqual(ADA);
  });

  it('profile_id, platform and tenant_id are immutable through the client', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setLinks(alice, ADA);
    for (const patch of [
      { profile_id: bob.id },
      { platform: 'x' },
      { tenant_id: crypto.randomUUID() },
    ]) {
      const { error } = await alice.client
        .from('profile_links')
        .update(patch)
        .eq('profile_id', alice.id);
      expect(error?.code).toBe('42501');
    }
  });

  it('the stored shape is checked at the database boundary', async () => {
    const alice = await createTestUser('Alice');
    for (const link of [
      { platform: 'instagram', value: '@ada' }, // the @ is stripped before storing
      { platform: 'instagram', value: 'ada lovelace' },
      { platform: 'phone', value: '555 1234' },
      { platform: 'email', value: 'ada@localhost' },
      { platform: 'website', value: 'ada.example' }, // no scheme
      { platform: 'website', value: `https://${'x'.repeat(200)}.com` },
      { platform: 'myspace', value: 'ada' }, // not a platform
      { platform: 'email', value: 'ada@example.com?bcc=eve@evil.example' }, // mailto injection
      { platform: 'email', value: 'eve@evil.example,ada@example.com' }, // a second recipient
      { platform: 'email', value: 'ada@example.com\u202e' }, // bidi override
      { platform: 'website', value: 'https://google.com@evil.example' }, // userinfo
      { platform: 'website', value: 'https://example.com evil' }, // unanchored tail
      { platform: 'website', value: 'https://exa\u200bmple.com' }, // zero-width space
    ]) {
      const { error } = await alice.client.rpc('set_my_links', { p_links: [link] });
      expect(error?.message).toContain('profile_links_value_shape');
    }
    expect(await linksSeenBy(alice, alice)).toEqual([]);
  });

  it('one link per platform, in one call too', async () => {
    const alice = await createTestUser('Alice');
    const { error } = await alice.client.rpc('set_my_links', {
      p_links: [
        { platform: 'x', value: 'ada' },
        { platform: 'x', value: 'ada2' },
      ],
    });
    expect(error?.code).toBe('23505');
    expect(await linksSeenBy(alice, alice)).toEqual([]);
  });

  it('the list is an array of at most the registry, or nothing', async () => {
    const alice = await createTestUser('Alice');
    const { error: notArray } = await alice.client.rpc('set_my_links', {
      p_links: { platform: 'x', value: 'ada' },
    });
    expect(notArray?.code).toBe('22023');
    const { error: tooMany } = await alice.client.rpc('set_my_links', {
      p_links: Array.from({ length: 33 }, (_, i) => ({ platform: `p${i}`, value: 'ada' })),
    });
    expect(tooMany?.code).toBe('22023');
  });

  it('deleting the account removes the links', async () => {
    const alice = await createTestUser('Alice');
    await setLinks(alice, ADA);
    const { error } = await admin.auth.admin.deleteUser(alice.id);
    expect(error).toBeNull();
    const { data, error: readError } = await admin
      .from('profile_links')
      .select('*')
      .eq('profile_id', alice.id);
    expect(readError).toBeNull();
    expect(data).toEqual([]);
  });
});
