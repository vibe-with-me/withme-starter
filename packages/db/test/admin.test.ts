// Operators and the admin read functions. An operator is a signed-in person
// with a row in private.operators for the tenant; admin_list_open_reports
// and admin_get_report check that before they read anything, so everyone
// else (a signed-in person, anon, an operator of another tenant) gets 42501
// and no data, and public.reports stays unreadable to them.
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { getReportForOperator, isOperator, listOpenReports } from '../src/queries/admin.ts';
import {
  SUPABASE_DB_URL,
  admin,
  anonClient,
  assertStackRunning,
  createTestUser,
  makeOperator,
} from '../src/test-utils/index.ts';
import type { TestUser } from '../src/test-utils/index.ts';

const sql = new SQL(SUPABASE_DB_URL);

beforeAll(assertStackRunning);
afterAll(() => sql.close());

const OTHER_TENANT = '00000000-0000-0000-0000-0000000000ff';

async function newOperator(name = 'Operator'): Promise<TestUser> {
  const user = await createTestUser(name);
  await makeOperator(user.id);
  return user;
}

/** Files a report through the real flow and returns its id. */
async function fileReport(
  reporter: TestUser,
  reported: string,
  reason = 'harassment',
): Promise<string> {
  const { error } = await reporter.client.rpc('report_user', {
    p_reported: reported,
    p_reason: reason,
  });
  if (error) throw error;
  const { data, error: readError } = await admin
    .from('reports')
    .select('id')
    .eq('reporter_id', reporter.id)
    .eq('reported_id', reported)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (readError) throw readError;
  return data.id;
}

async function setCreatedAt(id: string, at: Date): Promise<void> {
  const { data, error } = await admin
    .from('reports')
    .update({ created_at: at.toISOString() })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  expect(data).toHaveLength(1);
}

async function openIds(operator: TestUser): Promise<string[]> {
  const { data, error } = await operator.client.rpc('admin_list_open_reports');
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);

describe('who may call the admin functions', () => {
  it('an operator reads the queue and a report (positive control)', async () => {
    const ops = await newOperator();
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await fileReport(alice, bob.id);

    expect(await openIds(ops)).toContain(id);
    const { data, error } = await ops.client.rpc('admin_get_report', { p_id: id });
    expect(error).toBeNull();
    expect(data).toMatchObject({ report: { id } });
  });

  it('a signed-in non-operator gets 42501 and no data, whoever they are', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await fileReport(alice, bob.id);

    // The reporter, the reported person, and a stranger alike.
    for (const user of [alice, bob, await createTestUser('Stranger')]) {
      const list = await user.client.rpc('admin_list_open_reports');
      expect(list.error?.code).toBe('42501');
      expect(list.data).toBeNull();
      // A real id and an unknown one answer the same: no existence oracle.
      for (const p_id of [id, crypto.randomUUID()]) {
        const one = await user.client.rpc('admin_get_report', { p_id });
        expect(one.error?.code).toBe('42501');
        expect(one.data).toBeNull();
      }
    }
  });

  it('anon gets 42501 from every admin function and from is_operator', async () => {
    const anon = anonClient();
    expect((await anon.rpc('admin_list_open_reports')).error?.code).toBe('42501');
    expect((await anon.rpc('admin_get_report', { p_id: crypto.randomUUID() })).error?.code).toBe(
      '42501',
    );
    expect((await anon.rpc('is_operator')).error?.code).toBe('42501');
  });

  it('is_operator answers about the caller only: true for an operator, false for anyone else', async () => {
    const ops = await newOperator();
    const alice = await createTestUser('Alice');
    expect((await ops.client.rpc('is_operator')).data).toBe(true);
    expect((await alice.client.rpc('is_operator')).data).toBe(false);
  });

  it('nobody reaches private.operators through PostgREST, an operator included', async () => {
    const ops = await newOperator();
    for (const client of [ops.client, (await createTestUser('Alice')).client, anonClient()]) {
      const read = await client
        .schema('private' as 'public')
        .from('operators' as 'profiles')
        .select('*');
      expect(read.error).not.toBeNull();
      expect(read.data).toBeNull();
    }
    // Nor does the service role: the schema is not exposed at all.
    const { error } = await admin
      .schema('private' as 'public')
      .from('operators' as 'profiles')
      .select('*');
    expect(error).not.toBeNull();
  });

  it('public.reports itself stays closed to an operator', async () => {
    const ops = await newOperator();
    const { data, error } = await ops.client.from('reports').select('*');
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });
});

describe('admin_list_open_reports', () => {
  it('lists child safety first, then oldest first, open reports only', async () => {
    const ops = await newOperator();
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    const oldest = await fileReport(alice, bob.id, 'spam');
    const middle = await fileReport(alice, carol.id, 'harassment');
    const newestChild = await fileReport(carol, bob.id, 'child_safety');
    const resolved = await fileReport(bob, carol.id, 'hate');
    await setCreatedAt(oldest, hoursAgo(30));
    await setCreatedAt(middle, hoursAgo(20));
    await setCreatedAt(newestChild, hoursAgo(1));
    await setCreatedAt(resolved, hoursAgo(40));
    await admin
      .from('reports')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
      .eq('id', resolved);

    const mine = (await openIds(ops)).filter((id) =>
      [oldest, middle, newestChild, resolved].includes(id),
    );
    expect(mine).toEqual([newestChild, oldest, middle]);
  });

  it("carries moderation.md's columns: name, gathering, and the open count about them", async () => {
    const ops = await newOperator();
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const { data: created, error: createError } = await bob.client.rpc('create_gathering', {
      p_title: 'Rooftop session',
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      p_location: 'The roof',
    });
    expect(createError).toBeNull();
    const gatheringId = (created as { id: string }).id;
    const { error: reportError } = await alice.client.rpc('report_gathering', {
      p_gathering: gatheringId,
      p_reason: 'spam',
      p_details: '$20 to hold a spot',
    });
    expect(reportError).toBeNull();
    await fileReport(alice, bob.id, 'harassment');

    const { data, error } = await ops.client.rpc('admin_list_open_reports');
    expect(error).toBeNull();
    const aboutBob = (data ?? []).filter((row) => row.reported_id === bob.id);
    expect(aboutBob).toHaveLength(2);
    const gatheringRow = aboutBob.find((row) => row.gathering_id === gatheringId);
    expect(gatheringRow).toMatchObject({
      reason: 'spam',
      details: '$20 to hold a spot',
      reported_name: 'Bob',
      gathering_title: 'Rooftop session',
      gathering_snapshot: { id: gatheringId, title: 'Rooftop session', location: 'The roof' },
      open_reports_about_them: 2,
    });
    expect(Object.keys(gatheringRow!).toSorted()).toEqual(
      [
        'created_at',
        'details',
        'gathering_id',
        'gathering_snapshot',
        'gathering_title',
        'id',
        'open_reports_about_them',
        'reason',
        'reported_id',
        'reported_name',
      ].toSorted(),
    );
  });

  it('purges reports about accounts deleted more than 90 days ago before it lists', async () => {
    const ops = await newOperator();
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    const aboutBob = await fileReport(alice, bob.id);
    const aboutCarol = await fileReport(alice, carol.id);
    expect((await bob.client.rpc('delete_my_account')).error).toBeNull();
    expect((await carol.client.rpc('delete_my_account')).error).toBeNull();
    // Bob's 90 days ran out; Carol's have not.
    const aged = await admin
      .from('reports')
      .update({ reported_deleted_at: new Date(Date.now() - 91 * 86_400_000).toISOString() })
      .eq('id', aboutBob)
      .select('id');
    expect(aged.data).toHaveLength(1);

    const ids = await openIds(ops);
    expect(ids).not.toContain(aboutBob);
    expect(ids).toContain(aboutCarol);
    const { data: left } = await admin
      .from('reports')
      .select('id')
      .in('id', [aboutBob, aboutCarol]);
    expect(left).toEqual([{ id: aboutCarol }]);

    // A deleted account's report has no id to count by.
    const { data } = await ops.client.rpc('admin_list_open_reports');
    expect(data?.find((row) => row.id === aboutCarol)).toMatchObject({
      reported_id: null,
      reported_name: 'Carol',
      open_reports_about_them: null,
    });
  });
});

describe('admin_get_report', () => {
  it('returns the report next to the current card, the current gathering and the open count', async () => {
    const ops = await newOperator();
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const { data: created } = await bob.client.rpc('create_gathering', {
      p_title: 'Vinyl swap',
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const gatheringId = (created as { id: string }).id;
    expect(
      (
        await alice.client.rpc('report_gathering', {
          p_gathering: gatheringId,
          p_reason: 'spam',
        })
      ).error,
    ).toBeNull();
    const { data: row } = await admin
      .from('reports')
      .select('id')
      .eq('gathering_id', gatheringId)
      .single();
    await fileReport(alice, bob.id);

    // Both change after the report: the detail shows them as they are now.
    await bob.client.from('profiles').update({ bio: 'Innocent now' }).eq('id', bob.id);
    await bob.client
      .from('gatherings')
      .update({ title: 'Vinyl swap (free)' })
      .eq('id', gatheringId);

    const { data, error } = await ops.client.rpc('admin_get_report', { p_id: row!.id });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      report: {
        id: row!.id,
        reason: 'spam',
        status: 'open',
        reported_id: bob.id,
        gathering_id: gatheringId,
        snapshot: { display_name: 'Bob', bio: null, gathering: { title: 'Vinyl swap' } },
        resolved_by: null,
      },
      card: { id: bob.id, display_name: 'Bob', bio: 'Innocent now', avatar_path: null },
      gathering: { id: gatheringId, title: 'Vinyl swap (free)', host_id: bob.id },
      open_reports_about_them: 2,
    });
    // Who filed it stays out of the admin API.
    expect(Object.keys((data as { report: object }).report)).not.toContain('reporter_id');
  });

  it('a gone account and a deleted gathering read as null, the snapshot kept', async () => {
    const ops = await newOperator();
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const { data: created } = await bob.client.rpc('create_gathering', {
      p_title: 'Soon gone',
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const gatheringId = (created as { id: string }).id;
    await alice.client.rpc('report_gathering', { p_gathering: gatheringId, p_reason: 'spam' });
    const { data: row } = await admin
      .from('reports')
      .select('id')
      .eq('reporter_id', alice.id)
      .single();
    expect((await bob.client.rpc('delete_my_account')).error).toBeNull();

    const { data, error } = await ops.client.rpc('admin_get_report', { p_id: row!.id });
    expect(error).toBeNull();
    expect(data).toMatchObject({
      report: { reported_id: null, gathering_id: null, snapshot: { display_name: 'Bob' } },
      card: null,
      gathering: null,
      open_reports_about_them: 0,
    });
    expect(
      (data as { report: { reported_deleted_at: string | null } }).report.reported_deleted_at,
    ).not.toBeNull();
  });

  it('an id that is not a report is P0003 for an operator', async () => {
    const ops = await newOperator();
    const { data, error } = await ops.client.rpc('admin_get_report', { p_id: crypto.randomUUID() });
    expect(error?.code).toBe('P0003');
    expect(data).toBeNull();
  });

  it('a purged report is gone from the detail too', async () => {
    const ops = await newOperator();
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await fileReport(alice, bob.id);
    expect((await bob.client.rpc('delete_my_account')).error).toBeNull();
    await admin
      .from('reports')
      .update({ reported_deleted_at: new Date(Date.now() - 91 * 86_400_000).toISOString() })
      .eq('id', id);
    expect((await ops.client.rpc('admin_get_report', { p_id: id })).error?.code).toBe('P0003');
  });
});

describe('the tenant seam', () => {
  it("an operator of another tenant is refused, and sees nothing of this one's", async () => {
    const elsewhere = await createTestUser('Elsewhere');
    await makeOperator(elsewhere.id, OTHER_TENANT);
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await fileReport(alice, bob.id);

    expect((await elsewhere.client.rpc('is_operator')).data).toBe(false);
    expect((await elsewhere.client.rpc('admin_list_open_reports')).error?.code).toBe('42501');
    const one = await elsewhere.client.rpc('admin_get_report', { p_id: id });
    expect(one.error?.code).toBe('42501');
    expect(one.data).toBeNull();
  });

  it("this tenant's operator sees nothing of another tenant's reports", async () => {
    const ops = await newOperator();
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const here = await fileReport(alice, bob.id);
    const [{ id: there }] = await sql`
      insert into public.reports (tenant_id, reported_id, reason, snapshot)
      values (${OTHER_TENANT}, ${bob.id}, 'spam', '{"display_name": "Bob", "bio": null, "avatar_path": null}')
      returning id`;
    try {
      const { data } = await ops.client.rpc('admin_list_open_reports');
      const ids = (data ?? []).map((row) => row.id);
      expect(ids).toContain(here);
      expect(ids).not.toContain(there);
      // Nor is it counted against Bob here.
      expect(data?.find((row) => row.id === here)?.open_reports_about_them).toBe(1);
      expect((await ops.client.rpc('admin_get_report', { p_id: there })).error?.code).toBe('P0003');
    } finally {
      await sql`delete from public.reports where id = ${there}`;
    }
  });
});

describe('the admin queries', () => {
  it('isOperator, listOpenReports and getReportForOperator go through the caller', async () => {
    const ops = await newOperator();
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const id = await fileReport(alice, bob.id, 'impersonation');

    expect(await isOperator(ops.client)).toBe(true);
    expect(await isOperator(alice.client)).toBe(false);
    expect((await listOpenReports(ops.client)).map((row) => row.id)).toContain(id);
    expect(await getReportForOperator(ops.client, id)).toMatchObject({
      report: { id, reason: 'impersonation' },
      card: { id: bob.id },
      gathering: null,
    });
    await expect(listOpenReports(alice.client)).rejects.toMatchObject({ code: '42501' });
    await expect(getReportForOperator(ops.client, crypto.randomUUID())).rejects.toMatchObject({
      code: 'P0003',
    });
  });
});
