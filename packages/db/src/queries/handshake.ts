import type { Db, Tables } from '../index.ts';
import { LINK_EMBED, sortLinks, type ProfileLinkRow } from './links.ts';

/** The card columns — everything a counterpart may see, nothing more. */
export const CARD_COLUMNS = 'id, display_name, avatar_path, bio';

export interface ProfileCard {
  id: string;
  display_name: string;
  avatar_path: string | null;
  bio: string | null;
}

export async function getOwnProfile(db: Db, userId: string): Promise<Tables<'profiles'> | null> {
  const { data, error } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Insert-or-update the caller's profile. display_name and terms_version (the
 * sign-up agreement) are required on first create; on an update, a
 * terms_version records agreeing again (the database stamps the time).
 */
export async function upsertOwnProfile(
  db: Db,
  userId: string,
  patch: { display_name?: string; bio?: string | null; terms_version?: string },
): Promise<Tables<'profiles'>> {
  const existing = await getOwnProfile(db, userId);
  if (existing) {
    const { data, error } = await db
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  if (!patch.display_name || !patch.terms_version) {
    throw { code: 'P0001', message: 'display_name and terms_version are required to create a profile' };
  }
  const { data, error } = await db
    .from('profiles')
    .insert({
      id: userId,
      display_name: patch.display_name,
      bio: patch.bio ?? null,
      terms_version: patch.terms_version,
    })
    .select()
    .single();
  if (error) {
    // Lost a create race (two first-save tabs): the row exists now, update it.
    if (error.code === '23505') {
      const { data: raced, error: retryError } = await db
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select()
        .single();
      if (retryError) throw retryError;
      return raced;
    }
    throw error;
  }
  return data;
}

/** Agree to a terms version. Null when the caller has no profile yet. */
export async function acceptOwnTerms(
  db: Db,
  userId: string,
  version: string,
): Promise<Tables<'profiles'> | null> {
  const { data, error } = await db
    .from('profiles')
    .update({ terms_version: version })
    .eq('id', userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface PendingRequestRow {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
  requester: ProfileCard;
}

/** Incoming live requests with the requester's card. RLS scopes to the recipient. */
export async function listPendingRequests(db: Db): Promise<PendingRequestRow[]> {
  const { data, error } = await db
    .from('connect_requests')
    .select(
      `id, status, created_at, expires_at,
       requester:profiles!connect_requests_requester_id_fkey(${CARD_COLUMNS})`,
    )
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((row) =>
    row.requester
      ? [
          {
            id: row.id,
            status: row.status,
            created_at: row.created_at,
            expires_at: row.expires_at,
            requester: row.requester,
          },
        ]
      : [],
  );
}

/** The gathering a connection was made at, as the viewer sees it now. */
export interface MetAtGathering {
  id: string;
  title: string;
  starts_at: string;
}

export interface ConnectionRow {
  id: string;
  created_at: string;
  profile: ProfileCard;
  /** The other party's links: a connection is the one place they travel (RLS admits them here). */
  links: ProfileLinkRow[];
  /**
   * Where the two of them met: set by accept_connect_request, read through
   * gatherings_select, so null when there was none or the viewer no longer
   * sees it.
   */
  gathering: MetAtGathering | null;
}

/** The caller's connections, each carrying the OTHER party's card and links. */
export async function listConnections(db: Db, userId: string): Promise<ConnectionRow[]> {
  const { data, error } = await db
    .from('connections')
    .select(
      `id, created_at, user_a, user_b,
       gathering:gatherings(id, title, starts_at),
       a:profiles!connections_user_a_fkey(${CARD_COLUMNS}, ${LINK_EMBED}),
       b:profiles!connections_user_b_fkey(${CARD_COLUMNS}, ${LINK_EMBED})`,
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const other = row.user_a === userId ? row.b : row.a;
    if (!other) return [];
    const { links, ...profile } = other;
    return [
      {
        id: row.id,
        created_at: row.created_at,
        profile,
        links: sortLinks(links),
        gathering: row.gathering,
      },
    ];
  });
}

/** Unilateral and idempotent: deleting a connection that is not yours is a no-op. */
export async function removeConnection(db: Db, connectionId: string): Promise<void> {
  const { error } = await db.from('connections').delete().eq('id', connectionId);
  if (error) throw error;
}

/**
 * Idempotent and oracle-free: re-blocking succeeds silently, and so does
 * blocking an unknown id (an FK error would let callers probe which UUIDs
 * exist). The block keeps the card in the block list only if the blocker
 * can see it now; RLS refuses reveals_card for anyone else (42501), and the
 * retry blocks without it.
 */
export async function blockUser(db: Db, blockerId: string, blockedId: string): Promise<void> {
  const insert = (reveals_card: boolean) =>
    db.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId, reveals_card });
  let { error } = await insert(true);
  if (error?.code === '42501') ({ error } = await insert(false));
  if (error && error.code !== '23505' && error.code !== '23503') throw error;
}

export async function unblockUser(db: Db, blockerId: string, blockedId: string): Promise<void> {
  const { error } = await db
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
}

/** Stands in for a card the block does not reveal. */
export const BLOCKED_USER_NAME = 'Blocked user';

export interface BlockRow {
  created_at: string;
  user: ProfileCard;
}

export async function listBlocks(db: Db): Promise<BlockRow[]> {
  const { data, error } = await db
    .from('blocks')
    .select(`blocked_id, created_at, user:profiles!blocks_blocked_id_fkey(${CARD_COLUMNS})`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // A block that does not reveal its card (reveals_card false: the blocker
  // could not see it when they blocked) still lists, so it can be undone.
  return (data ?? []).map((row) => ({
    created_at: row.created_at,
    user: row.user ?? {
      id: row.blocked_id,
      display_name: BLOCKED_USER_NAME,
      avatar_path: null,
      bio: null,
    },
  }));
}
