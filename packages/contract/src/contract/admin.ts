import { oc } from '@orpc/contract';
import { z } from 'zod';
import { AdminReportDetailSchema, AdminReportListItemSchema } from '../schemas/admin.ts';

const session = oc
  .route({ method: 'GET', path: '/admin/session', tags: ['Admin'] })
  // Answers only for an operator: anyone else is FORBIDDEN, as every
  // admin.* procedure is. The web /admin area asks this first and shows a
  // non-operator the normal not-found page.
  .output(z.object({ operator: z.literal(true) }));

const listOpenReports = oc
  .route({ method: 'GET', path: '/admin/reports', tags: ['Admin', 'Reports'] })
  // Every open report in the domain, child safety first, then oldest first.
  // Reports about accounts deleted more than 90 days ago are purged first.
  .output(z.object({ reports: z.array(AdminReportListItemSchema) }));

const getReport = oc
  .route({ method: 'GET', path: '/admin/reports/{id}', tags: ['Admin', 'Reports'] })
  .input(z.object({ id: z.uuid() }))
  // Any status. An id that is not a report in the domain is NOT_FOUND.
  .output(AdminReportDetailSchema);

/**
 * Operator-scoped surface. Every procedure requires a verified Supabase JWT
 * whose user is an operator (private.operators): UNAUTHORIZED with no
 * token, FORBIDDEN for anyone else. The database checks again in every
 * admin function.
 */
export const adminContract = {
  session,
  reports: { list: listOpenReports, get: getReport },
};
