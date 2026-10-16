// Gatherings: listed to the domain, who's going connections-only,
// block-respecting joins, and the tap-to-join destination. The negative
// space is the spec: a stranger sees the gathering and the headcount and no
// member row; a blocked viewer sees nothing — not even a different error.
import { beforeAll, describe, expect, it } from 'bun:test';
import {
  admin,
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
  provisionTag,
} from '../src/test-utils/index.ts';
import {
  decodeFeedCursor,
  encodeFeedCursor,
  listUpcomingGatherings,
  type FeedCursor,
} from '../src/queries/index.ts';

beforeAll(assertStackRunning);

type Client = Awaited<ReturnType<typeof createTestUser>>['client'];

async function createGathering(
  client: Client,
  title = 'Rooftop listening session',
): Promise<string> {
  const { data, error } = await client.rpc('create_gathering', {
    p_title: title,
    p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    p_location: 'The roof',
  });
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

/** Invisible means an empty, error-free select: a policy error is not invisibility. */
function expectEmpty(result: { data: unknown[] | null; error: unknown }): void {
  expect(result.error).toBeNull();
  expect(result.data).toEqual([]);
}

/** The member rows this client may read, as profile ids. */
async function visibleMembers(client: Client, gatheringId: string): Promise<string[]> {
  const { data, error } = await client
    .from('gathering_members')
    .select('profile_id')
    .eq('gathering_id', gatheringId);
  expect(error).toBeNull();
  return (data ?? []).map((m) => m.profile_id).toSorted();
}

/** The headcount this client gets, or null when the gathering is hidden from it. */
async function headcount(client: Client, gatheringId: string): Promise<number | null> {
  const { data, error } = await client.rpc('gathering_member_counts', { p_ids: [gatheringId] });
  expect(error).toBeNull();
  const row = (data ?? []).find((r) => r.gathering_id === gatheringId);
  return row ? Number(row.member_count) : null;
}

describe('gathering membership and visibility', () => {
  it('creating a gathering makes the host a member', async () => {
    const alice = await createTestUser('Alice');
    const id = await createGathering(alice.client);

    const { data: rows } = await alice.client.from('gatherings').select('*').eq('id', id);
    expect(rows).toHaveLength(1);
    const { data: members } = await alice.client
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', id);
    expect(members?.map((m) => m.profile_id)).toEqual([alice.id]);

    // both new tables carry the tenant seam
    const { data: gathering } = await admin
      .from('gatherings')
      .select('tenant_id')
      .eq('id', id)
      .single();
    expect(gathering?.tenant_id).toBeTruthy();
    const { data: membership } = await admin
      .from('gathering_members')
      .select('tenant_id')
      .eq('gathering_id', id)
      .eq('profile_id', alice.id)
      .single();
    expect(membership?.tenant_id).toBe(gathering?.tenant_id);
  });

  it('a stranger sees the gathering and its headcount, and no member row', async () => {
    const alice = await createTestUser('Alice');
    const mallory = await createTestUser('Mallory');
    const id = await createGathering(alice.client);

    // the feed: every signed-in user of the domain reads the entity
    const { data: feed, error } = await mallory.client.from('gatherings').select('*').eq('id', id);
    expect(error).toBeNull();
    expect(feed?.map((g) => g.title)).toEqual(['Rooftop listening session']);
    expect(await headcount(mallory.client, id)).toBe(1);

    // who's going: not a single row, and the host's card stays hidden
    expect(await visibleMembers(mallory.client, id)).toEqual([]);
    expectEmpty(await mallory.client.from('profiles').select('id').eq('id', alice.id));
  });

  it("joining reveals your own row; co-members' cards stay hidden until they connect", async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await createGathering(alice.client);

    const { error } = await bob.client.rpc('join_gathering', { p_gathering_id: id });
    expect(error).toBeNull();

    // both are members; each sees only themself, and neither card crosses
    expect(await headcount(bob.client, id)).toBe(2);
    expect(await visibleMembers(bob.client, id)).toEqual([bob.id]);
    expect(await visibleMembers(alice.client, id)).toEqual([alice.id]);
    expectEmpty(await bob.client.from('profiles').select('id').eq('id', alice.id));
    expectEmpty(await alice.client.from('profiles').select('id').eq('id', bob.id));

    // the connection, not the gathering, is what shows who is going
    await connectUsers(alice, bob);
    expect(await visibleMembers(bob.client, id)).toEqual([alice.id, bob.id].toSorted());
    expect(await visibleMembers(alice.client, id)).toEqual([alice.id, bob.id].toSorted());
  });

  it('the headcount counts members the viewer cannot see', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    const id = await createGathering(alice.client);
    await bob.client.rpc('join_gathering', { p_gathering_id: id });
    await carol.client.rpc('join_gathering', { p_gathering_id: id });
    await connectUsers(bob, carol);

    expect(await headcount(bob.client, id)).toBe(3);
    expect(await visibleMembers(bob.client, id)).toEqual([bob.id, carol.id].toSorted());
    // the host sees the same shape as everyone: their connections, plus the count
    expect(await headcount(alice.client, id)).toBe(3);
    expect(await visibleMembers(alice.client, id)).toEqual([alice.id]);
  });

  it('leaving removes the membership; the gathering stays listed', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await createGathering(alice.client);
    await bob.client.rpc('join_gathering', { p_gathering_id: id });

    const { error } = await bob.client
      .from('gathering_members')
      .delete()
      .eq('gathering_id', id)
      .eq('profile_id', bob.id);
    expect(error).toBeNull();

    expect(await visibleMembers(bob.client, id)).toEqual([]);
    expect(await headcount(bob.client, id)).toBe(1);
    expect((await bob.client.from('gatherings').select('id').eq('id', id)).data).toHaveLength(1);
    expectEmpty(await bob.client.from('profiles').select('id').eq('id', alice.id));
  });

  it('the host cannot leave their own gathering', async () => {
    const alice = await createTestUser('Alice');
    const id = await createGathering(alice.client);

    // RLS matches zero rows: a silent no-op, like a stranger's delete
    const { error } = await alice.client
      .from('gathering_members')
      .delete()
      .eq('gathering_id', id)
      .eq('profile_id', alice.id);
    expect(error).toBeNull();

    const { data: memberships } = await admin
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', id);
    expect(memberships?.map((m) => m.profile_id)).toEqual([alice.id]);
    const { data: own } = await alice.client
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', id);
    expect(own?.map((m) => m.profile_id)).toEqual([alice.id]);
  });

  it('anon can neither create nor join', async () => {
    const alice = await createTestUser('Alice');
    const id = await createGathering(alice.client);
    const anon = anonClient();

    const { error: createError } = await anon.rpc('create_gathering', {
      p_title: 'X',
      p_starts_at: new Date().toISOString(),
    });
    expect(createError?.message).toContain('permission denied for function create_gathering');
    const { error: joinError } = await anon.rpc('join_gathering', { p_gathering_id: id });
    expect(joinError?.message).toContain('permission denied for function join_gathering');
    const { error: countError } = await anon.rpc('gathering_member_counts', { p_ids: [id] });
    expect(countError?.message).toContain('permission denied for function gathering_member_counts');
    expectEmpty(await anon.from('gatherings').select('*').eq('id', id));
  });

  it('only the host can edit or delete the gathering', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await createGathering(alice.client);
    await bob.client.rpc('join_gathering', { p_gathering_id: id });

    // a member's edit and delete match zero rows
    await bob.client.from('gatherings').update({ title: 'Hijacked' }).eq('id', id);
    await bob.client.from('gatherings').delete().eq('id', id);
    const { data: untouched } = await admin
      .from('gatherings')
      .select('title')
      .eq('id', id)
      .single();
    expect(untouched?.title).toBe('Rooftop listening session');

    // the host edits the granted columns only
    const { error: editError } = await alice.client
      .from('gatherings')
      .update({ title: 'Moved indoors' })
      .eq('id', id);
    expect(editError).toBeNull();
    const { error: hostIdError } = await alice.client
      .from('gatherings')
      .update({ host_id: bob.id })
      .eq('id', id);
    expect(hostIdError).not.toBeNull();

    const { error: deleteError } = await alice.client.from('gatherings').delete().eq('id', id);
    expect(deleteError).toBeNull();
    expectEmpty(await admin.from('gatherings').select('*').eq('id', id));
    expectEmpty(await bob.client.from('gatherings').select('*').eq('id', id));
  });

  it('nobody inserts a membership directly: joining is the RPC', async () => {
    const alice = await createTestUser('Alice');
    const mallory = await createTestUser('Mallory');
    const id = await createGathering(alice.client);

    // neither a stranger for themselves nor the host for someone else
    const { error: selfInsert } = await mallory.client
      .from('gathering_members')
      .insert({ gathering_id: id, profile_id: mallory.id });
    expect(selfInsert).not.toBeNull();
    const { error: hostInsert } = await alice.client
      .from('gathering_members')
      .insert({ gathering_id: id, profile_id: mallory.id });
    expect(hostInsert).not.toBeNull();

    const { data: raw } = await admin
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', id);
    expect(raw?.map((m) => m.profile_id)).toEqual([alice.id]);
  });
});

describe('gatherings respect blocks', () => {
  it("a viewer the host blocked sees neither the host's gathering nor its headcount", async () => {
    const alice = await createTestUser('Alice');
    const mallory = await createTestUser('Mallory');
    const id = await createGathering(alice.client);
    await admin.from('blocks').insert({ blocker_id: alice.id, blocked_id: mallory.id });

    expectEmpty(await mallory.client.from('gatherings').select('*').eq('id', id));
    expect(await headcount(mallory.client, id)).toBeNull();
    expect(await visibleMembers(mallory.client, id)).toEqual([]);
  });

  it("a viewer who blocked the host sees neither the host's gathering nor its headcount", async () => {
    const alice = await createTestUser('Alice');
    const mallory = await createTestUser('Mallory');
    const id = await createGathering(alice.client);
    await mallory.client.from('blocks').insert({ blocker_id: mallory.id, blocked_id: alice.id });

    expectEmpty(await mallory.client.from('gatherings').select('*').eq('id', id));
    expect(await headcount(mallory.client, id)).toBeNull();
    expect(await visibleMembers(mallory.client, id)).toEqual([]);
  });

  it("a hidden gathering hides a connection's membership in it too", async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    const id = await createGathering(alice.client);
    await carol.client.rpc('join_gathering', { p_gathering_id: id });
    await connectUsers(bob, carol);
    // positive control: a visible gathering shows the connection's row
    expect(await visibleMembers(bob.client, id)).toEqual([carol.id]);

    await admin.from('blocks').insert({ blocker_id: alice.id, blocked_id: bob.id });

    // the member policy is not an oracle for gatherings the viewer cannot see
    expect(await visibleMembers(bob.client, id)).toEqual([]);
    expectEmpty(await bob.client.from('gatherings').select('*').eq('id', id));
  });

  it('a blocked join is indistinguishable from a missing gathering, in both directions', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    const id = await createGathering(alice.client);
    await admin.from('blocks').insert({ blocker_id: alice.id, blocked_id: bob.id });
    // carol blocked the host: she reads the gathering as nonexistent, so she cannot join it
    await carol.client.from('blocks').insert({ blocker_id: carol.id, blocked_id: alice.id });

    const { error: blocked } = await bob.client.rpc('join_gathering', { p_gathering_id: id });
    const { error: blocker } = await carol.client.rpc('join_gathering', { p_gathering_id: id });
    const { error: missing } = await bob.client.rpc('join_gathering', {
      p_gathering_id: crypto.randomUUID(),
    });
    expect(blocked?.message).toContain('gathering not found');
    expect(blocker?.message).toContain('gathering not found');
    expect(missing?.message).toContain('gathering not found');
    expect(blocked?.message).toBe(missing!.message);
    expect(blocker?.message).toBe(missing!.message);
    const { data: raw } = await admin
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', id);
    expect(raw?.map((m) => m.profile_id)).toEqual([alice.id]);
  });

  it('blocking evicts the blocked member from the pair-hosted gathering', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await createGathering(alice.client);
    await bob.client.rpc('join_gathering', { p_gathering_id: id });

    const { error } = await alice.client
      .from('blocks')
      .insert({ blocker_id: alice.id, blocked_id: bob.id });
    expect(error).toBeNull();

    const { data: raw } = await admin
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', id);
    expect(raw?.map((m) => m.profile_id)).toEqual([alice.id]);
    expectEmpty(await bob.client.from('gatherings').select('*').eq('id', id));
  });

  it('blocking evicts in the other direction too: a member who blocks the host leaves', async () => {
    const carol = await createTestUser('Carol');
    const dave = await createTestUser('Dave');
    const id = await createGathering(carol.client);
    await dave.client.rpc('join_gathering', { p_gathering_id: id });

    const { error } = await dave.client
      .from('blocks')
      .insert({ blocker_id: dave.id, blocked_id: carol.id });
    expect(error).toBeNull();

    const { data: raw } = await admin
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', id);
    expect(raw?.map((m) => m.profile_id)).toEqual([carol.id]);
    expectEmpty(await dave.client.from('gatherings').select('*').eq('id', id));
  });

  it('a block between connected co-members hides their rows from each other; the third-party gathering is untouched', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    const id = await createGathering(alice.client);
    await bob.client.rpc('join_gathering', { p_gathering_id: id });
    await carol.client.rpc('join_gathering', { p_gathering_id: id });
    await connectUsers(bob, carol);
    expect(await visibleMembers(bob.client, id)).toEqual([bob.id, carol.id].toSorted());

    const { error } = await carol.client
      .from('blocks')
      .insert({ blocker_id: carol.id, blocked_id: bob.id, reveals_card: true });
    expect(error).toBeNull();

    // both stay members of alice's gathering, which both still see
    const { data: raw } = await admin
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', id);
    expect(raw?.map((m) => m.profile_id).toSorted()).toEqual(
      [alice.id, bob.id, carol.id].toSorted(),
    );
    expect((await bob.client.from('gatherings').select('id').eq('id', id)).data).toHaveLength(1);
    expect((await carol.client.from('gatherings').select('id').eq('id', id)).data).toHaveLength(1);
    expect(await headcount(bob.client, id)).toBe(3);

    // the block ended the connection, so each sees only their own row again;
    // the blocked member cannot see the blocker's card, while the blocker
    // still sees whom they blocked (their own list UI)
    expect(await visibleMembers(bob.client, id)).toEqual([bob.id]);
    expect(await visibleMembers(carol.client, id)).toEqual([carol.id]);
    expectEmpty(await bob.client.from('profiles').select('id').eq('id', carol.id));
    expect((await carol.client.from('profiles').select('id').eq('id', bob.id)).data).toHaveLength(
      1,
    );
  });
});

describe('gathering destinations', () => {
  type Resolved = {
    status: string;
    destination: { type: string; gathering_id?: string };
    gathering: { id: string; title: string; starts_at: string; location: string | null } | null;
  };

  it('a gathering tag resolves to the summary, anonymously', async () => {
    const alice = await createTestUser('Alice');
    const id = await createGathering(alice.client, 'Pinehurst at dawn');
    const uid = await provisionTag();
    const { error } = await alice.client.rpc('claim_tag', {
      p_uid: uid,
      p_destination: { type: 'gathering', gathering_id: id },
    });
    expect(error).toBeNull();

    const { data } = await anonClient().rpc('resolve_tag', { p_uid: uid });
    const resolved = data as Resolved;
    expect(resolved.status).toBe('claimed');
    expect(resolved.destination).toEqual({ type: 'gathering', gathering_id: id });
    expect(resolved.gathering?.title).toBe('Pinehurst at dawn');
    expect(resolved.gathering?.location).toBe('The roof');
  });

  it('a dangling gathering destination degrades to the profile card', async () => {
    const alice = await createTestUser('Alice');
    const id = await createGathering(alice.client);
    const uid = await provisionTag();
    const { error: claimError } = await alice.client.rpc('claim_tag', {
      p_uid: uid,
      p_destination: { type: 'gathering', gathering_id: id },
    });
    expect(claimError).toBeNull();
    await alice.client.from('gatherings').delete().eq('id', id);

    const { data, error } = await anonClient().rpc('resolve_tag', { p_uid: uid });
    expect(error).toBeNull();
    const resolved = data as Resolved;
    expect(resolved.status).toBe('claimed');
    expect(resolved.destination).toEqual({ type: 'profile' });
    expect(resolved.gathering).toBeNull();
  });

  it('a tag whose owner left the gathering degrades to the profile card', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await createGathering(alice.client);
    await bob.client.rpc('join_gathering', { p_gathering_id: id });
    const uid = await provisionTag();
    const { error: claimError } = await bob.client.rpc('claim_tag', {
      p_uid: uid,
      p_destination: { type: 'gathering', gathering_id: id },
    });
    expect(claimError).toBeNull();

    const { data: before, error: beforeError } = await anonClient().rpc('resolve_tag', {
      p_uid: uid,
    });
    expect(beforeError).toBeNull();
    expect((before as Resolved).gathering).not.toBeNull();

    await bob.client
      .from('gathering_members')
      .delete()
      .eq('gathering_id', id)
      .eq('profile_id', bob.id);

    const { data, error } = await anonClient().rpc('resolve_tag', { p_uid: uid });
    expect(error).toBeNull();
    const resolved = data as Resolved;
    expect(resolved.destination).toEqual({ type: 'profile' });
    expect(resolved.gathering).toBeNull();
  });

  it("a viewer the host blocked never sees the host's gathering through a member's tag", async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const mallory = await createTestUser('Mallory');
    const id = await createGathering(alice.client, 'Pinehurst at dawn');
    await bob.client.rpc('join_gathering', { p_gathering_id: id });
    const uid = await provisionTag();
    const { error: claimError } = await bob.client.rpc('claim_tag', {
      p_uid: uid,
      p_destination: { type: 'gathering', gathering_id: id },
    });
    expect(claimError).toBeNull();

    const { error: blockError } = await alice.client
      .from('blocks')
      .insert({ blocker_id: alice.id, blocked_id: mallory.id });
    expect(blockError).toBeNull();

    // Bob did not block Mallory, so his card still resolves; the host's
    // gathering does not
    const { data, error } = await mallory.client.rpc('resolve_tag', { p_uid: uid });
    expect(error).toBeNull();
    const resolved = data as Resolved;
    expect(resolved.status).toBe('claimed');
    expect(resolved.destination).toEqual({ type: 'profile' });
    expect(resolved.gathering).toBeNull();

    // the check is viewer-specific: an unblocked (anonymous) tap still gets the summary
    const { data: anon, error: anonError } = await anonClient().rpc('resolve_tag', {
      p_uid: uid,
    });
    expect(anonError).toBeNull();
    expect((anon as Resolved).destination).toEqual({ type: 'gathering', gathering_id: id });
    expect((anon as Resolved).gathering?.title).toBe('Pinehurst at dawn');
  });

  it('malformed gathering destinations are rejected at the DB boundary', async () => {
    const alice = await createTestUser('Alice');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    for (const destination of [
      { type: 'gathering' }, // missing gathering_id — the NULL-check trap
      { type: 'gathering', gathering_id: 'not-a-uuid' },
      { type: 'gathering', gathering_id: crypto.randomUUID(), extra: 'x' },
    ]) {
      const { error } = await alice.client.from('tags').update({ destination }).eq('uid', uid);
      expect(error?.message).toContain('tags_destination_shape');
    }
  });
});

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('gathering limits', () => {
  it('a host creates at most 5 gatherings an hour, even straight through PostgREST', async () => {
    const alice = await createTestUser('Alice');
    for (let i = 0; i < 5; i++) await createGathering(alice.client, `Night ${i}`);
    const { error } = await alice.client.rpc('create_gathering', {
      p_title: 'One too many',
      p_starts_at: inDays(1),
    });
    expect(error?.code).toBe('P0004');
    const { count } = await admin
      .from('gatherings')
      .select('id', { count: 'exact', head: true })
      .eq('host_id', alice.id);
    expect(count).toBe(5);
  });

  it('a host holds at most 20 upcoming gatherings; past ones do not count', async () => {
    const alice = await createTestUser('Alice');
    const rows = (startsAt: (i: number) => string, n: number) =>
      Array.from({ length: n }, (_, i) => ({
        host_id: alice.id,
        title: `Seeded ${i}`,
        starts_at: startsAt(i),
      }));
    // Seeded with the service role, around the hourly limit. 19 upcoming, 5 past.
    const seeded = await admin
      .from('gatherings')
      .insert([...rows((i) => inDays(i + 1), 19), ...rows((i) => inDays(-(i + 1)), 5)]);
    expect(seeded.error).toBeNull();

    await createGathering(alice.client, 'The 20th');
    const { error } = await alice.client.rpc('create_gathering', {
      p_title: 'The 21st',
      p_starts_at: inDays(2),
    });
    expect(error?.code).toBe('P0004');
  });

  it('a start more than a year ahead is refused, on create and on edit', async () => {
    const alice = await createTestUser('Alice');
    const far = await alice.client.rpc('create_gathering', {
      p_title: 'Next decade',
      p_starts_at: inDays(400),
    });
    expect(far.error?.code).toBe('22023');

    const id = await createGathering(alice.client);
    const moved = await alice.client
      .from('gatherings')
      .update({ starts_at: inDays(400) })
      .eq('id', id);
    expect(moved.error?.code).toBe('22023');
    const ok = await alice.client
      .from('gatherings')
      .update({ starts_at: inDays(300) })
      .eq('id', id);
    expect(ok.error).toBeNull();
  });
});

describe('the feed, a page at a time', () => {
  it('pages through every upcoming gathering once, in order, ties on start broken by id', async () => {
    const alice = await createTestUser('Alice');
    // Five gatherings at one shared instant (ties) and two just after it.
    const tie = new Date(
      Date.now() + 200 * 86_400_000 + Math.floor(Math.random() * 1e9),
    ).toISOString();
    const after = new Date(Date.parse(tie) + 1000).toISOString();
    const { data: seeded, error } = await admin
      .from('gatherings')
      .insert(
        [tie, tie, tie, tie, tie, after, after].map((starts_at, i) => ({
          host_id: alice.id,
          title: `Paged ${i}`,
          starts_at,
        })),
      )
      .select('id, starts_at');
    expect(error).toBeNull();
    const mine = new Set((seeded ?? []).map((g) => g.id));

    const seen: { id: string; starts_at: string }[] = [];
    let cursor: FeedCursor | null = null;
    let pages = 0;
    do {
      // Through the opaque form, as the API hands it out and takes it back.
      const page = await listUpcomingGatherings(alice.client, alice.id, {
        cursor,
        limit: 2 + (pages % 3),
      });
      expect(page.gatherings.length).toBeLessThanOrEqual(4);
      seen.push(...page.gatherings.map(({ id, starts_at }) => ({ id, starts_at })));
      cursor = page.nextCursor ? decodeFeedCursor(encodeFeedCursor(page.nextCursor)) : null;
      pages++;
    } while (cursor !== null && pages < 500);

    const ids = seen.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length); // nothing twice
    expect(ids.filter((id) => mine.has(id))).toHaveLength(7); // nothing missed
    const order = seen.map(
      (g) => `${Date.parse(g.starts_at).toString().padStart(15, '0')}|${g.id}`,
    );
    expect(order).toEqual(order.toSorted());
  });

  it('a cursor it did not write decodes to null', () => {
    expect(decodeFeedCursor('not-a-cursor')).toBeNull();
    expect(decodeFeedCursor(btoa('2026-10-16T18:00:00Z|x),or(id.gt.0'))).toBeNull();
    expect(decodeFeedCursor(btoa('tomorrow|7c9e6679-7425-40de-944b-e07fc1f90ae7'))).toBeNull();
    const cursor = {
      startsAt: '2026-10-16T18:00:00.123456+00:00',
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    };
    expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
  });
});
