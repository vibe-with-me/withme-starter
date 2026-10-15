// Blocks are absolute and invisible. The blocked user gets no signal a block
// exists — ever — and the blocker never sees dropped requests.
import { beforeAll, describe, expect, it } from 'bun:test';
import {
  admin,
  assertStackRunning,
  connectUsers,
  createTestUser,
  provisionTag,
} from '../src/test-utils/index.ts';
import { BLOCKED_USER_NAME, blockUser, listBlocks, unblockUser } from '../src/queries/handshake.ts';

beforeAll(assertStackRunning);

describe('block invisibility', () => {
  it('a blocked user cannot view the blocker profile, even when previously connected', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await connectUsers(alice, bob);

    const { error } = await bob.client.from('blocks').insert({
      blocker_id: bob.id,
      blocked_id: alice.id,
    });
    expect(error).toBeNull();

    const { data } = await alice.client.from('profiles').select('*').eq('id', bob.id);
    expect(data ?? []).toEqual([]);
  });

  it('blocking auto-removes the existing connection for both parties', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await connectUsers(alice, bob);

    await bob.client.from('blocks').insert({ blocker_id: bob.id, blocked_id: alice.id });

    const { data: aliceView } = await alice.client.from('connections').select('*');
    const { data: bobView } = await bob.client.from('connections').select('*');
    expect(aliceView ?? []).toEqual([]);
    expect(bobView ?? []).toEqual([]);
  });

  it('blocking cancels pending requests in both directions, leaving no trace', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    await bob.client.rpc('send_connect_request', { p_recipient: alice.id });

    await bob.client.from('blocks').insert({ blocker_id: bob.id, blocked_id: alice.id });

    const { data: bobInbox } = await bob.client.from('connect_requests').select('*');
    const { data: aliceInbox } = await alice.client.from('connect_requests').select('*');
    expect(bobInbox ?? []).toEqual([]);
    expect(aliceInbox ?? []).toEqual([]);
  });

  it('a blocked sender gets a success ack but nothing is stored (silent drop)', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await bob.client.from('blocks').insert({ blocker_id: bob.id, blocked_id: alice.id });

    // Identical ack to an unblocked send: no error, no data.
    const { error } = await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    expect(error).toBeNull();

    // The blocker's inbox shows nothing...
    const { data: inbox } = await bob.client.from('connect_requests').select('*');
    expect(inbox ?? []).toEqual([]);
    // ...and nothing was stored at all (service-role check).
    const { data: raw } = await admin
      .from('connect_requests')
      .select('*')
      .eq('requester_id', alice.id)
      .eq('recipient_id', bob.id);
    expect(raw ?? []).toEqual([]);
  });

  it('a blocked viewer resolving the blocker tag sees disabled — same as a deactivated tag', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const uid = await provisionTag();
    await bob.client.rpc('claim_tag', { p_uid: uid });
    await bob.client.from('blocks').insert({ blocker_id: bob.id, blocked_id: alice.id });

    const { data } = await alice.client.rpc('resolve_tag', { p_uid: uid });
    expect((data as { status: string }).status).toBe('disabled');

    // An uninvolved user still resolves it normally.
    const carol = await createTestUser('Carol');
    const { data: carolView } = await carol.client.rpc('resolve_tag', { p_uid: uid });
    expect((carolView as { status: string }).status).toBe('claimed');
  });

  it('the blocked user cannot see the block row in any direction', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await bob.client.from('blocks').insert({ blocker_id: bob.id, blocked_id: alice.id });

    const { data } = await alice.client.from('blocks').select('*');
    expect(data ?? []).toEqual([]);

    const { data: bobView } = await bob.client.from('blocks').select('*');
    expect(bobView).toHaveLength(1);
  });

  it('the blocker still sees a card they could see when they blocked, even under a mutual block', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await connectUsers(alice, bob);
    // Bob blocks from his connections list: the card was visible, so the
    // block row may keep it visible for his block-list UI.
    await bob.client
      .from('blocks')
      .insert({ blocker_id: bob.id, blocked_id: alice.id, reveals_card: true });
    // Alice can no longer see Bob, so her block cannot reveal his card.
    const { error } = await alice.client
      .from('blocks')
      .insert({ blocker_id: alice.id, blocked_id: bob.id, reveals_card: true });
    expect(error).not.toBeNull();
    await alice.client.from('blocks').insert({ blocker_id: alice.id, blocked_id: bob.id });

    const { data: bobSees } = await bob.client
      .from('profiles')
      .select('display_name')
      .eq('id', alice.id);
    expect(bobSees?.[0]?.display_name).toBe('Alice');
    const { data: aliceSees } = await alice.client.from('profiles').select('*').eq('id', bob.id);
    expect(aliceSees ?? []).toEqual([]);
  });

  it('blocking a stranger never reveals their card', async () => {
    const mallory = await createTestUser('Mallory');
    const host = await createTestUser('Host');

    // A plain block row reveals nothing.
    await mallory.client.from('blocks').insert({ blocker_id: mallory.id, blocked_id: host.id });
    const { data } = await mallory.client.from('profiles').select('*').eq('id', host.id);
    expect(data ?? []).toEqual([]);

    // Asking for the card outright is refused by RLS.
    await mallory.client.from('blocks').delete().eq('blocked_id', host.id);
    const { error } = await mallory.client
      .from('blocks')
      .insert({ blocker_id: mallory.id, blocked_id: host.id, reveals_card: true });
    expect(error).not.toBeNull();
    const { data: after } = await mallory.client.from('profiles').select('*').eq('id', host.id);
    expect(after ?? []).toEqual([]);
  });

  it('a gathering host id cannot be turned into a card by blocking the host', async () => {
    const mallory = await createTestUser('Mallory');
    const host = await createTestUser('Host');
    const { error: createError } = await host.client.rpc('create_gathering', {
      p_title: 'Open house',
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      p_location: 'Downtown',
    });
    expect(createError).toBeNull();

    const { data: feed } = await mallory.client.from('gatherings').select('host_id');
    expect(feed?.map((g) => g.host_id)).toContain(host.id);

    await blockUser(mallory.client, mallory.id, host.id);
    const { data } = await mallory.client.from('profiles').select('*').eq('id', host.id);
    expect(data ?? []).toEqual([]);

    // The block still lists, without the card, so it can be undone.
    expect(await listBlocks(mallory.client)).toEqual([
      {
        created_at: expect.any(String),
        user: { id: host.id, display_name: BLOCKED_USER_NAME, avatar_path: null, bio: null },
      },
    ]);
    await unblockUser(mallory.client, mallory.id, host.id);
    expect(await listBlocks(mallory.client)).toEqual([]);
  });

  it('blockUser keeps the card in the block list when it was visible', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await connectUsers(alice, bob);

    await blockUser(bob.client, bob.id, alice.id);
    const blocks = await listBlocks(bob.client);
    expect(blocks.map((b) => b.user.display_name)).toEqual(['Alice']);
  });

  it('existing block rows cannot be flipped to reveal a card', async () => {
    const mallory = await createTestUser('Mallory');
    const host = await createTestUser('Host');
    await mallory.client.from('blocks').insert({ blocker_id: mallory.id, blocked_id: host.id });
    await mallory.client.from('blocks').update({ reveals_card: true }).eq('blocked_id', host.id);
    const { data } = await mallory.client.from('profiles').select('*').eq('id', host.id);
    expect(data ?? []).toEqual([]);
  });

  it('a request cannot be accepted once a block lands, with no distinct signal', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    const { data: inbox } = await bob.client
      .from('connect_requests')
      .select('id')
      .eq('status', 'pending')
      .single();

    // Alice blocks Bob after sending; Bob's accept must fail exactly like a
    // request that never existed (not a different error).
    await alice.client.from('blocks').insert({ blocker_id: alice.id, blocked_id: bob.id });
    const { error } = await bob.client.rpc('accept_connect_request', {
      p_request_id: inbox!.id,
    });
    expect(error?.message).toContain('request not found');

    const { data: conns } = await admin
      .from('connections')
      .select('*')
      .eq('user_a', alice.id < bob.id ? alice.id : bob.id);
    expect(conns ?? []).toEqual([]);
  });

  it('only the blocker can remove their block', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await bob.client.from('blocks').insert({ blocker_id: bob.id, blocked_id: alice.id });

    // Alice cannot delete a block she cannot see.
    await alice.client.from('blocks').delete().eq('blocker_id', bob.id);
    const { data: stillThere } = await bob.client.from('blocks').select('*');
    expect(stillThere).toHaveLength(1);

    // Bob can.
    await bob.client.from('blocks').delete().eq('blocked_id', alice.id);
    const { data: gone } = await bob.client.from('blocks').select('*');
    expect(gone ?? []).toEqual([]);
  });
});
