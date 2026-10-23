import {
  AdminReportDetailSchema,
  AdminReportListItemSchema,
  type AdminReportDetail,
  type AdminReportListItem,
} from '@withme/contract';
import type { Db } from '../index.ts';

/**
 * Whether the caller is an operator of this tenant (public.is_operator,
 * which asks private.is_operator). Says nothing about anyone else.
 */
export async function isOperator(db: Db): Promise<boolean> {
  const { data, error } = await db.rpc('is_operator');
  if (error) throw error;
  return data === true;
}

/**
 * The open reports queue, child safety first, then oldest first, after
 * the 90-day purge. Throws 42501 for anyone but an operator.
 */
export async function listOpenReports(db: Db): Promise<AdminReportListItem[]> {
  const { data, error } = await db.rpc('admin_list_open_reports');
  if (error) throw error;
  return AdminReportListItemSchema.array().parse(data ?? []);
}

/**
 * One report with the reported person's card and the gathering as they
 * are now. Throws 42501 for anyone but an operator, P0003 for an id that
 * is not a report in the tenant.
 */
export async function getReportForOperator(db: Db, id: string): Promise<AdminReportDetail> {
  const { data, error } = await db.rpc('admin_get_report', { p_id: id });
  if (error) throw error;
  return AdminReportDetailSchema.parse(data);
}
