// Gathering capacity (20261017203000): the host counts toward it, a full
// gathering refuses with 'gathering is full' (P0007), concurrent joins for
// the last spot never overfill it, lowering it keeps everyone, and leaving
// frees a spot. "Full" is only ever an answer to someone who already sees
// the gathering and its headcount.
import { beforeAll, describe, expect, it } from 'bun:test';
import { admin, assertStackRunning, createTestUser, type TestUser } from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

type Client = TestUser['client'];

async function createGathering(
  client: Client,
  capacity: number | null,
  visibility: 'everyone' | 'connections' = 'everyone',
): Promise<string> {
  const { data, error } = await client.rpc('create_gathering', {
    p_title: 'A round of four',
    p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    p_visibility: visibility,
    p_capacity: capacity ?? undefined,
  });
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

async function join(client: Client, id: string) {
  return client.rpc('join_gathering', { p_gathering_id: id });
}

async function going(id: string): Promise<number> {
  const { count, error } = await admin
    .from('gathering_members')
    .select('*', { count: 'exact', head: true })
    .eq('gathering_id', id);
  expect(error).toBeNull();
  return count ?? 0;
}

describe('capacity', () => {
  it('the host counts: a round of 4 is the host and three, and the fifth is refused as full', async () => {
    const host = await createTestUser('Host');
    const id = await createGathering(host.client, 4);
    const players = await Promise.all(['A', 'B', 'C', 'D'].map((n) => createTestUser(n)));

    for (const player of players.slice(0, 3)) {
      expect((await join(player.client, id)).error).toBeNull();
    }
    const refused = await join(players[3]!.client, id);
    expect(refused.error?.code).toBe('P0007');
    expect(refused.error?.message).toBe('gathering is full');
    expect(await going(id)).toBe(4);

    // a member re-joining a full gathering is still the usual no-op
    expect((await join(players[0]!.client, id)).error).toBeNull();
    // the viewer's own headcount says the same
    const { data } = await players[3]!.client.rpc('gathering_member_counts', { p_ids: [id] });
    expect(Number(data?.[0]?.member_count)).toBe(4);
  });

  it('no capacity means no limit', async () => {
    const host = await createTestUser('Host');
    const id = await createGathering(host.client, null);
    const joiners = await Promise.all(['A', 'B', 'C'].map((n) => createTestUser(n)));
    for (const joiner of joiners) expect((await join(joiner.client, id)).error).toBeNull();
    expect(await going(id)).toBe(4);
    const { data } = await host.client.from('gatherings').select('capacity').eq('id', id).single();
    expect(data?.capacity).toBeNull();
  });

  it('two joins for the last spot never both succeed', async () => {
    // Five rounds of a two-way race, then one six-way race for two spots.
    for (let round = 0; round < 5; round++) {
      const host = await createTestUser('Host');
      const id = await createGathering(host.client, 2);
      const [a, b] = await Promise.all([createTestUser('A'), createTestUser('B')]);
      const results = await Promise.all([join(a.client, id), join(b.client, id)]);
      const codes = results.map((r) => r.error?.code ?? 'ok').toSorted();
      expect(codes).toEqual(['P0007', 'ok']);
      expect(await going(id)).toBe(2);
    }

    const host = await createTestUser('Host');
    const id = await createGathering(host.client, 3);
    const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => createTestUser(`R${i}`)));
    const results = await Promise.all(racers.map((r) => join(r.client, id)));
    expect(results.filter((r) => r.error === null)).toHaveLength(2);
    expect(results.filter((r) => r.error?.code === 'P0007')).toHaveLength(4);
    expect(await going(id)).toBe(3);
  });

  it('leaving frees a spot', async () => {
    const host = await createTestUser('Host');
    const id = await createGathering(host.client, 2);
    const [a, b] = await Promise.all([createTestUser('A'), createTestUser('B')]);
    expect((await join(a.client, id)).error).toBeNull();
    expect((await join(b.client, id)).error?.code).toBe('P0007');

    await a.client.from('gathering_members').delete().eq('gathering_id', id).eq('profile_id', a.id);
    expect((await join(b.client, id)).error).toBeNull();
    expect(await going(id)).toBe(2);
  });

  it('lowering capacity below the headcount keeps everyone and stops new joins; raising or clearing reopens it', async () => {
    const host = await createTestUser('Host');
    const id = await createGathering(host.client, 5);
    const [a, b, c, d] = (await Promise.all(['A', 'B', 'C', 'D'].map((n) => createTestUser(n)))) as [TestUser, TestUser, TestUser, TestUser];
    for (const joiner of [a, b, c]) expect((await join(joiner.client, id)).error).toBeNull();

    const lowered = await host.client.from('gatherings').update({ capacity: 2 }).eq('id', id).select('capacity');
    expect(lowered.error).toBeNull();
    expect(lowered.data).toEqual([{ capacity: 2 }]);
    expect(await going(id)).toBe(4);
    expect((await join(d.client, id)).error?.code).toBe('P0007');

    await host.client.from('gatherings').update({ capacity: null }).eq('id', id);
    expect((await join(d.client, id)).error).toBeNull();
    expect(await going(id)).toBe(5);
  });

  it('capacity is 2 to 500, set by the host only', async () => {
    const host = await createTestUser('Host');
    const member = await createTestUser('Member');
    for (const bad of [1, 0, -4, 501]) {
      const { error } = await host.client.rpc('create_gathering', {
        p_title: 'x',
        p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        p_capacity: bad,
      });
      expect(error?.code).toBe('23514');
    }
    const id = await createGathering(host.client, 500);
    expect((await host.client.from('gatherings').update({ capacity: 1 }).eq('id', id)).error?.code).toBe('23514');
    expect((await host.client.from('gatherings').update({ capacity: 2 }).eq('id', id)).error).toBeNull();

    await join(member.client, id);
    const byMember = await member.client.from('gatherings').update({ capacity: 400 }).eq('id', id).select('id');
    expect(byMember.error).toBeNull();
    expect(byMember.data).toEqual([]);
  });

  it('a full gathering the joiner cannot see answers not found, never full', async () => {
    const host = await createTestUser('Host');
    const stranger = await createTestUser('Stranger');
    const blocked = await createTestUser('Blocked');
    const hidden = await createGathering(host.client, 2, 'connections');
    const listed = await createGathering(host.client, 2);
    // fill the hidden one as setup (no joiner path exists for a non-connection)
    const insider = await createTestUser('Insider');
    const fill = await admin.from('gathering_members').insert({ gathering_id: hidden, profile_id: insider.id });
    expect(fill.error).toBeNull();
    const filler = await createTestUser('Filler');
    expect((await join(filler.client, listed)).error).toBeNull();
    await host.client.from('blocks').insert({ blocker_id: host.id, blocked_id: blocked.id });

    expect(await going(hidden)).toBe(2);
    const missing = await join(stranger.client, crypto.randomUUID());
    expect((await join(stranger.client, hidden)).error).toEqual(missing.error);
    expect((await join(blocked.client, listed)).error).toEqual(missing.error);
    // the control: a viewer who sees the gathering learns it is full
    expect((await join(stranger.client, listed)).error?.code).toBe('P0007');
  });
});
