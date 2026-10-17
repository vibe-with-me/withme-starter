// Reports: a signed-in person reports another, and only the operator (the
// service role) ever reads it. The reporter cannot read it back, the reported
// person never learns of it, anon sees nothing, and the call answers the same
// way for an id that is not a person (no existence oracle).
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  admin,
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
} from '../src/test-utils/index.ts';
import type { TestUser } from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

async function reportsAbout(id: string) {
  const { data, error } = await admin.from('reports').select('*').eq('reported_id', id);
  if (error) throw error;
  return data;
}

function report(reporter: TestUser, reported: string, extra: Record<string, unknown> = {}) {
  return reporter.client.rpc('report_user', { p_reported: reported, p_reason: 'harassment', ...extra });
}

describe('report_user', () => {
  it('stores the report with a snapshot of the card (positive control)', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await admin.from('profiles').update({ bio: 'Original bio' }).eq('id', bob.id);

    const { error } = await report(alice, bob.id, { p_details: '  Kept messaging me.\nTwice.  ' });
    expect(error).toBeNull();

    // A later edit cannot change what was reported. Assert the edit landed,
    // or the snapshot check below passes without testing anything.
    const { data: edited, error: editError } = await bob.client
      .from('profiles')
      .update({ bio: 'Innocent now' })
      .eq('id', bob.id)
      .select('bio');
    expect(editError).toBeNull();
    expect(edited).toEqual([{ bio: 'Innocent now' }]);

    const rows = await reportsAbout(bob.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reporter_id: alice.id,
      reported_id: bob.id,
      reason: 'harassment',
      details: 'Kept messaging me.\nTwice.',
      status: 'open',
      snapshot: { display_name: 'Bob', bio: 'Original bio', avatar_path: null },
    });
  });

  it('the reporter, the reported person and anon read nothing, and cannot write directly', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    expect((await report(alice, bob.id)).error).toBeNull();
    expect(await reportsAbout(bob.id)).toHaveLength(1);

    for (const client of [alice.client, bob.client, anonClient()]) {
      const { data, error } = await client.from('reports').select('*');
      // Privileges are revoked, so PostgREST refuses the table outright.
      expect(data ?? []).toEqual([]);
      expect(error).not.toBeNull();
    }
    const direct = await alice.client
      .from('reports')
      .insert({ reported_id: bob.id, reason: 'spam', snapshot: {} });
    expect(direct.error).not.toBeNull();
    const erase = await bob.client.from('reports').delete().eq('reported_id', bob.id);
    expect(erase.error).not.toBeNull();
    expect(await reportsAbout(bob.id)).toHaveLength(1);
  });

  it('an id that is not a person answers exactly like a real one, and stores nothing', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const ghost = crypto.randomUUID();

    const real = await report(alice, bob.id);
    const fake = await report(alice, ghost);
    expect(fake).toEqual(real);
    expect(fake.error).toBeNull();
    expect(await reportsAbout(ghost)).toEqual([]);
  });

  it('refuses reporting yourself, an unknown reason, and invisible characters', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    expect((await report(alice, alice.id)).error?.code).toBe('22023');
    expect((await report(alice, bob.id, { p_reason: 'rude' })).error?.code).toBe('22023');
    expect((await report(alice, bob.id, { p_details: 'a‮b' })).error?.code).toBe('22023');
    expect((await report(alice, bob.id, { p_details: 'x'.repeat(1001) })).error?.code).toBe('22023');
    expect(await reportsAbout(bob.id)).toEqual([]);
  });

  it('a bad reason or text answers the same for a real person and an unknown id, and reveals nothing', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob Hidden');
    await admin.from('profiles').update({ bio: 'Secret bio' }).eq('id', bob.id);
    // Bob blocked Alice: his card is hers to see nowhere.
    expect((await bob.client.from('blocks').insert({ blocker_id: bob.id, blocked_id: alice.id })).error).toBeNull();
    const ghost = crypto.randomUUID();

    for (const extra of [{ p_reason: 'rude' }, { p_details: 'a‮b' }, { p_details: 'x'.repeat(1001) }]) {
      const real = await report(alice, bob.id, extra);
      const fake = await report(alice, ghost, extra);
      expect(real).toEqual(fake);
      // A check-constraint error would carry the failing row: Bob's name, bio and photo path.
      expect(JSON.stringify(real)).not.toMatch(/Bob Hidden|Secret bio|avatar_path/);
    }
    expect(await reportsAbout(bob.id)).toEqual([]);
  });

  it('anon and a session without a profile cannot report', async () => {
    const bob = await createTestUser('Bob');
    const { error } = await anonClient().rpc('report_user', { p_reported: bob.id, p_reason: 'spam' });
    expect(error).not.toBeNull();
    expect(await reportsAbout(bob.id)).toEqual([]);
  });

  it('counts 10 attempts per rolling day, unknown ids included', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    for (let i = 0; i < 9; i++) expect((await report(alice, crypto.randomUUID())).error).toBeNull();
    expect((await report(alice, bob.id)).error).toBeNull();
    const refused = await report(alice, bob.id);
    expect(refused.error?.code).toBe('P0004');
    expect(await reportsAbout(bob.id)).toHaveLength(1);
    // Someone else's limit is their own.
    const carol = await createTestUser('Carol');
    expect((await report(carol, bob.id)).error).toBeNull();
  });

  it('block in the same step: blocks, drops the connection, keeps a known card in the list', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await connectUsers(alice, bob);

    expect((await report(alice, bob.id, { p_block: true })).error).toBeNull();

    const { data: blocks } = await alice.client.from('blocks').select('blocked_id, reveals_card');
    expect(blocks).toEqual([{ blocked_id: bob.id, reveals_card: true }]);
    expect((await bob.client.from('connections').select('*')).data ?? []).toEqual([]);
    // What the blocked party sees: exactly what a stranger sees.
    expect((await bob.client.from('profiles').select('id').eq('id', alice.id)).data ?? []).toEqual([]);
    expect((await bob.client.from('blocks').select('*')).data ?? []).toEqual([]);
  });

  it('blocking a stranger in the same step reveals nothing, and an existing block is kept', async () => {
    const alice = await createTestUser('Alice');
    const host = await createTestUser('Host');
    expect((await report(alice, host.id, { p_block: true })).error).toBeNull();
    expect((await report(alice, host.id, { p_block: true })).error).toBeNull();
    const { data: blocks } = await alice.client.from('blocks').select('blocked_id, reveals_card');
    expect(blocks).toEqual([{ blocked_id: host.id, reveals_card: false }]);
    expect((await alice.client.from('profiles').select('id').eq('id', host.id)).data ?? []).toEqual([]);
  });

  it('without p_block nothing is blocked', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await connectUsers(alice, bob);
    expect((await report(alice, bob.id)).error).toBeNull();
    expect((await alice.client.from('blocks').select('*')).data ?? []).toEqual([]);
    expect((await alice.client.from('connections').select('id')).data).toHaveLength(1);
  });
});

describe('reports and account deletion', () => {
  it("the reporter's reports are anonymised, not deleted, when they delete their account", async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    expect((await report(alice, bob.id, { p_details: 'Details stay' })).error).toBeNull();

    expect((await alice.client.rpc('delete_my_account')).error).toBeNull();

    const rows = await reportsAbout(bob.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reporter_id: null, reason: 'harassment', details: 'Details stay' });
  });

  it('reports about a person outlive their account deletion, for 90 days', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    expect((await report(alice, bob.id, { p_details: 'Threats' })).error).toBeNull();
    const [filed] = await reportsAbout(bob.id);

    expect((await bob.client.rpc('delete_my_account')).error).toBeNull();

    const { data: kept } = await admin.from('reports').select('*').eq('id', filed!.id).single();
    expect(kept).toMatchObject({
      reporter_id: alice.id,
      reported_id: null,
      details: 'Threats',
      snapshot: { display_name: 'Bob' },
    });
    expect(Date.now() - Date.parse(kept!.reported_deleted_at!)).toBeLessThan(60_000);
  });

  it('a profile cannot be deleted on its own to cut reports loose from a login that stays', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    expect((await report(alice, bob.id)).error).toBeNull();

    // /rest/v1/profiles?id=eq.<bob> DELETE, then a fresh profile on the same login.
    await bob.client.from('profiles').delete().eq('id', bob.id);
    const { data: still } = await admin.from('profiles').select('id').eq('id', bob.id);
    expect(still).toEqual([{ id: bob.id }]);
    const rows = await reportsAbout(bob.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reported_deleted_at).toBeNull();
  });

  it('purges them once the window has passed, on the next report or deletion', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    expect((await report(alice, bob.id)).error).toBeNull();
    expect((await report(alice, carol.id)).error).toBeNull();
    const [aboutBob] = await reportsAbout(bob.id);
    const [aboutCarol] = await reportsAbout(carol.id);
    expect((await bob.client.rpc('delete_my_account')).error).toBeNull();
    expect((await carol.client.rpc('delete_my_account')).error).toBeNull();

    // Bob's clock ran out; Carol's has not.
    const longAgo = new Date(Date.now() - 91 * 24 * 3600 * 1000).toISOString();
    await admin.from('reports').update({ reported_deleted_at: longAgo }).eq('id', aboutBob!.id);

    const dave = await createTestUser('Dave');
    expect((await report(dave, crypto.randomUUID())).error).toBeNull();

    const { data: left } = await admin
      .from('reports')
      .select('id')
      .in('id', [aboutBob!.id, aboutCarol!.id]);
    expect(left).toEqual([{ id: aboutCarol!.id }]);
  });
});

describe('the report webhook', () => {
  const DB_URL =
    process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
  const sql = new SQL(DB_URL);
  const received: unknown[] = [];
  const hook = Bun.serve({
    port: 0,
    hostname: '0.0.0.0',
    async fetch(request) {
      received.push(await request.json());
      return new Response('ok');
    },
  });

  beforeAll(async () => {
    await sql`update private.settings set value = ${`http://host.docker.internal:${hook.port}/hook`} where key = 'report_webhook_url'`;
  });
  afterAll(async () => {
    await sql`update private.settings set value = null where key = 'report_webhook_url'`;
    await hook.stop(true);
    await sql.close();
  });

  async function nextDelivery(): Promise<unknown> {
    for (let i = 0; i < 200 && received.length === 0; i++) await Bun.sleep(50);
    return received.shift();
  }

  it('posts the report id only: no names, no reason, no text', async () => {
    const alice = await createTestUser('Alice Webhook');
    const bob = await createTestUser('Bob Webhook');
    expect((await report(alice, bob.id, { p_details: 'secret words' })).error).toBeNull();
    const [row] = await reportsAbout(bob.id);

    const body = await nextDelivery();
    const message = `A report was filed: ${row!.id}`;
    expect(body).toEqual({ text: message, content: message });
    expect(JSON.stringify(body)).not.toMatch(/Webhook|secret|harassment/);
  });

  it('an id that is not a person sends nothing', async () => {
    const alice = await createTestUser('Alice');
    expect((await report(alice, crypto.randomUUID())).error).toBeNull();
    await Bun.sleep(1000);
    expect(received).toEqual([]);
  });
});
