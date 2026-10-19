import { describe, expect, test } from 'bun:test';
import { getLogger } from '@logtape/logtape';
import { ORPCError } from '@orpc/server';
import { sniffAvatar } from '../src/lib/avatar.ts';
import { throwFromDbError } from '../src/lib/errors.ts';

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])),
  );

describe('sniffAvatar', () => {
  test('JPEG by its FF D8 FF magic', () => {
    expect(sniffAvatar(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toEqual({
      ext: 'jpg',
      contentType: 'image/jpeg',
    });
  });

  test('WebP by RIFF....WEBP', () => {
    expect(sniffAvatar(bytes('RIFF', 0x24, 0, 0, 0, 'WEBP', 'VP8 '))).toEqual({
      ext: 'webp',
      contentType: 'image/webp',
    });
  });

  test('anything else is refused, whatever it claims to be', () => {
    for (const refused of [
      bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a), // PNG
      bytes('<svg xmlns="http://www.w3.org/2000/svg">'),
      bytes('<!doctype html><script>'),
      bytes('GIF89a'),
      bytes('RIFF', 0, 0, 0, 0, 'WAVE'), // RIFF, not WebP
      bytes(0xff, 0xd8), // truncated JPEG magic
      bytes('RIFF'), // truncated WebP header
      new Uint8Array(),
    ]) {
      expect(sniffAvatar(refused)).toBeNull();
    }
  });
});

describe('throwFromDbError', () => {
  const logger = getLogger(['api', 'test']);
  const mapped = (code: string | undefined) => {
    try {
      throwFromDbError({ code, message: 'secret value 555-0100 in a constraint message' }, logger);
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      const { code: orpcCode, message } = error as ORPCError<string, unknown>;
      return { code: orpcCode, message };
    }
    throw new Error('did not throw');
  };

  test.each([
    ['P0001', 'BAD_REQUEST', 'Invalid request'],
    ['P0002', 'CONFLICT', 'Tag is not claimable'],
    ['P0003', 'NOT_FOUND', 'Not found'],
    ['P0004', 'TOO_MANY_REQUESTS', 'Rate limit exceeded'],
    ['P0005', 'CONFLICT', 'Request expired'],
    ['P0006', 'CONFLICT', 'Try again'],
    ['P0007', 'CONFLICT', 'Gathering is full'],
    ['42501', 'UNAUTHORIZED', 'Authentication required'],
    ['23503', 'BAD_REQUEST', 'Profile required'],
    ['23505', 'CONFLICT', 'Already exists'],
    ['23514', 'BAD_REQUEST', 'Invalid request'],
    ['22023', 'BAD_REQUEST', 'Invalid request'],
    ['PGRST116', 'NOT_FOUND', 'Not found'],
  ])('%s -> %s', (sqlstate, code, message) => {
    expect(mapped(sqlstate)).toEqual({ code, message });
  });

  test('an unknown or missing code is a fixed 500; the database message never passes through', () => {
    for (const sqlstate of ['XX000', '40001', undefined]) {
      const result = mapped(sqlstate);
      expect(result).toEqual({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' });
      expect(result.message).not.toContain('555-0100');
    }
  });
});
