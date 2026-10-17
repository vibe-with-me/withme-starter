import { ORPCError } from '@orpc/server';
import type { Destination, ResolveOutput } from '@withme/contract';
import { throwFromDbError } from '../lib/errors.ts';
import type { ApiContext } from '../lib/orpc.ts';
import { publicProcedure, requireUser } from '../lib/orpc.ts';

/**
 * Edge rate limits keyed by UID + caller IP, plus caller IP alone for
 * resolve: a printed tag URL cannot be used to exhaust its own budget by a
 * third party, one client cannot hammer a tag, and one client cannot walk
 * the UID space. The IP is transient (rate-limit key only) — it is never
 * stored, matching the no-IP-at-rest rule. A missing binding fails open with
 * a loud log: the resolver staying unbreakable beats rate limiting in a
 * misconfigured deploy.
 *
 * Advisory, not a boundary: the publishable key reaches PostgREST directly,
 * and a direct /rest/v1/rpc call never passes through here. Whatever must
 * hold for every caller lives in the database (claim_tag's attempt ledger,
 * log_scan's per-UID cap, resolve_tag's single answer for unknown UIDs).
 */
async function enforceLimit(
  context: ApiContext,
  key: string,
  binding: 'SCAN_RATE_LIMITER' | 'RESOLVE_IP_RATE_LIMITER' = 'SCAN_RATE_LIMITER',
): Promise<void> {
  const limiter = context.env[binding];
  if (!limiter) {
    context.logger.error(`${binding} binding missing — rate limiting disabled`);
    return;
  }
  const { success } = await limiter.limit({ key });
  if (!success) {
    throw new ORPCError('TOO_MANY_REQUESTS', { message: 'Slow down' });
  }
}

const resolve = publicProcedure.resolve.handler(async ({ input, context }) => {
  await enforceLimit(context, `resolve:${input.uid}:${context.clientIp}`);
  await enforceLimit(context, `resolve-ip:${context.clientIp}`, 'RESOLVE_IP_RATE_LIMITER');

  const { data, error } = await context.db.rpc('resolve_tag', { p_uid: input.uid });
  if (error) throwFromDbError(error, context.logger);
  return data as ResolveOutput;
});

const claim = publicProcedure.claim.handler(async ({ input, context }) => {
  const userId = requireUser(context);
  await enforceLimit(context, `claim:${userId}`);

  const { data, error } = await context.db.rpc('claim_tag', {
    p_uid: input.uid,
    p_destination: input.destination,
  });
  if (error) throwFromDbError(error, context.logger);
  // null: unknown, already claimed, or disabled — one answer by design
  // (claim_tag returns rather than raises, so the attempt stays counted).
  if (data === null) throw new ORPCError('CONFLICT', { message: 'Tag is not claimable' });
  const tag = data as { uid: string; status: 'claimed'; destination: Destination };
  context.logger.info('tag claimed', { uid: tag.uid });
  return { tag };
});

const logScan = publicProcedure.logScan.handler(async ({ input, context }) => {
  await enforceLimit(context, `scan:${input.uid}:${context.clientIp}`);

  const { error } = await context.db.rpc('log_scan', {
    p_uid: input.uid,
    p_user_agent: input.user_agent,
    p_scan_method: input.scan_method,
  });
  if (error) throwFromDbError(error, context.logger);
  return { ok: true as const };
});

export const publicRouter = { resolve, claim, logScan };
