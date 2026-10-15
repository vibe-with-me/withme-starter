import type { GatheringMember } from '@withme/contract';

/** "1 going", "12 going". The count is everyone; the names below are not. */
export function goingLine(count: number): string {
  return `${count} going`;
}

/**
 * "With Ada", "With Ada and Lin", "With Ada, Lin, and 2 more": the viewer's
 * connections among the members, which is all a member list ever carries
 * besides the viewer. Null when there is nobody to name.
 */
export function withLine(members: GatheringMember[], viewerId: string | null): string | null {
  const names = members
    .filter((member) => member.profile.id !== viewerId)
    .map((member) => member.profile.display_name);
  if (names.length === 0) return null;
  if (names.length === 1) return `With ${names[0]}`;
  if (names.length === 2) return `With ${names[0]} and ${names[1]}`;
  const [first, second] = names;
  const more = names.length - 2;
  return `With ${first}, ${second}, and ${more} more`;
}
