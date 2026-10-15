import type { Db, Tables } from '../index.ts';
import { CARD_COLUMNS, type ProfileCard } from './handshake.ts';

/**
 * RLS does the scoping in every query here. A gathering is visible to every
 * signed-in user of the tenant except across a block with its host either
 * way, so a hidden one (blocked, or nonexistent) reads as nonexistent.
 * Member rows are the viewer's own and their accepted connections' only;
 * the headcount comes from a definer RPC that re-states the gathering's
 * visibility.
 */
export async function getGathering(
  db: Db,
  gatheringId: string,
): Promise<Tables<'gatherings'> | null> {
  const { data, error } = await db
    .from('gatherings')
    .select('*')
    .eq('id', gatheringId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface GatheringMemberRow {
  joined_at: string;
  profile: ProfileCard;
}

/** The members the viewer may see (themself and their connections), with
 * their cards. Never the whole list: `getGatheringMemberCount` is. */
export async function listGatheringMembers(
  db: Db,
  gatheringId: string,
): Promise<GatheringMemberRow[]> {
  const { data, error } = await db
    .from('gathering_members')
    .select(`joined_at, profile:profiles!gathering_members_profile_id_fkey(${CARD_COLUMNS})`)
    .eq('gathering_id', gatheringId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  // The generated type says profile is never null (NOT NULL FK); RLS on profiles makes it null for a hidden card.
  return (data ?? []).flatMap((row) =>
    row.profile ? [{ joined_at: row.joined_at, profile: row.profile }] : [],
  );
}

/** Everyone in the gathering, counted by the definer RPC. Zero when the
 * gathering is hidden from the viewer, so callers decide visibility from
 * `getGathering`, never from the count. */
export async function getGatheringMemberCount(db: Db, gatheringId: string): Promise<number> {
  const counts = await memberCounts(db, [gatheringId]);
  return counts.get(gatheringId) ?? 0;
}

async function memberCounts(db: Db, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db.rpc('gathering_member_counts', { p_ids: ids });
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.gathering_id, Number(row.member_count)]));
}

export interface GatheringListRow extends Tables<'gatherings'> {
  member_count: number;
  is_member: boolean;
  members: GatheringMemberRow[];
}

/** One members select and one counts RPC for the whole page, grouped by gathering. */
async function withWhoIsGoing(
  db: Db,
  userId: string,
  gatherings: Tables<'gatherings'>[],
): Promise<GatheringListRow[]> {
  if (gatherings.length === 0) return [];
  const ids = gatherings.map((g) => g.id);
  const [membersResult, counts] = await Promise.all([
    db
      .from('gathering_members')
      .select(
        `gathering_id, joined_at, profile:profiles!gathering_members_profile_id_fkey(${CARD_COLUMNS})`,
      )
      .in('gathering_id', ids)
      .order('joined_at', { ascending: true }),
    memberCounts(db, ids),
  ]);
  if (membersResult.error) throw membersResult.error;
  const membersByGathering = new Map<string, GatheringMemberRow[]>();
  for (const row of membersResult.data ?? []) {
    if (!row.profile) continue; // a hidden card drops out silently, as in listGatheringMembers
    const list = membersByGathering.get(row.gathering_id) ?? [];
    list.push({ joined_at: row.joined_at, profile: row.profile });
    membersByGathering.set(row.gathering_id, list);
  }
  return gatherings.map((gathering) => {
    const members = membersByGathering.get(gathering.id) ?? [];
    return {
      ...gathering,
      member_count: counts.get(gathering.id) ?? 0,
      is_member: members.some((member) => member.profile.id === userId),
      members,
    };
  });
}

/** What is happening in the domain: every upcoming gathering the viewer may
 * see, in start-time order. A bare RLS-scoped select — nothing ranks,
 * recommends, or filters beyond "has not started yet". No pagination yet:
 * the page is every upcoming gathering, and the enrichment runs one
 * members select and one counts RPC over all of them. */
export async function listUpcomingGatherings(db: Db, userId: string): Promise<GatheringListRow[]> {
  const { data, error } = await db
    .from('gatherings')
    .select('*')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return withWhoIsGoing(db, userId, data ?? []);
}

/** The viewer's own calendar: every gathering they host or have joined,
 * past included, in start-time order. */
export async function listMyGatherings(db: Db, userId: string): Promise<GatheringListRow[]> {
  const { data: memberships, error: membershipsError } = await db
    .from('gathering_members')
    .select('gathering_id')
    .eq('profile_id', userId);
  if (membershipsError) throw membershipsError;
  const ids = (memberships ?? []).map((row) => row.gathering_id);
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from('gatherings')
    .select('*')
    .in('id', ids)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return withWhoIsGoing(db, userId, data ?? []);
}

export interface GatheringPatch {
  title?: string;
  starts_at?: string;
  location?: string | null;
}

/** Host-only by RLS and the column grant: a non-host's patch matches zero
 * rows and reads as null. */
export async function updateGathering(
  db: Db,
  gatheringId: string,
  patch: GatheringPatch,
): Promise<Tables<'gatherings'> | null> {
  const { data, error } = await db
    .from('gatherings')
    .update(patch)
    .eq('id', gatheringId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Host-only by RLS; idempotent — a non-host's delete is a no-op.
 * Memberships cascade. */
export async function deleteGathering(db: Db, gatheringId: string): Promise<void> {
  const { error } = await db.from('gatherings').delete().eq('id', gatheringId);
  if (error) throw error;
}

/** Leaving is deleting your own membership row — idempotent under RLS. */
export async function leaveGathering(
  db: Db,
  gatheringId: string,
  userId: string,
): Promise<void> {
  const { error } = await db
    .from('gathering_members')
    .delete()
    .eq('gathering_id', gatheringId)
    .eq('profile_id', userId);
  if (error) throw error;
}
