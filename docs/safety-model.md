# The safety model

The starter makes a handful of promises to the people who use a fork.
This page explains each one in plain terms, says where it is enforced,
and names the test that fails if it regresses. Every promise is enforced
in the database (row-level security and security-definer functions), not
in the apps, so a fork cannot break one by changing a screen.

If you only remember one thing: **the tests are the spec.** When a skill
says "the twenty-one existing tests pass untouched; if one does not, you
moved a safety mechanism", this is what it means.

## Nobody can list your users

**The promise.** There is no way to see a person you have not met. A card
is reachable by tapping their tag (knowing the unguessable UID is the
capability) or through a connection or a live incoming request. Sharing a
gathering reveals nothing.

**How.** `profiles` has no anonymous select policy at all. `resolve_tag`
is the only anonymous read, and it answers for one UID at a time. There
is no search endpoint, no directory, no sequential id anywhere; UIDs are
48 random bits. Error responses are shaped so they cannot be used as an
oracle: an unknown UID and an unclaimed UID both resolve as `unclaimed`;
`claim_tag` answers an unknown, a claimed and a disabled UID alike; and
the rate limiters account attempts in private ledgers so their responses
do not reveal whether a row exists. Those ledgers live inside the RPCs
(`send_connect_request`, `claim_tag`, `create_gathering`), because the
publishable key reaches PostgREST directly: the API Worker's per-IP and
per-tag limits only see calls that go through it, so they are advisory,
never the boundary.

**The test.** `packages/db/test/enumeration.test.ts`.

**What this means for a fork.** Never add a browse, search, "nearby", or
"members of" surface that reaches past the viewer's own relationships.
That includes indirect oracles: a foreign-key error, a distinguishable
error code, a count. `provision-tags` keeps provisioning as an operator
script on the service-role key for the same reason: a "list unclaimed
tags" endpoint would be an enumeration surface for exactly the rows that
can be stolen.

## Blocks are absolute and invisible

**The promise.** When you block someone, they cannot see your card,
cannot connect, cannot join your gatherings, and receive no signal that
any of this is happening. What they see is exactly what a stranger sees.

**How.** `private.is_blocked()` is checked inside policies and RPCs,
never in UI. A blocked viewer's `resolve_tag` returns `disabled`, the
same answer as a tag the owner turned off. A connect request from a
blocked sender returns the same bare `{ ok: true }` as one that was
stored; it is simply never written. `join_gathering` raises the same
`'gathering not found'` for a blocked joiner as for an id that does not
exist. Creating a block evicts the pair from gatherings they share.

Blocking is not a way to see someone. The blocker keeps the blocked card
in their block list only when the block row's `reveals_card` is true, and
the `blocks_insert` policy allows that only if the blocker could already
see the card at that moment (`private.sees_card`, the same rule
`profiles_select` uses). Blocking a stranger, such as a gathering host
whose id the feed lists, blocks them and reveals nothing.

**The test.** `packages/db/test/blocks.test.ts`, plus the blocked-viewer
assertions in `apps/api/e2e/handshake.e2e.ts`.

**What this means for a fork.** Every new read or write path must answer
one question: what does the blocked party see? The answer has to be:
exactly what a stranger sees, in the same shape, with the same timing.

## Connections are mutual

**The promise.** A connection exists only when one person asked and the
other accepted. Requests expire after seven days. Either person can
remove a connection, and the other is not notified.

**How.** `send_connect_request` and `accept_connect_request` are
security-definer functions that take a pair lock (`private.lock_pair`)
so two simultaneous requests cannot race into a duplicate. Connections
are a single row per pair.

**The test.** `packages/db/test/requests.test.ts`.

## Gatherings are listed; who's going is connections-only

**The promise.** Everyone signed in to your domain sees every gathering —
title, time, place, a headcount — so people know where their scene is
congregating. Who is going is another matter: you see yourself and the
people you have connected with, and nobody else. Joining tells the people
you already know; it shows a stranger nothing, not even the host's name.
A gathering hidden by a block looks like one that does not exist, with no
headcount either.

**How.** `gatherings_select` admits every signed-in user of the tenant,
minus a block in either direction with the host. `gathering_members_select`
admits the viewer's own row and their accepted connections' rows, on a
gathering the viewer can see — the host gets the same view as everyone.
The headcount is `public.gathering_member_counts`, a security-definer
function whose `where` restates the gathering's visibility. There is no
card bridge: `profiles_select` admits only you, your connections, the
sender of a live request to you, and cards you could already see when you
blocked them, so co-membership never reveals a card. A listed gathering does expose its
host's id; that id is not a card, and what it allows is one consent-gated
connect request. A host cannot leave their own gathering; deleting it is
how they leave.

**The test.** `packages/db/test/gatherings.test.ts` (twenty-one cases).

**Both directions.** `join_gathering` refuses a joiner the host has
blocked and a joiner who has blocked the host, with the same "gathering
not found" as for a missing id: a gathering you cannot see is one you
cannot join, in either direction.

## Two tiers of profile data

**The promise.** A field on your card is visible to anyone who taps your
tag. A field in the connections tier is visible only to you and the
people you accepted, and never to someone who blocked you or whom you
blocked.

**How.** RLS decides rows, not columns, so every viewer the
`profiles_select` policy admits reads every column of the row. That is
why a connections-tier field is never a column on `profiles`: the
recipient of your pending request and someone who blocked you would both
read it. Instead it lives in a sibling table with
its own narrower policy. The starter ships one: `profile_links` (Profile →
Links, the places you can be reached), readable by you and your accepted
connections with no block in either direction. `extend-profile` builds a
second one, `profile_details`, and explains the mistake it prevents,
because a real build made that mistake first.

**The test.** `packages/db/test/links.test.ts`, and
`profile-fields.test.ts` once a fork runs `extend-profile`.

## Scans are privacy-default

**The promise.** A tap records a user-agent string and a timestamp.
Nothing else.

**How.** The `tag_scans` table has no columns for location, IP, or
device identifiers. The API uses the caller's IP as a rate-limit key only
and never stores it. There is no analytics or telemetry in the starter;
that stance is part of its identity, and the roadmap records the
decision to skip an analytics skill permanently.

**The test.** The columns do not exist; `tags.test.ts` covers the write
path.

## Photos cannot point off-site

**The promise.** A profile photo is always a file in your own Storage
bucket. A profile can never carry a URL to somewhere else.

**How.** `profiles.avatar_path` stores `<user-uuid>/<uuid>.(webp|jpg)`,
shape-checked by a CHECK constraint that also binds the folder to the
profile's own id. Clients build the URL from their configured Supabase
URL. The bucket is public by path but has no list policy for anyone but
the owner (a listable bucket is a directory), limits files to 1 MiB JPEG
or WebP, and has no update policy (objects are immutable). The API sniffs
uploaded bytes as a first gate; the bucket's limits are the real one. A
photo's public URL works for anyone holding it until the photo changes,
and caches may serve the old file for up to an hour after that.

**The test.** `packages/db/test/avatars.test.ts`, with a positive control
for every negative case so none can pass vacuously.

## Notifications say only what you could already see

**The promise.** A phone gets three pushes, ever: someone sent you a
connect request, someone accepted yours, people joined your gathering.
No reminders, no digests, nothing to bring you back. A push names only
what you could already see in the app, never tells anyone a block
exists, and never reaches someone who blocked the sender. Pushes are
off until you turn them on, and one switch in Profile turns them off.

**How.** The database sends them, from triggers on the rows that
already carry consent (`connect_requests`, `gathering_members`), through
`pg_net` to Expo's push service. A send that a block silently drops
writes no row, so it cannot push; the triggers check the block again
anyway. Because the send is in the database, a call straight to
PostgREST pushes exactly as a call through the API does, and the API
never needs the service-role key to read someone else's tokens. `pg_net`
is asynchronous, so the sender's response time does not depend on
whether a push went out. A request names the sender (their card is on
the request); an acceptance names the person who accepted (you are
connected now); a gathering push gives a count and never a name, because
a host sees only their connections among the members (the count is
the headcount the gathering page already shows everyone). Bursts collapse:
one request push per sender per day, one gathering push per fifteen
minutes with the joins in between counted into the next one.

`push_tokens` is owner-only: you read and delete your own devices'
tokens, and nobody reads anyone else's. A token Expo reports as
`DeviceNotRegistered` is deleted, and so is one the app has not
refreshed in thirty days. Signing out deletes that device's token;
deleting your account deletes all of them. The notification text passes
through Expo and Apple or Google on its way to your phone, so it holds
a display name, a gathering's title, or a count, and nothing else. A
request push shows the sender's name on the lock screen; iOS and Android
both let a person hide notification previews, so the starter adds no
setting of its own. Expo's push access token, when a deployment sets
it, means a device token alone cannot be used to push to that phone.

**The test.** `packages/db/test/push.test.ts`, against a stand-in for
Expo's push endpoint, with a positive control for every "no push" case.

**What this means for a fork.** A new push kind is a trigger on a row
that already encodes consent, and its text names only what the
recipient can already read. Never add a push that exists to bring
someone back. Never add `net` to the API's exposed schemas: Supabase
grants pg_net's functions to every role, and the schema being
unexposed is what keeps an outbound HTTP call out of a client's reach.
Web push and email are a fork's choice; the starter ships neither, and
the web app shows the pending count instead.

## Deleting an account deletes everything

**The promise.** Delete your account and your profile, connections,
requests, blocks, hosted gatherings and memberships, photos, push
tokens, and scan history are gone. Your claimed tags return to unclaimed.

**How.** Profile → Account clears the photo pointer, sweeps the avatar
files through the Storage API, then calls `delete_my_account()`, a
security-definer function that cascades in one transaction.

**The test.** `packages/db/test/account.test.ts` and `cascade.test.ts`.

## The tenant seam

Not a user-facing promise, but a rule every fork inherits: every public
table carries `tenant_id uuid not null default private.current_tenant_id()`
and every policy predicates on it. The starter never varies the tenant.
The seam exists so that multi-tenancy later is a function swap, not a
migration storm. New tables copy the column and the default verbatim.

## How the model survives extension

Each promise exists twice: once in SQL, once as a test that fails if it
regresses. A migration that changes a policy without a test asserting
the new boundary is half a change. The skills bake this in: every one
that touches the database has you write or extend the RLS test, and the
verification gate (`bun run test`) runs the whole suite against the real
local stack. [the-slice.md](the-slice.md) lists the discipline layer by
layer.
