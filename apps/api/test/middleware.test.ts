import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { AVATAR_MAX_BYTES } from '@withme/contract';
import { AVATAR_BODY_LIMIT } from '../src/middleware/avatar-body-limit.ts';
import {
  USER_ID,
  client,
  fakeSupabase,
  foreignKey,
  makeEnv,
  profileRow,
  request,
  token,
  type FakeSupabase,
} from './harness.ts';

let supabase: FakeSupabase;
const env = makeEnv();

beforeEach(() => {
  supabase = fakeSupabase();
  supabase.on('GET', '/rest/v1/profiles', [profileRow()]);
  supabase.install();
});
afterEach(() => supabase.restore());

const withBearer = (value: string) => ({ headers: { authorization: value } });

describe('supabaseAuth', () => {
  test('no Authorization header is anonymous, not refused', async () => {
    const res = await request(env, '/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('a non-bearer scheme is treated as no token', async () => {
    expect((await request(env, '/health', withBearer('Basic dXNlcjpwYXNz'))).status).toBe(200);
  });

  test('a valid token passes, and queries carry it under the verified sub', async () => {
    const jwt = await token();
    expect((await request(env, '/health', withBearer(`Bearer ${jwt}`))).status).toBe(200);

    const { profile } = await client(env, jwt).app.profile.get();
    expect(profile?.id).toBe(USER_ID);
    const [query] = supabase.to('GET', '/rest/v1/profiles');
    expect(query?.headers.get('authorization')).toBe(`Bearer ${jwt}`);
    expect(query?.search.get('id')).toBe(`eq.${USER_ID}`);
  });

  test('the scheme is case-insensitive', async () => {
    const jwt = await token();
    expect((await request(env, '/health', withBearer(`bearer ${jwt}`))).status).toBe(200);
    expect((await request(env, '/health', withBearer(`BEARER ${jwt}`))).status).toBe(200);
  });

  const refused: [string, () => Promise<string>][] = [
    ['garbage', async () => 'not-a-jwt'],
    ['an expired token', () => token({ expiresIn: Math.floor(Date.now() / 1000) - 60 })],
    ['a token signed by another key', async () => token({ key: await foreignKey() })],
    ['another issuer', () => token({ issuer: 'http://elsewhere.test/auth/v1' })],
    ['another audience', () => token({ audience: 'anon' })],
    ['no sub', () => token({ sub: null })],
    ['an anonymous sign-in', () => token({ isAnonymous: true })],
  ];

  test.each(refused)('%s is 401, never downgraded to anonymous', async (_label, make) => {
    const res = await request(env, '/health', withBearer(`Bearer ${await make()}`));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid token' });
  });

  test('a refused token never reaches the database, even for a public procedure', async () => {
    const res = await request(env, '/rpc/public/resolve', {
      method: 'POST',
      headers: { authorization: 'Bearer nope', 'content-type': 'application/json' },
      body: JSON.stringify({ json: { uid: '04A1B2C3D4E5F6' } }),
    });
    expect(res.status).toBe(401);
    expect(supabase.seen).toHaveLength(0);
  });
});

const preflight = (origin: string, corsEnv = env) =>
  request(corsEnv, '/rpc/public/resolve', {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'POST' },
  });

describe('CORS', () => {
  test('only the configured origins are allowed', async () => {
    const multi = makeEnv({ CORS_ORIGIN: 'https://app.example, https://www.app.example' });
    expect(
      (await preflight('https://www.app.example', multi)).headers.get(
        'access-control-allow-origin',
      ),
    ).toBe('https://www.app.example');
    expect(
      (await preflight('https://evil.example', multi)).headers.get('access-control-allow-origin'),
    ).toBeNull();
  });

  test('an unset CORS_ORIGIN falls back to local dev instead of crashing', async () => {
    const unset = makeEnv({ CORS_ORIGIN: undefined });
    const res = await preflight('http://localhost:3000', unset);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });
});

const upload = (path: string, init: RequestInit) => request(env, path, { method: 'POST', ...init });

describe('avatar upload body limit', () => {
  test('the limit is the contract cap plus multipart framing', () => {
    expect(AVATAR_BODY_LIMIT).toBe(AVATAR_MAX_BYTES + 65_536);
  });

  test('a declared Content-Length over the limit is 413 before the body is read', async () => {
    for (const path of ['/rpc/app/profile/uploadAvatar', '/rpc/app/profile/uploadAvatar/']) {
      const res = await upload(path, {
        headers: {
          'content-length': String(AVATAR_BODY_LIMIT + 1),
          'content-type': 'multipart/form-data; boundary=x',
        },
        body: new Uint8Array(AVATAR_BODY_LIMIT + 1),
      });
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ error: 'payload too large' });
    }
  });

  test('a streamed body with no length is cut off at the limit', async () => {
    const chunk = new Uint8Array(64 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > AVATAR_BODY_LIMIT + chunk.length) return controller.close();
        sent += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const res = await upload('/rpc/app/profile/uploadAvatar', {
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body,
      duplex: 'half',
    } as RequestInit);
    expect(res.status).toBe(413);
  });

  test('other procedures are not held to the avatar limit', async () => {
    const res = await upload('/rpc/public/resolve', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ json: { uid: 'x'.repeat(AVATAR_BODY_LIMIT + 1) } }),
    });
    expect(res.status).not.toBe(413);
  });

  test('an upload at the limit gets past it to the handler', async () => {
    const jwt = await token();
    const res = await upload('/rpc/app/profile/uploadAvatar', {
      headers: {
        authorization: `Bearer ${jwt}`,
        'content-length': String(AVATAR_BODY_LIMIT),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ json: {} }).padEnd(AVATAR_BODY_LIMIT, ' '),
    });
    // past the limit, the contract refuses the missing file
    expect(res.status).toBe(400);
  });
});

test('unknown /rpc paths fall through to a 404', async () => {
  expect((await request(env, '/rpc/nope', { method: 'POST' })).status).toBe(404);
});
