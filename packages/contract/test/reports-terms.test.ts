import { describe, expect, it } from 'bun:test';
import {
  AcceptTermsInputSchema,
  CreateReportInputSchema,
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  TERMS_VERSION,
  termsAreCurrent,
  UpdateProfileInputSchema,
} from '../src/index.ts';

const id = '9b2c8f43-1b1a-4f7e-9d3c-2a6c1e5b8d90';

describe('CreateReportInputSchema', () => {
  it('takes a known reason and defaults block to false', () => {
    expect(CreateReportInputSchema.parse({ reported_id: id, reason: 'spam' })).toEqual({
      reported_id: id,
      reason: 'spam',
      block: false,
    });
  });

  it('refuses an unknown reason', () => {
    expect(CreateReportInputSchema.safeParse({ reported_id: id, reason: 'rude' }).success).toBe(false);
  });

  it('labels every reason, and the list matches the SQL CHECK', () => {
    expect(Object.keys(REPORT_REASON_LABELS).toSorted()).toEqual([...REPORT_REASONS].toSorted());
    // reports_reason_known in 20261016190000_reports_and_terms.sql.
    expect([...REPORT_REASONS]).toEqual([
      'harassment',
      'hate',
      'sexual_content',
      'violence',
      'child_safety',
      'underage',
      'spam',
      'impersonation',
      'other',
    ]);
  });

  it('caps details and refuses invisible characters, keeping line feeds', () => {
    const base = { reported_id: id, reason: 'other' as const };
    expect(CreateReportInputSchema.safeParse({ ...base, details: 'a\nb' }).success).toBe(true);
    expect(CreateReportInputSchema.safeParse({ ...base, details: 'a‮b' }).success).toBe(false);
    expect(
      CreateReportInputSchema.safeParse({ ...base, details: 'x'.repeat(REPORT_DETAILS_MAX + 1) }).success,
    ).toBe(false);
  });

  it('refuses a reported id that is not a uuid', () => {
    expect(CreateReportInputSchema.safeParse({ reported_id: 'ada', reason: 'spam' }).success).toBe(false);
  });
});

describe('terms', () => {
  it('accepts only the current version', () => {
    expect(AcceptTermsInputSchema.safeParse({ version: TERMS_VERSION }).success).toBe(true);
    expect(AcceptTermsInputSchema.safeParse({ version: '2000-01-01' }).success).toBe(false);
    expect(UpdateProfileInputSchema.safeParse({ terms_version: '2000-01-01' }).success).toBe(false);
    expect(UpdateProfileInputSchema.safeParse({ terms_version: TERMS_VERSION }).success).toBe(true);
  });

  it('is current only for the current version', () => {
    expect(termsAreCurrent({ terms_version: TERMS_VERSION })).toBe(true);
    expect(termsAreCurrent({ terms_version: '2000-01-01' })).toBe(false);
    expect(termsAreCurrent({ terms_version: null })).toBe(false);
  });

  it('fits the database shape', () => {
    // profiles_terms_version_shape.
    expect(TERMS_VERSION).toMatch(/^[A-Za-z0-9._-]{1,32}$/);
  });
});
