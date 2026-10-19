// Where a connection was made (20261019120000). The database infers the
// gathering at accept, from what both parties are members of around the
// moment the request was sent; the client never names it. The spec is the
// negative space: no shared gathering, one outside the window, someone who
// left, a pending request, a client write and a viewer who no longer sees
// the gathering all read null, each beside a positive control.
import { beforeAll, describe, expect, it } from 'bun:test';
import {
  admin,
  assertStackRunning,
  createTestUser,
  pendingRequestId,
  type TestUser,
} from '../src/test-utils/index.ts';
import { listConnections } from '../src/queries/index.ts';

beforeAll(assertStackRunning);

const HOUR = 3_600_000;

/** A gathering for everyone, starting `offsetMs` from now; the host is a member. */
async function gathering(host: TestUser, offsetMs = HOUR, title = 'Friday mixer'): Promise<string> {
  // Created in the future (where join works), then moved by the operator.
  const { data, error } = await host.client.rpc('create_gathering', {
    p_title: title,
    p_starts_at: new Date(Date.now() + Math.max(offsetMs, HOUR)).toISOString(),
    p_visibility: 'everyone',
  });
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

async function moveTo(id: string, offsetMs: number) {
  const { error } = await admin
    .from('gatherings')
    .update({ starts_at: new Date(Date.now() + offsetMs).toISOString() })
    .eq('id', id);
  expect(error).toBeNull();
}

async function join(user: TestUser, id: string) {
  const { error } = await user.client.rpc('join_gathering', { p_gathering_id: id });
  expect(error).toBeNull();
}

/** a requests, b accepts; returns accept's answer. */
async function connect(a: TestUser, b: TestUser) {
  const { error } = await a.client.rpc('send_connect_request', { p_recipient: b.id });
  expect(error).toBeNull();
  const requestId = await pendingRequestId(a, b);
  const { data, error: acceptError } = await b.client.rpc('accept_connect_request', {
    p_request_id: requestId,
  });
  expect(acceptError).toBeNull();
  return data as { id: string; gathering: { id: string; title: string } | null };
}

async function metAt(viewer: TestUser) {
  const rows = await listConnections(viewer.client, viewer.id);
  expect(rows).toHaveLength(1);
  return rows[0]!.gathering;
}

describe('the gathering a connection was made at', () => {
  it('is recorded when both are going to one starting near the tap, and both see it', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await gathering(alice);
    await join(bob, id);

    const accepted = await connect(bob, alice);
    expect(accepted.gathering).toMatchObject({ id, title: 'Friday mixer' });
    expect(await metAt(alice)).toMatchObject({ id, title: 'Friday mixer' });
    expect(await metAt(bob)).toMatchObject({ id, title: 'Friday mixer' });
  });

  it('counts one that started earlier the same evening', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await gathering(alice);
    await join(bob, id);
    await moveTo(id, -3 * HOUR);

    await connect(alice, bob);
    expect((await metAt(bob))?.id).toBe(id);
  });

  it('is null when only one of them is going', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await gathering(alice);

    const accepted = await connect(alice, bob);
    expect(accepted.gathering).toBeNull();
    expect(await metAt(alice)).toBeNull();
    expect(await metAt(bob)).toBeNull();
  });

  it('is null when the shared gathering is days away or long over', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const ahead = await gathering(alice, 0, 'Next week');
    await moveTo(ahead, 3 * 24 * HOUR);
    const over = await gathering(alice, 0, 'Last week');
    await join(bob, ahead);
    await join(bob, over);
    await moveTo(over, -3 * 24 * HOUR);

    await connect(alice, bob);
    expect(await metAt(alice)).toBeNull();
  });

  it('picks the shared gathering closest to the tap', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const earlier = await gathering(alice, 0, 'Drinks');
    const closer = await gathering(alice, 0, 'Dinner');
    await join(bob, earlier);
    await join(bob, closer);
    await moveTo(earlier, -6 * HOUR);
    await moveTo(closer, -30 * 60_000);

    await connect(alice, bob);
    expect(await metAt(alice)).toMatchObject({ id: closer, title: 'Dinner' });
  });

  it('is null when the requester left before the accept', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await gathering(alice);
    await join(bob, id);
    await bob.client.rpc('send_connect_request', { p_recipient: alice.id });
    const requestId = await pendingRequestId(bob, alice);
    await bob.client.from('gathering_members').delete().eq('gathering_id', id).eq('profile_id', bob.id);
    const { data: still } = await admin
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', id)
      .eq('profile_id', bob.id);
    expect(still).toEqual([]);

    const { error } = await alice.client.rpc('accept_connect_request', { p_request_id: requestId });
    expect(error).toBeNull();
    expect(await metAt(alice)).toBeNull();
  });

  it('never rides a pending request', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await gathering(alice);
    await join(bob, id);
    await bob.client.rpc('send_connect_request', { p_recipient: alice.id });

    const { data } = await alice.client.from('connect_requests').select('*');
    expect(data).toHaveLength(1);
    expect(Object.keys(data![0]!)).not.toContain('gathering_id');
    expect(JSON.stringify(data)).not.toContain(id);
  });

  it('cannot be written by either party', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await gathering(alice);
    await connect(alice, bob);
    expect(await metAt(alice)).toBeNull(); // positive control: nothing to infer

    const { data: conn } = await alice.client.from('connections').select('id').single();
    // No update policy: the write matches no row.
    const { data: updated } = await alice.client
      .from('connections')
      .update({ gathering_id: id })
      .eq('id', conn!.id)
      .select();
    expect(updated ?? []).toEqual([]);
    expect(await metAt(alice)).toBeNull();
    expect(await metAt(bob)).toBeNull();
  });

  it('reads null for a viewer who no longer sees the gathering, and stays for the other', async () => {
    const host = await createTestUser('Host');
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await gathering(host);
    await join(alice, id);
    await join(bob, id);
    await connect(alice, bob);
    expect((await metAt(bob))?.id).toBe(id);

    const { error } = await bob.client
      .from('blocks')
      .insert({ blocker_id: bob.id, blocked_id: host.id, reveals_card: false });
    expect(error).toBeNull();
    expect(await metAt(bob)).toBeNull();
    expect((await metAt(alice))?.id).toBe(id);
  });

  it('clears when the gathering is deleted, and the connection stays', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await gathering(alice);
    await join(bob, id);
    await connect(alice, bob);
    expect((await metAt(bob))?.id).toBe(id);

    const { error } = await alice.client.from('gatherings').delete().eq('id', id);
    expect(error).toBeNull();
    expect(await metAt(bob)).toBeNull();
  });
});
