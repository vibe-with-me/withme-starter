import { z } from 'zod';
import { TagUidSchema } from './tag.ts';

/**
 * How a tap arrived. Mirrors @vibewithme/nfc's ScanMethod. A client's hint is
 * advisory: the database records 'qr' for every scan of a share code
 * whatever the hint says, and 'unknown' for anything it does not recognize.
 */
export const ScanMethodSchema = z.enum(['nfc', 'qr', 'direct', 'unknown']);

/**
 * The caller's share code: a QR-only tag claimed to them, resolved by the
 * same resolver as a physical tag. Clients build the URL with `tagUrl`.
 */
export const ShareCodeSchema = z.object({ uid: TagUidSchema });

/** The resolver URL a tag or share code opens: `<origin>/t/<UID>`. */
export function tagUrl(origin: string, uid: string): string {
  return `${origin.replace(/\/+$/, '')}/t/${uid}`;
}

const MAX_SCANNED_LENGTH = 2048;
const ABSOLUTE_URL = /^(https?):\/\/([^/?#\\]+)(\/[^?#]*)?(?:[?#].*)?$/is;
const TAG_PATH = /^\/t\/([0-9A-Fa-f]{14})\/?$/;

/** scheme + lowercase host, default port dropped; null when not an http(s) URL. */
function schemeAndHost(raw: string): { scheme: string; host: string; path: string } | null {
  const match = ABSOLUTE_URL.exec(raw);
  if (!match) return null;
  const scheme = match[1]!.toLowerCase();
  const defaultPort = scheme === 'https' ? ':443' : ':80';
  let host = match[2]!.toLowerCase();
  if (host.endsWith(defaultPort)) host = host.slice(0, -defaultPort.length);
  return { scheme, host, path: match[3] ?? '/' };
}

/**
 * The tag UID a scanned code points at, or null. Accepts only this app's own
 * resolver URL: the scheme and host (port included) must equal `origin`'s
 * exactly, there may be no credentials, and the path must be exactly `/t/`
 * plus 14 hex characters. Query and fragment are ignored. Anything else is
 * someone else's URL and must never be opened.
 *
 * Plain string matching, not `URL`: the same rules then hold in every
 * runtime that runs this (Workers, browsers, Hermes), and a host is a host
 * only when it is literally equal, with no normalization to argue about.
 */
export function tagUidFromUrl(scanned: string, origin: string): string | null {
  if (scanned.length > MAX_SCANNED_LENGTH) return null;
  const code = schemeAndHost(scanned.trim());
  const own = schemeAndHost(origin.trim());
  if (!code || !own) return null;
  // '@' in the authority is userinfo: someone else's host dressed as ours.
  if (code.host.includes('@')) return null;
  if (code.scheme !== own.scheme || code.host !== own.host) return null;
  const path = TAG_PATH.exec(code.path);
  return path ? path[1]!.toUpperCase() : null;
}

export type ScanMethod = z.infer<typeof ScanMethodSchema>;
export type ShareCode = z.infer<typeof ShareCodeSchema>;
