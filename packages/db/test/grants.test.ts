// Function grants. Postgres grants EXECUTE to PUBLIC on every new function,
// and Supabase's default privileges also grant it to anon directly on new
// functions in `public`, so `revoke ... from public` alone leaves anon able to
// call a signed-in-only RPC. The catalog is the source of truth: read it over
// the local database URL with Bun's built-in Postgres client (no dependency).
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { assertStackRunning } from '../src/test-utils/index.ts';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const sql = new SQL(DB_URL);

beforeAll(assertStackRunning);
afterAll(() => sql.close());

type Role = 'anon' | 'authenticated' | 'service_role';

/** Every function in `public` and `private` (not extension-owned) the role may execute. */
async function executableBy(role: Role): Promise<string[]> {
  const rows: { fn: string }[] = await sql`
    select n.nspname || '.' || p.proname as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
      and has_function_privilege(${role}, p.oid, 'EXECUTE')
    order by 1`;
  return rows.map((r) => r.fn);
}

// The anonymous resolver's surface, and nothing else. A new anon-facing
// function joins this list on purpose; a signed-in-only one needs
// `revoke execute ... from public, anon` before its grant to authenticated.
const ANON_EXECUTABLE = ['private.current_tenant_id', 'public.log_scan', 'public.resolve_tag'];

const SIGNED_IN_RPCS = [
  'public.accept_connect_request',
  'public.claim_tag',
  'public.create_gathering',
  'public.decline_connect_request',
  'public.delete_my_account',
  'public.join_gathering',
  'public.send_connect_request',
  'public.set_my_links',
];

// Called by the policies that apply to authenticated.
const POLICY_HELPERS = [
  'private.current_tenant_id',
  'private.is_avatar_path',
  'private.is_blocked',
  'private.is_gathering_member',
  'private.is_link_value',
  'private.shares_gathering',
];

describe('function grants', () => {
  it('anon can execute only the resolver surface', async () => {
    expect(await executableBy('anon')).toEqual(ANON_EXECUTABLE);
  });

  it('authenticated keeps every RPC and the helpers its policies call', async () => {
    const granted = await executableBy('authenticated');
    for (const fn of [...ANON_EXECUTABLE, ...SIGNED_IN_RPCS, ...POLICY_HELPERS]) {
      expect(granted).toContain(fn);
    }
  });

  it('service_role keeps every RPC', async () => {
    const granted = await executableBy('service_role');
    for (const fn of [...ANON_EXECUTABLE, ...SIGNED_IN_RPCS]) expect(granted).toContain(fn);
  });
});
