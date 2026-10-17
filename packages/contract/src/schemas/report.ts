import { z } from 'zod';
import { PLAIN_TEXT_MESSAGE, isPlainText } from './text.ts';

/**
 * Why a person is reported: a short fixed list, mirrored by the
 * reports_reason_known CHECK (keep the two in step). Order is display order.
 */
export const REPORT_REASONS = [
  'harassment',
  'hate',
  'sexual_content',
  'violence',
  'child_safety',
  'spam',
  'impersonation',
  'other',
] as const;

export const ReportReasonSchema = z.enum(REPORT_REASONS);

/** What the report form shows for each reason. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or bullying',
  hate: 'Hate speech or symbols',
  sexual_content: 'Nudity or sexual content',
  violence: 'Threats or violence',
  child_safety: 'Puts a child at risk',
  spam: 'Spam or a scam',
  impersonation: 'Pretending to be someone else',
  other: 'Something else',
};

export const REPORT_DETAILS_MAX = 1000;

/**
 * Report a person, optionally blocking them in the same step. Reports are
 * read only by the fork's operator (the service role): never by the
 * reporter, never by the reported person, never publicly.
 */
export const CreateReportInputSchema = z.object({
  reported_id: z.uuid(),
  reason: ReportReasonSchema,
  details: z
    .string()
    .max(REPORT_DETAILS_MAX)
    .refine((v) => isPlainText(v, { multiline: true }), PLAIN_TEXT_MESSAGE)
    .optional(),
  block: z.boolean().default(false),
});

export type ReportReason = z.infer<typeof ReportReasonSchema>;
export type CreateReportInput = z.input<typeof CreateReportInputSchema>;
