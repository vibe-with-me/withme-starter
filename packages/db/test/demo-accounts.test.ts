// Shared demo logins (20261020120000_demo_account_guard,
// 20261020120100_restore_demo): with private.settings 'demo_account_domain'
// set, an account at that domain can't be deleted by its holder, can't have
// its email or password changed through Auth, and a sign-out ends nobody
// else's session; private.restore_demo() puts Ada, Lin and the demo tags
// back. With the setting null (every fork's default) none of it applies.
//
// The suite runs on a domain of its own, so the seeded demo logins (if any)
// are never the ones it signs in as. restore_demo also rewrites the three
// demo tags; afterAll hands them back to the seeded Ada when there is one.
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { TERMS_VERSION } from '@withme/contract';
import {
  admin,
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
  type TestUser,
} from '../src/test-utils/index.ts';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const sql = new SQL(DB_URL);

const DOMAIN = `demo-${crypto.randomUUID().slice(0, 8)}.test`;
const PASSWORD = 'demo-guard-password-1!';
const DEMO_TAGS = ['04AAAAAAAAAAAA', '04BBBBBBBBBBBB', '04CCCCCCCCCCCC'];

async function setDomain(value: string | null): Promise<void> {
  await sql`update private.settings set value = ${value} where key = 'demo_account_domain'`;
}

async function restore(): Promise<string> {
  const [row] = await sql`select private.restore_demo() as result`;
  return row.result;
}

/** A confirmed login with a card, signed in on its own client. */
async function createLogin(email: string, displayName: string): Promise<TestUser> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  const { error: profileError } = await client.from('profiles').insert({
    id: data.user.id,
    display_name: displayName,
    terms_version: TERMS_VERSION,
  });
  if (profileError) throw profileError;
  return { id: data.user.id, email, client };
}

/** A second, independent session on the same login. */
async function signInAgain(email: string) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error || !data.session) throw error ?? new Error('no session');
  return { client, refreshToken: data.session.refresh_token };
}

async function canSignIn(email: string, password: string): Promise<boolean> {
  const { error } = await anonClient().auth.signInWithPassword({
    email,
    password,
  });
  return error === null;
}

const tagsBefore: string[] = [];

beforeAll(async () => {
  await assertStackRunning();
  const rows = await sql`select uid from public.tags where uid in ${sql(DEMO_TAGS)}`;
  tagsBefore.push(...rows.map((row: { uid: string }) => row.uid));
});

afterAll(async () => {
  // Back to the seeded demo if this stack has one; otherwise remove the tags
  // this suite created.
  await setDomain('demo.withme.local');
  if ((await restore()) !== 'restored') {
    const created = DEMO_TAGS.filter((uid) => !tagsBefore.includes(uid));
    if (created.length > 0) await sql`delete from public.tags where uid in ${sql(created)}`;
  }
  await setDomain(null);
  await sql.close();
});

describe('demo account guard, off (the default)', () => {
  beforeAll(() => setDomain(null));

  it('lets a login at the demo domain change its password and delete itself', async () => {
    const ada = await createLogin(`off-${crypto.randomUUID()}@${DOMAIN}`, 'Ada');
    expect(
      (await ada.client.auth.updateUser({ password: 'changed-password-1!' })).error,
    ).toBeNull();
    expect(await canSignIn(ada.email, 'changed-password-1!')).toBe(true);
    expect((await ada.client.rpc('delete_my_account')).error).toBeNull();
    expect((await admin.auth.admin.getUserById(ada.id)).data.user).toBeNull();
  });

  it('restore_demo does nothing', async () => {
    expect(await restore()).toBe('off');
  });
});

describe('demo account guard, on', () => {
  beforeAll(() => setDomain(DOMAIN));

  it('refuses a password change, by the holder or the admin API', async () => {
    const ada = await createLogin(`pw-${crypto.randomUUID()}@${DOMAIN}`, 'Ada');
    expect(
      (await ada.client.auth.updateUser({ password: 'changed-password-1!' })).error,
    ).not.toBeNull();
    expect(
      (
        await admin.auth.admin.updateUserById(ada.id, {
          password: 'changed-password-2!',
        })
      ).error,
    ).not.toBeNull();
    expect(await canSignIn(ada.email, PASSWORD)).toBe(true);
    expect(await canSignIn(ada.email, 'changed-password-1!')).toBe(false);
  });

  it('refuses an email change, and records no pending one', async () => {
    const ada = await createLogin(`email-${crypto.randomUUID()}@${DOMAIN}`, 'Ada');
    expect(
      (await ada.client.auth.updateUser({ email: 'taken-over@example.com' })).error,
    ).not.toBeNull();
    const [row] = await sql`select email, email_change from auth.users where id = ${ada.id}`;
    expect(row.email).toBe(ada.email);
    expect(row.email_change ?? '').toBe('');
  });

  it('matches the domain case-insensitively, and only that domain', async () => {
    const shouty = await createLogin(`CASE-${crypto.randomUUID()}@${DOMAIN.toUpperCase()}`, 'Ada');
    expect(
      (await shouty.client.auth.updateUser({ password: 'changed-password-1!' })).error,
    ).not.toBeNull();
    const sub = await createLogin(`sub-${crypto.randomUUID()}@x.${DOMAIN}`, 'Sub');
    expect(
      (await sub.client.auth.updateUser({ password: 'changed-password-1!' })).error,
    ).toBeNull();
    const other = await createTestUser('Other');
    expect(
      (await other.client.auth.updateUser({ password: 'changed-password-1!' })).error,
    ).toBeNull();
  });

  it('keeps card edits and sign-in metadata working', async () => {
    const ada = await createLogin(`card-${crypto.randomUUID()}@${DOMAIN}`, 'Ada');
    const edit = await ada.client
      .from('profiles')
      .update({ display_name: 'Not Ada', bio: 'edited' })
      .eq('id', ada.id)
      .select('display_name')
      .single();
    expect(edit.error).toBeNull();
    expect(edit.data).toEqual({ display_name: 'Not Ada' });
    expect(
      (
        await admin.auth.admin.updateUserById(ada.id, {
          user_metadata: { note: 'ok' },
        })
      ).error,
    ).toBeNull();
    expect(await canSignIn(ada.email, PASSWORD)).toBe(true);
  });

  it('refuses delete_my_account with P0008, and the account stays', async () => {
    const ada = await createLogin(`del-${crypto.randomUUID()}@${DOMAIN}`, 'Ada');
    const { error } = await ada.client.rpc('delete_my_account');
    expect(error?.code).toBe('P0008');
    expect((await admin.auth.admin.getUserById(ada.id)).data.user?.id).toBe(ada.id);
    const profile = await admin.from('profiles').select('id').eq('id', ada.id);
    expect(profile.data).toHaveLength(1);
  });

  it('still lets the admin API delete it (the seed resets demo users that way)', async () => {
    const ada = await createLogin(`admin-${crypto.randomUUID()}@${DOMAIN}`, 'Ada');
    await signInAgain(ada.email);
    expect((await admin.auth.admin.deleteUser(ada.id)).error).toBeNull();
    expect((await admin.auth.admin.getUserById(ada.id)).data.user).toBeNull();
    const [row] = await sql`select count(*)::int as n from auth.sessions where user_id = ${ada.id}`;
    expect(row.n).toBe(0);
  });

  it("a sign-out, of any scope, ends no other visitor's session", async () => {
    const ada = await createLogin(`out-${crypto.randomUUID()}@${DOMAIN}`, 'Ada');
    const other = await signInAgain(ada.email);
    expect((await ada.client.auth.signOut({ scope: 'global' })).error).toBeNull();
    const refreshed = await other.client.auth.refreshSession({
      refresh_token: other.refreshToken,
    });
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.session).not.toBeNull();
  });

  it('control: a global sign-out still ends every session of an ordinary account', async () => {
    const bob = await createTestUser('Bob');
    const { data } = await anonClient().auth.signInWithPassword({
      email: bob.email,
      password: 'rls-test-password-1!',
    });
    expect((await bob.client.auth.signOut({ scope: 'global' })).error).toBeNull();
    const refreshed = await anonClient().auth.refreshSession({
      refresh_token: data.session!.refresh_token,
    });
    expect(refreshed.error).not.toBeNull();
  });
});

describe('restore_demo', () => {
  let ada: TestUser;
  let lin: TestUser;
  let stranger: TestUser;
  let strangersGathering: string;

  beforeAll(async () => {
    await setDomain(DOMAIN);
    expect(await restore()).toBe('missing');
    ada = await createLogin(`ada@${DOMAIN}`, 'Ada');
    lin = await createLogin(`lin@${DOMAIN}`, 'Lin');
    stranger = await createTestUser('Stranger');
    expect(await restore()).toBe('restored');

    // An hour of visitors signed in as Ada.
    await ada.client
      .from('profiles')
      .update({ display_name: 'pwned', bio: 'pwned' })
      .eq('id', ada.id);
    await ada.client.rpc('set_my_links', {
      p_links: [{ platform: 'x', value: 'pwned' }],
    });
    await ada.client.from('blocks').insert({ blocker_id: ada.id, blocked_id: lin.id });
    await ada.client.from('tags').update({ status: 'disabled' }).eq('uid', '04BBBBBBBBBBBB');
    await ada.client.rpc('claim_tag', { p_uid: '04AAAAAAAAAAAA' });
    const own = await ada.client.from('gatherings').select('id').eq('host_id', ada.id);
    for (const row of own.data ?? []) await ada.client.from('gatherings').delete().eq('id', row.id);
    await lin.client.from('connect_requests').delete().eq('requester_id', lin.id);
    // A stranger met Ada, and has a gathering of their own that Ada joined.
    await connectUsers(stranger, ada);
    await stranger.client.from('blocks').insert({ blocker_id: stranger.id, blocked_id: lin.id });
    const created = await stranger.client.rpc('create_gathering', {
      p_title: "Stranger's picnic",
      p_starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      p_location: 'The park',
    });
    expect(created.error).toBeNull();
    strangersGathering = (created.data as { id: string }).id;
    expect(
      (
        await ada.client.rpc('join_gathering', {
          p_gathering_id: strangersGathering,
        })
      ).error,
    ).toBeNull();

    expect(await restore()).toBe('restored');
  });

  it("restores Ada's and Lin's cards and Ada's links", async () => {
    const profiles = await admin
      .from('profiles')
      .select('display_name, bio, avatar_path')
      .in('id', [ada.id, lin.id])
      .order('display_name');
    expect(profiles.data).toEqual([
      {
        display_name: 'Ada',
        bio: 'Brings the good playlists.',
        avatar_path: null,
      },
      { display_name: 'Lin', bio: 'Will trade book recs.', avatar_path: null },
    ]);
    const links = await admin
      .from('profile_links')
      .select('platform, value')
      .eq('profile_id', ada.id)
      .order('sort_order');
    expect(links.data?.map((link) => link.platform)).toEqual([
      'instagram',
      'tiktok',
      'x',
      'youtube',
      'email',
      'website',
    ]);
    expect(links.data?.find((link) => link.platform === 'email')?.value).toBe(`ada@${DOMAIN}`);
  });

  it('restores the three demo tags', async () => {
    const tags = await admin
      .from('tags')
      .select('uid, claimed_by, destination, status')
      .in('uid', DEMO_TAGS)
      .order('uid');
    expect(tags.data).toEqual([
      {
        uid: '04AAAAAAAAAAAA',
        claimed_by: null,
        destination: null,
        status: 'unclaimed',
      },
      {
        uid: '04BBBBBBBBBBBB',
        claimed_by: ada.id,
        destination: { type: 'profile' },
        status: 'claimed',
      },
      {
        uid: '04CCCCCCCCCCCC',
        claimed_by: ada.id,
        destination: { type: 'profile' },
        status: 'disabled',
      },
    ]);
  });

  it("restores Lin's pending request and nothing else between the demo accounts", async () => {
    const requests = await admin
      .from('connect_requests')
      .select('requester_id, recipient_id, status')
      .or(`requester_id.in.(${ada.id},${lin.id}),recipient_id.in.(${ada.id},${lin.id})`);
    expect(requests.data).toEqual([
      { requester_id: lin.id, recipient_id: ada.id, status: 'pending' },
    ]);
    const blocks = await admin.from('blocks').select('blocker_id').eq('blocker_id', ada.id);
    expect(blocks.data).toEqual([]);
    const connections = await admin
      .from('connections')
      .select('id')
      .or(`user_a.in.(${ada.id},${lin.id}),user_b.in.(${ada.id},${lin.id})`);
    expect(connections.data).toEqual([]);
  });

  it('restores two gatherings days out: Ada hosts one Lin joined, Lin hosts one with a capacity', async () => {
    const gatherings = await admin
      .from('gatherings')
      .select('id, host_id, title, starts_at, capacity, gathering_members(profile_id)')
      .in('host_id', [ada.id, lin.id])
      .order('starts_at');
    expect(gatherings.error).toBeNull();
    expect(gatherings.data).toHaveLength(2);
    const [adas, lins] = gatherings.data ?? [];
    if (!adas || !lins) throw new Error('expected two gatherings');
    expect(adas.host_id).toBe(ada.id);
    expect(adas.gathering_members.map((m) => m.profile_id).toSorted()).toEqual(
      [ada.id, lin.id].toSorted(),
    );
    expect(lins.host_id).toBe(lin.id);
    expect(lins.capacity).toBe(12);
    expect(lins.gathering_members.map((m) => m.profile_id)).toEqual([lin.id]);
    expect(new Date(adas.starts_at).getTime()).toBeGreaterThan(Date.now() + 86_400_000);
    // Ada sees both on her Events feed.
    const feed = await ada.client.from('gatherings').select('id').in('host_id', [ada.id, lin.id]);
    expect(feed.data).toHaveLength(2);
  });

  it("leaves the stranger's account, card, gathering and own blocks alone", async () => {
    const profile = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', stranger.id)
      .single();
    expect(profile.data).toEqual({ display_name: 'Stranger' });
    const members = await admin
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', strangersGathering);
    expect(members.data).toEqual([{ profile_id: stranger.id }]);
    const blocks = await admin.from('blocks').select('blocked_id').eq('blocker_id', stranger.id);
    expect(blocks.data).toEqual([{ blocked_id: lin.id }]);
  });

  it('runs again cleanly (hourly)', async () => {
    expect(await restore()).toBe('restored');
    const gatherings = await admin.from('gatherings').select('id').in('host_id', [ada.id, lin.id]);
    expect(gatherings.data).toHaveLength(2);
  });

  it('is not callable by a signed-in user', async () => {
    const [row] = await sql`
      select has_function_privilege('authenticated', 'private.restore_demo()', 'execute') as auth,
             has_function_privilege('anon', 'private.restore_demo()', 'execute') as anon`;
    expect(row).toEqual({ auth: false, anon: false });
  });
});
