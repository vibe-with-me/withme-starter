import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { TERMS_VERSION } from '@withme/contract';
import {
  USER_ID,
  client,
  codeOf,
  fakeSupabase,
  gatheringRow,
  makeEnv,
  pgError,
  profileRow,
  token,
  type Api,
  type FakeSupabase,
  type Seen,
} from './harness.ts';

const NOW_ISO = '2026-10-19T12:00:00Z';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const UID = '04A1B2C3D4E5F6';
const OLD_AVATAR = `${USER_ID}/44444444-4444-4444-8444-444444444444.jpg`;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const env = makeEnv();
let supabase: FakeSupabase;
let api: Api;

beforeEach(async () => {
  supabase = fakeSupabase();
  supabase.install();
  api = client(env, await token());
});
afterEach(() => supabase.restore());

describe('every app.* procedure requires a verified identity', () => {
  const calls: [string, (a: Api) => Promise<unknown>][] = [
    ['profile.get', (a) => a.app.profile.get()],
    ['profile.update', (a) => a.app.profile.update({ display_name: 'Ada' })],
    ['profile.deleteAccount', (a) => a.app.profile.deleteAccount()],
    ['requests.send', (a) => a.app.requests.send({ recipient_id: OTHER_ID })],
    ['connections.list', (a) => a.app.connections.list()],
    ['blocks.block', (a) => a.app.blocks.block({ user_id: OTHER_ID })],
    ['gatherings.list', (a) => a.app.gatherings.list()],
    ['tags.listMine', (a) => a.app.tags.listMine()],
    ['shareCode.replace', (a) => a.app.shareCode.replace()],
    [
      'push.register',
      (a) => a.app.push.register({ token: 'ExponentPushToken[x]', platform: 'ios' }),
    ],
  ];

  test.each(calls)('%s without a token is UNAUTHORIZED and never queries', async (_name, call) => {
    expect(await codeOf(call(client(env)))).toBe('UNAUTHORIZED');
    expect(supabase.seen).toHaveLength(0);
  });
});

describe('input validation runs before any query', () => {
  const invalid: [string, (a: Api) => Promise<unknown>][] = [
    ['a non-uuid recipient', (a) => a.app.requests.send({ recipient_id: 'not-a-uuid' })],
    ['an over-long display name', (a) => a.app.profile.update({ display_name: 'x'.repeat(81) })],
    [
      'a stale terms version',
      (a) => a.app.profile.update({ terms_version: '2000-01-01' as typeof TERMS_VERSION }),
    ],
    ['a non-uuid gathering', (a) => a.app.gatherings.get({ id: 'nope' })],
    ['a page size over 50', (a) => a.app.gatherings.list({ limit: 51 })],
    [
      'a feed window that ends before it starts',
      (a) =>
        a.app.gatherings.list({ from: '2099-01-02T00:00:00Z', to: '2099-01-01T00:00:00Z' }),
    ],
    ['a malformed tag uid', (a) => a.app.tags.update({ uid: 'nope', status: 'disabled' })],
  ];

  test.each(invalid)('%s is BAD_REQUEST', async (_name, call) => {
    expect(await codeOf(call(api))).toBe('BAD_REQUEST');
    expect(supabase.seen).toHaveLength(0);
  });
});

describe('profile', () => {
  test('get reads the caller’s own row, or null before one exists', async () => {
    supabase.on('GET', '/rest/v1/profiles', [profileRow()]);
    const { profile } = await api.app.profile.get();
    expect(profile?.display_name).toBe('Ada');
    // tenant_id is not part of the contract and does not cross the API
    expect(profile).not.toHaveProperty('tenant_id');

    supabase.on('GET', '/rest/v1/profiles', []);
    expect(await api.app.profile.get()).toEqual({ profile: null });
  });

  test('acceptTerms without a profile is BAD_REQUEST', async () => {
    supabase.on('PATCH', '/rest/v1/profiles', []);
    expect(await codeOf(api.app.profile.acceptTerms({ version: TERMS_VERSION }))).toBe(
      'BAD_REQUEST',
    );
  });

  test('acceptTerms records the current version', async () => {
    supabase.on('PATCH', '/rest/v1/profiles', [profileRow()]);
    await api.app.profile.acceptTerms({ version: TERMS_VERSION });
    const [patch] = supabase.to('PATCH', '/rest/v1/profiles');
    expect(patch?.body).toEqual({ terms_version: TERMS_VERSION });
    expect(patch?.search.get('id')).toBe(`eq.${USER_ID}`);
  });

  test('a database error never leaks its message', async () => {
    supabase.on('GET', '/rest/v1/profiles', pgError('XX000', 500));
    const error = await api.app.profile.get().catch((e: { code: string; message: string }) => e);
    expect(error).toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' });
  });
});

const file = (bytes: Uint8Array, name = 'a.jpg', type = 'image/jpeg') =>
  new File([bytes], name, { type });
const uploads = () => supabase.to('POST', /^\/storage\/v1\/object\/avatars\//);
const removals = () => supabase.to('DELETE', '/storage/v1/object/avatars');

describe('profile.uploadAvatar', () => {
  beforeEach(() => {
    supabase
      .on('POST', /^\/storage\/v1\/object\/avatars\//, { Key: 'avatars/x', Id: 'x' })
      .on('DELETE', '/storage/v1/object/avatars', []);
  });

  test('the bytes decide: PNG bytes named .jpg are refused before Storage', async () => {
    supabase.on('GET', '/rest/v1/profiles', [profileRow()]);
    expect(await codeOf(api.app.profile.uploadAvatar({ file: file(PNG) }))).toBe('BAD_REQUEST');
    expect(uploads()).toHaveLength(0);
  });

  test('no profile yet is BAD_REQUEST, before Storage', async () => {
    supabase.on('GET', '/rest/v1/profiles', []);
    expect(await codeOf(api.app.profile.uploadAvatar({ file: file(JPEG) }))).toBe('BAD_REQUEST');
    expect(uploads()).toHaveLength(0);
  });

  test('stores a fresh path in the caller’s folder, points the profile at it, and removes the old file', async () => {
    supabase.on('GET', '/rest/v1/profiles', [profileRow({ avatar_path: OLD_AVATAR })]);
    supabase.on('PATCH', '/rest/v1/profiles', (req: Seen) => [
      profileRow({ avatar_path: (req.body as { avatar_path: string }).avatar_path }),
    ]);
    // a WebP claimed as a JPEG is stored as what it is
    const webp = new Uint8Array([...'RIFF\0\0\0\0WEBPVP8 '].map((c) => c.charCodeAt(0)));
    const { profile } = await api.app.profile.uploadAvatar({ file: file(webp) });

    const [upload] = uploads();
    const path = upload!.path.replace('/storage/v1/object/avatars/', '');
    expect(path).toMatch(new RegExp(`^${USER_ID}/[0-9a-f-]{36}\\.webp$`));
    expect(upload!.headers.get('authorization')).toStartWith('Bearer ');
    expect(profile.avatar_path).toBe(path);
    expect(removals().map((r) => r.body)).toEqual([{ prefixes: [OLD_AVATAR] }]);
  });

  test('a failed pointer update removes the file it would have pointed at', async () => {
    supabase.on('GET', '/rest/v1/profiles', [profileRow()]);
    supabase.on('PATCH', '/rest/v1/profiles', pgError('23514'));
    expect(await codeOf(api.app.profile.uploadAvatar({ file: file(JPEG) }))).toBe('BAD_REQUEST');
    const stored = uploads()[0]!.path.replace('/storage/v1/object/avatars/', '');
    expect(removals().map((r) => r.body)).toEqual([{ prefixes: [stored] }]);
  });

  test('a Storage failure is a fixed 500 and the profile is untouched', async () => {
    supabase.on('GET', '/rest/v1/profiles', [profileRow()]);
    supabase.on('POST', /^\/storage\/v1\/object\/avatars\//, {
      status: 403,
      body: {
        statusCode: '403',
        error: 'Unauthorized',
        message: 'new row violates row-level security policy',
      },
    });
    const error = await api.app.profile
      .uploadAvatar({ file: file(JPEG) })
      .catch((e: { code: string; message: string }) => e);
    expect(error).toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal error' });
    expect(supabase.to('PATCH', '/rest/v1/profiles')).toHaveLength(0);
  });

  test('an old file that will not delete does not fail the upload', async () => {
    supabase.on('GET', '/rest/v1/profiles', [profileRow({ avatar_path: OLD_AVATAR })]);
    supabase.on('PATCH', '/rest/v1/profiles', [profileRow()]);
    supabase.on('DELETE', '/storage/v1/object/avatars', {
      status: 500,
      body: { statusCode: '500', error: 'x', message: 'x' },
    });
    expect(await codeOf(api.app.profile.uploadAvatar({ file: file(JPEG) }))).toBe('ok');
  });

  test('an empty file is refused by the contract', async () => {
    expect(await codeOf(api.app.profile.uploadAvatar({ file: file(new Uint8Array()) }))).toBe(
      'BAD_REQUEST',
    );
    expect(supabase.seen).toHaveLength(0);
  });
});

describe('profile.removeAvatar', () => {
  test('clears the pointer first, then removes the file', async () => {
    supabase
      .on('GET', '/rest/v1/profiles', [profileRow({ avatar_path: OLD_AVATAR })])
      .on('PATCH', '/rest/v1/profiles', [profileRow()])
      .on('DELETE', '/storage/v1/object/avatars', []);
    const { profile } = await api.app.profile.removeAvatar();
    expect(profile.avatar_path).toBeNull();
    const order = supabase.seen.map((s) => s.method);
    expect(order).toEqual(['GET', 'PATCH', 'DELETE']);
  });

  test('no profile is BAD_REQUEST', async () => {
    supabase.on('GET', '/rest/v1/profiles', []);
    expect(await codeOf(api.app.profile.removeAvatar())).toBe('BAD_REQUEST');
  });
});

describe('profile.deleteAccount', () => {
  test('clears the pointer, sweeps the folder page by page, then deletes the account', async () => {
    let pages = 2;
    supabase
      .on('GET', '/rest/v1/profiles', [profileRow({ avatar_path: OLD_AVATAR })])
      .on('PATCH', '/rest/v1/profiles', [profileRow()])
      .on('POST', '/storage/v1/object/list/avatars', () =>
        pages-- > 0 ? [{ name: 'a.jpg' }, { name: 'b.webp' }] : [],
      )
      .on('DELETE', '/storage/v1/object/avatars', [])
      .on('POST', '/rest/v1/rpc/delete_my_account', null);

    expect(await api.app.profile.deleteAccount()).toEqual({ ok: true });
    expect(supabase.to('PATCH', '/rest/v1/profiles')[0]?.body).toEqual({ avatar_path: null });
    expect(supabase.to('DELETE', '/storage/v1/object/avatars')).toHaveLength(2);
    expect(supabase.to('DELETE', '/storage/v1/object/avatars')[0]?.body).toEqual({
      prefixes: [`${USER_ID}/a.jpg`, `${USER_ID}/b.webp`],
    });
    expect(supabase.seen.at(-1)?.path).toBe('/rest/v1/rpc/delete_my_account');
  });

  test('no avatar: no pointer update', async () => {
    supabase
      .on('GET', '/rest/v1/profiles', [profileRow()])
      .on('POST', '/storage/v1/object/list/avatars', [])
      .on('POST', '/rest/v1/rpc/delete_my_account', null);
    await api.app.profile.deleteAccount();
    expect(supabase.to('PATCH', '/rest/v1/profiles')).toHaveLength(0);
  });

  test('a folder that never empties stops after ten pages, before the account is deleted', async () => {
    supabase
      .on('GET', '/rest/v1/profiles', [profileRow()])
      .on('POST', '/storage/v1/object/list/avatars', [{ name: 'stuck.jpg' }])
      .on('DELETE', '/storage/v1/object/avatars', []);
    expect(await codeOf(api.app.profile.deleteAccount())).toBe('INTERNAL_SERVER_ERROR');
    expect(supabase.to('DELETE', '/storage/v1/object/avatars')).toHaveLength(10);
    expect(supabase.to('POST', '/rest/v1/rpc/delete_my_account')).toHaveLength(0);
  });

  test('photos the sweep missed (P0006) ask the client to try again', async () => {
    supabase
      .on('GET', '/rest/v1/profiles', [])
      .on('POST', '/storage/v1/object/list/avatars', [])
      .on('POST', '/rest/v1/rpc/delete_my_account', pgError('P0006'));
    expect(await codeOf(api.app.profile.deleteAccount())).toBe('CONFLICT');
  });
});

describe('requests', () => {
  test.each([
    ['P0003', 'NOT_FOUND'],
    ['P0004', 'TOO_MANY_REQUESTS'],
    ['23505', 'CONFLICT'],
  ])('send maps %s to %s', async (sqlstate, code) => {
    supabase.on('POST', '/rest/v1/rpc/send_connect_request', pgError(sqlstate));
    expect(await codeOf(api.app.requests.send({ recipient_id: OTHER_ID }))).toBe(code);
  });

  test('send passes only the recipient: the requester is the token', async () => {
    supabase.on('POST', '/rest/v1/rpc/send_connect_request', null);
    await api.app.requests.send({ recipient_id: OTHER_ID });
    expect(supabase.to('POST', '/rest/v1/rpc/send_connect_request')[0]?.body).toEqual({
      p_recipient: OTHER_ID,
    });
  });

  test('accept of an expired request is CONFLICT', async () => {
    supabase.on('POST', '/rest/v1/rpc/accept_connect_request', pgError('P0005'));
    expect(await codeOf(api.app.requests.accept({ id: OTHER_ID }))).toBe('CONFLICT');
  });
});

describe('gatherings', () => {
  test('get of an invisible or missing gathering is NOT_FOUND', async () => {
    supabase.on('GET', '/rest/v1/gatherings', []);
    expect(await codeOf(api.app.gatherings.get({ id: OTHER_ID }))).toBe('NOT_FOUND');
  });

  test('a malformed cursor is BAD_REQUEST, before any query', async () => {
    for (const cursor of ['%%%', btoa('2026-11-01T07:00:00Z|not-a-uuid'), btoa('a|b|c')]) {
      expect(await codeOf(api.app.gatherings.list({ cursor }))).toBe('BAD_REQUEST');
    }
    expect(supabase.seen).toHaveLength(0);
  });

  test('create passes the fields through and maps a full gathering', async () => {
    supabase.on('POST', '/rest/v1/rpc/create_gathering', gatheringRow());
    const starts_at = new Date(Date.now() + 86_400_000).toISOString();
    const { gathering } = await api.app.gatherings.create({
      title: 'Sunrise 5K',
      starts_at,
      capacity: 4,
    });
    expect(gathering.title).toBe('Sunrise 5K');
    expect(supabase.to('POST', '/rest/v1/rpc/create_gathering')[0]?.body).toMatchObject({
      p_title: 'Sunrise 5K',
      p_capacity: 4,
    });

    supabase.on('POST', '/rest/v1/rpc/join_gathering', pgError('P0007'));
    const error = await api.app.gatherings
      .join({ id: OTHER_ID })
      .catch((e: { message: string }) => e);
    expect(error).toMatchObject({ code: 'CONFLICT', message: 'Gathering is full' });
  });

  test('update by someone other than the host is NOT_FOUND', async () => {
    supabase.on('PATCH', '/rest/v1/gatherings', []);
    expect(await codeOf(api.app.gatherings.update({ id: OTHER_ID, title: 'Mine now' }))).toBe(
      'NOT_FOUND',
    );
  });
});

describe('tags and share code', () => {
  test('updating a tag that is not yours is NOT_FOUND', async () => {
    supabase.on('PATCH', '/rest/v1/tags', []);
    expect(await codeOf(api.app.tags.update({ uid: UID, status: 'disabled' }))).toBe('NOT_FOUND');
  });

  test('the share code RPCs take no uid, so they act on the caller only', async () => {
    supabase.on('POST', '/rest/v1/rpc/my_share_code', UID);
    supabase.on('POST', '/rest/v1/rpc/replace_my_share_code', UID);
    expect(await api.app.shareCode.get()).toEqual({ uid: UID });
    expect(await api.app.shareCode.replace()).toEqual({ uid: UID });
    for (const call of supabase.seen) expect(call.body ?? {}).toEqual({});
  });
});

// The rest are thin: one query each, the row mapped onto the contract. One
// pass each pins the wiring (route, arguments, output shape).
const card = (id: string, display_name: string) => ({
  id,
  display_name,
  avatar_path: null,
  bio: null,
});

describe('pass-through handlers', () => {
  const GATHERING_ID = gatheringRow().id;

  test('profile.update creates the profile on first save', async () => {
    supabase
      .on('GET', '/rest/v1/profiles', [])
      .on('POST', '/rest/v1/profiles', (req: Seen) => [
        profileRow(req.body as Record<string, unknown>),
      ]);
    const { profile } = await api.app.profile.update({
      display_name: 'Ada',
      terms_version: TERMS_VERSION,
    });
    expect(profile.display_name).toBe('Ada');
  });

  test('links.listMine and links.replace', async () => {
    supabase
      .on('GET', '/rest/v1/profile_links', [{ platform: 'instagram', value: 'ada' }])
      .on('POST', '/rest/v1/rpc/set_my_links', [
        { platform: 'instagram', value: 'ada', sort_order: 0 },
      ]);
    expect(await api.app.links.listMine()).toEqual({
      links: [{ platform: 'instagram', value: 'ada' }],
    });
    expect(
      await api.app.links.replace({ links: [{ platform: 'instagram', value: 'ada' }] }),
    ).toEqual({
      links: [{ platform: 'instagram', value: 'ada' }],
    });
  });

  test('requests.listPending, accept and decline', async () => {
    const request = {
      id: GATHERING_ID,
      status: 'pending' as const,
      created_at: NOW_ISO,
      expires_at: NOW_ISO,
      requester: card(OTHER_ID, 'Lin'),
    };
    const connection = {
      id: GATHERING_ID,
      profile: card(OTHER_ID, 'Lin'),
      links: [],
      gathering: null,
      created_at: NOW_ISO,
    };
    supabase
      .on('GET', '/rest/v1/connect_requests', [request, { ...request, requester: null }])
      .on('POST', '/rest/v1/rpc/accept_connect_request', connection)
      .on('POST', '/rest/v1/rpc/decline_connect_request', null);
    // a hidden requester card drops the row
    expect((await api.app.requests.listPending()).requests).toEqual([request]);
    expect(await api.app.requests.accept({ id: GATHERING_ID })).toEqual({ connection });
    expect(await api.app.requests.decline({ id: GATHERING_ID })).toEqual({ ok: true });
  });

  test('connections.list shows the other party, and remove', async () => {
    supabase
      .on('GET', '/rest/v1/connections', [
        {
          id: GATHERING_ID,
          created_at: NOW_ISO,
          user_a: USER_ID,
          user_b: OTHER_ID,
          gathering: { id: GATHERING_ID, title: 'Friday mixer', starts_at: NOW_ISO },
          a: { ...card(USER_ID, 'Ada'), links: [] },
          b: {
            ...card(OTHER_ID, 'Lin'),
            links: [{ platform: 'instagram', value: 'lin', sort_order: 0 }],
          },
        },
      ])
      .on('DELETE', '/rest/v1/connections', []);
    const { connections } = await api.app.connections.list();
    expect(connections.map((c) => [c.profile.display_name, c.links, c.gathering?.title])).toEqual([
      ['Lin', [{ platform: 'instagram', value: 'lin' }], 'Friday mixer'],
    ]);
    expect(await api.app.connections.remove({ id: GATHERING_ID })).toEqual({ ok: true });
  });

  test('blocks: block retries without the card when RLS refuses it; unblock; list', async () => {
    let attempts = 0;
    supabase
      .on('POST', '/rest/v1/blocks', () =>
        ++attempts === 1 ? pgError('42501', 403) : { status: 201, body: null },
      )
      .on('DELETE', '/rest/v1/blocks', [])
      .on('GET', '/rest/v1/blocks', [{ blocked_id: OTHER_ID, created_at: NOW_ISO, user: null }]);
    expect(await api.app.blocks.block({ user_id: OTHER_ID })).toEqual({ ok: true });
    expect(
      supabase
        .to('POST', '/rest/v1/blocks')
        .map((r) => (r.body as { reveals_card: boolean }).reveals_card),
    ).toEqual([true, false]);
    expect(await api.app.blocks.unblock({ user_id: OTHER_ID })).toEqual({ ok: true });
    expect((await api.app.blocks.list()).blocks[0]?.user.display_name).toBe('Blocked user');
  });

  test('reports.create and gatherings.report', async () => {
    supabase
      .on('POST', '/rest/v1/rpc/report_user', null)
      .on('POST', '/rest/v1/rpc/report_gathering', null);
    expect(await api.app.reports.create({ reported_id: OTHER_ID, reason: 'harassment' })).toEqual({
      ok: true,
    });
    expect(supabase.to('POST', '/rest/v1/rpc/report_user')[0]?.body).toEqual({
      p_reported: OTHER_ID,
      p_reason: 'harassment',
      p_block: false,
    });
    expect(
      await api.app.gatherings.report({ id: GATHERING_ID, reason: 'spam', block: true }),
    ).toEqual({ ok: true });
  });

  test('gatherings.get carries the visible members and everyone’s count', async () => {
    supabase
      .on('GET', '/rest/v1/gatherings', [gatheringRow()])
      .on('GET', '/rest/v1/gathering_members', [
        { joined_at: NOW_ISO, profile: card(USER_ID, 'Ada') },
        { joined_at: NOW_ISO, profile: null },
      ])
      .on('POST', '/rest/v1/rpc/gathering_member_counts', [
        { gathering_id: GATHERING_ID, member_count: 7 },
      ]);
    const { gathering, members, member_count } = await api.app.gatherings.get({ id: GATHERING_ID });
    expect(gathering.id).toBe(GATHERING_ID);
    expect(members.map((m) => m.profile.display_name)).toEqual(['Ada']);
    expect(member_count).toBe(7);
  });

  test('gatherings.list pages with an opaque cursor', async () => {
    const rows = [
      gatheringRow(),
      gatheringRow({ id: OTHER_ID, starts_at: '2026-11-02T07:00:00+00:00' }),
    ];
    supabase
      .on('GET', '/rest/v1/gatherings', rows)
      .on('GET', '/rest/v1/gathering_members', [
        { gathering_id: GATHERING_ID, joined_at: NOW_ISO, profile: card(USER_ID, 'Ada') },
      ])
      .on('POST', '/rest/v1/rpc/gathering_member_counts', [
        { gathering_id: GATHERING_ID, member_count: 1 },
      ]);
    const first = await api.app.gatherings.list({ limit: 1 });
    expect(first.gatherings.map((g) => [g.id, g.is_member, g.member_count])).toEqual([
      [GATHERING_ID, true, 1],
    ]);
    expect(first.next_cursor).toEqual(expect.any(String));

    await api.app.gatherings.list({ cursor: first.next_cursor!, limit: 1 });
    const query = supabase.to('GET', '/rest/v1/gatherings').at(-1)!;
    expect(query.search.get('or')).toContain(GATHERING_ID);
    expect(query.search.get('limit')).toBe('2');
  });

  test('gatherings.list narrows to a window of start times, never before now', async () => {
    supabase.on('GET', '/rest/v1/gatherings', []);
    const from = '2099-01-02T18:00:00.000Z';
    const to = '2099-01-05T00:00:00.000Z';
    await api.app.gatherings.list({ from, to });
    let query = supabase.to('GET', '/rest/v1/gatherings').at(-1)!;
    expect(query.search.getAll('starts_at')).toEqual([`gte.${from}`, `lt.${to}`]);

    // A window reaching back is floored at now: the feed stays upcoming-only.
    await api.app.gatherings.list({ from: '2000-01-01T00:00:00Z' });
    query = supabase.to('GET', '/rest/v1/gatherings').at(-1)!;
    const [floor, ...rest] = query.search.getAll('starts_at');
    expect(rest).toEqual([]);
    expect(Date.parse(floor!.slice('gte.'.length))).toBeGreaterThan(Date.parse('2020-01-01'));
  });

  test('gatherings.listMine, update, leave and remove', async () => {
    supabase
      .on('GET', '/rest/v1/gathering_members', [])
      .on('PATCH', '/rest/v1/gatherings', [gatheringRow({ title: 'Renamed' })])
      .on('DELETE', '/rest/v1/gathering_members', [])
      .on('DELETE', '/rest/v1/gatherings', []);
    expect(await api.app.gatherings.listMine()).toEqual({ gatherings: [] });
    expect(
      (await api.app.gatherings.update({ id: GATHERING_ID, title: 'Renamed' })).gathering.title,
    ).toBe('Renamed');
    expect(await api.app.gatherings.leave({ id: GATHERING_ID })).toEqual({ ok: true });
    expect(supabase.to('DELETE', '/rest/v1/gathering_members')[0]?.search.get('profile_id')).toBe(
      `eq.${USER_ID}`,
    );
    expect(await api.app.gatherings.remove({ id: GATHERING_ID })).toEqual({ ok: true });
  });

  test('tags.listMine and tags.update', async () => {
    const tag = { uid: UID, status: 'disabled', destination: { type: 'profile' } } as const;
    supabase.on('GET', '/rest/v1/tags', [tag]).on('PATCH', '/rest/v1/tags', [tag]);
    expect(await api.app.tags.listMine()).toEqual({ tags: [tag] });
    expect(await api.app.tags.update({ uid: UID, status: 'disabled' })).toEqual({ tag });
    expect(supabase.to('PATCH', '/rest/v1/tags')[0]?.body).toEqual({ status: 'disabled' });
  });

  test('push.register and push.unregister', async () => {
    const pushToken = 'ExponentPushToken[abc]';
    supabase
      .on('POST', '/rest/v1/rpc/register_push_token', null)
      .on('DELETE', '/rest/v1/push_tokens', []);
    expect(await api.app.push.register({ token: pushToken, platform: 'android' })).toEqual({
      ok: true,
    });
    expect(await api.app.push.unregister({ token: pushToken })).toEqual({ ok: true });
  });
});
