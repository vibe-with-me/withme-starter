// @vibewithme/nfc ships SQL that forks apply to their own Supabase project. Applied
// in order, its tables must be unreachable through the Data API: RLS on, and
// no privileges for the client roles. Applied here in a scratch schema inside
// a rolled-back transaction, so the starter's own `tags` is untouched.
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { assertStackRunning } from '../src/test-utils/index.ts';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const sql = new SQL(DB_URL);
const SQL_DIR = new URL('../../nfc-sdk/sql/', import.meta.url);
const read = (name: string) => Bun.file(new URL(name, SQL_DIR)).text();

beforeAll(assertStackRunning);
afterAll(() => sql.close());

interface TableState {
  table: string;
  rls: boolean;
  anon: boolean;
  authenticated: boolean;
}

async function applyAndInspect(files: string[]): Promise<TableState[]> {
  let state: TableState[] = [];
  await sql
    .begin(async (tx) => {
      await tx.unsafe('create schema nfc_sdk_check; set local search_path = nfc_sdk_check, public');
      for (const file of files) await tx.unsafe(await read(file));
      state = await tx`
        select c.relname as table,
               c.relrowsecurity as rls,
               has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon,
               has_table_privilege('authenticated', c.oid, 'select,insert,update,delete')
                 as authenticated
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'nfc_sdk_check' and c.relkind = 'r'
        order by 1`;
      throw new Error('rollback');
    })
    .catch((error: Error) => {
      if (error.message !== 'rollback') throw error;
    });
  return state;
}

describe('@vibewithme/nfc schema', () => {
  it('leaves tags and scans server-only once both files are applied', async () => {
    expect(await applyAndInspect(['0001_initial.sql', '0002_lock_down.sql'])).toEqual([
      { table: 'scans', rls: true, anon: false, authenticated: false },
      { table: 'tags', rls: true, anon: false, authenticated: false },
    ]);
  });

  it('0002 is safe to re-run', async () => {
    const state = await applyAndInspect([
      '0001_initial.sql',
      '0002_lock_down.sql',
      '0002_lock_down.sql',
    ]);
    expect(state.every((t) => t.rls && !t.anon && !t.authenticated)).toBe(true);
  });
});
