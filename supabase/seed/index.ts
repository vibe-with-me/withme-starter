// Demo seed: two users, three tags (unclaimed / claimed / disabled), one
// pending connect request, two gatherings — enough to walk the full handshake
// locally. Locally, also an operator account that can open /admin.
// Idempotent: re-running resets the demo users and tags. `bun run db:unseed`
// removes them.
import './local-env.ts';
import { TERMS_VERSION } from '@withme/contract';
import { admin, anonClient, makeOperator } from '@withme/db/test-utils';
import { DEMO_TAGS as TAGS, DEMO_USERS, findDemoUsers } from './demo.ts';

// This seed DELETES the demo users and tags it owns. Refuse anything that
// isn't the local stack unless explicitly overridden.
const seedTarget = new URL(process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321');
if (
  !['127.0.0.1', 'localhost'].includes(seedTarget.hostname) &&
  process.env.SEED_ALLOW_REMOTE !== '1'
) {
  console.error(
    `Refusing to seed non-local Supabase at ${seedTarget.origin}. Set SEED_ALLOW_REMOTE=1 to override.`,
  );
  process.exit(1);
}

// The local password is public (README, .env.example). A hosted project gets
// its own: anyone holding a demo login can accept requests sent to that
// account and read the senders' links, so a published password must never
// be one that every fork shares.
const LOCAL_DEMO_PASSWORD = 'withme-demo-1';
const remote = !['127.0.0.1', 'localhost'].includes(seedTarget.hostname);
const DEMO_PASSWORD = remote ? (process.env.SEED_DEMO_PASSWORD ?? '') : LOCAL_DEMO_PASSWORD;
if (remote && (DEMO_PASSWORD === LOCAL_DEMO_PASSWORD || DEMO_PASSWORD.length < 16)) {
  console.error(
    'Refusing to seed a hosted project without SEED_DEMO_PASSWORD (16+ characters, not the ' +
      'local default). go-live writes one to the keys file.',
  );
  process.exit(1);
}

async function resetDemoUser(email: string): Promise<void> {
  const existing = (await findDemoUsers(admin)).find((user) => user.email === email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
}

async function createDemoUser(email: string, displayName: string, bio: string) {
  await resetDemoUser(email);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });
  if (signInError) throw signInError;
  const { error: profileError } = await client
    .from('profiles')
    .insert({ id: data.user.id, display_name: displayName, bio, terms_version: TERMS_VERSION });
  if (profileError) throw profileError;
  return { id: data.user.id, email, client };
}

console.log('Seeding demo data…');

const ada = await createDemoUser(DEMO_USERS.ada, 'Ada', 'Brings the good playlists.');
const lin = await createDemoUser(DEMO_USERS.lin, 'Lin', 'Will trade book recs.');

// Ada's links: what Lin will see once Ada accepts (Profile → Links). Her
// tag's card lists the platforms, locked.
const { error: linksError } = await ada.client.rpc('set_my_links', {
  p_links: [
    { platform: 'instagram', value: 'ada.plays' },
    { platform: 'tiktok', value: 'ada.plays' },
    { platform: 'x', value: 'ada_plays' },
    { platform: 'youtube', value: 'adaplays' },
    { platform: 'email', value: 'ada@demo.withme.local' },
    { platform: 'website', value: 'https://ada.example' },
  ],
});
if (linksError) throw linksError;

// Tags: recreate from scratch (cascades clear old scans).
await admin.from('tags').delete().in('uid', Object.values(TAGS));
const { error: tagError } = await admin
  .from('tags')
  .insert(Object.values(TAGS).map((uid) => ({ uid })));
if (tagError) throw tagError;

// Ada claims two tags through the real RPC, then disables one herself.
for (const uid of [TAGS.claimed, TAGS.disabled]) {
  const { error } = await ada.client.rpc('claim_tag', { p_uid: uid });
  if (error) throw error;
}
const { error: disableError } = await ada.client
  .from('tags')
  .update({ status: 'disabled' })
  .eq('uid', TAGS.disabled);
if (disableError) throw disableError;

// A couple of scans on the live tag.
for (const ua of ['Seed/iPhone Mobile Safari', 'Seed/Android Chrome Mobile']) {
  const { error: scanError } = await anonClient().rpc('log_scan', {
    p_uid: TAGS.claimed,
    p_user_agent: ua,
  });
  if (scanError) throw scanError;
}

// Lin has tapped Ada's tag and asked to connect.
const { error: requestError } = await lin.client.rpc('send_connect_request', {
  p_recipient: ada.id,
});
if (requestError) throw requestError;

// Ada hosts a gathering and Lin has joined. Ada's live tag keeps the
// profile destination claim_tag gave it: a tap on 04BBBBBBBBBBBB shows her
// card with Connect.
const startsAt = new Date();
startsAt.setDate(startsAt.getDate() + 2);
startsAt.setHours(19, 0, 0, 0);
const { data: gathering, error: gatheringError } = await ada.client.rpc('create_gathering', {
  p_title: 'Rooftop listening session',
  p_starts_at: startsAt.toISOString(),
  p_location: 'The roof, 14 Loom St',
});
if (gatheringError) throw gatheringError;
const gatheringId = (gathering as { id: string }).id;
const { error: joinError } = await lin.client.rpc('join_gathering', {
  p_gathering_id: gatheringId,
});
if (joinError) throw joinError;

// Lin hosts one too, which Ada has not joined: her Events tab shows the
// domain's feed working, not just her own calendar.
const linStartsAt = new Date();
linStartsAt.setDate(linStartsAt.getDate() + 5);
linStartsAt.setHours(14, 0, 0, 0);
const { error: linGatheringError } = await lin.client.rpc('create_gathering', {
  p_title: 'Vinyl swap in the park',
  p_starts_at: linStartsAt.toISOString(),
  p_location: 'The bandstand, Loom Park',
  // a capacity, so the feed shows "1 of 12 going"
  p_capacity: 12,
});
if (linGatheringError) throw linGatheringError;

// An operator, locally only: anyone holding a hosted project's demo login
// would read every report. A hosted project makes its operators in the SQL
// Editor (docs/moderation.md).
if (!remote) {
  const operator = await createDemoUser(DEMO_USERS.operator, 'Sam', 'Runs this community.');
  await makeOperator(operator.id);
} else {
  await resetDemoUser(DEMO_USERS.operator);
}

console.log(`
Seeded.
  Users     ${DEMO_USERS.ada} / ${DEMO_PASSWORD}   (has 1 pending request from Lin; hosts a gathering Lin joined; six links)
            ${DEMO_USERS.lin} / ${DEMO_PASSWORD}   (hosts a second gathering, listed to the domain)${
              remote
                ? ''
                : `\n            ${DEMO_USERS.operator} / ${DEMO_PASSWORD}   (an operator: opens /admin)`
            }
  Tags      /t/${TAGS.claimed}  -> Ada's card, her links locked behind Connect
            /t/${TAGS.unclaimed}  -> claim flow
            /t/${TAGS.disabled}  -> inactive
`);
