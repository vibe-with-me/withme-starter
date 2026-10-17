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

**The promise.** A tap records a user-agent string, a timestamp, and
whether it came by NFC or a QR code. Nothing else.

**How.** The `tag_scans` table has no columns for location, IP, or
device identifiers. `scan_method` is how the tap arrived (`nfc`, `qr`,
`direct`, `unknown`), not who made it. For a physical tag it is the
client's own hint and anyone can send any value, so it is advisory:
nothing may branch on it. Only a share code's `qr` is set by the
database. The API uses the caller's IP as a rate-limit key only
and never stores it. There is no analytics or telemetry in the starter;
that stance is part of its identity, and the roadmap records the
decision to skip an analytics skill permanently.

**The test.** The columns do not exist (`tags.test.ts` pins the list);
`tags.test.ts` and `share-code.test.ts` cover the write path.

## A shared code can be taken back

**The promise.** Your QR code (Profile → Your code) shows exactly what a
tap on your tag shows, and nothing more. If a screenshot of it gets
somewhere it shouldn't, Replace code makes every copy of the old one open
an inactive tag.

**How.** A share code is a tag row of kind `qr` claimed to you, resolved
by the same `resolve_tag`: same card, same block behavior, same limits.
Replacing it retires the old row (no owner, no destination, no scans), so
it resolves as `disabled` and `claim_tag` cannot take it. A share code is
never unclaimed, always points at your card, and you manage it only
through its two RPCs. [nfc-tags.md](nfc-tags.md) § Share codes has the
details.

**The test.** `packages/db/test/share-code.test.ts`.

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

## Deleting an account deletes everything

**The promise.** Delete your account and your profile, connections,
requests, blocks, hosted gatherings and memberships, photos, and scan
history are gone. Your claimed tags return to unclaimed; your share code
is retired, so a screenshot of it opens an inactive tag and can never be
claimed by someone else.

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
