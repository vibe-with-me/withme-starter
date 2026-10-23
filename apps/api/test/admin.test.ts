// admin.*: adminProcedure's two answers (UNAUTHORIZED with no token,
// FORBIDDEN for a non-operator) before any admin query, and the handlers'
// mapping. The database's own check is pinned in packages/db/test/admin.test.ts.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { AdminReportDetail, AdminReportListItem } from '@withme/contract';
import {
  NOW,
  client,
  codeOf,
  fakeSupabase,
  makeEnv,
  pgError,
  token,
  type Api,
  type FakeSupabase,
} from './harness.ts';

const REPORT_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

const env = makeEnv();
let supabase: FakeSupabase;
let bearer: string;
let api: Api;

beforeEach(async () => {
  supabase = fakeSupabase();
  supabase.install();
  bearer = await token();
  api = client(env, bearer);
});
afterEach(() => supabase.restore());

const listRow: AdminReportListItem = {
  id: REPORT_ID,
  created_at: NOW,
  reason: 'child_safety',
  details: null,
  reported_name: 'Bob',
  gathering_title: null,
  gathering_snapshot: null,
  reported_id: OTHER_ID,
  gathering_id: null,
  open_reports_about_them: 1,
};

const detail: AdminReportDetail = {
  report: {
    id: REPORT_ID,
    created_at: NOW,
    reason: 'spam',
    details: 'Asked for money',
    snapshot: { display_name: 'Bob', bio: null, avatar_path: null },
    status: 'open',
    reported_id: OTHER_ID,
    reported_deleted_at: null,
    gathering_id: null,
    resolution_note: null,
    resolved_at: null,
    resolved_by: null,
  },
  card: { id: OTHER_ID, display_name: 'Bob', bio: null, avatar_path: null },
  gathering: null,
  open_reports_about_them: 1,
};

const calls: [string, (a: Api) => Promise<unknown>][] = [
  ['session', (a) => a.admin.session()],
  ['reports.list', (a) => a.admin.reports.list()],
  ['reports.get', (a) => a.admin.reports.get({ id: REPORT_ID })],
];

describe('every admin.* procedure requires an operator', () => {
  test.each(calls)('%s without a token is UNAUTHORIZED and never queries', async (_name, call) => {
    expect(await codeOf(call(client(env)))).toBe('UNAUTHORIZED');
    expect(supabase.seen).toHaveLength(0);
  });

  test.each(calls)(
    '%s for a signed-in non-operator is FORBIDDEN after is_operator alone',
    async (_name, call) => {
      supabase.on('POST', '/rest/v1/rpc/is_operator', false);
      expect(await codeOf(call(api))).toBe('FORBIDDEN');
      expect(supabase.seen.map((s) => s.path)).toEqual(['/rest/v1/rpc/is_operator']);
    },
  );

  test('the operator check runs as the caller, not as an admin key', async () => {
    supabase.on('POST', '/rest/v1/rpc/is_operator', true);
    await api.admin.session();
    expect(supabase.seen[0]?.headers.get('authorization')).toBe(`Bearer ${bearer}`);
  });

  test('a failing operator check is a fixed error, never a pass', async () => {
    supabase.on('POST', '/rest/v1/rpc/is_operator', pgError('XX000', 500));
    expect(await codeOf(api.admin.session())).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('as an operator', () => {
  beforeEach(() => {
    supabase.on('POST', '/rest/v1/rpc/is_operator', true);
  });

  test('session says so', async () => {
    expect(await api.admin.session()).toEqual({ operator: true });
  });

  test('reports.list returns the queue as the database orders it', async () => {
    const second: AdminReportListItem = {
      ...listRow,
      id: OTHER_ID,
      reason: 'spam',
      open_reports_about_them: null,
    };
    supabase.on('POST', '/rest/v1/rpc/admin_list_open_reports', [listRow, second]);
    expect(await api.admin.reports.list()).toEqual({ reports: [listRow, second] });
    expect(
      supabase.to('POST', '/rest/v1/rpc/admin_list_open_reports')[0]?.headers.get('authorization'),
    ).toBe(`Bearer ${bearer}`);
  });

  test('reports.get passes the id and returns the detail', async () => {
    supabase.on('POST', '/rest/v1/rpc/admin_get_report', detail);
    expect(await api.admin.reports.get({ id: REPORT_ID })).toEqual(detail);
    expect(supabase.to('POST', '/rest/v1/rpc/admin_get_report')[0]?.body).toEqual({
      p_id: REPORT_ID,
    });
  });

  test('reports.get: an unknown report is NOT_FOUND', async () => {
    supabase.on('POST', '/rest/v1/rpc/admin_get_report', pgError('P0003'));
    expect(await codeOf(api.admin.reports.get({ id: REPORT_ID }))).toBe('NOT_FOUND');
  });

  test('reports.get: a non-uuid id is BAD_REQUEST and never reaches the database function', async () => {
    expect(await codeOf(api.admin.reports.get({ id: 'nope' }))).toBe('BAD_REQUEST');
    expect(supabase.to('POST', '/rest/v1/rpc/admin_get_report')).toHaveLength(0);
  });

  // The role was taken away between adminProcedure's check and the call.
  test.each([
    ['reports.list', '/rest/v1/rpc/admin_list_open_reports', (a: Api) => a.admin.reports.list()],
    [
      'reports.get',
      '/rest/v1/rpc/admin_get_report',
      (a: Api) => a.admin.reports.get({ id: REPORT_ID }),
    ],
  ] as const)('%s: the database refusing (42501) is FORBIDDEN', async (_name, path, call) => {
    supabase.on('POST', path, pgError('42501', 403));
    expect(await codeOf(call(api))).toBe('FORBIDDEN');
  });

  test('a row the contract does not know is a fixed 500, not a leak', async () => {
    supabase.on('POST', '/rest/v1/rpc/admin_list_open_reports', [{ ...listRow, reason: 'rude' }]);
    expect(await codeOf(api.admin.reports.list())).toBe('INTERNAL_SERVER_ERROR');
  });
});
