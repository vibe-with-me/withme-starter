// Push notifications: who may hold a token, who gets a push, what it says,
// and what Expo's answers do to the tokens. The database sends through
// pg_net, so a mock of Expo's push endpoint runs here (Bun.serve) and the
// suite points private.push_config at it for its duration. The database
// container reaches the host as host.docker.internal.
//
// Negative cases ("no push") are proved with a positive control: a later
// push to the same device that does arrive. pg_net sends in queue order, so
// once the control has arrived, a push queued before it would have too.
import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  SUPABASE_URL,
  ANON_KEY,
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
  pendingRequestId,
  type TestUser,
} from '../src/test-utils/index.ts';

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const sql = new SQL(DB_URL);

type Message = {
  to: string;
  title: string;
  body: string;
  sound: string;
  data: { path: string };
};

const received: Message[] = [];

// Expo's documented answer: one ticket per message, in order. A token with
// "Dead" in it answers the way Expo does for an uninstalled app.
const expo = Bun.serve({
  port: 0,
  hostname: '0.0.0.0',
  async fetch(request) {
    const messages = (await request.json()) as Message[];
    received.push(...messages);
    return Response.json({
      data: messages.map((m) =>
        m.to.includes('Dead')
          ? {
              status: 'error',
              message: `"${m.to}" is not a registered push notification recipient`,
              details: { error: 'DeviceNotRegistered', expoPushToken: m.to },
            }
          : { status: 'ok', id: crypto.randomUUID() },
      ),
    });
  },
});

let previousEndpoint: string | null = null;

beforeAll(async () => {
  await assertStackRunning();
  const [row] = await sql`select endpoint from private.push_config`;
  previousEndpoint = row.endpoint;
  await sql`update private.push_config set endpoint = ${`http://host.docker.internal:${expo.port}/push/send`}`;
});

afterAll(async () => {
  await sql`update private.push_config set endpoint = ${previousEndpoint}`;
  await sql.close();
  expo.stop(true);
});

function token(label = 'Live'): string {
  return `ExponentPushToken[${label}${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}]`;
}

async function register(user: TestUser, label = 'Live'): Promise<string> {
  const t = token(label);
  const { error } = await user.client.rpc('register_push_token', { p_token: t, p_platform: 'ios' });
  expect(error).toBeNull();
  return t;
}

/** Waits for the next message to `to`, failing after a few seconds. */
async function nextPush(to: string, after = 0): Promise<Message> {
  for (let i = 0; i < 100; i++) {
    const hit = received.filter((m) => m.to === to)[after];
    if (hit) return hit;
    await Bun.sleep(50);
  }
  throw new Error(`no push reached ${to}`);
}

function pushesTo(to: string): Message[] {
  return received.filter((m) => m.to === to);
}

async function sendRequest(from: TestUser, to: TestUser): Promise<void> {
  const { error } = await from.client.rpc('send_connect_request', { p_recipient: to.id });
  expect(error).toBeNull();
}

async function createGathering(host: TestUser, title: string): Promise<string> {
  const { data, error } = await host.client.rpc('create_gathering', {
    p_title: title,
    p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    p_location: 'The roof',
  });
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

async function join(user: TestUser, gatheringId: string): Promise<void> {
  const { error } = await user.client.rpc('join_gathering', { p_gathering_id: gatheringId });
  expect(error).toBeNull();
}

async function myTokens(user: TestUser): Promise<string[]> {
  const { data, error } = await user.client.from('push_tokens').select('token');
  expect(error).toBeNull();
  return (data ?? []).map((r) => r.token);
}

describe('push tokens', () => {
  it('are visible to their owner only', async () => {
    const alice = await createTestUser('Alice');
    const mallory = await createTestUser('Mallory');
    const t = await register(alice);

    expect(await myTokens(alice)).toEqual([t]);
    expect(await myTokens(mallory)).toEqual([]);
    const { data, error } = await anonClient().from('push_tokens').select('token');
    expect(data ?? []).toEqual([]);
    expect(error === null || /permission denied/.test(error.message)).toBe(true);
  });

  it('cannot be written directly, only through register_push_token', async () => {
    const alice = await createTestUser('Alice');
    const insert = await alice.client
      .from('push_tokens')
      .insert({ token: token(), user_id: alice.id, platform: 'ios' });
    expect(insert.error?.message).toContain('permission denied');

    const t = await register(alice);
    const update = await alice.client.from('push_tokens').update({ platform: 'android' }).eq('token', t);
    expect(update.error?.message).toContain('permission denied');
  });

  it('a stranger cannot delete yours; you can', async () => {
    const alice = await createTestUser('Alice');
    const mallory = await createTestUser('Mallory');
    const t = await register(alice);

    await mallory.client.from('push_tokens').delete().eq('token', t);
    expect(await myTokens(alice)).toEqual([t]);
    await alice.client.from('push_tokens').delete().eq('token', t);
    expect(await myTokens(alice)).toEqual([]);
  });

  it('move to whoever signs in on the device next', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const t = await register(alice);
    const { error } = await bob.client.rpc('register_push_token', { p_token: t, p_platform: 'ios' });
    expect(error).toBeNull();

    expect(await myTokens(alice)).toEqual([]);
    expect(await myTokens(bob)).toEqual([t]);
  });

  it('must look like an Expo token', async () => {
    const alice = await createTestUser('Alice');
    for (const bad of ['https://evil.example/hook', 'ExponentPushToken[]', 'ExponentPushToken[a b]']) {
      const { error } = await alice.client.rpc('register_push_token', { p_token: bad, p_platform: 'ios' });
      expect(error?.message).toContain('push_tokens_token_shape');
    }
    const { error } = await alice.client.rpc('register_push_token', {
      p_token: token(),
      p_platform: 'web',
    });
    expect(error).not.toBeNull();
  });

  it('keep at most ten devices per account, dropping the longest-unseen', async () => {
    const alice = await createTestUser('Alice');
    const first = await register(alice);
    for (let i = 0; i < 10; i++) await register(alice);
    const tokens = await myTokens(alice);
    expect(tokens).toHaveLength(10);
    expect(tokens).not.toContain(first);
  });

  it('go with the account', async () => {
    const alice = await createTestUser('Alice');
    const t = await register(alice);
    expect((await alice.client.rpc('delete_my_account')).error).toBeNull();
    const [row] = await sql`select count(*)::int as n from public.push_tokens where token = ${t}`;
    expect(row.n).toBe(0);
  });

  it('pg_net stays out of reach of PostgREST', async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/http_post`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
        'Content-Profile': 'net',
      },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.ok).toBe(false);
    expect(await res.text()).toContain('PGRST106');
  });
});

describe('a connect request', () => {
  it('pushes the recipient, naming the sender and linking to Requests', async () => {
    const alice = await createTestUser('Alice Push');
    const bob = await createTestUser('Bob');
    const bobPhone = await register(bob);
    const alicePhone = await register(alice);

    await sendRequest(alice, bob);
    const push = await nextPush(bobPhone);
    expect(push).toEqual({
      to: bobPhone,
      title: 'New connect request',
      body: 'Alice Push wants to connect.',
      sound: 'default',
      data: { path: '/connections?segment=requests' },
    });
    expect(pushesTo(alicePhone)).toEqual([]);
  });

  it('reaches every device the recipient has', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const phone = await register(bob);
    const tablet = await register(bob);
    await sendRequest(alice, bob);
    await nextPush(phone);
    await nextPush(tablet);
  });

  it('from someone the recipient blocked pushes nothing', async () => {
    const mallory = await createTestUser('Mallory');
    const bob = await createTestUser('Bob');
    const control = await createTestUser('Carol');
    const bobPhone = await register(bob);
    await bob.client.from('blocks').insert({ blocker_id: bob.id, blocked_id: mallory.id });

    await sendRequest(mallory, bob);
    await sendRequest(control, bob);
    expect((await nextPush(bobPhone)).body).toBe('Carol wants to connect.');
    expect(pushesTo(bobPhone)).toHaveLength(1);
  });

  it('to someone the sender blocked pushes nothing', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const control = await createTestUser('Carol');
    const bobPhone = await register(bob);
    await alice.client.from('blocks').insert({ blocker_id: alice.id, blocked_id: bob.id });

    await sendRequest(alice, bob);
    await sendRequest(control, bob);
    expect((await nextPush(bobPhone)).body).toBe('Carol wants to connect.');
    expect(pushesTo(bobPhone)).toHaveLength(1);
  });

  it('re-sent after a decline does not ring again within a day', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const control = await createTestUser('Carol');
    const bobPhone = await register(bob);

    await sendRequest(alice, bob);
    await nextPush(bobPhone);
    const id = await pendingRequestId(alice, bob);
    expect((await bob.client.rpc('decline_connect_request', { p_request_id: id })).error).toBeNull();
    await sendRequest(alice, bob);
    await sendRequest(control, bob);

    expect((await nextPush(bobPhone, 1)).body).toBe('Carol wants to connect.');
    expect(pushesTo(bobPhone).map((m) => m.body)).toEqual([
      'Alice wants to connect.',
      'Carol wants to connect.',
    ]);
  });

  it('to someone with no devices sends nothing, and turning pushes off is deleting the token', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const control = await createTestUser('Carol');
    const old = await register(bob);
    await bob.client.from('push_tokens').delete().eq('token', old);

    await sendRequest(alice, bob);
    const fresh = await register(bob);
    await sendRequest(control, bob);
    expect((await nextPush(fresh)).body).toBe('Carol wants to connect.');
    expect(pushesTo(old)).toEqual([]);
  });
});

describe('an accepted request', () => {
  it('pushes the requester, naming the person who accepted', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob Accepts');
    const alicePhone = await register(alice);

    await connectUsers(alice, bob);
    expect(await nextPush(alicePhone)).toEqual({
      to: alicePhone,
      title: 'Request accepted',
      body: 'Bob Accepts accepted your connect request.',
      sound: 'default',
      data: { path: '/connections' },
    });
  });
});

describe('a gathering join', () => {
  it('pushes the host a count, never a name, linking to the gathering', async () => {
    const host = await createTestUser('Host');
    const stranger = await createTestUser('Stranger Danger');
    const hostPhone = await register(host);
    const id = await createGathering(host, 'Rooftop listening session');

    await join(stranger, id);
    const push = await nextPush(hostPhone);
    expect(push).toEqual({
      to: hostPhone,
      title: 'Rooftop listening session',
      body: '1 person joined.',
      sound: 'default',
      data: { path: `/gathering/${id}` },
    });
  });

  it('does not push the host for their own membership', async () => {
    const host = await createTestUser('Host');
    const joiner = await createTestUser('Joiner');
    const hostPhone = await register(host);
    const id = await createGathering(host, 'Mine');
    await join(joiner, id);
    await nextPush(hostPhone);
    expect(pushesTo(hostPhone)).toHaveLength(1);
  });

  it('collapses a burst into one push, and carries the held joins into the next', async () => {
    const host = await createTestUser('Host');
    const hostPhone = await register(host);
    const id = await createGathering(host, 'Busy night');
    const joiners = await Promise.all(['A', 'B', 'C'].map((n) => createTestUser(n)));

    await join(joiners[0]!, id);
    await join(joiners[1]!, id);
    await join(joiners[2]!, id);
    expect((await nextPush(hostPhone)).body).toBe('1 person joined.');

    // The window passes (moved back rather than waited out).
    await sql`
      update private.push_throttle set last_sent_at = now() - interval '16 minutes'
       where recipient_id = ${host.id} and subject_id = ${id}`;
    await join(await createTestUser('D'), id);
    expect((await nextPush(hostPhone, 1)).body).toBe('3 people joined.');
    expect(pushesTo(hostPhone)).toHaveLength(2);
  });
});

describe("Expo's answers", () => {
  it('DeviceNotRegistered deletes that token and keeps the live one', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const dead = await register(bob, 'Dead');
    const live = await register(bob);

    await sendRequest(alice, bob);
    await nextPush(dead);
    await nextPush(live);

    // Expo's answer is read on the next send, by anyone, to anyone, once
    // pg_net has stored it.
    for (let i = 0; i < 100; i++) {
      const [row] = await sql`
        select exists (
          select 1 from private.push_batches b join net._http_response r on r.id = b.request_id
           where ${dead} = any (b.tokens)
        ) as answered`;
      if (row.answered) break;
      await Bun.sleep(50);
    }
    expect(await myTokens(bob)).toContain(dead);
    const carol = await createTestUser('Carol');
    const dave = await createTestUser('Dave');
    const davePhone = await register(dave);
    await sendRequest(carol, dave);
    await nextPush(davePhone);

    expect(await myTokens(bob)).toEqual([live]);
  });

  it('tokens not refreshed in 30 days are dropped instead of sent to', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const stale = await register(bob);
    const fresh = await register(bob);
    await sql`update public.push_tokens set last_seen_at = now() - interval '31 days' where token = ${stale}`;

    await sendRequest(alice, bob);
    await nextPush(fresh);
    expect(pushesTo(stale)).toEqual([]);
    expect(await myTokens(bob)).toEqual([fresh]);
  });
});
