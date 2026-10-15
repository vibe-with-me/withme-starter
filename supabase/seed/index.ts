// Demo seed: two users, three tags (unclaimed / claimed / disabled), one
// pending connect request, one gathering — enough to walk the full handshake
// locally.
// Idempotent: re-running resets the demo users and tags. Local stack only.
import './local-env.ts';
import { admin, anonClient } from '@withme/db/test-utils';

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

const DEMO_PASSWORD = 'withme-demo-1';
const TAGS = {
  unclaimed: '04AAAAAAAAAAAA',
  claimed: '04BBBBBBBBBBBB',
  disabled: '04CCCCCCCCCCCC',
} as const;

async function resetDemoUser(email: string): Promise<void> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = data.users.find((user) => user.email === email);
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
    .insert({ id: data.user.id, display_name: displayName, bio });
  if (profileError) throw profileError;
  return { id: data.user.id, email, client };
}

console.log('Seeding demo data…');

const ada = await createDemoUser('ada@demo.withme.local', 'Ada', 'Brings the good playlists.');
const lin = await createDemoUser('lin@demo.withme.local', 'Lin', 'Will trade book recs.');

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

// Ada hosts a gathering, Lin has joined, and Ada's live tag points at it:
// a tap on 04BBBBBBBBBBBB shows her card as the invitation.
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
const { error: joinError } = await lin.client.rpc('join_gathering', { p_gathering_id: gatheringId });
if (joinError) throw joinError;
// The owner's column-granted update — the same path app.tags.update takes.
const { error: pointError } = await ada.client
  .from('tags')
  .update({ destination: { type: 'gathering', gathering_id: gatheringId } })
  .eq('uid', TAGS.claimed);
if (pointError) throw pointError;

console.log(`
Seeded.
  Users     ada@demo.withme.local / ${DEMO_PASSWORD}   (has 1 pending request from Lin; hosts a gathering Lin joined)
            lin@demo.withme.local / ${DEMO_PASSWORD}
  Tags      /t/${TAGS.claimed}  -> Ada's card, inviting you to her gathering
            /t/${TAGS.unclaimed}  -> claim flow
            /t/${TAGS.disabled}  -> inactive
`);
