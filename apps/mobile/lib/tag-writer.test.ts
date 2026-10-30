import { describe, expect, test } from 'bun:test';
import {
  decideSticker,
  locksTags,
  stickerContent,
  tagFromHold,
  uriFromRecord,
  usesTemporaryAddress,
  writeSticker,
  writeResultMessage,
  type NdefRecordLike,
  type StickerSession,
  type StickerStatus,
  type WriteResult,
} from './tag-writer';

const ORIGIN = 'https://tags.example.com';
const UID = '04A3B2C1D05E80';
const URL = `${ORIGIN}/t/${UID}`;
const OTHER_UID = '04FFFFFFFFFFFF';

const bytes = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const WELL_KNOWN = 1;
const uriRecord = (url: string): NdefRecordLike => ({
  tnf: WELL_KNOWN,
  type: [0x55],
  payload: url.startsWith('https://') ? [4, ...bytes(url.slice(8))] : [3, ...bytes(url.slice(7))],
});

describe('uriFromRecord', () => {
  test('expands the prefixes a tag URL can be stored with', () => {
    expect(uriFromRecord(uriRecord(URL))).toBe(URL);
    expect(uriFromRecord(uriRecord('http://localhost:3000/t/x'))).toBe('http://localhost:3000/t/x');
    expect(uriFromRecord({ tnf: 1, type: [0x55], payload: [2, ...bytes('a.co')] })).toBe(
      'https://www.a.co',
    );
    expect(uriFromRecord({ tnf: 1, type: [0x55], payload: [1, ...bytes('a.co')] })).toBe(
      'http://www.a.co',
    );
    expect(uriFromRecord({ tnf: 1, type: [0x55], payload: [0, ...bytes('https://a.co')] })).toBe(
      'https://a.co',
    );
  });

  test('takes the record type as text too', () => {
    expect(uriFromRecord({ ...uriRecord(URL), type: 'U' })).toBe(URL);
  });

  test('anything but a known URI record is not a URL', () => {
    expect(uriFromRecord({ tnf: 1, type: [0x54], payload: bytes('hello') })).toBeNull();
    expect(uriFromRecord({ tnf: 2, type: [0x55], payload: [4] })).toBeNull();
    expect(uriFromRecord({ tnf: 1, type: [0x55], payload: [] })).toBeNull();
    // Another scheme's prefix code: tel:, ftp:, urn: and the rest.
    expect(uriFromRecord({ tnf: 1, type: [0x55], payload: [5, ...bytes('123')] })).toBeNull();
  });
});

describe('stickerContent', () => {
  test('no records, or only empty ones, is blank', () => {
    expect(stickerContent(undefined)).toEqual({ kind: 'blank' });
    expect(stickerContent([])).toEqual({ kind: 'blank' });
    expect(stickerContent([{ tnf: 0, type: [], payload: [] }])).toEqual({ kind: 'blank' });
  });

  test('one URI record is a URL', () => {
    expect(stickerContent([uriRecord(URL)])).toEqual({ kind: 'url', url: URL });
  });

  test('anything else is other', () => {
    expect(stickerContent([{ tnf: 1, type: [0x54], payload: bytes('hi') }])).toEqual({
      kind: 'other',
    });
    expect(stickerContent([uriRecord(URL), uriRecord(URL)])).toEqual({ kind: 'other' });
  });
});

describe('decideSticker: the design’s sticker table', () => {
  const writable: StickerStatus = { state: 'writable', capacity: 137 };
  const locked: StickerStatus = { state: 'locked', capacity: 137 };
  const decide = (
    status: StickerStatus,
    content: Parameters<typeof decideSticker>[0]['content'],
    uid: string | null = UID,
    origin = ORIGIN,
  ) => decideSticker({ status, content, uid, origin, urlBytes: 40 });

  test('blank and writable: write', () => {
    expect(decide(writable, { kind: 'blank' })).toEqual({ action: 'write' });
    expect(decide(writable, { kind: 'blank' }, null)).toEqual({ action: 'write' });
  });

  test('this row’s URL, unlocked: lock only', () => {
    expect(decide(writable, { kind: 'url', url: URL })).toEqual({ action: 'lock' });
  });

  test('this row’s URL, locked: already done', () => {
    expect(decide(locked, { kind: 'url', url: URL })).toEqual({ action: 'done' });
  });

  test('over http, this row’s URL unlocked is already done: nothing locks', () => {
    const origin = 'http://localhost:3000';
    expect(decide(writable, { kind: 'url', url: `${origin}/t/${UID}` }, UID, origin)).toEqual({
      action: 'done',
    });
  });

  test('anything else, locked or not: refused', () => {
    const refused = { action: 'refuse', reason: 'in-use' } as const;
    expect(decide(writable, { kind: 'other' })).toEqual(refused);
    expect(decide(locked, { kind: 'other' })).toEqual(refused);
    expect(decide(locked, { kind: 'blank' })).toEqual(refused);
    expect(decide(writable, { kind: 'url', url: 'https://evil.example/t/x' })).toEqual(refused);
    // Another tag of this app: someone else's, or another of yours.
    expect(decide(writable, { kind: 'url', url: `${ORIGIN}/t/${OTHER_UID}` })).toEqual(refused);
    expect(decide(locked, { kind: 'url', url: `${ORIGIN}/t/${OTHER_UID}` })).toEqual(refused);
  });

  test('Add a tag has no row yet, so a tag URL on the sticker is refused', () => {
    expect(decide(writable, { kind: 'url', url: URL }, null)).toEqual({
      action: 'refuse',
      reason: 'in-use',
    });
  });

  test('a chip without NDEF, or too small for the URL: refused', () => {
    expect(decide({ state: 'unsupported', capacity: 0 }, { kind: 'blank' })).toEqual({
      action: 'refuse',
      reason: 'unsupported',
    });
    expect(decide({ state: 'writable', capacity: 39 }, { kind: 'blank' })).toEqual({
      action: 'refuse',
      reason: 'too-small',
    });
    expect(decide({ state: 'writable', capacity: 40 }, { kind: 'blank' })).toEqual({
      action: 'write',
    });
  });

  test('a capacity the chip did not report does not block the write', () => {
    expect(decide({ state: 'writable', capacity: 0 }, { kind: 'blank' })).toEqual({
      action: 'write',
    });
  });
});

describe('locksTags and usesTemporaryAddress', () => {
  test('only https locks', () => {
    expect(locksTags('https://tags.example.com')).toBe(true);
    expect(locksTags('HTTPS://tags.example.com')).toBe(true);
    expect(locksTags('http://192.168.1.5:3000')).toBe(false);
    expect(locksTags('http://localhost:3000')).toBe(false);
  });

  test('a workers.dev host is temporary, another host is not', () => {
    expect(usesTemporaryAddress('https://withme-web.acme.workers.dev')).toBe(true);
    expect(usesTemporaryAddress('https://WITHME.workers.dev/')).toBe(true);
    expect(usesTemporaryAddress('https://tags.example.com')).toBe(false);
    expect(usesTemporaryAddress('https://workers.dev.example.com')).toBe(false);
  });
});

/** A fake sticker that records the order of calls, and can fail any of them. */
function fakeSticker(
  overrides: Partial<{
    status: StickerStatus;
    records: NdefRecordLike[];
    readBack: NdefRecordLike[];
    failing: 'status' | 'read' | 'write' | 'readBack' | 'lock';
  }> = {},
) {
  const calls: string[] = [];
  const fail = (step: string) => {
    calls.push(step);
    if (overrides.failing === step) throw new Error(`${step} failed`);
  };
  let written: string | null = null;
  const session: StickerSession = {
    status: async () => {
      fail('status');
      return overrides.status ?? { state: 'writable', capacity: 137 };
    },
    read: async () => {
      fail('read');
      return overrides.records ?? [];
    },
    urlBytes: (url) => url.length,
    write: async (url) => {
      fail('write');
      written = url;
    },
    readBack: async () => {
      fail('readBack');
      return overrides.readBack ?? (written ? [uriRecord(written)] : []);
    },
    lock: async () => {
      fail('lock');
    },
  };
  return { session, calls };
}

describe('writeSticker', () => {
  const run = (session: StickerSession, mint = async () => UID, uid: string | null = null) =>
    writeSticker({ session, origin: ORIGIN, uid, mint });

  test('a blank sticker: check, mint, write, read back, lock, in that order', async () => {
    const { session, calls } = fakeSticker();
    const order: string[] = calls;
    const result = await run(session, async () => {
      order.push('mint');
      return UID;
    });
    expect(result).toEqual({ kind: 'done', uid: UID, locked: true });
    expect(calls).toEqual(['status', 'read', 'mint', 'write', 'readBack', 'lock']);
  });

  test('an existing row writes its own URL and never mints', async () => {
    const { session, calls } = fakeSticker();
    const result = await run(
      session,
      async () => {
        throw new Error('should not mint');
      },
      OTHER_UID,
    );
    expect(result).toEqual({ kind: 'done', uid: OTHER_UID, locked: true });
    expect(calls).not.toContain('mint');
  });

  test('a refused sticker never mints or writes', async () => {
    const { session, calls } = fakeSticker({ records: [uriRecord('https://elsewhere.example')] });
    const minted: string[] = [];
    const result = await run(session, async () => {
      minted.push('mint');
      return UID;
    });
    expect(result).toEqual({ kind: 'refused', reason: 'in-use' });
    expect(minted).toEqual([]);
    expect(calls).toEqual(['status', 'read']);
  });

  test('this row’s URL, unlocked: locks and does not write', async () => {
    const { session, calls } = fakeSticker({ records: [uriRecord(URL)] });
    const result = await run(session, undefined, UID);
    expect(result).toEqual({ kind: 'done', uid: UID, locked: true });
    expect(calls).toEqual(['status', 'read', 'lock']);
  });

  test('this row’s URL, locked: done without touching it', async () => {
    const { session, calls } = fakeSticker({
      status: { state: 'locked', capacity: 137 },
      records: [uriRecord(URL)],
    });
    const result = await run(session, undefined, UID);
    expect(result).toEqual({ kind: 'done', uid: UID, locked: true });
    expect(calls).toEqual(['status', 'read']);
  });

  test('over http it writes and verifies, and never locks', async () => {
    const { session, calls } = fakeSticker();
    const result = await writeSticker({
      session,
      origin: 'http://localhost:3000',
      uid: UID,
      mint: async () => UID,
    });
    expect(result).toEqual({ kind: 'done', uid: UID, locked: false });
    expect(calls).not.toContain('lock');
  });

  test('losing the sticker before anything changed is not a failure', async () => {
    for (const failing of ['status', 'read'] as const) {
      const { session, calls } = fakeSticker({ failing });
      expect(await run(session)).toEqual({ kind: 'lost' });
      expect(calls).not.toContain('write');
    }
  });

  test('at the cap: nothing written', async () => {
    const { session, calls } = fakeSticker();
    const result = await run(session, async () => {
      throw Object.assign(new Error('limit'), { code: 'TOO_MANY_REQUESTS' });
    });
    expect(result).toEqual({ kind: 'at-cap' });
    expect(calls).not.toContain('write');
  });

  test('a network failure while minting: nothing written, no row', async () => {
    const { session, calls } = fakeSticker();
    const result = await run(session, async () => {
      throw new Error('offline');
    });
    expect(result).toEqual({ kind: 'mint-failed' });
    expect(calls).not.toContain('write');
  });

  test('a failed write keeps the minted row for the retry, and does not lock', async () => {
    const { session, calls } = fakeSticker({ failing: 'write' });
    expect(await run(session)).toEqual({ kind: 'write-failed', uid: UID });
    expect(calls).not.toContain('lock');
  });

  test('a failed read-back does not lock', async () => {
    const { session, calls } = fakeSticker({ failing: 'readBack' });
    expect(await run(session)).toEqual({ kind: 'verify-failed', uid: UID });
    expect(calls).not.toContain('lock');
  });

  test('a read-back that differs does not lock', async () => {
    const { session, calls } = fakeSticker({ readBack: [uriRecord(`${ORIGIN}/t/${OTHER_UID}`)] });
    expect(await run(session)).toEqual({ kind: 'verify-failed', uid: UID });
    expect(calls).not.toContain('lock');
  });

  test('a failed lock says so and names the row', async () => {
    const { session } = fakeSticker({ failing: 'lock' });
    expect(await run(session)).toEqual({ kind: 'lock-failed', uid: UID });
  });
});

describe('writeResultMessage', () => {
  const results: WriteResult[] = [
    { kind: 'done', uid: UID, locked: true },
    { kind: 'done', uid: UID, locked: false },
    { kind: 'refused', reason: 'in-use' },
    { kind: 'refused', reason: 'unsupported' },
    { kind: 'refused', reason: 'too-small' },
    { kind: 'lost' },
    { kind: 'at-cap' },
    { kind: 'mint-failed' },
    { kind: 'write-failed', uid: UID },
    { kind: 'verify-failed', uid: UID },
    { kind: 'lock-failed', uid: UID },
  ];

  test('every result has words of its own', () => {
    const messages = results.map(writeResultMessage);
    expect(messages.every(Boolean)).toBe(true);
    expect(new Set(messages).size).toBe(results.length);
  });

  test('a test tag says it is unlocked, and a failed lock says what is true', () => {
    expect(writeResultMessage({ kind: 'done', uid: UID, locked: false })).toContain('not locked');
    expect(writeResultMessage({ kind: 'lock-failed', uid: UID })).toContain('not locked');
  });

  test('a refusal names the chips that work', () => {
    expect(writeResultMessage({ kind: 'refused', reason: 'unsupported' })).toContain('NTAG213');
  });
});

describe('tagFromHold: what the in-app reader opens', () => {
  const read = (records: NdefRecordLike[] | undefined, chip?: string, origin: string | null = ORIGIN) =>
    tagFromHold({ records, chipId: chip, origin });

  test('a URL for this app gives its UID, not the chip’s', () => {
    expect(read([uriRecord(URL)], '04000000000000')).toEqual({ kind: 'uid', uid: UID });
  });

  test('someone else’s URL is refused and never falls back to the chip', () => {
    expect(read([uriRecord('https://elsewhere.example/t/04A3B2C1D05E80')], '04000000000000')).toEqual({
      kind: 'foreign',
    });
  });

  test('other content is refused too', () => {
    expect(read([{ tnf: 1, type: [0x54], payload: bytes('hi') }], '04000000000000')).toEqual({
      kind: 'foreign',
    });
  });

  test('no origin to check against: a URL is refused', () => {
    expect(read([uriRecord(URL)], '04000000000000', null)).toEqual({ kind: 'foreign' });
  });

  test('no NDEF falls back to the chip’s UID', () => {
    expect(read(undefined, '04a1b2c3d4e5f6')).toEqual({ kind: 'uid', uid: '04A1B2C3D4E5F6' });
    expect(read([], '04a1b2c3d4e5f6')).toEqual({ kind: 'uid', uid: '04A1B2C3D4E5F6' });
  });

  test('no NDEF and no chip UID: nothing', () => {
    expect(read(undefined, undefined)).toEqual({ kind: 'nothing' });
  });
});
