import { z } from 'zod';
import { GatheringSchema } from './gathering.ts';
import { PublicProfileSchema } from './profile.ts';
import { ReportReasonSchema } from './report.ts';

const timestamp = z.iso.datetime({ offset: true });

/** Where a report is in the operator's workflow (reports_status_known). */
export const ReportStatusSchema = z.enum(['open', 'actioned', 'dismissed']);

/**
 * The card as the reporter saw it, kept on the report. `gathering` is set on
 * a gathering report (title, start, location, plus any field a fork adds
 * to report_gathering's snapshot), so it stays an open record.
 */
export const ReportSnapshotSchema = z.object({
  display_name: z.string().nullable(),
  bio: z.string().nullable(),
  avatar_path: z.string().nullable(),
  gathering: z.record(z.string(), z.unknown()).optional(),
});

/**
 * One row of the open reports queue: the columns of moderation.md's "Open
 * reports" query. `open_reports_about_them` is null once the reported
 * account is gone (its reports no longer share an id). Operators only.
 */
export const AdminReportListItemSchema = z.object({
  id: z.uuid(),
  created_at: timestamp,
  reason: ReportReasonSchema,
  details: z.string().nullable(),
  reported_name: z.string().nullable(),
  gathering_title: z.string().nullable(),
  gathering_snapshot: z.record(z.string(), z.unknown()).nullable(),
  reported_id: z.uuid().nullable(),
  gathering_id: z.uuid().nullable(),
  open_reports_about_them: z.number().int().nonnegative().nullable(),
});

/**
 * A report as an operator reads it. Who filed it is left out: nothing an
 * admin page does needs the reporter, and an operator who must reach them
 * still has SQL.
 */
export const AdminReportSchema = z.object({
  id: z.uuid(),
  created_at: timestamp,
  reason: ReportReasonSchema,
  details: z.string().nullable(),
  snapshot: ReportSnapshotSchema,
  status: ReportStatusSchema,
  reported_id: z.uuid().nullable(),
  reported_deleted_at: timestamp.nullable(),
  gathering_id: z.uuid().nullable(),
  resolution_note: z.string().nullable(),
  resolved_at: timestamp.nullable(),
  resolved_by: z.uuid().nullable(),
});

/**
 * One report, next to what it is about now: the reported person's current
 * card (null once the account is gone), the gathering as it is now (null
 * when the report has none, or it was deleted), and how many open reports
 * there are about that person (0 once the account is gone).
 */
export const AdminReportDetailSchema = z.object({
  report: AdminReportSchema,
  card: PublicProfileSchema.nullable(),
  gathering: GatheringSchema.nullable(),
  open_reports_about_them: z.number().int().nonnegative(),
});

export type ReportStatus = z.infer<typeof ReportStatusSchema>;
export type ReportSnapshot = z.infer<typeof ReportSnapshotSchema>;
export type AdminReportListItem = z.infer<typeof AdminReportListItemSchema>;
export type AdminReport = z.infer<typeof AdminReportSchema>;
export type AdminReportDetail = z.infer<typeof AdminReportDetailSchema>;
