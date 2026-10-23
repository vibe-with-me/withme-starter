import { describe, expect, it } from 'bun:test';
import {
  AdminReportDetailSchema,
  AdminReportListItemSchema,
  ReportStatusSchema,
  contract,
} from '../src/index.ts';

const id = '9b2c8f43-1b1a-4f7e-9d3c-2a6c1e5b8d90';
const other = '3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b';
const at = '2026-10-22T12:00:00.123456+00:00';

const row = {
  id,
  created_at: at,
  reason: 'spam',
  details: 'Asked for $20 to hold a spot.',
  reported_name: 'Bob',
  gathering_title: 'Rooftop session',
  gathering_snapshot: { id: other, title: 'Rooftop session', course: 'a fork field' },
  reported_id: other,
  gathering_id: other,
  open_reports_about_them: 2,
};

const report = {
  id,
  created_at: at,
  reason: 'child_safety',
  details: null,
  snapshot: { display_name: 'Bob', bio: null, avatar_path: null },
  status: 'open',
  reported_id: null,
  reported_deleted_at: at,
  gathering_id: null,
  resolution_note: null,
  resolved_at: null,
  resolved_by: null,
};

describe('AdminReportListItemSchema', () => {
  it('parses a queue row, keeping a fork field in the gathering snapshot', () => {
    expect(AdminReportListItemSchema.parse(row)).toEqual(row);
  });

  it('takes a row about a deleted account (no id, no count)', () => {
    const gone = { ...row, reported_id: null, open_reports_about_them: null, gathering_snapshot: null };
    expect(AdminReportListItemSchema.parse(gone)).toEqual(gone);
  });

  it('refuses an unknown reason, a non-uuid id, and a missing column', () => {
    expect(AdminReportListItemSchema.safeParse({ ...row, reason: 'rude' }).success).toBe(false);
    expect(AdminReportListItemSchema.safeParse({ ...row, id: 'nope' }).success).toBe(false);
    const { open_reports_about_them: _dropped, ...missing } = row;
    expect(AdminReportListItemSchema.safeParse(missing).success).toBe(false);
  });
});

describe('AdminReportDetailSchema', () => {
  it('parses a report whose account and gathering are gone', () => {
    const detail = { report, card: null, gathering: null, open_reports_about_them: 0 };
    expect(AdminReportDetailSchema.parse(detail)).toEqual(detail);
  });

  it('parses the current card and gathering', () => {
    const detail = {
      report: { ...report, reported_id: other, reported_deleted_at: null, gathering_id: other },
      card: { id: other, display_name: 'Bob', bio: 'Now innocent', avatar_path: null },
      gathering: {
        id: other,
        title: 'Rooftop session',
        starts_at: at,
        location: null,
        visibility: 'everyone',
        capacity: null,
        host_id: other,
        created_at: at,
      },
      open_reports_about_them: 1,
    };
    expect(AdminReportDetailSchema.parse(detail)).toEqual(detail);
  });

  it('refuses an unknown status and a negative count', () => {
    const detail = { report, card: null, gathering: null, open_reports_about_them: 0 };
    expect(
      AdminReportDetailSchema.safeParse({ ...detail, report: { ...report, status: 'closed' } }).success,
    ).toBe(false);
    expect(AdminReportDetailSchema.safeParse({ ...detail, open_reports_about_them: -1 }).success).toBe(
      false,
    );
  });
});

describe('the admin contract', () => {
  it('sits beside public and app, with exactly session, reports.list and reports.get', () => {
    expect(Object.keys(contract)).toEqual(['public', 'app', 'admin']);
    expect(Object.keys(contract.admin)).toEqual(['session', 'reports']);
    expect(Object.keys(contract.admin.reports)).toEqual(['list', 'get']);
  });

  it('knows the three statuses of reports_status_known', () => {
    expect(ReportStatusSchema.options).toEqual(['open', 'actioned', 'dismissed']);
  });
});
