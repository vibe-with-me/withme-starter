// What the demo seed creates, shared with unseed so the two cannot drift.
export const DEMO_USERS = {
  ada: 'ada@demo.withme.local',
  lin: 'lin@demo.withme.local',
} as const;

export const DEMO_TAGS = {
  unclaimed: '04AAAAAAAAAAAA',
  claimed: '04BBBBBBBBBBBB',
  disabled: '04CCCCCCCCCCCC',
} as const;
