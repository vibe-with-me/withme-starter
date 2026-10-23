// Account deletion cascades: profile gone, connections and requests deleted,
// blocks deleted, claimed tags reset to unclaimed, their scan history erased,
// and an operator's role gone with them.
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  SUPABASE_DB_URL,
  admin,
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
  makeOperator,
  provisionTag,
} from '../src/test-utils/index.ts';

const sql = new SQL(SUPABASE_DB_URL);

beforeAll(assertStackRunning);
afterAll(() => sql.close());

describe('account deletion', () => {
  it('cascades through every table and resets claimed tags', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    const dave = await createTestUser('Dave');

    // Alice: claims a tag with scans, connects with Bob, has a pending
    // request to Carol, and has blocked Dave.
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });
    await anonClient().rpc('log_scan', { p_uid: uid, p_user_agent: 'cascade-test' });
    await connectUsers(alice, bob);
    await alice.client.rpc('send_connect_request', { p_recipient: carol.id });
    await alice.client.from('blocks').insert({ blocker_id: alice.id, blocked_id: dave.id });

    // Delete the auth user — the way account deletion actually happens.
    const { error } = await admin.auth.admin.deleteUser(alice.id);
    expect(error).toBeNull();

    // Profile: gone.
    const { data: profile } = await admin.from('profiles').select('*').eq('id', alice.id);
    expect(profile ?? []).toEqual([]);

    // Connections: gone (Bob sees nothing).
    expect((await bob.client.from('connections').select('*')).data ?? []).toEqual([]);

    // Pending requests: gone (Carol's inbox empty).
    expect((await carol.client.from('connect_requests').select('*')).data ?? []).toEqual([]);

    // Blocks: gone.
    const { data: blocks } = await admin.from('blocks').select('*').eq('blocker_id', alice.id);
    expect(blocks ?? []).toEqual([]);

    // Tag: reset to unclaimed with destination nulled.
    const { data: tag } = await admin.from('tags').select('*').eq('uid', uid).single();
    expect(tag?.status).toBe('unclaimed');
    expect(tag?.claimed_by).toBeNull();
    expect(tag?.destination).toBeNull();

    // Scan history for her tags: erased.
    const { data: scans } = await admin.from('tag_scans').select('*').eq('tag_uid', uid);
    expect(scans ?? []).toEqual([]);

    // And the tag is immediately re-claimable.
    const { error: reclaim } = await bob.client.rpc('claim_tag', { p_uid: uid });
    expect(reclaim).toBeNull();
  });
});

describe('operator account deletion', () => {
  it('an operator who deletes their account loses the role; a report they resolved keeps its row', async () => {
    const ops = await createTestUser('Operator');
    await makeOperator(ops.id);
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    expect((await alice.client.rpc('report_user', { p_reported: bob.id, p_reason: 'spam' })).error).toBeNull();
    const { data: report } = await admin.from('reports').select('id').eq('reporter_id', alice.id).single();
    // As #135's resolve will record it.
    const resolved = await admin
      .from('reports')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString(), resolved_by: ops.id })
      .eq('id', report!.id)
      .select('resolved_by');
    expect(resolved.data).toEqual([{ resolved_by: ops.id }]);
    expect((await ops.client.rpc('is_operator')).data).toBe(true);

    expect((await ops.client.rpc('delete_my_account')).error).toBeNull();

    expect(await sql`select user_id from private.operators where user_id = ${ops.id}`).toEqual([]);
    const { data: after } = await admin
      .from('reports')
      .select('status, resolved_by')
      .eq('id', report!.id)
      .single();
    expect(after).toEqual({ status: 'dismissed', resolved_by: null });

    // A new account is a new user id: nothing carries over.
    const fresh = await createTestUser('Operator again');
    expect((await fresh.client.rpc('is_operator')).data).toBe(false);
  });

  it('resolved_by must be a profile', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await alice.client.rpc('report_user', { p_reported: bob.id, p_reason: 'spam' });
    const { error } = await admin
      .from('reports')
      .update({ resolved_by: crypto.randomUUID() })
      .eq('reporter_id', alice.id);
    expect(error?.code).toBe('23503');
  });
});
