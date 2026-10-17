// Share codes: a QR-only tag row per person, resolved by the unchanged
// resolver. A scan must show exactly what a tap shows, a replaced or
// orphaned code must never become claimable, and the owner manages it only
// through its two RPCs.
import { beforeAll, describe, expect, it } from 'bun:test';
import { listOwnTags } from '../src/queries/tags.ts';
import {
  admin,
  anonClient,
  assertStackRunning,
  createTestUser,
  provisionTag,
} from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

async function shareCode(user: { client: ReturnType<typeof anonClient> }): Promise<string> {
  const { data, error } = await user.client.rpc('my_share_code');
  expect(error).toBeNull();
  expect(data).toMatch(/^[0-9A-F]{14}$/);
  return data as string;
}

async function resolve(uid: string, client = anonClient()) {
  const { data, error } = await client.rpc('resolve_tag', { p_uid: uid });
  expect(error).toBeNull();
  return data as { status: string; uid: string; profile?: { id: string; display_name: string } };
}

describe('my_share_code', () => {
  it('mints once and returns the same code after', async () => {
    const alice = await createTestUser('Alice');
    const first = await shareCode(alice);
    expect(await shareCode(alice)).toBe(first);
    const { data } = await admin.from('tags').select('kind, status, claimed_by').eq('uid', first).single();
    expect(data).toEqual({ kind: 'qr', status: 'claimed', claimed_by: alice.id });
  });

  it('two first opens at once yield one code', async () => {
    const alice = await createTestUser('Alice');
    const [a, b] = await Promise.all([shareCode(alice), shareCode(alice)]);
    expect(a).toBe(b);
    const { data } = await admin.from('tags').select('uid').eq('claimed_by', alice.id).eq('kind', 'qr');
    expect(data).toHaveLength(1);
  });

  it('resolves for anon and a stranger exactly like a tapped tag', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const code = await shareCode(alice);
    const tag = await provisionTag();
    expect((await alice.client.rpc('claim_tag', { p_uid: tag })).error).toBeNull();

    const byCode = await resolve(code, bob.client);
    const byTap = await resolve(tag, bob.client);
    expect(byCode.status).toBe('claimed');
    // The same card, the same keys: a scan reveals nothing a tap does not.
    expect({ ...byCode, uid: undefined }).toEqual({ ...byTap, uid: undefined });
    expect((await resolve(code)).profile?.id).toBe(alice.id);
  });

  it('a viewer the owner blocked gets disabled, as with a tap', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const code = await shareCode(alice);
    // positive control: bob sees the card before the block
    expect((await resolve(code, bob.client)).status).toBe('claimed');
    expect(
      (await alice.client.from('blocks').insert({ blocker_id: alice.id, blocked_id: bob.id })).error,
    ).toBeNull();
    expect(await resolve(code, bob.client)).toEqual({ status: 'disabled', uid: code });
  });

  it('anon cannot mint or replace', async () => {
    for (const fn of ['my_share_code', 'replace_my_share_code'] as const) {
      const { error } = await anonClient().rpc(fn);
      expect(error?.message).toContain(`permission denied for function ${fn}`);
    }
  });

  it('a signed-in caller without a profile cannot mint', async () => {
    const email = `${crypto.randomUUID()}@rls.test`;
    await admin.auth.admin.createUser({ email, password: 'rls-test-password-1!', email_confirm: true });
    const client = anonClient();
    await client.auth.signInWithPassword({ email, password: 'rls-test-password-1!' });
    const { error } = await client.rpc('my_share_code');
    expect(error?.code).toBe('P0001');
  });
});

describe('replace_my_share_code', () => {
  it('retires the old code: inactive, ownerless, unclaimable, scans erased', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const old = await shareCode(alice);
    expect((await anonClient().rpc('log_scan', { p_uid: old })).error).toBeNull();

    const { data: fresh, error } = await alice.client.rpc('replace_my_share_code');
    expect(error).toBeNull();
    expect(fresh).not.toBe(old);
    expect(await shareCode(alice)).toBe(fresh as string);

    expect(await resolve(old)).toEqual({ status: 'disabled', uid: old });
    expect((await resolve(fresh as string)).profile?.id).toBe(alice.id);
    expect((await bob.client.rpc('claim_tag', { p_uid: old })).data).toBeNull();
    const { data: row } = await admin.from('tags').select('status, claimed_by, destination').eq('uid', old).single();
    expect(row).toEqual({ status: 'disabled', claimed_by: null, destination: null });
    const { data: scans } = await admin.from('tag_scans').select('id').eq('tag_uid', old);
    expect(scans).toEqual([]);
  });

  it('counts 10 replacements an hour, then refuses and keeps the live code', async () => {
    const alice = await createTestUser('Alice');
    for (let i = 0; i < 10; i++) {
      expect((await alice.client.rpc('replace_my_share_code')).error).toBeNull();
    }
    const live = await shareCode(alice);
    const { error } = await alice.client.rpc('replace_my_share_code');
    expect(error?.code).toBe('P0004');
    expect(await shareCode(alice)).toBe(live);
    // Per user: someone else still replaces theirs.
    const bob = await createTestUser('Bob');
    expect((await bob.client.rpc('replace_my_share_code')).error).toBeNull();
  });
});

describe('owner CRUD', () => {
  it('the code is not in My tags, and cannot be switched off or re-pointed', async () => {
    const alice = await createTestUser('Alice');
    const code = await shareCode(alice);
    const tag = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: tag });
    expect((await listOwnTags(alice.client)).map((t) => t.uid)).toEqual([tag]);

    // positive control: the same update lands on a physical tag
    const onTag = await alice.client.from('tags').update({ status: 'disabled' }).eq('uid', tag).select('uid');
    expect(onTag.data).toHaveLength(1);
    for (const patch of [{ status: 'disabled' as const }, { destination: { type: 'profile' } }]) {
      const { data, error } = await alice.client.from('tags').update(patch).eq('uid', code).select('uid');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    expect((await resolve(code)).status).toBe('claimed');
  });

  it('a share code can never be unclaimed or point at anything but a card', async () => {
    const alice = await createTestUser('Alice');
    const code = await shareCode(alice);
    const unclaim = await admin
      .from('tags')
      .update({ status: 'unclaimed', claimed_by: null, destination: null })
      .eq('uid', code);
    expect(unclaim.error?.code).toBe('23514');
    const repoint = await admin
      .from('tags')
      .update({ destination: { type: 'gathering', gathering_id: crypto.randomUUID() } })
      .eq('uid', code);
    expect(repoint.error?.code).toBe('23514');
  });
});

describe('scan method', () => {
  it('a share code logs qr whatever the client says; a tag keeps a known hint', async () => {
    const alice = await createTestUser('Alice');
    const code = await shareCode(alice);
    const tag = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: tag });
    const anon = anonClient();
    expect((await anon.rpc('log_scan', { p_uid: code, p_scan_method: 'nfc' })).error).toBeNull();
    expect((await anon.rpc('log_scan', { p_uid: tag, p_scan_method: 'nfc' })).error).toBeNull();
    expect((await anon.rpc('log_scan', { p_uid: tag, p_scan_method: 'gps' })).error).toBeNull();
    expect((await anon.rpc('log_scan', { p_uid: tag })).error).toBeNull();

    const { data: codeScans } = await admin.from('tag_scans').select('scan_method').eq('tag_uid', code);
    expect(codeScans).toEqual([{ scan_method: 'qr' }]);
    const { data: tagScans } = await admin
      .from('tag_scans')
      .select('scan_method')
      .eq('tag_uid', tag)
      .order('scanned_at');
    expect(tagScans?.map((s) => s.scan_method).toSorted()).toEqual(['nfc', 'unknown', 'unknown']);
  });
});

describe('account deletion', () => {
  it('tombstones the code: it never returns to unclaimed', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const code = await shareCode(alice);
    expect((await anonClient().rpc('log_scan', { p_uid: code })).error).toBeNull();
    expect((await alice.client.rpc('delete_my_account')).error).toBeNull();

    const { data: row } = await admin.from('tags').select('status, claimed_by').eq('uid', code).single();
    expect(row).toEqual({ status: 'disabled', claimed_by: null });
    expect(await resolve(code)).toEqual({ status: 'disabled', uid: code });
    expect((await bob.client.rpc('claim_tag', { p_uid: code })).data).toBeNull();
    const { data: scans } = await admin.from('tag_scans').select('id').eq('tag_uid', code);
    expect(scans).toEqual([]);
  });
});
