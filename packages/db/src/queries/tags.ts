import type { Db } from '../index.ts';
import type { Json } from '../types/supabase.ts';

const OWN_TAG_COLUMNS = 'uid, status, destination';

/**
 * The owner's view of a tag. tenant_id and claimed_by never leave the
 * database layer. destination is Json here (this package does not depend on
 * the contract); the tags_destination_shape CHECK is what makes the handler's
 * narrowing to the contract's Destination union safe.
 */
export interface OwnTagRow {
  uid: string;
  status: 'unclaimed' | 'claimed' | 'disabled';
  destination: Json | null;
}

/**
 * Every physical tag the caller has claimed, including disabled ones. RLS:
 * tags_select_own. The caller's share code is a tag row too (kind 'qr'), but
 * it is not a tag they hold: it has its own procedures.
 */
export async function listOwnTags(db: Db): Promise<OwnTagRow[]> {
  const { data, error } = await db
    .from('tags')
    .select(OWN_TAG_COLUMNS)
    .eq('kind', 'nfc')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** What an owner may change on their tag: where it points, and off or on. */
export interface OwnTagPatch {
  destination?: Json;
  status?: 'claimed' | 'disabled';
}

/**
 * Re-point and/or switch one of the caller's tags. RLS + the (destination,
 * status) column grant make this owner-only; the shape and state CHECKs
 * validate what lands. A tag that is not yours matches zero rows and reads
 * as null.
 */
export async function updateOwnTag(
  db: Db,
  uid: string,
  patch: OwnTagPatch,
): Promise<OwnTagRow | null> {
  const update: OwnTagPatch = {};
  if (patch.destination !== undefined) update.destination = patch.destination;
  if (patch.status !== undefined) update.status = patch.status;
  const { data, error } = await db
    .from('tags')
    .update(update)
    .eq('uid', uid)
    .select(OWN_TAG_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data;
}
