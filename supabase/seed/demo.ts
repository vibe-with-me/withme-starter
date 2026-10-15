import type { Db } from '@withme/db';

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

type AuthUser = Awaited<ReturnType<Db['auth']['admin']['listUsers']>>['data']['users'][number];

/** Every auth user whose email is a demo login, across all pages. */
export async function findDemoUsers(admin: Db): Promise<AuthUser[]> {
  const emails = new Set<string>(Object.values(DEMO_USERS));
  const perPage = 1000;
  const found: AuthUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    found.push(...data.users.filter((user) => user.email && emails.has(user.email)));
    if (data.users.length < perPage) return found;
  }
}
