import type { Db } from '../index.ts';

/**
 * Report a person (and optionally block them) through report_user. Resolves
 * the same way whether or not the id is a person in the caller's domain;
 * the database keeps the report where only the service role reads it.
 */
export async function reportUser(
  db: Db,
  input: { reported_id: string; reason: string; details?: string | null; block: boolean },
): Promise<void> {
  const { error } = await db.rpc('report_user', {
    p_reported: input.reported_id,
    p_reason: input.reason,
    p_details: input.details ?? undefined,
    p_block: input.block,
  });
  if (error) throw error;
}
