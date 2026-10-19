// Drives the real Hono app in-process: app.fetch with stub bindings, a fake
// Supabase behind globalThis.fetch (PostgREST, Storage, and the JWKS the JWT
// middleware fetches), and tokens signed here with a key that JWKS serves.
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { contract } from '@withme/contract';
import { configureSync } from '@logtape/logtape';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { ApiEnv } from '../src/env.ts';

// Through a non-literal specifier, so this bun-typed project does not
// typecheck the Worker entry: there @types/node's and bun's ReadableStream
// collide. `tsc --noEmit` checks src/index.ts under the Workers types.
const ENTRY = '../src/index.ts';
const app = (await import(ENTRY)).default as {
  fetch: (request: Request, env: ApiEnv) => Response | Promise<Response>;
  request: (
    path: string,
    init: RequestInit | undefined,
    env: ApiEnv,
  ) => Response | Promise<Response>;
};

// index.ts configured LogTape on import; quiet it for the run (the log calls still execute).
configureSync({
  reset: true,
  sinks: {},
  loggers: [{ category: ['logtape', 'meta'], sinks: [], lowestLevel: 'fatal' }],
});

export const SUPABASE_URL = 'http://supabase.test';
export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const NOW = '2026-10-19T12:00:00+00:00';

const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };

export interface TokenOptions {
  sub?: string | null;
  issuer?: string;
  audience?: string;
  expiresIn?: string | number;
  isAnonymous?: boolean;
  key?: CryptoKey;
}

export async function token(opts: TokenOptions = {}): Promise<string> {
  const claims: Record<string, unknown> = { role: 'authenticated' };
  if (opts.isAnonymous) claims.is_anonymous = true;
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(opts.issuer ?? `${SUPABASE_URL}/auth/v1`)
    .setAudience(opts.audience ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h');
  if (opts.sub !== null) jwt.setSubject(opts.sub ?? USER_ID);
  return jwt.sign(opts.key ?? privateKey);
}

/** A key the JWKS does not serve: a well-formed token with the wrong signature. */
export async function foreignKey(): Promise<CryptoKey> {
  return (await generateKeyPair('ES256')).privateKey;
}

export interface Limiter {
  keys: string[];
  allow: boolean;
  limit: (opts: { key: string }) => Promise<{ success: boolean }>;
}

export function limiter(allow = true): Limiter {
  const l: Limiter = {
    keys: [],
    allow,
    limit: async ({ key }) => {
      l.keys.push(key);
      return { success: l.allow };
    },
  };
  return l;
}

export function makeEnv(overrides: Partial<Record<keyof ApiEnv, unknown>> = {}): ApiEnv {
  return {
    APP_ENV: 'test',
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    CORS_ORIGIN: 'http://localhost:3000',
    SCAN_RATE_LIMITER: limiter(),
    RESOLVE_IP_RATE_LIMITER: limiter(),
    ...overrides,
  } as unknown as ApiEnv;
}

/** One request Supabase saw. */
export interface Seen {
  method: string;
  path: string;
  search: URLSearchParams;
  headers: Headers;
  body: unknown;
}

type Reply = unknown | { status: number; body: unknown };
export type Handler = (req: Seen) => Reply | Promise<Reply>;

/** Answers as PostgREST does: an error object with a status, or rows. */
export const pgError = (code: string, status = 400) => ({
  status,
  body: { code, message: `raw ${code} detail`, details: null, hint: null },
});

/**
 * A fake Supabase. `on(method, path, handler)` answers one route; anything
 * unrouted fails the test loudly with a 599. Rows answer a `.single()` /
 * `.maybeSingle()` (an object Accept) with the first row, or PGRST116.
 */
export function fakeSupabase() {
  const routes: { method: string; path: string | RegExp; handler: Handler }[] = [];
  const seen: Seen[] = [];
  const original = globalThis.fetch;

  const reply = (req: Seen, out: Reply): Response => {
    let status = 200;
    let body = out;
    if (out && typeof out === 'object' && 'status' in out && 'body' in out) {
      ({ status, body } = out as { status: number; body: unknown });
    }
    const wantsObject = req.headers.get('accept')?.includes('vnd.pgrst.object') ?? false;
    if (status < 300 && wantsObject && Array.isArray(body)) {
      if (body.length !== 1) {
        return Response.json(
          { code: 'PGRST116', message: 'JSON object requested', details: null, hint: null },
          { status: 406 },
        );
      }
      body = body[0];
    }
    return Response.json(body ?? null, { status });
  };

  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const incoming =
      input instanceof Request ? new Request(input, init) : new Request(String(input), init);
    const url = new URL(incoming.url);
    if (url.origin !== SUPABASE_URL) throw new Error(`unexpected fetch: ${incoming.url}`);
    if (url.pathname === '/auth/v1/.well-known/jwks.json') {
      return Response.json({ keys: [jwk] });
    }
    const text = incoming.body ? await incoming.text() : '';
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // multipart or binary: kept as text
    }
    const req: Seen = {
      method: incoming.method,
      path: url.pathname,
      search: url.searchParams,
      headers: incoming.headers,
      body,
    };
    seen.push(req);
    const route = routes.find(
      (r) =>
        r.method === req.method &&
        (typeof r.path === 'string' ? r.path === req.path : r.path.test(req.path)),
    );
    if (!route)
      return Response.json({ message: `unrouted ${req.method} ${req.path}` }, { status: 599 });
    return reply(req, await route.handler(req));
  }) as typeof fetch;

  return {
    seen,
    on(method: string, path: string | RegExp, handler: Handler | Reply) {
      routes.unshift({
        method,
        path,
        handler: typeof handler === 'function' ? (handler as Handler) : () => handler,
      });
      return this;
    },
    /** Requests to one path, in order. */
    to(method: string, path: string | RegExp) {
      return seen.filter(
        (s) =>
          s.method === method && (typeof path === 'string' ? s.path === path : path.test(s.path)),
      );
    },
    install() {
      globalThis.fetch = fake;
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

export type FakeSupabase = ReturnType<typeof fakeSupabase>;

export type Api = ContractRouterClient<typeof contract>;

/** The typed client the shells use, wired straight to app.fetch. */
export function client(env: ApiEnv, bearer?: string, headers: Record<string, string> = {}): Api {
  const link = new RPCLink({
    url: 'http://api.test/rpc',
    headers: () => ({ ...headers, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }),
    fetch: async (outgoing, init) => app.fetch(new Request(outgoing, init), env),
  });
  return createORPCClient(link);
}

export function request(env: ApiEnv, path: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(app.request(path, init, env));
}

/** The ORPCError code a call failed with, or 'ok'. */
export async function codeOf(call: Promise<unknown>): Promise<string> {
  return call.then(
    () => 'ok',
    (error: { code?: string }) => error.code ?? String(error),
  );
}

export function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    tenant_id: '00000000-0000-0000-0000-000000000001',
    display_name: 'Ada',
    avatar_path: null,
    bio: null,
    terms_version: '2026-10-16',
    terms_accepted_at: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

export function gatheringRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    title: 'Sunrise 5K',
    starts_at: '2026-11-01T07:00:00+00:00',
    location: null,
    visibility: 'everyone',
    capacity: null,
    host_id: USER_ID,
    created_at: NOW,
    ...overrides,
  };
}
