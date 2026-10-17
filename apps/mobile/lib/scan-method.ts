import type { ScanMethod } from '@withme/contract';

/**
 * The resolver's `via` param as a scan-log hint. Only the known methods
 * pass; a deep link carrying anything else sends none (the log says
 * 'unknown', and a share code logs 'qr' whatever the hint).
 */
export function scanMethod(via: string | string[] | undefined): ScanMethod | undefined {
  return via === 'nfc' || via === 'qr' || via === 'direct' ? via : undefined;
}
