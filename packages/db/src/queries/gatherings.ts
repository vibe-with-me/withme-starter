import type { Db, Tables } from '../index.ts';
import { CARD_COLUMNS, type ProfileCard } from './handshake.ts';

/**
 * RLS does the scoping in every query here. A gathering is visible to every
 * signed-in user of the tenant except across a block with its host either
 * way, so a hidden one (blocked, or nonexistent) reads as nonexistent.
 * A `connections` gathering reads as nonexistent too, except to its host,
 * the host's accepted connections and its members (private.sees_gathering).
 * Member rows are the viewer's own and their accepted connections' only;
 * the headcount comes from a definer RPC that re-states the gathering's
 * visibility.
 */
/** The row with `visibility` narrowed from the generated `string`: the
 * gatherings_visibility_known CHECK admits exactly these two values. */
export type GatheringRow = Omit<Tables<'gatherings'>, 'visibility'> & {
  visibility: 'everyone' | 'connections';
};

function narrow(row: Tables<'gatherings'>): GatheringRow {
  return row as GatheringRow;
}

export async function getGathering(
  db: Db,
  gatheringId: string,
): Promise<GatheringRow | null> {
  const { data, error } = await db
    .from('gatherings')
    .select('*')
    .eq('id', gatheringId)
    .maybeSingle();
  if (error) throw error;
  return data && narrow(data);
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

export interface GatheringListRow extends GatheringRow {
  member_count: number;
  is_member: boolean;
  members: GatheringMemberRow[];
}

/** One members select and one counts RPC for the whole page, grouped by gathering. */
async function withWhoIsGoing(
  db: Db,
  userId: string,
  rows: Tables<'gatherings'>[],
): Promise<GatheringListRow[]> {
  const gatherings = rows.map(narrow);
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

/** Where a feed page ends: the last row's start and id (ties on start are broken by id). */
export interface FeedCursor {
  startsAt: string;
  id: string;
}

const CURSOR_STARTS_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Opaque to clients: base64url of `<starts_at>|<id>`, the row's own values. */
export function encodeFeedCursor(cursor: FeedCursor): string {
  return btoa(`${cursor.startsAt}|${cursor.id}`)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/** The cursor, or null when it is not one this module wrote. Both parts are
 * checked against strict patterns, so they are safe inside a PostgREST filter. */
export function decodeFeedCursor(raw: string): FeedCursor | null {
  let text: string;
  try {
    text = atob(raw.replaceAll('-', '+').replaceAll('_', '/'));
  } catch {
    return null;
  }
  const [startsAt, id, ...rest] = text.split('|');
  if (rest.length > 0 || !startsAt || !id) return null;
  if (!CURSOR_STARTS_AT.test(startsAt) || !CURSOR_ID.test(id)) return null;
  return { startsAt, id };
}

export interface GatheringsPage {
  gatherings: GatheringListRow[];
  nextCursor: FeedCursor | null;
}

/** What is happening in the domain: the upcoming gatherings the viewer may
 * see, in start-time order, one page at a time. A bare RLS-scoped select —
 * nothing ranks, recommends, or filters beyond "has not started yet". Keyset
 * paging on (starts_at, id), so a gathering created between two pages never
 * shifts or repeats a row, and the enrichment (one members select, one counts
 * RPC) only ever covers one page's ids. */
export async function listUpcomingGatherings(
  db: Db,
  userId: string,
  { cursor = null, limit }: { cursor?: FeedCursor | null; limit: number },
): Promise<GatheringsPage> {
  let query = db
    .from('gatherings')
    .select('*')
    .gte('starts_at', new Date().toISOString());
  if (cursor) {
    // Quoted: a timestamp holds PostgREST's reserved ':' and '.'.
    query = query.or(
      `starts_at.gt."${cursor.startsAt}",and(starts_at.eq."${cursor.startsAt}",id.gt.${cursor.id})`,
    );
  }
  const { data, error } = await query
    .order('starts_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1);
  if (error) throw error;
  const rows = data ?? [];
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    gatherings: await withWhoIsGoing(db, userId, page),
    nextCursor: rows.length > limit && last ? { startsAt: last.starts_at, id: last.id } : null,
  };
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
  visibility?: 'everyone' | 'connections';
  capacity?: number | null;
}

/** Host-only by RLS and the column grant: a non-host's patch matches zero
 * rows and reads as null. */
export async function updateGathering(
  db: Db,
  gatheringId: string,
  patch: GatheringPatch,
): Promise<GatheringRow | null> {
  const { data, error } = await db
    .from('gatherings')
    .update(patch)
    .eq('id', gatheringId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data && narrow(data);
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
