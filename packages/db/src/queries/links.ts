import type { Db } from '../index.ts';

/** What a link is on the wire: the platform and the stored value; order is the array's. */
export type ProfileLinkRow = { platform: string; value: string };

/** The embed every connection card carries. Sorted in JS: a nested embed's order is not expressible here. */
export const LINK_EMBED = 'links:profile_links(platform, value, sort_order)';

export function sortLinks(links: Array<ProfileLinkRow & { sort_order: number }>): ProfileLinkRow[] {
  return links
    .toSorted((a, b) => a.sort_order - b.sort_order)
    .map(({ platform, value }) => ({ platform, value }));
}

/** The caller's own links, in display order. */
export async function listOwnLinks(db: Db, userId: string): Promise<ProfileLinkRow[]> {
  const { data, error } = await db
    .from('profile_links')
    .select('platform, value')
    .eq('profile_id', userId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Replace the caller's whole list in one transaction (set_my_links):
 * platforms left out are removed, the rest upserted in the given order.
 * Returns the stored list.
 */
export async function replaceOwnLinks(db: Db, links: ProfileLinkRow[]): Promise<ProfileLinkRow[]> {
  const { data, error } = await db.rpc('set_my_links', { p_links: links });
  if (error) throw error;
  return (data ?? []).map(({ platform, value }) => ({ platform, value }));
}
