import { createClient } from '@supabase/supabase-js';
import { TERMS_VERSION } from '@withme/contract';
import type { Database } from '../types/supabase.ts';
import type { Db } from '../index.ts';

// Local-stack shared defaults (supabase start prints these; they are the same
// on every machine). Override via env for any other target.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';

// These helpers create confirmed users with a fixed password and write rows
// with the service role. Against a hosted project that is a production write
// (and a known-password account), so a non-local URL is refused unless the
// caller opts in the same way the seed and provision scripts do. Keep
// SEED_ALLOW_REMOTE out of your shell: set it inline on the one command.
const target = new URL(SUPABASE_URL);
if (
  !['127.0.0.1', 'localhost'].includes(target.hostname) &&
  process.env.SEED_ALLOW_REMOTE !== '1'
) {
  throw new Error(
    `Refusing to use non-local Supabase at ${target.origin} from @withme/db/test-utils ` +
      '(RLS tests, seed, provisioning). Unset SUPABASE_URL to use the local stack, or set ' +
      'SEED_ALLOW_REMOTE=1 on a single seed or provision command.',
  );
}
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
// The service-role key has no default in source: it bypasses RLS, and a
// literal one here reads as a leaked secret to every scanner.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. For the local stack, take it from ' +
      'the `bun run db:start` output (the Secret key) or `supabase status -o env`:\n' +
      '  eval "export $(supabase status -o env --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY | grep ^SUPABASE_SERVICE_ROLE_KEY=)"\n' +
      'docs/local-development.md has the details.',
  );
}

/** Service-role client: bypasses RLS. Test fixtures and assertions only. */
export const admin: Db = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

export function anonClient(): Db {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
}

export async function assertStackRunning(): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: ANON_KEY },
    });
    if (!res.ok) throw new Error(`auth health returned ${res.status}`);
  } catch (cause) {
    throw new Error(
      `Supabase local stack is not reachable at ${SUPABASE_URL}. Run \`bun run db:start\` first.`,
      { cause },
    );
  }
}

export interface TestUser {
  id: string;
  email: string;
  /** Signed-in client — every query runs under this user's RLS identity. */
  client: Db;
}

const TEST_PASSWORD = 'rls-test-password-1!';

export async function createTestUser(displayName: string): Promise<TestUser> {
  const email = `${crypto.randomUUID()}@rls.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError) throw signInError;

  // Through the user's own client on purpose: exercises the insert policy
  // (which requires agreeing to the terms).
  const { error: profileError } = await client
    .from('profiles')
    .insert({ id: data.user.id, display_name: displayName, terms_version: TERMS_VERSION });
  if (profileError) throw profileError;

  return { id: data.user.id, email, client };
}

/** Random NTAG213-style UID: 7 bytes, 14 uppercase hex chars. */
export function freshUid(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(7)), (b) =>
    b.toString(16).padStart(2, '0'),
  )
    .join('')
    .toUpperCase();
}

/** Operator action: provision an unclaimed tag (service role, like a fulfillment step). */
export async function provisionTag(uid: string = freshUid()): Promise<string> {
  const { error } = await admin.from('tags').insert({ uid });
  if (error) throw error;
  return uid;
}

export async function pendingRequestId(requester: TestUser, recipient: TestUser): Promise<string> {
  const { data, error } = await recipient.client
    .from('connect_requests')
    .select('id')
    .eq('requester_id', requester.id)
    .eq('status', 'pending')
    .single();
  if (error) throw error;
  return data.id;
}

/** Full consent flow: a requests, b accepts. */
export async function connectUsers(a: TestUser, b: TestUser): Promise<void> {
  const { error } = await a.client.rpc('send_connect_request', { p_recipient: b.id });
  if (error) throw error;
  const requestId = await pendingRequestId(a, b);
  const { error: acceptError } = await b.client.rpc('accept_connect_request', {
    p_request_id: requestId,
  });
  if (acceptError) throw acceptError;
}
