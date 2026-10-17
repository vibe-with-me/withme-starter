import { describe, expect, it } from 'bun:test';
import { contract, ScanMethodSchema, ShareCodeSchema, tagUidFromUrl, tagUrl } from '../src/index.ts';

const ORIGIN = 'https://app.example.com';
const UID = '04A3B2C1D05E80';

describe('tagUidFromUrl', () => {
  it('accepts this app’s own resolver URL', () => {
    expect(tagUidFromUrl(`${ORIGIN}/t/${UID}`, ORIGIN)).toBe(UID);
    expect(tagUidFromUrl(`${ORIGIN}/t/${UID}/`, ORIGIN)).toBe(UID);
    expect(tagUidFromUrl(`  ${ORIGIN}/t/${UID}\n`, ORIGIN)).toBe(UID);
    // case is normalized the way the resolver normalizes it
    expect(tagUidFromUrl(`HTTPS://APP.Example.com/t/${UID.toLowerCase()}`, ORIGIN)).toBe(UID);
    // query and fragment are ignored, never acted on
    expect(tagUidFromUrl(`${ORIGIN}/t/${UID}?via=qr#card`, ORIGIN)).toBe(UID);
    // a trailing slash on the configured origin is fine; so is the default port
    expect(tagUidFromUrl(`${ORIGIN}/t/${UID}`, `${ORIGIN}/`)).toBe(UID);
    expect(tagUidFromUrl(`https://app.example.com:443/t/${UID}`, ORIGIN)).toBe(UID);
  });

  it('accepts a local http origin when that is what the app is configured with', () => {
    expect(tagUidFromUrl(`http://localhost:3000/t/${UID}`, 'http://localhost:3000')).toBe(UID);
  });

  it('refuses other hosts, including lookalikes', () => {
    for (const url of [
      `https://evil.example/t/${UID}`,
      `https://app.example.com.evil.example/t/${UID}`,
      `https://evil.example/app.example.com/t/${UID}`,
      `https://example.com/t/${UID}`,
      `https://www.app.example.com/t/${UID}`,
      `https://app.example.com@evil.example/t/${UID}`,
      `https://user:pass@app.example.com/t/${UID}`,
      `https://app.example.com:8443/t/${UID}`,
      `https://app.example.com\\@evil.example/t/${UID}`,
    ]) {
      expect(tagUidFromUrl(url, ORIGIN)).toBeNull();
    }
  });

  it('refuses other schemes, including a downgrade to http', () => {
    for (const url of [
      `http://app.example.com/t/${UID}`,
      `javascript:alert(1)//app.example.com/t/${UID}`,
      `withme://t/${UID}`,
      `ftp://app.example.com/t/${UID}`,
      `//app.example.com/t/${UID}`,
      `data:text/html,${ORIGIN}/t/${UID}`,
    ]) {
      expect(tagUidFromUrl(url, ORIGIN)).toBeNull();
    }
  });

  it('refuses any path but /t/ plus 14 hex', () => {
    for (const path of [
      '/',
      '/t/',
      `/t/${UID}0`,
      `/t/${UID.slice(1)}`,
      '/t/04A3B2C1D05E8G',
      `/t/${UID}/extra`,
      `/claim/${UID}`,
      `/t/%30${UID.slice(1)}`,
      `/T/${UID}`,
      `//t/${UID}`,
      `/x/../t/${UID}`,
      `/profile`,
    ]) {
      expect(tagUidFromUrl(`${ORIGIN}${path}`, ORIGIN)).toBeNull();
    }
  });

  it('refuses things that are not URLs at all', () => {
    for (const text of ['', UID, 'hello', `t/${UID}`, 'WIFI:S:home;T:WPA;P:secret;;']) {
      expect(tagUidFromUrl(text, ORIGIN)).toBeNull();
    }
    expect(tagUidFromUrl(`${ORIGIN}/t/${UID}?${'a'.repeat(2048)}`, ORIGIN)).toBeNull();
  });

  it('refuses everything when the configured origin is not a URL', () => {
    expect(tagUidFromUrl(`${ORIGIN}/t/${UID}`, '')).toBeNull();
    expect(tagUidFromUrl(`${ORIGIN}/t/${UID}`, 'app.example.com')).toBeNull();
  });

  it('round-trips with tagUrl', () => {
    expect(tagUrl(`${ORIGIN}/`, UID)).toBe(`${ORIGIN}/t/${UID}`);
    expect(tagUidFromUrl(tagUrl(ORIGIN, UID), ORIGIN)).toBe(UID);
  });
});

describe('ScanMethodSchema', () => {
  it('mirrors the SDK’s ScanMethod and nothing else', () => {
    expect(ScanMethodSchema.options).toEqual(['nfc', 'qr', 'direct', 'unknown']);
    expect(ScanMethodSchema.safeParse('gps').success).toBe(false);
  });
});

describe('share code procedures', () => {
  it('return a canonical uid', () => {
    expect(ShareCodeSchema.parse({ uid: UID.toLowerCase() })).toEqual({ uid: UID });
    expect(ShareCodeSchema.safeParse({ uid: 'nope' }).success).toBe(false);
    expect(contract.app.shareCode.get).toBeDefined();
    expect(contract.app.shareCode.replace).toBeDefined();
  });

  it('logScan accepts a known method and refuses an unknown one', () => {
    const input = contract.public.logScan['~orpc'].inputSchema!;
    expect(input['~standard'].validate({ uid: UID, scan_method: 'qr' })).toMatchObject({
      value: { uid: UID, scan_method: 'qr' },
    });
    const bad = input['~standard'].validate({ uid: UID, scan_method: 'gps' });
    expect('issues' in (bad as object)).toBe(true);
  });
});
