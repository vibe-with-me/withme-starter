// Connections-only gatherings (20261017203000). The spec is the negative
// space: a stranger, a blocked party either way and anon read a connections
// gathering exactly as one that does not exist, on every path (feed, detail,
// member rows, headcount, join, a tap on a tag, a scan of a share code),
// while the host, the host's connections and current members read it as
// before. Every negative case has a positive control beside it.
import { beforeAll, describe, expect, it } from 'bun:test';
import {
  admin,
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
  provisionTag,
  type TestUser,
} from '../src/test-utils/index.ts';
import { listUpcomingGatherings, type FeedCursor } from '../src/queries/index.ts';

beforeAll(assertStackRunning);

type Client = TestUser['client'];
type Visibility = 'everyone' | 'connections';

async function createGathering(client: Client, visibility: Visibility = 'connections'): Promise<string> {
  const { data, error } = await client.rpc('create_gathering', {
    p_title: 'Dinner at mine',
    p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    p_location: '12 Elm St',
    p_visibility: visibility,
  });
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

/** Every read a viewer has of one gathering, side by side. */
async function seen(client: Client, id: string) {
  const detail = await client.from('gatherings').select('id').eq('id', id);
  expect(detail.error).toBeNull();
  const counts = await client.rpc('gathering_member_counts', { p_ids: [id] });
  expect(counts.error).toBeNull();
  const members = await client.from('gathering_members').select('profile_id').eq('gathering_id', id);
  expect(members.error).toBeNull();
  const {
    data: { user },
  } = await client.auth.getUser();
  // Every page: other suites' gatherings share the feed.
  let inFeed = false;
  let cursor: FeedCursor | null = null;
  do {
    const page = await listUpcomingGatherings(client, user!.id, { cursor, limit: 50 });
    inFeed ||= page.gatherings.some((g) => g.id === id);
    cursor = page.nextCursor;
  } while (cursor && !inFeed);
  return {
    detail: (detail.data ?? []).length === 1,
    counted: (counts.data ?? []).some((row) => row.gathering_id === id),
    memberRows: (members.data ?? []).length,
    inFeed,
  };
}

const HIDDEN = { detail: false, counted: false, memberRows: 0, inFeed: false };

async function join(client: Client, id: string) {
  return client.rpc('join_gathering', { p_gathering_id: id });
}

describe('a connections gathering', () => {
  it('the host sees it everywhere, with the host as the one member', async () => {
    const host = await createTestUser('Host');
    const id = await createGathering(host.client);
    expect(await seen(host.client, id)).toEqual({
      detail: true,
      counted: true,
      memberRows: 1,
      inFeed: true,
    });
    const { data } = await host.client.from('gatherings').select('visibility, capacity').eq('id', id).single();
    expect(data).toEqual({ visibility: 'connections', capacity: null });
  });

  it('a stranger reads it as nonexistent and cannot join; an everyone gathering is the control', async () => {
    const host = await createTestUser('Host');
    const stranger = await createTestUser('Stranger');
    const hidden = await createGathering(host.client);
    const listed = await createGathering(host.client, 'everyone');

    expect(await seen(stranger.client, hidden)).toEqual(HIDDEN);
    expect((await seen(stranger.client, listed)).detail).toBe(true);

    const refused = await join(stranger.client, hidden);
    const missing = await join(stranger.client, crypto.randomUUID());
    expect(refused.error?.code).toBe('P0003');
    expect(refused.error?.message).toBe(missing.error?.message);
    expect(refused.error?.message).toBe('gathering not found');
    expect((await join(stranger.client, listed)).error).toBeNull();

    const { count } = await admin
      .from('gathering_members')
      .select('*', { count: 'exact', head: true })
      .eq('gathering_id', hidden);
    expect(count).toBe(1);
  });

  it("the host's connection sees it and joins; their member rows show only to whom rows always show", async () => {
    const host = await createTestUser('Host');
    const friend = await createTestUser('Friend');
    const stranger = await createTestUser('Stranger');
    await connectUsers(host, friend);
    const id = await createGathering(host.client);

    const before = await seen(friend.client, id);
    expect(before).toEqual({ detail: true, counted: true, memberRows: 1, inFeed: true });
    expect((await join(friend.client, id)).error).toBeNull();
    expect((await seen(friend.client, id)).memberRows).toBe(2);
    expect(await seen(stranger.client, id)).toEqual(HIDDEN);
  });

  it("a connection of a member who is not the host's connection sees nothing", async () => {
    const host = await createTestUser('Host');
    const friend = await createTestUser('Friend');
    const friendOfFriend = await createTestUser('FriendOfFriend');
    await connectUsers(host, friend);
    await connectUsers(friend, friendOfFriend);
    const id = await createGathering(host.client);
    expect((await join(friend.client, id)).error).toBeNull();

    expect(await seen(friendOfFriend.client, id)).toEqual(HIDDEN);
    expect((await join(friendOfFriend.client, id)).error?.code).toBe('P0003');
  });

  it('switching an open gathering to connections keeps everyone going; switching back lists it again', async () => {
    const host = await createTestUser('Host');
    const early = await createTestUser('Early');
    const stranger = await createTestUser('Stranger');
    const id = await createGathering(host.client, 'everyone');
    expect((await join(early.client, id)).error).toBeNull();

    const toConnections = await host.client
      .from('gatherings')
      .update({ visibility: 'connections' })
      .eq('id', id)
      .select('id');
    expect(toConnections.data).toHaveLength(1);

    // a member who is not the host's connection still sees it, and stays counted
    expect(await seen(early.client, id)).toEqual({ detail: true, counted: true, memberRows: 1, inFeed: true });
    expect(await seen(stranger.client, id)).toEqual(HIDDEN);
    const { data: hostCount } = await host.client.rpc('gathering_member_counts', { p_ids: [id] });
    expect(Number(hostCount?.[0]?.member_count)).toBe(2);
    // re-joining as a member is the usual no-op
    expect((await join(early.client, id)).error).toBeNull();

    // leaving a connections gathering you were only admitted to as a member hides it
    await early.client.from('gathering_members').delete().eq('gathering_id', id).eq('profile_id', early.id);
    expect(await seen(early.client, id)).toEqual(HIDDEN);
    expect((await join(early.client, id)).error?.code).toBe('P0003');

    await host.client.from('gatherings').update({ visibility: 'everyone' }).eq('id', id);
    expect((await seen(stranger.client, id)).detail).toBe(true);
    expect((await join(early.client, id)).error).toBeNull();
  });

  it('only the host changes visibility, and only to a known value', async () => {
    const host = await createTestUser('Host');
    const friend = await createTestUser('Friend');
    await connectUsers(host, friend);
    const id = await createGathering(host.client);
    await join(friend.client, id);

    const byMember = await friend.client
      .from('gatherings')
      .update({ visibility: 'everyone' })
      .eq('id', id)
      .select('id');
    expect(byMember.error).toBeNull();
    expect(byMember.data).toEqual([]);

    const unknown = await host.client.from('gatherings').update({ visibility: 'invite_only' }).eq('id', id);
    expect(unknown.error?.code).toBe('23514');
    const created = await host.client.rpc('create_gathering', {
      p_title: 'x',
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      p_visibility: 'friends',
    });
    expect(created.error?.code).toBe('23514');
  });

  it('a block either way hides it from a connection-turned-blocked, as for any gathering', async () => {
    for (const direction of ['host blocks', 'viewer blocks'] as const) {
      const host = await createTestUser('Host');
      const friend = await createTestUser('Friend');
      await connectUsers(host, friend);
      const id = await createGathering(host.client);
      expect((await seen(friend.client, id)).detail).toBe(true);

      if (direction === 'host blocks') {
        await host.client.from('blocks').insert({ blocker_id: host.id, blocked_id: friend.id });
      } else {
        await friend.client.from('blocks').insert({ blocker_id: friend.id, blocked_id: host.id });
      }
      expect(await seen(friend.client, id)).toEqual(HIDDEN);
      expect((await join(friend.client, id)).error?.message).toBe('gathering not found');
    }
  });

  it('anon reads nothing from the table or the headcount', async () => {
    const host = await createTestUser('Host');
    const id = await createGathering(host.client, 'everyone');
    const anon = anonClient();
    const rows = await anon.from('gatherings').select('id').eq('id', id);
    expect(rows.data ?? []).toEqual([]);
    const counts = await anon.rpc('gathering_member_counts', { p_ids: [id] });
    expect(counts.error).not.toBeNull();
  });
});

async function pointedTag(owner: TestUser, gatheringId: string): Promise<string> {
  const uid = await provisionTag();
  const { error } = await owner.client.rpc('claim_tag', {
    p_uid: uid,
    p_destination: { type: 'gathering', gathering_id: gatheringId },
  });
  expect(error).toBeNull();
  return uid;
}

describe('a tap or a scan never reveals a hidden gathering', () => {
  type Resolved = {
    status: string;
    uid: string;
    destination: { type: string; gathering_id?: string };
    gathering: { id: string } | null;
    profile: { id: string };
  };

  async function resolve(client: Client, uid: string): Promise<Resolved> {
    const { data, error } = await client.rpc('resolve_tag', { p_uid: uid });
    expect(error).toBeNull();
    return data as Resolved;
  }

  it("the host's tag shows a stranger and anon the card only, byte-for-byte a profile tag", async () => {
    const host = await createTestUser('Host');
    const stranger = await createTestUser('Stranger');
    const friend = await createTestUser('Friend');
    await connectUsers(host, friend);
    const id = await createGathering(host.client);
    const tag = await pointedTag(host, id);
    const profileTag = await provisionTag();
    await host.client.rpc('claim_tag', { p_uid: profileTag });

    for (const viewer of [stranger.client, anonClient()]) {
      const hidden = await resolve(viewer, tag);
      const control = await resolve(viewer, profileTag);
      expect(hidden.gathering).toBeNull();
      expect({ ...hidden, uid: '' }).toEqual({ ...control, uid: '' });
    }
    // positive controls: the host's connection, and the host, see the line
    expect((await resolve(friend.client, tag)).gathering?.id).toBe(id);
    expect((await resolve(host.client, tag)).destination).toEqual({ type: 'gathering', gathering_id: id });
  });

  it("a member's tag shows the line only to viewers the gathering admits", async () => {
    const host = await createTestUser('Host');
    const member = await createTestUser('Member');
    const membersFriend = await createTestUser('MembersFriend');
    await connectUsers(host, member);
    await connectUsers(member, membersFriend);
    const id = await createGathering(host.client);
    await join(member.client, id);
    const tag = await pointedTag(member, id);

    expect((await resolve(membersFriend.client, tag)).gathering).toBeNull();
    expect((await resolve(member.client, tag)).gathering?.id).toBe(id);

    // switching to everyone is the control: the same tag now shows the line
    await host.client.from('gatherings').update({ visibility: 'everyone' }).eq('id', id);
    expect((await resolve(membersFriend.client, tag)).gathering?.id).toBe(id);
    expect((await resolve(anonClient(), tag)).gathering?.id).toBe(id);
  });

  it('a tapper who blocked the host sees no line, even for an everyone gathering', async () => {
    const host = await createTestUser('Host');
    const member = await createTestUser('Member');
    const tapper = await createTestUser('Tapper');
    const id = await createGathering(host.client, 'everyone');
    await join(member.client, id);
    const tag = await pointedTag(member, id);
    expect((await resolve(tapper.client, tag)).gathering?.id).toBe(id);

    await tapper.client.from('blocks').insert({ blocker_id: tapper.id, blocked_id: host.id });
    const after = await resolve(tapper.client, tag);
    expect(after.gathering).toBeNull();
    expect(after.destination).toEqual({ type: 'profile' });
  });

  it("the host's share code resolves to the card alone, whatever the host is hosting", async () => {
    const host = await createTestUser('Host');
    const stranger = await createTestUser('Stranger');
    await createGathering(host.client);
    const { data: code, error } = await host.client.rpc('my_share_code');
    expect(error).toBeNull();
    const resolved = await resolve(stranger.client, code as string);
    expect(resolved.status).toBe('claimed');
    expect(resolved.destination).toEqual({ type: 'profile' });
    expect(resolved.gathering).toBeNull();
    expect(resolved.profile.id).toBe(host.id);
  });
});
