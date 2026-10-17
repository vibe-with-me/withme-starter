/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { scanMethod } from './scan-method';

describe('scanMethod', () => {
  it('passes the methods the app itself sends', () => {
    expect(scanMethod('nfc')).toBe('nfc');
    expect(scanMethod('qr')).toBe('qr');
    expect(scanMethod('direct')).toBe('direct');
  });

  it('drops anything else a deep link carries', () => {
    expect(scanMethod(undefined)).toBeUndefined();
    expect(scanMethod('unknown')).toBeUndefined();
    expect(scanMethod('QR')).toBeUndefined();
    expect(scanMethod(['qr', 'nfc'])).toBeUndefined();
    expect(scanMethod('gps')).toBeUndefined();
  });
});
