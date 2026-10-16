import type { Logger } from '@logtape/logtape';
import { ORPCError } from '@orpc/server';

interface DbError {
  code?: string;
  message?: string;
}

/**
 * Maps SQLSTATE codes raised by the database RPCs (the safety-semantic layer)
 * to ORPC errors. Database messages never pass through verbatim — what the
 * client sees is fixed here.
 */
export function throwFromDbError(error: DbError, logger: Logger): never {
  switch (error.code) {
    case 'P0001':
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid request' });
    case 'P0002':
      throw new ORPCError('CONFLICT', { message: 'Tag is not claimable' });
    case 'P0003':
      throw new ORPCError('NOT_FOUND', { message: 'Not found' });
    case 'P0004':
      throw new ORPCError('TOO_MANY_REQUESTS', { message: 'Rate limit exceeded' });
    case 'P0005':
      throw new ORPCError('CONFLICT', { message: 'Request expired' });
    case 'P0006':
      // delete_my_account found photos the sweep missed (an upload raced it).
      throw new ORPCError('CONFLICT', { message: 'Try again' });
    case '42501':
      throw new ORPCError('UNAUTHORIZED', { message: 'Authentication required' });
    case '23503':
      throw new ORPCError('BAD_REQUEST', { message: 'Profile required' });
    case '23505':
      throw new ORPCError('CONFLICT', { message: 'Already exists' });
    case '23514':
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid request' });
    case '22023':
      throw new ORPCError('BAD_REQUEST', { message: 'Invalid request' });
    case 'PGRST116':
      throw new ORPCError('NOT_FOUND', { message: 'Not found' });
    default:
      // Code only: constraint-violation messages can embed submitted values.
      logger.error('unexpected database error', { code: error.code });
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Internal error' });
  }
}
