// Startup and teardown for running the e2e suite against a deployed stack
// (the staging run: .github/workflows/staging-e2e.yml, docs/testing.md).
//
//   bun e2e/staging.ts setup      # before the suite
//   bun e2e/staging.ts teardown   # after it, pass or fail
//
// Every spec seeds its own data, scoped to the run: accounts on
// `@rls.test` addresses (the domain every spec uses, and nothing real
// does), tags it provisions, and what those accounts create. So:
//
// - setup checks the stack answers and the service role works, sweeps
//   whatever an earlier run left behind, and proves sign-in works with a
//   canary account (a hosted project's rate limits would otherwise surface
//   as forty confusing failures), then records when the run started.
// - teardown deletes every `@rls.test` account with what it made, and
//   every unclaimed tag provisioned since the run started.
//
// It never touches an account on any other domain. Env: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY (setup's canary),
// E2E_TARGET_URL and E2E_API_URL (setup's health checks),
// E2E_RUN_STARTED_AT (teardown; setup writes it to $GITHUB_ENV in CI).
import { appendFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const TEST_DOMAIN = '@rls.test';
const CHUNK = 100;

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set (see the header of e2e/staging.ts).`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = env('SUPABASE_URL');
const admin = createClient(SUPABASE_URL, env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

async function testUserIds(db: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email?.toLowerCase().endsWith(TEST_DOMAIN)) ids.push(user.id);
    }
    if (data.users.length < 1000) return ids;
  }
}

/** Deletes test accounts and what they made. Returns how many accounts went. */
async function sweep(): Promise<number> {
  const ids = await testUserIds(admin);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const list = `(${chunk.join(',')})`;
    // Reports outlive their people (reporter_id and reported_id go null), so
    // delete them first, while they can still be found.
    const reports = await admin
      .from('reports')
      .delete()
      .or(`reporter_id.in.${list},reported_id.in.${list}`);
    if (reports.error) throw reports.error;
    // A claimed tag blocks deleting its owner (claimed_by has no cascade).
    const tags = await admin.from('tags').delete().in('claimed_by', chunk);
    if (tags.error) throw tags.error;
    for (const id of chunk) {
      // Photos live under the owner's folder; deleting the account leaves them.
      const listed = await admin.storage.from('avatars').list(id);
      if (listed.error) throw listed.error;
      if (listed.data.length > 0) {
        const removed = await admin.storage
          .from('avatars')
          .remove(listed.data.map((f) => `${id}/${f.name}`));
        if (removed.error) throw removed.error;
      }
      // Cascades the profile, connections, requests, blocks, gatherings and
      // memberships, links, push tokens and scans of their tags.
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    }
  }
  return ids.length;
}

async function setup(): Promise<void> {
  const target = env('E2E_TARGET_URL');
  const api = env('E2E_API_URL');
  const health = await fetch(`${api}/health`).then((r) => r.text(), () => '');
  if (health !== '{"ok":true}') throw new Error(`${api}/health answered ${JSON.stringify(health)}`);
  const web = await fetch(target);
  if (!web.ok) throw new Error(`${target} answered ${web.status}`);
  console.log(`API and web answer: ${api}, ${target}`);

  const swept = await sweep();
  console.log(`Swept ${swept} test account(s) left by earlier runs.`);

  // The canary: one confirmed account signs in with a password, as every
  // spec will. A refusal here (rate limit, confirmations, a wrong key) is
  // one clear failure instead of a red suite.
  const email = `e2e-canary-${Date.now()}${TEST_DOMAIN}`;
  const password = 'canary-pass-1!';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const anon = createClient(SUPABASE_URL, env('SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false },
  });
  const signIn = await anon.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`The canary could not sign in: ${signIn.error.message}`);
  console.log('Canary signed in.');

  const startedAt = new Date().toISOString();
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `E2E_RUN_STARTED_AT=${startedAt}\n`);
  console.log(`E2E_RUN_STARTED_AT=${startedAt}`);
}

async function teardown(): Promise<void> {
  const swept = await sweep();
  console.log(`Deleted ${swept} test account(s) and what they made.`);
  // Tags the specs provisioned and never claimed (or released when their
  // claimer was deleted above). Only since this run started: tags older
  // than that belong to the stack, not to the suite.
  const startedAt = process.env.E2E_RUN_STARTED_AT;
  if (!startedAt) {
    console.log('No E2E_RUN_STARTED_AT: left unclaimed tags alone.');
    return;
  }
  const { data, error } = await admin
    .from('tags')
    .delete()
    .is('claimed_by', null)
    .gte('created_at', startedAt)
    .select('uid');
  if (error) throw error;
  console.log(`Deleted ${data.length} unclaimed tag(s) provisioned since ${startedAt}.`);
}

const command = process.argv[2];
if (command === 'setup') await setup();
else if (command === 'teardown') await teardown();
else {
  console.error('Usage: bun e2e/staging.ts setup|teardown');
  process.exit(1);
}
