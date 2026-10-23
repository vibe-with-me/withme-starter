import { ORPCError } from '@orpc/server';
import { getReportForOperator, listOpenReports } from '@withme/db/queries';
import { isDbError, throwFromDbError } from '../lib/errors.ts';
import { adminProcedure } from '../lib/orpc.ts';
import type { ApiContext } from '../lib/orpc.ts';

/**
 * Like app.ts's run, with one difference: a 42501 here comes from an admin
 * function's own operator check (the role was taken away after
 * adminProcedure asked), so it answers FORBIDDEN, not UNAUTHORIZED.
 */
async function run<T>(context: ApiContext, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isDbError(error)) {
      if (error.code === '42501') throw new ORPCError('FORBIDDEN', { message: 'Forbidden' });
      throwFromDbError(error, context.logger);
    }
    throw error;
  }
}

const session = adminProcedure.session.handler(() => ({ operator: true as const }));

// What a report says stays out of the logs: the report is the record.
const reportsList = adminProcedure.reports.list.handler(async ({ context }) => {
  const reports = await run(context, () => listOpenReports(context.db));
  return { reports };
});

const reportsGet = adminProcedure.reports.get.handler(({ input, context }) =>
  run(context, () => getReportForOperator(context.db, input.id)),
);

export const adminRouter = {
  session,
  reports: { list: reportsList, get: reportsGet },
};
