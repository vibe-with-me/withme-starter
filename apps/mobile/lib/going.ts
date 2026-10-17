import {
  GATHERING_CAPACITY_MAX,
  GATHERING_CAPACITY_MIN,
  type GatheringMember,
  type GatheringVisibility,
} from '@withme/contract';

/** "1 going", "12 going", or "3 of 4 going" with a capacity. The count is
 * everyone, the host included; the names below are not. */
export function goingLine(count: number, capacity: number | null = null): string {
  return capacity === null ? `${count} going` : `${count} of ${capacity} going`;
}

/** Shown instead of Join once going reaches the capacity. */
export const FULL_LABEL = 'Full';

/** The small mark on a connections-only gathering, in ink. */
export function audienceMark(visibility: GatheringVisibility): string | null {
  return visibility === 'connections' ? 'Connections only' : null;
}

/** The host's choice on the create and edit forms, one line explaining each. */
export const VISIBILITY_CHOICES: readonly {
  value: GatheringVisibility;
  label: string;
  help: string;
}[] = [
  {
    value: 'everyone',
    label: 'Everyone in the app',
    help: 'Anyone signed in can see it and join.',
  },
  {
    value: 'connections',
    label: 'My connections',
    help: 'Only people you’re connected with can see it and join.',
  },
];

/**
 * The optional Spots field: '' is no limit; otherwise a whole number from 2
 * to 500, counting you. Undefined when the text is not one.
 */
export function parseSpots(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const spots = Number(trimmed);
  return spots >= GATHERING_CAPACITY_MIN && spots <= GATHERING_CAPACITY_MAX ? spots : undefined;
}

export const SPOTS_HELP = `Optional. Counts you. ${GATHERING_CAPACITY_MIN} to ${GATHERING_CAPACITY_MAX}; leave it empty for no limit.`;

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
