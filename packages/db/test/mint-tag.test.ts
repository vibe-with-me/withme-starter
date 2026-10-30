// Minted tags: a physical tag row for a blank sticker, claimed to its owner
// from the moment it exists. Nothing unclaimed is created, so nothing here can
// be stolen, and from then on it behaves like any tag someone claimed.
import { beforeAll, describe, expect, it } from 'bun:test';
import { MAX_OWNED_TAGS } from '@withme/contract';
import { listOwnTags } from '../src/queries/tags.ts';
import {
  admin,
  anonClient,
  assertStackRunning,
  createTestUser,
  provisionTag,
  type TestUser,
} from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

async function mint(user: TestUser): Promise<string> {
  const { data, error } = await user.client.rpc('mint_my_tag');
  expect(error).toBeNull();
  expect(data).toMatch(/^[0-9A-F]{14}$/);
  return data as string;
}

/** Fills the caller up to `count` owned tags, through the service role. */
async function own(user: TestUser, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const uid = await provisionTag();
    const { error } = await admin
      .from('tags')
      .update({ claimed_by: user.id, status: 'claimed', destination: { type: 'profile' } })
      .eq('uid', uid);
    expect(error).toBeNull();
  }
}

async function resolve(uid: string, client = anonClient()) {
  const { data, error } = await client.rpc('resolve_tag', { p_uid: uid });
  expect(error).toBeNull();
  return data as { status: string; profile?: { id: string } };
}

describe('mint_my_tag', () => {
  it('makes a claimed physical tag that points at your card', async () => {
    const alice = await createTestUser('Alice');
    const uid = await mint(alice);
    const { data } = await admin
      .from('tags')
      .select('kind, status, claimed_by, destination')
      .eq('uid', uid)
      .single();
    expect(data).toEqual({
      kind: 'nfc',
      status: 'claimed',
      claimed_by: alice.id,
      destination: { type: 'profile' },
    });
  });

  it('mints a new tag each time, and My tags lists them', async () => {
    const alice = await createTestUser('Alice');
    const first = await mint(alice);
    const second = await mint(alice);
    expect(second).not.toBe(first);
    const mine = await listOwnTags(alice.client);
    expect(mine.map((tag) => tag.uid).toSorted()).toEqual([first, second].toSorted());
  });

  it('refuses anon', async () => {
    const { data, error } = await anonClient().rpc('mint_my_tag');
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('refuses a caller with no profile, and creates nothing', async () => {
    const alice = await createTestUser('Alice');
    expect((await admin.from('profiles').delete().eq('id', alice.id)).error).toBeNull();
    const { error } = await alice.client.rpc('mint_my_tag');
    expect(error?.code).toBe('P0001');
    const { data } = await admin.from('tags').select('uid').eq('claimed_by', alice.id);
    expect(data).toHaveLength(0);
  });
});

describe('the cap', () => {
  it('allows the last tag and refuses the one after', async () => {
    const alice = await createTestUser('Alice');
    await own(alice, MAX_OWNED_TAGS - 1);
    await mint(alice);
    const { data, error } = await alice.client.rpc('mint_my_tag');
    expect(data).toBeNull();
    expect(error?.code).toBe('P0004');
  });

  it('counts tags you claimed, and does not count your share code', async () => {
    const alice = await createTestUser('Alice');
    expect((await alice.client.rpc('my_share_code')).error).toBeNull();
    await own(alice, MAX_OWNED_TAGS - 2);
    const sticker = await provisionTag();
    expect((await alice.client.rpc('claim_tag', { p_uid: sticker })).error).toBeNull();
    // 24 physical tags plus the share code: one left.
    await mint(alice);
    expect((await alice.client.rpc('mint_my_tag')).error?.code).toBe('P0004');
  });

  it('leaves claim_tag alone: someone at the cap can still claim a tag', async () => {
    const alice = await createTestUser('Alice');
    await own(alice, MAX_OWNED_TAGS);
    const sticker = await provisionTag();
    expect((await alice.client.rpc('claim_tag', { p_uid: sticker })).error).toBeNull();
    const { data } = await admin.from('tags').select('claimed_by').eq('uid', sticker).single();
    expect(data?.claimed_by).toBe(alice.id);
  });

  it('holds under concurrent mints', async () => {
    const alice = await createTestUser('Alice');
    await own(alice, MAX_OWNED_TAGS - 1);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => alice.client.rpc('mint_my_tag')),
    );
    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    const { data } = await admin
      .from('tags')
      .select('uid')
      .eq('claimed_by', alice.id)
      .eq('kind', 'nfc');
    expect(data).toHaveLength(MAX_OWNED_TAGS);
  });

  it('is per person: one full account does not stop another', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await own(alice, MAX_OWNED_TAGS);
    await mint(bob);
  });
});

describe('a minted tag is a tag', () => {
  it('cannot be taken by claim_tag', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const uid = await mint(alice);
    const { data } = await bob.client.rpc('claim_tag', { p_uid: uid });
    expect(data).toBeNull();
    const { data: row } = await admin.from('tags').select('claimed_by').eq('uid', uid).single();
    expect(row?.claimed_by).toBe(alice.id);
  });

  it('its owner can turn it off and on; a stranger cannot', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const uid = await mint(alice);
    const stranger = await bob.client
      .from('tags')
      .update({ status: 'disabled' })
      .eq('uid', uid)
      .select('uid');
    expect(stranger.data).toEqual([]);
    const owner = await alice.client
      .from('tags')
      .update({ status: 'disabled' })
      .eq('uid', uid)
      .select('uid');
    expect(owner.data).toEqual([{ uid }]);
    expect((await resolve(uid)).status).toBe('disabled');
  });

  it('a stranger sees the same card as any tap', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const uid = await mint(alice);
    const seen = await resolve(uid, bob.client);
    expect(seen.status).toBe('claimed');
    expect(seen.profile?.id).toBe(alice.id);
  });

  it('a viewer the owner blocked gets disabled', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const uid = await mint(alice);
    // positive control: bob sees the card before the block
    expect((await resolve(uid, bob.client)).status).toBe('claimed');
    expect(
      (await alice.client.from('blocks').insert({ blocker_id: alice.id, blocked_id: bob.id })).error,
    ).toBeNull();
    expect((await resolve(uid, bob.client)).status).toBe('disabled');
  });

  it('nobody can mint a tag for someone else: the RPC takes no arguments', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const { error } = await alice.client.rpc(
      'mint_my_tag',
      { p_user: bob.id } as unknown as undefined,
    );
    expect(error).not.toBeNull();
    const { data } = await admin.from('tags').select('uid').eq('claimed_by', bob.id);
    expect(data).toHaveLength(0);
  });
});
