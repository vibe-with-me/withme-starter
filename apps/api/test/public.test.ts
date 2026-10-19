import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  client,
  codeOf,
  fakeSupabase,
  limiter,
  makeEnv,
  pgError,
  token,
  type FakeSupabase,
} from './harness.ts';

const UID = '04A1B2C3D4E5F6';
const CLIENT_IP = { 'cf-connecting-ip': '203.0.113.7' };
let supabase: FakeSupabase;

beforeEach(() => {
  supabase = fakeSupabase();
  supabase.install();
});
afterEach(() => supabase.restore());

describe('public.resolve', () => {
  test('anonymous, with the uid canonicalised by the contract', async () => {
    supabase.on('POST', '/rest/v1/rpc/resolve_tag', { status: 'unclaimed', uid: UID });
    const env = makeEnv();
    expect(await client(env).public.resolve({ uid: ` ${UID.toLowerCase()} ` })).toEqual({
      status: 'unclaimed',
      uid: UID,
    });
    expect(supabase.to('POST', '/rest/v1/rpc/resolve_tag')[0]?.body).toEqual({ p_uid: UID });
  });

  test('keys both limiters on the uid and the caller IP, not just the uid', async () => {
    supabase.on('POST', '/rest/v1/rpc/resolve_tag', { status: 'disabled', uid: UID });
    const env = makeEnv();
    await client(env, undefined, CLIENT_IP).public.resolve({ uid: UID });
    expect((env.SCAN_RATE_LIMITER as unknown as ReturnType<typeof limiter>).keys).toEqual([
      `resolve:${UID}:203.0.113.7`,
    ]);
    expect((env.RESOLVE_IP_RATE_LIMITER as unknown as ReturnType<typeof limiter>).keys).toEqual([
      'resolve-ip:203.0.113.7',
    ]);
  });

  test('a tripped limiter is TOO_MANY_REQUESTS before the database is asked', async () => {
    for (const env of [
      makeEnv({ SCAN_RATE_LIMITER: limiter(false) }),
      makeEnv({ RESOLVE_IP_RATE_LIMITER: limiter(false) }),
    ]) {
      expect(await codeOf(client(env).public.resolve({ uid: UID }))).toBe('TOO_MANY_REQUESTS');
    }
    expect(supabase.seen).toHaveLength(0);
  });

  test('a missing limiter binding fails open: the resolver stays up', async () => {
    supabase.on('POST', '/rest/v1/rpc/resolve_tag', { status: 'unclaimed', uid: UID });
    const env = makeEnv({ SCAN_RATE_LIMITER: undefined, RESOLVE_IP_RATE_LIMITER: undefined });
    expect((await client(env).public.resolve({ uid: UID })).status).toBe('unclaimed');
  });

  test('a malformed uid is refused by the contract, before the database', async () => {
    for (const uid of ['04A1B2', '04A1B2C3D4E5FG', '04A1B2C3D4E5F6A', '']) {
      expect(await codeOf(client(makeEnv()).public.resolve({ uid }))).toBe('BAD_REQUEST');
    }
    expect(supabase.seen).toHaveLength(0);
  });

  test('a database error maps through the fixed table', async () => {
    supabase.on('POST', '/rest/v1/rpc/resolve_tag', pgError('P0004'));
    expect(await codeOf(client(makeEnv()).public.resolve({ uid: UID }))).toBe('TOO_MANY_REQUESTS');
  });
});

describe('public.claim', () => {
  const claimed = { uid: UID, status: 'claimed', destination: { type: 'profile' } } as const;

  test('requires a signed-in user', async () => {
    expect(await codeOf(client(makeEnv()).public.claim({ uid: UID }))).toBe('UNAUTHORIZED');
    expect(supabase.seen).toHaveLength(0);
  });

  test('claims with the profile destination by default, keyed on the user', async () => {
    supabase.on('POST', '/rest/v1/rpc/claim_tag', claimed);
    const env = makeEnv();
    const jwt = await token();
    expect(await client(env, jwt).public.claim({ uid: UID })).toEqual({ tag: claimed });
    expect(supabase.to('POST', '/rest/v1/rpc/claim_tag')[0]?.body).toEqual({
      p_uid: UID,
      p_destination: { type: 'profile' },
    });
    expect((env.SCAN_RATE_LIMITER as unknown as ReturnType<typeof limiter>).keys[0]).toStartWith(
      'claim:',
    );
  });

  test('null from claim_tag (unknown, claimed, disabled) is one CONFLICT', async () => {
    supabase.on('POST', '/rest/v1/rpc/claim_tag', null);
    expect(await codeOf(client(makeEnv(), await token()).public.claim({ uid: UID }))).toBe(
      'CONFLICT',
    );
  });

  test('a gathering destination must carry a uuid', async () => {
    const api = client(makeEnv(), await token());
    const bad = {
      uid: UID,
      destination: { type: 'gathering', gathering_id: 'not-a-uuid' },
    } as const;
    expect(await codeOf(api.public.claim(bad))).toBe('BAD_REQUEST');
    expect(supabase.seen).toHaveLength(0);
  });
});

describe('public.logScan', () => {
  test('anonymous, storing only the user agent and method', async () => {
    supabase.on('POST', '/rest/v1/rpc/log_scan', null);
    expect(
      await client(makeEnv()).public.logScan({ uid: UID, user_agent: 'ua', scan_method: 'nfc' }),
    ).toEqual({ ok: true });
    expect(supabase.to('POST', '/rest/v1/rpc/log_scan')[0]?.body).toEqual({
      p_uid: UID,
      p_user_agent: 'ua',
      p_scan_method: 'nfc',
    });
  });

  test('an oversized user agent is refused by the contract', async () => {
    const call = client(makeEnv()).public.logScan({ uid: UID, user_agent: 'x'.repeat(513) });
    expect(await codeOf(call)).toBe('BAD_REQUEST');
  });

  test('the per-uid limiter trips', async () => {
    const env = makeEnv({ SCAN_RATE_LIMITER: limiter(false) });
    expect(await codeOf(client(env).public.logScan({ uid: UID }))).toBe('TOO_MANY_REQUESTS');
  });
});
