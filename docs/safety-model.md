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
is reachable by tapping their tag or scanning their code (knowing the
unguessable UID is the capability) or through a connection or a live incoming request. Sharing a
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

**The promise.** Everyone signed in to your domain sees every gathering
the host lists to everyone — title, time, place, a headcount — so people
know where their scene is congregating. Who is going is another matter: you see yourself and the
people you have connected with, and nobody else. Joining tells the people
you already know; it shows a stranger nothing, not even the host's name.
A gathering hidden by a block looks like one that does not exist, with no
headcount either. A gathering's location opens in Maps, which sends its text
to Apple or Google, but only on the viewer's own tap: the text is what the
host chose to publish, and no request leaves until then.

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

**A host can keep it to their connections.** Posting where you will be to
the whole app is the wrong default for a dinner at home or a round among
friends, so a host picks who can see each gathering: everyone in the app
(the default), or their connections. A connections-only gathering is
listed, counted, readable by its link and joinable only by the host, the
host's accepted connections, and whoever is already going; to anyone else
it looks exactly like one that does not exist. Switching an open
gathering to connections keeps everyone already going, the way a block
does not evict a third party; switching back is always allowed. There are
no invite lists and no third setting.

A stranger who taps the host's tag, or scans their share code, sees the
host's card and nothing about the gathering: the same answer as a tag
that points at a profile, so a tap is not a way to learn that a hidden
gathering exists. On the web the tag page resolves before it knows who
is signed in, so a tap there shows a connections-only gathering to
nobody; connections find it in Events.

`private.sees_gathering` is the one rule, and every path that shows a
gathering asks it: `gatherings_select` (so the feed, the detail, your own
list and the member rows), the headcount, `join_gathering`, and
`resolve_tag`'s gathering line. It reads membership through a definer, so
the gatherings policy still never reads `gathering_members` under RLS. It
takes only the gathering's id and always asks about the caller
(`auth.uid()`), so it cannot be used to ask whether two other people are
connected or blocked. `grants.test.ts` lists every security-definer
function that reads gatherings, each with how it complies, and fails on a
new one until it is listed.

**A change for blocks, too.** Before this, a tap on a member's tag showed
the gathering line to a tapper who had blocked the host (only a tapper the
host blocked was refused), though the feed already hid it from them. The
tap now follows the feed: a block either way hides the line.
**The test.** `packages/db/test/gathering-visibility.test.ts`: a
stranger, a connection, a member, a member's connection, both directions
of a block, anon, a tap and a share-code scan, each beside a positive
control.

**Capacity.** A host may cap a gathering at 2 to 500 spots, counting
themself, so a round of golf is the host and three. Once that many are
going, `join_gathering` answers "gathering is full" (`P0007`; the API
says CONFLICT "Gathering is full"), and the apps show Full instead of
Join. Two joins for the last spot never both succeed: the join locks the
gathering's row before it counts. Lowering the cap below the headcount
keeps everyone and only stops new joins; leaving frees a spot. There is
no waitlist and no push when a spot opens. "Full" leaks nothing: it is
checked after every visibility check, so only someone who already sees
the gathering and its headcount can learn it. **The test.**
`packages/db/test/gathering-capacity.test.ts`, including a concurrent
race that fails without the row lock.

**Both directions.** `join_gathering` refuses a joiner the host has
blocked and a joiner who has blocked the host, with the same "gathering
not found" as for a missing id: a gathering you cannot see is one you
cannot join, in either direction.

## Reports are private

**The promise.** You can report anyone whose card you see, and any
gathering you can see (the report is filed against its host), and block
them in the same step. Only the people who run the app read reports. The person
you reported never learns of it, you cannot read your report back, and
nothing about a report is ever public. Reporting is not a way to find out
whether someone exists.

**How.** `public.reports` has row-level security on, no policies, and every
privilege revoked from anon and authenticated, so only the service role
reads it. Reports enter through `report_user`, a security-definer function.
It answers an id that is not a person in the tenant exactly as it answers a
real one (nothing is stored), so it is not an existence oracle. It checks
the reason and the text before it reads anything about the id, so a bad
argument is the same 22023 for everyone and never a constraint error (whose
details would carry the reported card). It counts
attempts in a private ledger, 10 per rolling day, before it looks the id
up: the publishable key reaches PostgREST directly, so the limit has to be
inside the function, as `claim_tag`'s is. Its block option inserts the same
block row Block does, with `reveals_card` decided by the same
`private.sees_card` rule. Each report keeps a snapshot of the card as it
was, so editing a name afterwards does not erase what was reported.

`report_gathering` is the second way in, with the same guarantees: it
checks the reason and text first, answers a gathering you cannot see
exactly like a stored report, shares `report_user`'s ledger, and blocks
by the same `private.sees_card` rule. It files the row against the host,
with `gathering_id` and the gathering (title, start, location) in the
snapshot.

**Account deletion.** Reports you filed are **anonymised**, not deleted:
the reporter column is cleared, and the reason, your words and the
snapshot stay. Victims often leave first, and a report about someone
abusive should not disappear when they do. Reports **about** you are kept
for **90 days** after you delete your account (the link to your account is
cleared; the reason, the reporter's words and the snapshot of your card
stay), then deleted. Otherwise deleting an account would erase every
report against it before anyone read them. The basis is legitimate
interest: acting on abuse, recognising someone who returns, and answering
the authorities. The purge runs lazily, as request expiry does (the stack
has no background jobs): every new report, every account deletion, and
the operator's daily "Open reports" query (`docs/moderation.md`) first
delete the rows past their window. Your report ledger is cleared by `delete_my_account`.

**Notification.** The `report_webhook_url` row of `private.settings` holds
one optional webhook URL, unset by default. When it is set, each new report POSTs the report's id
and nothing else (no names, no reason, no text) through pg_net, so the
operator learns a report exists and reads it in Studio.

**The test.** `packages/db/test/reports.test.ts`, and the report steps in
`apps/api/e2e/handshake.e2e.ts` and `apps/web/e2e/reports.spec.ts`.

**What this means for a fork.** A fork that ships to the stores must act
on reports, within 24 hours for Apple: [moderation.md](moderation.md) is
the operator's side. Never add a way for a reporter or the reported person
to read reports, or a count of reports anywhere a user can see it. A fork
that must keep evidence longer (child safety, legal holds) changes the
`reported_id` cascade on purpose and says so here.

## Terms are agreed to, and recorded

**The promise.** Nobody gets a profile without agreeing to the fork's terms
of use and privacy policy, and when the terms change, everyone is asked
again before the app opens.

**How.** `profiles.terms_version` and `profiles.terms_accepted_at` record
which version you agreed to and when. The `profiles_insert` policy refuses
a profile without a version, and a trigger stamps `terms_accepted_at`
itself whenever the version changes, so no client can backdate it. The
current version is `TERMS_VERSION` in `packages/contract`; the web shell
and the mobile root layout send a profile on any other version to the
re-ask screen. That gate is in the apps, not the database: it records an
agreement rather than protecting anyone, and a direct API caller already
agreed once, at sign-up, which the database enforces. The two columns
are on `profiles`, so anyone who can read your profile row can read
them, as they can read `created_at`; they are not on the card.

**The test.** `packages/db/test/terms.test.ts`, and the terms spec in
`apps/web/e2e/reports.spec.ts`.

## Two tiers of profile data

**The promise.** A field on your card is visible to anyone who taps your
tag or scans your code. A field in the connections tier is visible only to you and the
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

One part of a link is card tier on purpose: its platform name.
`resolve_tag` lists which platforms you are on, in your order, so a
stranger's card shows them locked behind Connect. The handle, number or
address reaches only you and your connections.

**The test.** `packages/db/test/links.test.ts` (the card names the
platforms and never a value), and
`profile-fields.test.ts` once a fork runs `extend-profile`.

## Scans are privacy-default

**The promise.** A tap or a scan records a user-agent string, a timestamp, and
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

**The promise.** Your QR code (the Your code button in the tab bar)
shows exactly what a tap on your tag shows, and nothing more. If a screenshot of it gets
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

## Notifications say only what you could already see

**The promise.** There are three kinds of push, ever: someone sent you
a connect request, someone accepted yours, people joined your gathering.
No reminders, no digests, nothing to bring you back. A push names only
what you could already see in the app, never tells anyone a block
exists, and is never sent across a block that exists when the request,
acceptance, or join is written. Pushes are
off until you turn them on, and one switch in Profile turns them off.

**How.** The database sends them, from triggers on the rows that
already carry consent (`connect_requests`, `gathering_members`), through
`pg_net` to Expo's push service. A send that a block silently drops
writes no row, so it cannot push; the triggers check the block again
anyway. The check happens when the row is written: `pg_net` delivers a
moment after the transaction commits, so a block made in that moment
does not recall a push already queued. Because the send is in the database, a call straight to
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
tokens, and scan history are gone. Your claimed tags return to
unclaimed; your share code is retired, so a screenshot of it opens an
inactive tag and can never be claimed by someone else. Reports you filed
stay, anonymised; reports about you stay 90 days, then go (see Reports
are private).

**How.** Profile → Account clears the photo pointer, sweeps the avatar
files through the Storage API, then calls `delete_my_account()`, a
security-definer function that cascades in one transaction. It is the
only door: no client role may delete a profile row directly, since that
would skip the ledgers and the photo check and cut reports loose from a
login that stays.

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
