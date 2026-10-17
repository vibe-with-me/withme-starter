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
  'public.gathering_member_counts',
  'public.join_gathering',
  'public.my_share_code',
  'public.register_push_token',
  'public.replace_my_share_code',
  'public.report_user',
  'public.send_connect_request',
  'public.set_my_links',
];

// Called by the policies that apply to authenticated, plus the resolver's
// membership helper (resolve_tag is a definer, but the grant is kept so a
// fork's policy may call it).
const POLICY_HELPERS = [
  'private.current_tenant_id',
  'private.is_avatar_path',
  'private.is_blocked',
  'private.is_gathering_member',
  'private.is_link_value',
  'private.is_plain_text',
  'private.sees_card',
  'private.sees_gathering',
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

  // Exactly, not "at least": a private definer (push_send, mint_share_code,
  // notify_report...) reachable by a signed-in session would be a hole even
  // though PostgREST does not expose `private`, because a fork's policy or
  // view could call it. lock_pair is the one non-definer helper granted
  // since the first migration; it only takes an advisory lock.
  it('authenticated can execute nothing beyond the RPCs and helpers listed here', async () => {
    const expected = [
      ...new Set([...ANON_EXECUTABLE, ...SIGNED_IN_RPCS, ...POLICY_HELPERS, 'private.lock_pair']),
    ].toSorted();
    expect(await executableBy('authenticated')).toEqual(expected);
  });

  it('service_role keeps every RPC', async () => {
    const granted = await executableBy('service_role');
    for (const fn of [...ANON_EXECUTABLE, ...SIGNED_IN_RPCS]) expect(granted).toContain(fn);
  });

  // Default privileges (20261015140000): a function a later migration adds
  // starts closed to anon, without the author remembering a revoke. Created as
  // postgres, the role migrations run as, then rolled back.
  it('a function added after the migrations is not executable by anon', async () => {
    const rollback = new Error('rollback');
    const probe = sql.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`create function public.new_fn() returns int language sql as 'select 1'`;
      await tx`create function private.new_fn() returns int language sql as 'select 1'`;
      const [row] = await tx`
        select
          has_function_privilege('anon', 'public.new_fn()', 'EXECUTE') public_anon,
          has_function_privilege('anon', 'private.new_fn()', 'EXECUTE') private_anon,
          has_function_privilege('authenticated', 'public.new_fn()', 'EXECUTE') public_authed,
          has_function_privilege('authenticated', 'private.new_fn()', 'EXECUTE') private_authed`;
      expect(row).toEqual({
        public_anon: false,
        private_anon: false,
        public_authed: true,
        private_authed: false,
      });
      throw rollback;
    });
    await expect(probe).rejects.toBe(rollback);
  });
});

// Every security-definer function that reads public.gatherings bypasses its
// RLS, so each one either asks private.sees_gathering (the one visibility
// rule, 20261017203000) or is listed here with why it never shows a
// gathering to someone the rule would refuse. A new definer that reads the
// table fails until it is added, with its reason.
const GATHERING_READERS: Record<string, 'asks sees_gathering' | string> = {
  'private.sees_gathering': 'the rule itself',
  'public.gathering_member_counts': 'asks sees_gathering',
  'public.join_gathering': 'asks sees_gathering',
  'public.resolve_tag': 'asks sees_gathering',
  'public.create_gathering': "the caller's own new row, and a count of their own upcoming ones",
  'private.on_block_created': 'deletes pair-hosted memberships; returns nothing',
  'private.on_gathering_member_joined': 'pushes the title and a count to the host only',
};

describe('gathering readers', () => {
  it('every definer that reads gatherings asks sees_gathering or is listed with its reason', async () => {
    const rows: { fn: string; asks: boolean }[] = await sql`
      select n.nspname || '.' || p.proname as fn, strpos(p.prosrc, 'sees_gathering(') > 0 as asks
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.prosecdef
        -- no backslashes: Bun's sql tag sends the raw template text
        and p.prosrc ~ 'public[.]gatherings([^_a-z]|$)'
      order by 1`;
    expect(rows.map((r) => r.fn)).toEqual(Object.keys(GATHERING_READERS).toSorted());
    for (const row of rows) {
      if (GATHERING_READERS[row.fn] === 'asks sees_gathering') expect(row.asks).toBe(true);
    }
  });

  // One argument: the viewer is always auth.uid() and the host and the
  // visibility come from the row. A (viewer, host) helper would answer
  // "are these two connected, is there a block" for any pair a caller named.
  it('sees_gathering takes only a gathering id, and anon cannot run it', async () => {
    const rows: { args: string }[] = await sql`
      select pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = 'sees_gathering'`;
    expect(rows).toEqual([{ args: 'p_gathering uuid' }]);
    const [row] = await sql`
      select
        has_function_privilege('anon', 'private.sees_gathering(uuid)', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'private.sees_gathering(uuid)', 'EXECUTE') as authed`;
    expect(row).toEqual({ anon: false, authed: true });
  });
});

describe('table privileges', () => {
  // Every table a client role could ever reach has RLS on, including the
  // private ledgers (settings, push batches, throttle, report and share-code
  // attempts): defense in depth if `private` were ever exposed.
  it('every table in public and private has row level security on', async () => {
    const rows: { name: string }[] = await sql`
      select schemaname || '.' || tablename as name
      from pg_tables
      where schemaname in ('public', 'private') and not rowsecurity
      order by 1`;
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  // private.settings holds the push access token and the outbound URLs:
  // no client role holds any privilege on any private table.
  it('anon and authenticated hold no privilege on any private table', async () => {
    // has_table_privilege resolves PUBLIC grants and role membership, which
    // information_schema.role_table_grants does not.
    const rows: { name: string }[] = await sql`
      select t.schemaname || '.' || t.tablename || ':' || r.role as name
      from pg_tables t
      cross join (values ('anon'), ('authenticated')) as r(role)
      where t.schemaname = 'private'
        and has_table_privilege(
          r.role,
          format('%I.%I', t.schemaname, t.tablename),
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
        )
      order by 1`;
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  // Account deletion is one door, delete_my_account: it clears the ledgers,
  // refuses while photos remain, and keeps reports about the person tied to
  // the deletion clock. A bare DELETE on profiles skipped all of that.
  it('no client role may delete a profile row directly', async () => {
    const [row] = await sql`
      select
        has_table_privilege('anon', 'public.profiles', 'DELETE') anon,
        has_table_privilege('authenticated', 'public.profiles', 'DELETE') authed`;
    expect(row).toEqual({ anon: false, authed: false });
  });
});
