import type { PublicProfile } from '@withme/contract';

/**
 * The card tier as one line under a person's name, on every list of people:
 * Requests, Connections, Blocked, and a gathering's members. The card tier
 * rides every card, so every row shows it. The starter's card has no vertical
 * fields, so this is null; extend-profile fills it in once (e.g.
 * `profile.affiliation`) and every list follows. Mobile mirrors it in
 * lib/card-line.ts.
 */
export function cardLine(profile: PublicProfile): string | null {
  void profile;
  return null;
}
