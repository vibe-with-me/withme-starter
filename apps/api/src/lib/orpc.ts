import type { Logger } from '@logtape/logtape';
import { ORPCError, implement } from '@orpc/server';
import { contract } from '@withme/contract';
import type { Db } from '@withme/db';
import { isOperator } from '@withme/db/queries';
import type { ApiEnv } from '../env.ts';
import { isDbError, throwFromDbError } from './errors.ts';

export interface ApiContext {
  env: ApiEnv;
  /** Per-request client carrying the caller's JWT — all queries run under RLS. */
  db: Db;
  userId: string | null;
  requestId: string;
  /** Rate-limit key dimension only. Never stored, never logged. */
  clientIp: string;
  logger: Logger;
}

const os = implement(contract).$context<ApiContext>();

export const publicProcedure = os.public;

/** The one public procedure that needs an identity (claim) calls this itself. */
export function requireUser(context: ApiContext): string {
  if (!context.userId) {
    throw new ORPCError('UNAUTHORIZED', { message: 'Authentication required' });
  }
  return context.userId;
}

/**
 * Every app.* procedure requires a verified Supabase identity. The check runs
 * here, once, so a new handler cannot forget it, and handlers read a typed,
 * non-null `context.userId`.
 */
export const appProcedure = os.app.use(({ context, next }) =>
  next({ context: { userId: requireUser(context) } }),
);

/**
 * Every admin.* procedure requires an operator: a verified identity first
 * (UNAUTHORIZED, as appProcedure), then public.is_operator() through the
 * caller's own client, FORBIDDEN if not. Built here, once, so a new admin
 * handler cannot forget the check. The database checks again inside every
 * admin function, so this is the early answer, not the only one.
 */
export const adminProcedure = os.admin.use(async ({ context, next }) => {
  const userId = requireUser(context);
  let operator: boolean;
  try {
    operator = await isOperator(context.db);
  } catch (error) {
    if (isDbError(error)) throwFromDbError(error, context.logger);
    throw error;
  }
  if (!operator) throw new ORPCError('FORBIDDEN', { message: 'Forbidden' });
  return next({ context: { userId } });
});
