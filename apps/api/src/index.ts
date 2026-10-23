import { configureSync, getConsoleSink, getLogger } from '@logtape/logtape';
import { RPCHandler } from '@orpc/server/fetch';
import { createDbClient } from '@withme/db';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { HonoEnv } from './env.ts';
import type { ApiContext } from './lib/orpc.ts';
import { supabaseAuth } from './middleware/jwt.ts';
import { avatarUploadLimit } from './middleware/upload-limit.ts';
import { adminRouter } from './routers/admin.ts';
import { appRouter } from './routers/app.ts';
import { publicRouter } from './routers/public.ts';

// LogTape, not Pino: Pino depends on Node streams and is Workers-incompatible.
configureSync({
  sinks: { console: getConsoleSink() },
  loggers: [
    { category: ['api'], sinks: ['console'], lowestLevel: 'info' },
    { category: ['logtape', 'meta'], sinks: ['console'], lowestLevel: 'warning' },
  ],
});

const logger = getLogger(['api', 'http']);

const rpcHandler = new RPCHandler({ public: publicRouter, app: appRouter, admin: adminRouter });

const app = new Hono<HonoEnv>();

app.use('*', async (c, next) => {
  // Honor a well-formed inbound id for correlation; regenerate anything else.
  const inbound = c.req.header('x-request-id');
  c.set(
    'requestId',
    inbound && /^[\w.-]{1,64}$/.test(inbound) ? inbound : crypto.randomUUID(),
  );
  await next();
});

app.use('*', (c, next) =>
  cors({
    // Comma-separated list supported; unset env falls back to local dev
    // rather than crashing every request.
    origin: (c.env.CORS_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    maxAge: 86_400,
  })(c, next),
);

app.use('/rpc/*', avatarUploadLimit());

app.use('*', supabaseAuth());

app.get('/health', (c) => c.json({ ok: true }));

app.use('/rpc/*', async (c, next) => {
  const context: ApiContext = {
    env: c.env,
    userId: c.get('userId'),
    requestId: c.get('requestId'),
    clientIp: c.req.header('cf-connecting-ip') ?? 'unknown',
    logger: logger.with({ requestId: c.get('requestId') }),
    db: createDbClient({
      url: c.env.SUPABASE_URL,
      key: c.env.SUPABASE_PUBLISHABLE_KEY,
      accessToken: c.get('accessToken') ?? undefined,
    }),
  };

  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: '/rpc',
    context,
  });
  if (matched) {
    return c.newResponse(response.body, response);
  }
  await next();
});

export default app;
