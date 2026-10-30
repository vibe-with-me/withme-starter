import { tagUidFromUrl, tagUrl } from '@withme/contract';

/** One NDEF record as the NFC library hands it over. */
export interface NdefRecordLike {
  tnf: number;
  type: number[] | string;
  payload: number[];
}

const TNF_EMPTY = 0;
const TNF_WELL_KNOWN = 1;
const RTD_URI = 0x55;
/** The NDEF URI prefix codes a web address can use. Other codes are other schemes. */
const URI_PREFIXES = ['', 'http://www.', 'https://www.', 'http://', 'https://'];

/** The URL in a URI record, or null for any other record. */
export function uriFromRecord(record: NdefRecordLike): string | null {
  if (record.tnf !== TNF_WELL_KNOWN) return null;
  const isUri = typeof record.type === 'string' ? record.type === 'U' : record.type[0] === RTD_URI;
  if (!isUri || record.type.length !== 1) return null;
  const [code, ...rest] = record.payload;
  const prefix = code === undefined ? undefined : URI_PREFIXES[code];
  if (prefix === undefined) return null;
  return prefix + String.fromCharCode(...rest);
}

export type StickerContent = { kind: 'blank' } | { kind: 'url'; url: string } | { kind: 'other' };

export function stickerContent(records: NdefRecordLike[] | undefined): StickerContent {
  if (!records || records.every((record) => record.tnf === TNF_EMPTY)) return { kind: 'blank' };
  const url = records.length === 1 ? uriFromRecord(records[0]!) : null;
  return url === null ? { kind: 'other' } : { kind: 'url', url };
}

export interface StickerStatus {
  state: 'unsupported' | 'writable' | 'locked';
  /** Bytes the chip can hold; 0 when it did not say. */
  capacity: number;
}

export type RefusalReason = 'in-use' | 'unsupported' | 'too-small';

type Decision =
  | { action: 'write' | 'lock' | 'done' }
  | { action: 'refuse'; reason: RefusalReason };

/** Locking is forever, so it only happens on a real address: over http this is a test tag. */
export function locksTags(origin: string): boolean {
  return /^https:\/\//i.test(origin);
}

/** A workers.dev address is tied to a worker's name, and a locked tag keeps it for good. */
export function usesTemporaryAddress(origin: string): boolean {
  return /^https?:\/\/[^/]*\.workers\.dev(\/|$)/i.test(origin);
}

/**
 * What to do with the sticker being held. Only a blank chip is ever written,
 * so nobody overwrites someone else's tag by accident.
 */
export function decideSticker({
  status,
  content,
  uid,
  origin,
  urlBytes,
}: {
  status: StickerStatus;
  content: StickerContent;
  /** The row being written; null for Add a tag, which has no row yet. */
  uid: string | null;
  origin: string;
  urlBytes: number;
}): Decision {
  if (status.state === 'unsupported') return { action: 'refuse', reason: 'unsupported' };
  if (content.kind === 'url' && uid !== null && tagUidFromUrl(content.url, origin) === uid) {
    return { action: status.state === 'writable' && locksTags(origin) ? 'lock' : 'done' };
  }
  if (content.kind !== 'blank' || status.state === 'locked') {
    return { action: 'refuse', reason: 'in-use' };
  }
  if (status.capacity > 0 && urlBytes > status.capacity) {
    return { action: 'refuse', reason: 'too-small' };
  }
  return { action: 'write' };
}

/** One hold of one sticker. Any call rejects when the sticker moves away. */
export interface StickerSession {
  status(): Promise<StickerStatus>;
  /** What the sticker holds; never rejects for a blank one. */
  read(): Promise<NdefRecordLike[] | undefined>;
  /** The size `url` takes on the chip. */
  urlBytes(url: string): number;
  write(url: string): Promise<void>;
  /** Reads the chip again, not a copy taken when the hold began. */
  readBack(): Promise<NdefRecordLike[] | undefined>;
  lock(): Promise<void>;
}

export type WriteResult =
  | { kind: 'done'; uid: string; locked: boolean }
  | { kind: 'refused'; reason: RefusalReason }
  | { kind: 'lost' }
  | { kind: 'at-cap' }
  | { kind: 'mint-failed' }
  | { kind: 'write-failed' | 'verify-failed' | 'lock-failed'; uid: string };

/** The longest URL Add a tag can write: every UID is the same length. */
const UID_PLACEHOLDER = '0'.repeat(14);

/**
 * Check, mint, write, read back, lock, in one hold. Minting waits for the
 * check, so holding up a bad sticker or walking away leaves no row behind, and
 * locking waits for the read-back, because it cannot be undone. A result that
 * names a uid has a row to retry with.
 */
export async function writeSticker({
  session,
  origin,
  uid,
  mint,
}: {
  session: StickerSession;
  origin: string;
  uid: string | null;
  mint: () => Promise<string>;
}): Promise<WriteResult> {
  let status: StickerStatus;
  let content: StickerContent;
  try {
    status = await session.status();
    content = stickerContent(await session.read());
  } catch {
    return { kind: 'lost' };
  }

  const urlBytes = session.urlBytes(tagUrl(origin, uid ?? UID_PLACEHOLDER));
  const decision = decideSticker({ status, content, uid, origin, urlBytes });
  if (decision.action === 'refuse') return { kind: 'refused', reason: decision.reason };

  if (decision.action === 'write') {
    let target = uid;
    if (target === null) {
      try {
        target = await mint();
      } catch (e) {
        return (e as { code?: string }).code === 'TOO_MANY_REQUESTS'
          ? { kind: 'at-cap' }
          : { kind: 'mint-failed' };
      }
    }
    const url = tagUrl(origin, target);
    try {
      await session.write(url);
    } catch {
      return { kind: 'write-failed', uid: target };
    }
    try {
      const after = stickerContent(await session.readBack());
      if (after.kind !== 'url' || after.url !== url) {
        return { kind: 'verify-failed', uid: target };
      }
    } catch {
      return { kind: 'verify-failed', uid: target };
    }
    if (!locksTags(origin)) return { kind: 'done', uid: target, locked: false };
    return lockSticker(session, target);
  }

  // Only a tag with this row's URL reaches here, so the row exists.
  const row = uid as string;
  if (decision.action === 'lock') return lockSticker(session, row);
  return { kind: 'done', uid: row, locked: status.state === 'locked' };
}

async function lockSticker(session: StickerSession, uid: string): Promise<WriteResult> {
  try {
    await session.lock();
    return { kind: 'done', uid, locked: true };
  } catch {
    return { kind: 'lock-failed', uid };
  }
}

/** What the screen says about a result. */
export function writeResultMessage(result: WriteResult): string {
  switch (result.kind) {
    case 'done':
      return result.locked
        ? 'Your tag is ready. Tap it to see your card, and point it anywhere from My tags.'
        : 'Written, but not locked: this is a test tag, because the app’s address isn’t https.';
    case 'refused':
      if (result.reason === 'in-use') {
        return 'This sticker already has something on it, so it was left as it is. Try a blank one.';
      }
      if (result.reason === 'too-small') return 'This sticker is too small to hold your tag’s address.';
      return 'This chip can’t be written. Use a blank NTAG213, NTAG215 or NTAG216 sticker.';
    case 'lost':
      return 'Didn’t catch the sticker. Hold it still against the phone and try again.';
    case 'at-cap':
      return 'You’ve reached the limit for tags, so no new one was made.';
    case 'mint-failed':
      return 'Couldn’t make your tag, and nothing was written. Check your connection and try again.';
    case 'write-failed':
      return 'Couldn’t write to the sticker. It isn’t locked, so try again.';
    case 'verify-failed':
      return 'Couldn’t confirm what the sticker holds, so it wasn’t locked. Try again.';
    case 'lock-failed':
      return 'Written, but not locked yet. Hold it to the phone again to finish.';
  }
}

export type HeldTag = { kind: 'uid'; uid: string } | { kind: 'foreign' } | { kind: 'nothing' };

/**
 * The tag an in-app read opens. The URL on the sticker names it. A sticker
 * holding anything else is refused rather than opened by its chip UID, so a
 * stranger's sticker can't reach a claim screen. Only a chip with no NDEF at
 * all falls back to its own UID (provision-tags §5).
 */
export function tagFromHold({
  records,
  chipId,
  origin,
}: {
  records: NdefRecordLike[] | undefined;
  chipId: string | undefined;
  origin: string | null;
}): HeldTag {
  const content = stickerContent(records);
  if (content.kind === 'blank') {
    return chipId ? { kind: 'uid', uid: chipId.toUpperCase() } : { kind: 'nothing' };
  }
  const uid = content.kind === 'url' && origin ? tagUidFromUrl(content.url, origin) : null;
  return uid ? { kind: 'uid', uid } : { kind: 'foreign' };
}
