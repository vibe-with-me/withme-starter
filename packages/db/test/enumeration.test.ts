// No enumeration: profiles are reachable ONLY via a tag scan resolving to
// that profile or an existing connection. No browse, no search, no directory.
import { beforeAll, describe, expect, it } from 'bun:test';
import {
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
  provisionTag,
} from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

describe('anonymous access', () => {
  it('anon cannot select any rows from any handshake table', async () => {
    const anon = anonClient();
    for (const table of [
      'profiles',
      'tags',
      'tag_scans',
      'connect_requests',
      'connections',
      'blocks',
    ] as const) {
      const { data } = await anon.from(table).select('*');
      expect(data ?? []).toEqual([]);
    }
    // Connections tier: anon holds Supabase's default select grant and no
    // policy, so RLS answers with an empty, error-free result. An error here
    // means the table is missing or a grant changed.
    const { data: links, error: linksError } = await anon.from('profile_links').select('*');
    expect(linksError).toBeNull();
    expect(links).toEqual([]);
  });

  it('anon CAN resolve a claimed tag by uid (capability-based access)', async () => {
    const owner = await createTestUser('Tag Owner');
    const uid = await provisionTag();
    const { error: claimError } = await owner.client.rpc('claim_tag', { p_uid: uid });
    expect(claimError).toBeNull();

    const { data, error } = await anonClient().rpc('resolve_tag', { p_uid: uid.toLowerCase() });
    expect(error).toBeNull();
    const result = data as { status: string; profile?: { display_name: string; id: string } };
    expect(result.status).toBe('claimed');
    expect(result.profile?.display_name).toBe('Tag Owner');
  });

  it('anon resolving an unknown uid gets unclaimed, never an error', async () => {
    const { data, error } = await anonClient().rpc('resolve_tag', { p_uid: '04FFFFFFFFFF99' });
    expect(error).toBeNull();
    expect((data as { status: string }).status).toBe('unclaimed');
  });
});

describe('authenticated visibility boundaries', () => {
  it('a stranger profile is invisible (no connection, no request)', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');

    const { data } = await alice.client.from('profiles').select('*').eq('id', bob.id);
    expect(data ?? []).toEqual([]);
  });

  it('own profile is visible', async () => {
    const alice = await createTestUser('Alice');
    const { data } = await alice.client.from('profiles').select('display_name').eq('id', alice.id);
    expect(data?.[0]?.display_name).toBe('Alice');
  });

  it('a connected profile is visible', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await connectUsers(alice, bob);

    const { data } = await alice.client.from('profiles').select('display_name').eq('id', bob.id);
    expect(data?.[0]?.display_name).toBe('Bob');
  });

  it('the recipient of a pending request sees the requester card (consent surface)', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const { error } = await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    expect(error).toBeNull();

    const { data } = await bob.client.from('profiles').select('display_name').eq('id', alice.id);
    expect(data?.[0]?.display_name).toBe('Alice');
    // ...but not the other way around: sending grants the recipient nothing.
    const { data: reverse } = await alice.client.from('profiles').select('*').eq('id', bob.id);
    expect(reverse ?? []).toEqual([]);
  });

  it('requesters cannot read their own outgoing requests (silent-drop cover)', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const { error } = await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    expect(error).toBeNull();

    const { data: mine } = await alice.client
      .from('connect_requests')
      .select('*')
      .eq('requester_id', alice.id);
    expect(mine ?? []).toEqual([]);

    const { data: theirs } = await bob.client
      .from('connect_requests')
      .select('*')
      .eq('recipient_id', bob.id);
    expect(theirs).toHaveLength(1);
  });
});
