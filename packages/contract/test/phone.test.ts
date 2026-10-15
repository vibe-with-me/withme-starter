import { describe, expect, it } from 'bun:test';
import { normalizePhone, OTP_CODE_LENGTH } from '../src/index.ts';

describe('normalizePhone', () => {
  it('keeps a bare E.164 number', () => {
    expect(normalizePhone('+15555550100')).toBe('+15555550100');
  });

  it('strips the spaces, dashes, dots and parens people type', () => {
    expect(normalizePhone(' +1 (555) 555-0100 ')).toBe('+15555550100');
    expect(normalizePhone('+44 20.7946.0958')).toBe('+442079460958');
  });

  it('accepts a 00 international prefix', () => {
    expect(normalizePhone('0044 20 7946 0958')).toBe('+442079460958');
  });

  it('rejects a number without a country code', () => {
    expect(normalizePhone('555-555-0100')).toBeNull();
  });

  it('rejects letters, a leading zero country code, and wrong lengths', () => {
    expect(normalizePhone('+1 555 CALL NOW')).toBeNull();
    expect(normalizePhone('+0 555 555 0100')).toBeNull();
    expect(normalizePhone('+1234567')).toBeNull();
    expect(normalizePhone('+1234567890123456')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});

describe('OTP_CODE_LENGTH', () => {
  it('matches the 6 digits Supabase and Twilio Verify send', () => {
    expect(OTP_CODE_LENGTH).toBe(6);
  });
});
