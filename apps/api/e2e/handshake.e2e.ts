// End-to-end exercise of the public surface through the real stack:
// built SDK client -> API Worker (wrangler dev) -> Supabase local (RLS).
// Run: bun run db:start, then `bun run dev` here, then `bun run e2e`.
import { NfcClient } from '@vibewithme/nfc/client';
import { admin, createTestUser, provisionTag } from '@withme/db/test-utils';

const API_URL = process.env.API_URL ?? 'http://localhost:8786';

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`ok: ${label}`);
}

const health = await fetch(`${API_URL}/health`).then((r) => r.json() as Promise<{ ok: boolean }>);
assert(health.ok, 'api worker is up');

const anon = new NfcClient({ baseUrl: API_URL });
const uid = await provisionTag();

// 1. resolve an unclaimed tag, anonymously, with messy input casing
const unclaimed = await anon.resolve(uid.toLowerCase());
assert(unclaimed.status === 'unclaimed', `resolve unclaimed (got ${unclaimed.status})`);

// 2. claim it as an authed user through the SDK
const alice = await createTestUser('E2E Alice');
const { data: session } = await alice.client.auth.getSession();
const authed = new NfcClient({
  baseUrl: API_URL,
  getAuthToken: () => session.session?.access_token ?? null,
});
const claimed = await authed.claim(uid);
assert(claimed.tag.status === 'claimed', 'claim succeeds for authed user');

// 3. anonymous resolve now returns the card
const resolved = await anon.resolve(uid);
assert(resolved.status === 'claimed', 'resolve after claim');
assert(
  resolved.status === 'claimed' && resolved.profile.display_name === 'E2E Alice',
  'resolved card carries the profile',
);

// 4. claim without auth is rejected
const unauthedClaim = await anon.claim(await provisionTag()).then(
  () => 'succeeded',
  (e: { code?: string }) => e.code ?? 'error',
);
assert(unauthedClaim === 'UNAUTHORIZED', `anon claim rejected (got ${unauthedClaim})`);

// 5. double claim maps to CONFLICT
const doubleClaim = await authed.claim(uid).then(
  () => 'succeeded',
  (e: { code?: string }) => e.code ?? 'error',
);
assert(doubleClaim === 'CONFLICT', `double claim is CONFLICT (got ${doubleClaim})`);

// 6. scan logging works and stores exactly the privacy-safe columns
await anon.logScan(uid, 'e2e-agent');
const { data: scans } = await admin.from('tag_scans').select('*').eq('tag_uid', uid);
assert(scans?.length === 1, 'scan stored');
assert(scans?.[0]?.user_agent === 'e2e-agent', 'scan carries user agent');

// 7. the per-UID rate limiter trips
let limited = false;
for (let i = 0; i < 35 && !limited; i++) {
  limited = await anon.logScan(uid).then(
    () => false,
    (e: { code?: string }) => e.code === 'TOO_MANY_REQUESTS',
  );
}
assert(limited, 'per-uid scan rate limiter trips');

// === app router: the social loop through the API ===
const { createORPCClient } = await import('@orpc/client');
const { RPCLink } = await import('@orpc/client/fetch');
const { contract } = await import('@withme/contract');
type AppClient = import('@orpc/contract').ContractRouterClient<typeof contract>['app'];

function appClientFor(token: string): AppClient {
  const link = new RPCLink({
    url: `${API_URL}/rpc/app`,
    headers: () => ({ authorization: `Bearer ${token}` }),
  });
  return createORPCClient(link);
}

const bob = await createTestUser('E2E Bob');
const { data: bobSession } = await bob.client.auth.getSession();
const bobApp = appClientFor(bobSession.session?.access_token ?? '');
const aliceApp = appClientFor(session.session?.access_token ?? '');

// 8a. every app.* procedure refuses an anonymous caller, before its handler runs
const anonApp: AppClient = createORPCClient(new RPCLink({ url: `${API_URL}/rpc/app` }));
for (const [label, call] of [
  ['profile.get', () => anonApp.profile.get()],
  ['gatherings.list', () => anonApp.gatherings.list()],
  ['requests.send', () => anonApp.requests.send({ recipient_id: alice.id })],
  ['links.replace', () => anonApp.links.replace({ links: [] })],
] as const) {
  const code = await call().then(
    () => 'succeeded',
    (e: { code?: string }) => e.code ?? 'error',
  );
  assert(code === 'UNAUTHORIZED', `anon app.${label} rejected (got ${code})`);
}

// 8. profile get/update round-trip
const me = await bobApp.profile.get();
assert(me.profile?.display_name === 'E2E Bob', 'profile.get returns own profile');
const updated = await bobApp.profile.update({ bio: 'taps tags' });
assert(updated.profile.bio === 'taps tags', 'profile.update patches bio');

// 9. consent flow: bob -> alice, alice accepts
await bobApp.requests.send({ recipient_id: alice.id });
const inbox = await aliceApp.requests.listPending();
assert(inbox.requests.length === 1, 'pending request lands in inbox');
assert(inbox.requests[0]?.requester.display_name === 'E2E Bob', 'inbox carries requester card');

const accepted = await aliceApp.requests.accept({ id: inbox.requests[0]!.id });
assert(accepted.connection.profile.display_name === 'E2E Bob', 'accept returns the connection');

const aliceConns = await aliceApp.connections.list();
const bobConns = await bobApp.connections.list();
assert(aliceConns.connections.length === 1, 'alice sees the connection');
assert(bobConns.connections[0]?.profile.display_name === 'E2E Alice', 'bob sees alice card');

// 10. block: connection vanishes, future sends silently drop, resolve goes dark
await aliceApp.blocks.block({ user_id: bob.id });
assert((await aliceApp.connections.list()).connections.length === 0, 'block removed connection');

await bobApp.requests.send({ recipient_id: alice.id }); // silent drop — must not throw
assert(
  (await aliceApp.requests.listPending()).requests.length === 0,
  'blocked send is silently dropped',
);

const bobView = await new NfcClient({
  baseUrl: API_URL,
  getAuthToken: () => bobSession.session?.access_token ?? null,
}).resolve(uid);
assert(bobView.status === 'disabled', 'blocked viewer resolves the tag as disabled');

const blockList = await aliceApp.blocks.list();
assert(blockList.blocks[0]?.user.display_name === 'E2E Bob', 'block list carries the card');

// 11. unblock + unknown-id block is a silent ack (no probe oracle)
await aliceApp.blocks.unblock({ user_id: bob.id });
assert((await aliceApp.blocks.list()).blocks.length === 0, 'unblock empties the list');
await aliceApp.blocks.block({ user_id: crypto.randomUUID() });
assert(true, 'blocking an unknown id acks silently');

// === gatherings: tap-to-join through the API ===

// 12. create a gathering, point a tag at it, resolve anonymously
const created = await aliceApp.gatherings.create({
  title: 'E2E Rooftop',
  starts_at: new Date(Date.now() + 86_400_000).toISOString(),
  location: 'The roof',
});
assert(created.gathering.title === 'E2E Rooftop', 'gathering created');
assert(created.gathering.host_id === alice.id, 'creator is the host');

const gatheringUid = await provisionTag();
await authed.claim(gatheringUid, { type: 'gathering', gathering_id: created.gathering.id });
const gatheringResolved = await anon.resolve(gatheringUid);
assert(
  gatheringResolved.status === 'claimed' &&
    gatheringResolved.destination.type === 'gathering' &&
    gatheringResolved.gathering?.title === 'E2E Rooftop' &&
    gatheringResolved.gathering.location === 'The roof',
  'gathering tag resolves with the summary',
);
const plainResolved = await anon.resolve(uid);
assert(
  plainResolved.status === 'claimed' && plainResolved.gathering === null,
  'a profile tag carries gathering: null',
);

// 13. the gathering is listed to the domain before bob joins; after joining,
// who's going is connections-only, so each sees their own row until the
// pair connects
const feed = await bobApp.gatherings.list();
const listed = feed.gatherings.find((g) => g.id === created.gathering.id);
assert(listed !== undefined, 'a stranger sees the gathering in the feed');
assert(listed.member_count === 1 && !listed.is_member, 'the feed carries the headcount');
assert(listed.members.length === 0, 'the feed reveals no stranger (not even the host)');
const strangerDetail = await bobApp.gatherings.get({ id: created.gathering.id });
assert(strangerDetail.members.length === 0, 'a stranger reads the detail with no member rows');

await bobApp.gatherings.join({ id: created.gathering.id });
const detail = await bobApp.gatherings.get({ id: created.gathering.id });
assert(detail.member_count === 2, 'join raises the headcount');
assert(
  detail.members.length === 1 && detail.members[0]?.profile.display_name === 'E2E Bob',
  'a joiner sees only their own row',
);
const hostDetail = await aliceApp.gatherings.get({ id: created.gathering.id });
assert(
  hostDetail.members.length === 1 && hostDetail.members[0]?.profile.display_name === 'E2E Alice',
  'the host sees only their own row too',
);
const mine = await bobApp.gatherings.listMine();
assert(
  mine.gatherings.some((g) => g.id === created.gathering.id && g.is_member),
  'joined gathering shows in listMine',
);

// connecting is what reveals who is going
await bobApp.requests.send({ recipient_id: alice.id });
const inboxAgain = await aliceApp.requests.listPending();
await aliceApp.requests.accept({ id: inboxAgain.requests[0]!.id });
const connectedDetail = await bobApp.gatherings.get({ id: created.gathering.id });
assert(
  connectedDetail.members.some((m) => m.profile.display_name === 'E2E Alice'),
  'once connected, the host appears in who is going',
);

// 14. only the host edits; a member's edit reads as not found
const edited = await aliceApp.gatherings.update({
  id: created.gathering.id,
  title: 'E2E Rooftop (moved)',
});
assert(edited.gathering.title === 'E2E Rooftop (moved)', 'host edits the gathering');
const bobEdit = await bobApp.gatherings
  .update({ id: created.gathering.id, title: 'Hijacked' })
  .then(
    () => 'edited',
    (e: { code?: string }) => e.code ?? 'error',
  );
assert(bobEdit === 'NOT_FOUND', `a member cannot edit (got ${bobEdit})`);

// 15. my tags: list, re-point (destination only), stranger denied
const myTags = await aliceApp.tags.listMine();
assert(myTags.tags.some((t) => t.uid === gatheringUid), 'tags.listMine carries the pointed tag');
await aliceApp.tags.update({ uid: gatheringUid, destination: { type: 'profile' } });
const repointed = await anon.resolve(gatheringUid);
assert(
  repointed.status === 'claimed' &&
    repointed.destination.type === 'profile' &&
    repointed.gathering === null,
  'tags.update re-points the tag; the summary is gone',
);
const bobRepoint = await bobApp.tags
  .update({ uid: gatheringUid, destination: { type: 'profile' } })
  .then(
    () => 'updated',
    (e: { code?: string }) => e.code ?? 'error',
  );
assert(bobRepoint === 'NOT_FOUND', `a stranger cannot re-point another's tag (got ${bobRepoint})`);

// 16. leaving removes the membership, not the listing; a block does both
await bobApp.gatherings.leave({ id: created.gathering.id });
const left = await bobApp.gatherings.get({ id: created.gathering.id });
assert(left.member_count === 1, 'leaving lowers the headcount');
assert(
  !(await bobApp.gatherings.listMine()).gatherings.some((g) => g.id === created.gathering.id),
  'a left gathering drops out of listMine',
);
assert(
  (await bobApp.gatherings.list()).gatherings.some((g) => g.id === created.gathering.id),
  'a left gathering stays in the feed',
);
await aliceApp.blocks.block({ user_id: bob.id });
const gone = await bobApp.gatherings.get({ id: created.gathering.id }).then(
  () => 'visible',
  (e: { code?: string }) => e.code ?? 'error',
);
assert(gone === 'NOT_FOUND', `a blocked viewer reads the gathering as not found (got ${gone})`);
assert(
  !(await bobApp.gatherings.list()).gatherings.some((g) => g.id === created.gathering.id),
  'a blocked viewer does not see it in the feed',
);
await aliceApp.blocks.unblock({ user_id: bob.id });

// 17. the host deletes; the gathering is gone for everyone, and a tag that
// pointed at it degrades to the profile card
const doomed = await aliceApp.gatherings.create({
  title: 'E2E Doomed',
  starts_at: new Date(Date.now() + 86_400_000).toISOString(),
});
await aliceApp.tags.update({
  uid: gatheringUid,
  destination: { type: 'gathering', gathering_id: doomed.gathering.id },
});
await aliceApp.gatherings.remove({ id: doomed.gathering.id });
const removed = await aliceApp.gatherings.get({ id: doomed.gathering.id }).then(
  () => 'visible',
  (e: { code?: string }) => e.code ?? 'error',
);
assert(removed === 'NOT_FOUND', `a deleted gathering reads as not found (got ${removed})`);
const degraded = await anon.resolve(gatheringUid);
assert(
  degraded.status === 'claimed' &&
    degraded.destination.type === 'profile' &&
    degraded.gathering === null,
  'a tag pointed at a deleted gathering degrades to the profile card',
);

// === profile: the photo, my tags' status, account deletion ===
const { AVATAR_MAX_BYTES, avatarPublicUrl } = await import('@withme/contract');
const { AVATAR_BODY_LIMIT } = await import('../src/middleware/avatar-body-limit.ts');
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const codeOf = (e: { code?: string }) => e.code ?? 'error';
// Leading bytes only: the API sniffs magic numbers; Storage never decodes.
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// 18. upload: stored under the caller's folder, public by path, carried by the card
const uploaded = await aliceApp.profile.uploadAvatar({
  file: new File([jpegBytes], 'me.jpg', { type: 'image/jpeg' }),
});
const firstPath = uploaded.profile.avatar_path;
assert(
  firstPath !== null && new RegExp(`^${alice.id}/[0-9a-f-]{36}\\.jpg$`).test(firstPath),
  `the photo is stored under the caller's folder (got ${firstPath})`,
);
const served = await fetch(avatarPublicUrl(SUPABASE_URL, firstPath!));
assert(
  served.ok && new Uint8Array(await served.arrayBuffer()).length === jpegBytes.length,
  'the photo is publicly readable by its path',
);
const withAvatar = await anon.resolve(uid);
assert(
  withAvatar.status === 'claimed' && withAvatar.profile.avatar_path === firstPath,
  'the resolved card carries avatar_path',
);
const replaced = await aliceApp.profile.uploadAvatar({
  file: new File([webpBytes], 'me.webp', { type: 'image/webp' }),
});
assert(replaced.profile.avatar_path?.endsWith('.webp') === true, 'a WebP replaces the photo');
assert(!(await fetch(avatarPublicUrl(SUPABASE_URL, firstPath!))).ok, 'the replaced file is deleted');
const png = await aliceApp.profile
  .uploadAvatar({ file: new File([pngBytes], 'me.png', { type: 'image/png' }) })
  .then(() => 'stored', codeOf);
assert(png === 'BAD_REQUEST', `a PNG is refused (got ${png})`);
const huge = await aliceApp.profile
  .uploadAvatar({
    file: new File([new Uint8Array(AVATAR_MAX_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' }),
  })
  .then(() => 'stored', codeOf);
assert(huge === 'BAD_REQUEST', `an oversized file is refused (got ${huge})`);
// Past the cap plus the framing slack, bodyLimit refuses by the declared Content-Length, before reading.
const tooLarge = await fetch(`${API_URL}/rpc/app/profile/uploadAvatar`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${session.session?.access_token ?? ''}`,
    'content-type': 'multipart/form-data; boundary=e2e',
  },
  body: new Uint8Array(AVATAR_MAX_BYTES + 65_537),
});
assert(tooLarge.status === 413, `an oversized declared length is a 413 before the body is read (got ${tooLarge.status})`);
// A stream body goes out with Transfer-Encoding: chunked and no Content-Length (as React Native may
// send), so bodyLimit has nothing declared to judge and counts the streamed bytes instead. One byte
// past the limit, so the count trips on the last chunk: under wrangler dev, chunks left unread when
// the 413 goes out wreck the next request on the dev server.
const chunkedSize = AVATAR_BODY_LIMIT + 1;
let streamed = 0;
const tooLargeChunked = await fetch(`${API_URL}/rpc/app/profile/uploadAvatar`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${session.session?.access_token ?? ''}`,
    'content-type': 'multipart/form-data; boundary=e2e',
  },
  body: new ReadableStream<Uint8Array>({
    pull(controller) {
      if (streamed === chunkedSize) return controller.close();
      const size = Math.min(65_536, chunkedSize - streamed);
      streamed += size;
      controller.enqueue(new Uint8Array(size));
    },
  }),
  duplex: 'half',
}).then((r) => r.status, codeOf);
assert(
  tooLargeChunked === 413,
  `an oversized chunked body is a 413 once the count passes the limit (got ${tooLargeChunked})`,
);
const secondPath = replaced.profile.avatar_path!;
const cleared = await aliceApp.profile.removeAvatar();
assert(
  cleared.profile.avatar_path === null &&
    !(await fetch(avatarPublicUrl(SUPABASE_URL, secondPath))).ok,
  'removing the photo clears the path and deletes the file',
);

// 19. my tags: off and back on through the same update
await aliceApp.tags.update({ uid: gatheringUid, status: 'disabled' });
assert((await anon.resolve(gatheringUid)).status === 'disabled', 'tags.update turns a tag off');
const backOn = await aliceApp.tags.update({ uid: gatheringUid, status: 'claimed' });
assert(
  backOn.tag.status === 'claimed' && (await anon.resolve(gatheringUid)).status === 'claimed',
  'and back on',
);
const release = await aliceApp.tags
  .update({ uid: gatheringUid, status: 'unclaimed' as 'claimed' })
  .then(() => 'updated', codeOf);
assert(release === 'BAD_REQUEST', `an owner cannot release a tag (got ${release})`);

// 20. account deletion: pointer cleared, files swept (Storage API, own JWT), then the definer RPC
const carol = await createTestUser('E2E Carol');
const { data: carolSession } = await carol.client.auth.getSession();
const carolToken = carolSession.session?.access_token ?? '';
const carolApp = appClientFor(carolToken);
const carolUid = await provisionTag();
await new NfcClient({ baseUrl: API_URL, getAuthToken: () => carolToken }).claim(carolUid);
const carolPhoto = (
  await carolApp.profile.uploadAvatar({ file: new File([jpegBytes], 'c.jpg', { type: 'image/jpeg' }) })
).profile.avatar_path!;
await carolApp.requests.send({ recipient_id: bob.id });
assert(
  (await bobApp.requests.listPending()).requests.some((r) => r.requester.id === carol.id),
  "carol's request reaches bob",
);
const deleted = await carolApp.profile.deleteAccount();
assert(deleted.ok, 'deleteAccount acks');
const released = await anon.resolve(carolUid);
assert(released.status === 'unclaimed', `her tag is released (got ${released.status})`);
assert(!(await fetch(avatarPublicUrl(SUPABASE_URL, carolPhoto))).ok, 'her photo file is gone');
assert(
  !(await bobApp.requests.listPending()).requests.some((r) => r.requester.id === carol.id),
  'her pending request is gone',
);
assert((await carolApp.profile.get()).profile === null, 'her still-valid token reads no profile');

console.log('\nhandshake e2e: all checks passed');
