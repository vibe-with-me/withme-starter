import { describe, expect, it } from 'bun:test';
import {
  AcceptTermsInputSchema,
  CreateReportInputSchema,
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  shellGate,
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

describe('shellGate', () => {
  type P = { terms_version: string | null; affiliation: string | null };
  const current: P = { terms_version: TERMS_VERSION, affiliation: 'Riverside GC' };
  const stale: P = { terms_version: null, affiliation: 'Riverside GC' };
  // A fork's stricter rule, as extend-profile passes isProfileComplete.
  const complete = (p: P | null) => p !== null && p.affiliation !== null;

  /** Follows the gate's redirects from `start`; fails if they never settle. */
  function settle(profile: P | null, start: string, isComplete?: (p: P | null) => boolean) {
    let path = start;
    for (let hop = 0; hop < 4; hop += 1) {
      const next = shellGate(profile, path, isComplete);
      if (next === null) return path;
      path = next;
    }
    throw new Error(`no settled page from ${start}`);
  }

  it('sends no profile to /profile, old terms to /terms, and lets a current one through', () => {
    expect(shellGate(null, '/gatherings')).toBe('/profile');
    expect(shellGate(null, '/terms')).toBe('/profile');
    expect(shellGate(null, '/profile')).toBeNull();
    expect(shellGate(stale, '/gatherings')).toBe('/terms');
    expect(shellGate(stale, '/profile')).toBe('/terms');
    expect(shellGate(current, '/gatherings')).toBeNull();
  });

  it('an incomplete profile on old terms settles on /terms, never bouncing', () => {
    const incompleteStale: P = { terms_version: null, affiliation: null };
    for (const start of ['/gatherings', '/profile', '/terms', '/connections']) {
      expect(settle(incompleteStale, start, complete)).toBe('/terms');
    }
    // Once the terms are accepted, the completion gate takes over.
    const incompleteCurrent: P = { terms_version: TERMS_VERSION, affiliation: null };
    expect(settle(incompleteCurrent, '/gatherings', complete)).toBe('/profile');
    expect(settle(current, '/gatherings', complete)).toBe('/gatherings');
  });
});
