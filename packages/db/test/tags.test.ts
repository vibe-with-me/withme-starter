// Tag lifecycle: atomic claiming, owner-only management, scan privacy.
import { beforeAll, describe, expect, it } from 'bun:test';
import { DEFAULT_TENANT_ID } from '../src/index.ts';
import {
  admin,
  anonClient,
  assertStackRunning,
  createTestUser,
  provisionTag,
} from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

describe('claiming', () => {
  it('claim is atomic: the second claimant loses', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const uid = await provisionTag();

    const first = await alice.client.rpc('claim_tag', { p_uid: uid });
    expect(first.error).toBeNull();
    expect(first.data).not.toBeNull();
    // Not an exception: an exception would roll back the attempt it records.
    const second = await bob.client.rpc('claim_tag', { p_uid: uid });
    expect(second.error).toBeNull();
    expect(second.data).toBeNull();
    const { data } = await admin.from('tags').select('claimed_by').eq('uid', uid).single();
    expect(data?.claimed_by).toBe(alice.id);
  });

  it('unknown, claimed and disabled uids get the same answer: no existence oracle', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const claimed = await provisionTag();
    await bob.client.rpc('claim_tag', { p_uid: claimed });
    const disabled = await provisionTag();
    await admin.from('tags').update({ status: 'disabled' }).eq('uid', disabled);

    const answers = [];
    for (const uid of ['04FFFFFFFFFF98', claimed, disabled]) {
      const { data, error } = await alice.client.rpc('claim_tag', { p_uid: uid });
      answers.push({ data, error });
    }
    expect(answers).toEqual([
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);
  });

  it('every attempt counts against 30 an hour, failed guesses included, via PostgREST', async () => {
    const alice = await createTestUser('Alice');
    for (let i = 0; i < 30; i++) {
      const { error } = await alice.client.rpc('claim_tag', {
        p_uid: `04${i.toString(16).toUpperCase().padStart(12, '0')}`,
      });
      expect(error).toBeNull();
    }
    // The 31st is refused, even for a real, unclaimed tag.
    const uid = await provisionTag();
    const { error } = await alice.client.rpc('claim_tag', { p_uid: uid });
    expect(error?.code).toBe('P0004');
    const { data } = await admin.from('tags').select('status').eq('uid', uid).single();
    expect(data?.status).toBe('unclaimed');
    // Per user: someone else still claims it.
    const bob = await createTestUser('Bob');
    expect((await bob.client.rpc('claim_tag', { p_uid: uid })).data).not.toBeNull();
  });

  it('anon cannot claim', async () => {
    const uid = await provisionTag();
    const { error } = await anonClient().rpc('claim_tag', { p_uid: uid });
    // No EXECUTE: refused before the definer body runs (its own check is a backstop).
    expect(error?.message).toContain('permission denied for function claim_tag');
    const { data } = await admin.from('tags').select('status').eq('uid', uid).single();
    expect(data?.status).toBe('unclaimed');
  });

  it('rows carry the default tenant seam', async () => {
    const alice = await createTestUser('Alice');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    const { data: tag } = await admin.from('tags').select('tenant_id').eq('uid', uid).single();
    expect(tag?.tenant_id).toBe(DEFAULT_TENANT_ID);
    const { data: profile } = await admin
      .from('profiles')
      .select('tenant_id')
      .eq('id', alice.id)
      .single();
    expect(profile?.tenant_id).toBe(DEFAULT_TENANT_ID);
  });
});

describe('owner management', () => {
  it('the owner can disable and re-enable their tag', async () => {
    const alice = await createTestUser('Alice');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    const { error } = await alice.client.from('tags').update({ status: 'disabled' }).eq('uid', uid);
    expect(error).toBeNull();
    const { data } = await anonClient().rpc('resolve_tag', { p_uid: uid });
    expect((data as { status: string }).status).toBe('disabled');

    await alice.client.from('tags').update({ status: 'claimed' }).eq('uid', uid);
    const { data: back } = await anonClient().rpc('resolve_tag', { p_uid: uid });
    expect((back as { status: string }).status).toBe('claimed');
  });

  it('a non-owner cannot touch the tag', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    await bob.client.from('tags').update({ status: 'disabled' }).eq('uid', uid);
    const { data } = await admin.from('tags').select('status').eq('uid', uid).single();
    expect(data?.status).toBe('claimed'); // unchanged — RLS matched zero rows
  });

  it('destination must match the typed union (DB-level validation)', async () => {
    const alice = await createTestUser('Alice');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    const { error } = await alice.client
      .from('tags')
      .update({ destination: { type: 'teleport' } })
      .eq('uid', uid);
    expect(error?.message).toContain('tags_destination_shape');

    // exact-match: extra keys on a valid type are rejected too
    const { error: extraKeys } = await alice.client
      .from('tags')
      .update({ destination: { type: 'profile', payload: 'x' } })
      .eq('uid', uid);
    expect(extraKeys?.message).toContain('tags_destination_shape');
  });

  it('the owner cannot mutate the immutable uid or reassign ownership', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    // uid is not an updatable column for clients (squat prevention)
    const { error: uidError } = await alice.client
      .from('tags')
      .update({ uid: '04FFFFFFFFFF96' })
      .eq('uid', uid);
    expect(uidError).not.toBeNull();

    // neither is claimed_by
    const { error: ownerError } = await alice.client
      .from('tags')
      .update({ claimed_by: bob.id })
      .eq('uid', uid);
    expect(ownerError).not.toBeNull();

    const { data } = await admin.from('tags').select('uid, claimed_by').eq('uid', uid).single();
    expect(data?.uid).toBe(uid);
    expect(data?.claimed_by).toBe(alice.id);
  });
});

describe('scan privacy', () => {
  it('anon can log a scan; nobody can read scans through the API', async () => {
    const alice = await createTestUser('Alice');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    const { error } = await anonClient().rpc('log_scan', {
      p_uid: uid,
      p_user_agent: 'test-agent',
    });
    expect(error).toBeNull();

    // Stored (service-role check)...
    const { data: raw } = await admin.from('tag_scans').select('*').eq('tag_uid', uid);
    expect(raw).toHaveLength(1);
    // ...but invisible to everyone via client roles, including the tag owner.
    expect((await alice.client.from('tag_scans').select('*')).data ?? []).toEqual([]);
    expect((await anonClient().from('tag_scans').select('*')).data ?? []).toEqual([]);
  });

  it('logging a scan for an unknown uid is a silent no-op', async () => {
    const { error } = await anonClient().rpc('log_scan', { p_uid: '04FFFFFFFFFF97' });
    expect(error).toBeNull();
  });

  it('scan rows contain no location or network identity columns', async () => {
    // seed a scan so this test can never vacuously pass on an empty table
    const uid = await provisionTag();
    await anonClient().rpc('log_scan', { p_uid: uid, p_user_agent: 'columns-probe' });

    const { data } = await admin.from('tag_scans').select('*').eq('tag_uid', uid).limit(1);
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    const columns = Object.keys(data![0]!);
    expect(columns.toSorted()).toEqual(['id', 'scanned_at', 'tag_uid', 'tenant_id', 'user_agent']);
  });

  it('log_scan throttles a single uid at the database floor (60/min)', async () => {
    const uid = await provisionTag();
    const anon = anonClient();
    for (let i = 0; i < 65; i++) {
      const { error } = await anon.rpc('log_scan', { p_uid: uid });
      expect(error).toBeNull(); // always a silent ack, never an error
    }
    const { count } = await admin
      .from('tag_scans')
      .select('*', { count: 'exact', head: true })
      .eq('tag_uid', uid);
    expect(count).toBe(60);
  });
});

/** Invisible means an empty, error-free result: a policy error is not invisibility. */
function expectEmpty(result: { data: unknown[] | null; error: unknown }): void {
  expect(result.error).toBeNull();
  expect(result.data).toEqual([]);
}

describe('my tags (what app.tags.listMine and app.tags.update rest on)', () => {
  it('the owner lists every tag they claimed, disabled ones included; a stranger and anon list none', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const live = await provisionTag();
    const off = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: live });
    await alice.client.rpc('claim_tag', { p_uid: off });
    await alice.client.from('tags').update({ status: 'disabled' }).eq('uid', off);

    const { data: mine, error } = await alice.client
      .from('tags')
      .select('uid, status')
      .in('uid', [live, off]);
    expect(error).toBeNull();
    expect(new Map(mine?.map((tag) => [tag.uid, tag.status]))).toEqual(
      new Map([
        [live, 'claimed'],
        [off, 'disabled'],
      ]),
    );
    expectEmpty(await bob.client.from('tags').select('uid').in('uid', [live, off]));
    expectEmpty(await anonClient().from('tags').select('uid').in('uid', [live, off]));
  });

  it('the owner re-points and switches a tag off in one update; a stranger matches zero rows', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    expectEmpty(
      await bob.client.from('tags').update({ status: 'disabled' }).eq('uid', uid).select('uid'),
    );

    const { data, error } = await alice.client
      .from('tags')
      .update({ destination: { type: 'profile' }, status: 'disabled' })
      .eq('uid', uid)
      .select('uid, status, destination')
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ uid, status: 'disabled', destination: { type: 'profile' } });
  });

  it('an owner cannot release a tag by setting it unclaimed', async () => {
    const alice = await createTestUser('Alice');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    const { error } = await alice.client.from('tags').update({ status: 'unclaimed' }).eq('uid', uid);
    expect(error?.message).toContain('tags_state_consistent');
    const { data } = await admin.from('tags').select('status, claimed_by').eq('uid', uid).single();
    expect(data).toEqual({ status: 'claimed', claimed_by: alice.id });
  });
});
