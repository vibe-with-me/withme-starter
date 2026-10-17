// Terms acceptance: no client creates a profile without agreeing, and the
// time of agreement is the database's, never the client's.
import { beforeAll, describe, expect, it } from 'bun:test';
import { TERMS_VERSION } from '@withme/contract';
import { admin, anonClient, assertStackRunning, createTestUser } from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

async function signedInWithoutProfile() {
  const email = `${crypto.randomUUID()}@rls.test`;
  const password = 'rls-test-password-1!';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, client };
}

describe('terms acceptance', () => {
  it('a profile cannot be created without a terms version', async () => {
    const user = await signedInWithoutProfile();
    const refused = await user.client.from('profiles').insert({ id: user.id, display_name: 'Ada' });
    expect(refused.error?.code).toBe('42501');
    // Positive control: the same insert with the agreement succeeds.
    const ok = await user.client
      .from('profiles')
      .insert({ id: user.id, display_name: 'Ada', terms_version: TERMS_VERSION })
      .select('terms_version, terms_accepted_at')
      .single();
    expect(ok.error).toBeNull();
    expect(ok.data?.terms_version).toBe(TERMS_VERSION);
    expect(ok.data?.terms_accepted_at).not.toBeNull();
  });

  it('the acceptance time is stamped by the database, not the client', async () => {
    const user = await signedInWithoutProfile();
    const forged = '2001-01-01T00:00:00+00:00';
    const { data } = await user.client
      .from('profiles')
      .insert({ id: user.id, display_name: 'Ada', terms_version: 'v1', terms_accepted_at: forged })
      .select('terms_accepted_at')
      .single();
    expect(data?.terms_accepted_at).not.toBe(forged);
    expect(Date.now() - Date.parse(data!.terms_accepted_at!)).toBeLessThan(60_000);

    // Any other write keeps it, including an attempt to rewrite it.
    const first = data!.terms_accepted_at;
    const { data: edited } = await user.client
      .from('profiles')
      .update({ bio: 'hi', terms_accepted_at: forged })
      .eq('id', user.id)
      .select('terms_accepted_at')
      .single();
    expect(edited?.terms_accepted_at).toBe(first);
  });

  it('agreeing to a new version restamps; withdrawing is refused', async () => {
    const alice = await createTestUser('Alice');
    await admin.from('profiles').update({ terms_version: 'old' }).eq('id', alice.id);
    const { data: before } = await admin.from('profiles').select('terms_accepted_at').eq('id', alice.id).single();
    await Bun.sleep(10);
    const { data: after } = await alice.client
      .from('profiles')
      .update({ terms_version: TERMS_VERSION })
      .eq('id', alice.id)
      .select('terms_version, terms_accepted_at')
      .single();
    expect(after?.terms_version).toBe(TERMS_VERSION);
    expect(Date.parse(after!.terms_accepted_at!)).toBeGreaterThan(Date.parse(before!.terms_accepted_at!));

    const withdraw = await alice.client.from('profiles').update({ terms_version: null }).eq('id', alice.id);
    expect(withdraw.error?.code).toBe('22023');
  });

  it('refuses a version outside the stored shape', async () => {
    const alice = await createTestUser('Alice');
    const { error } = await alice.client
      .from('profiles')
      .update({ terms_version: 'not a version!' })
      .eq('id', alice.id);
    expect(error?.code).toBe('23514');
  });
});
