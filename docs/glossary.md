# Glossary

The words the README, the docs, and the skills use, in the order you are
likely to meet them.

**Tag.** A physical NFC sticker or puck. The starter targets NTAG213
chips, the cheapest common type. A tag stores one short URL and nothing
else; the phone that taps it opens that URL.

**UID.** The 14-character hex string in a tag's URL
(`https://<domain>/t/04BBBBBBBBBBBB`). It names one row in the `tags`
table. The starter generates random UIDs by default rather than using the
chip's factory UID; [NFC tags](nfc-tags.md) explains why.

**Resolve.** What happens when a tag's URL opens: the web app asks the
API "what does this UID point at?" and renders the answer. Unknown and
unclaimed UIDs both resolve as *unclaimed* and go to the claim flow.

**Claim.** The first signed-in person to open an unclaimed tag's URL and
press "Claim tag" owns it. First tap wins; there is no other way to take
ownership.

**Destination.** What a tag points at. A small typed object stored in
the database: `{ type: 'profile' }` (the owner's card) or
`{ type: 'gathering', gathering_id }` today. The
`add-destination-type` skill grows this union (a `link`, say).

**Card.** A person's public profile as a stranger sees it after a tap:
name, photo, bio, plus any card-tier fields a fork adds. The card is the
only thing a tap reveals.

**Handshake.** Tap → "Connect" → accept → connected. The whole product
the starter ships; everything else serves it.

**Connect request.** The pending state between "Connect" and "Accept".
Expires after seven days. A request that a block silently drops looks
identical, to the sender, to one that was delivered.

**Connection.** A mutual, accepted link between two people. Either side
can remove it without the other being told.

**Block.** One person hiding from another, absolutely and invisibly. The
blocked person sees what a stranger sees and gets no signal. Blocks are
checked inside database policies and functions, never in UI code.

**Gathering.** The one feature beyond the handshake: an event a host
creates (a listening session, a run, a round, a tailgate) and can point a
tag at. Tapping that tag is the invitation. Only members see a gathering
or each other through it. Forks rename it (`customize-gathering`); the
internal name stays `gathering`.

**Card tier / connections tier.** The two kinds of profile field a fork
can add. Card tier rides the card (a pace, a handicap, a team).
Connections tier is readable only by you and the people you accepted (a
phone number, a Strava handle). `extend-profile` builds both.

**Tenant seam.** Every table carries a `tenant_id` column with one fixed
value. The starter never varies it; it exists so a future multi-tenant
deployment is a function swap rather than a migration storm.

**RLS (row-level security).** Postgres rules that decide, per row and per
command, who may read or write. The starter's privacy promises are RLS
policies plus a few security-definer functions, and every one has a test.

**Security-definer function.** A database function that runs with its
own privileges rather than the caller's. The starter uses them for
anything that checks then writes (`claim_tag`, `send_connect_request`,
`accept_connect_request`, `join_gathering`, `delete_my_account`), so the
check and the write cannot be separated.

**Contract.** `packages/contract`: the Zod schemas and oRPC route
definitions every other package derives its types from. Change the
contract and the API, web, mobile, and SDK all fail to compile until they
agree.

**oRPC.** The typed RPC layer between clients and the API. Routes are
declared once in the contract and implemented once in `apps/api`.

**Worker.** A Cloudflare Worker: a small server that runs at Cloudflare's
edge. Both the API and the web app are Workers, deployed with `wrangler`.

**Service binding.** The private, in-platform link the web Worker uses to
call the API Worker during server-side rendering. It is why the API
deploys first.

**Publishable key.** Supabase's anonymous client key (`sb_publishable_…`).
Safe to ship in a browser; it can only do what RLS allows an anonymous or
signed-in user to do. The **service-role key** bypasses RLS and is for
operator scripts only, never an app.

**Skill.** A Markdown runbook in `.agents/skills/` that an AI coding agent
(or a person) follows to make one kind of change to a fork. Each was built
for real before it was written down, and each ends every step with a
checkpoint.

**The slice.** The fixed order every change moves through: contract →
migration + RLS → RLS tests → API → web → mobile → e2e.
[the-slice.md](the-slice.md) is the map.

**The verification gate.** `bun run lint && bun run typecheck && bun run
test`, all green, plus the e2e harness the change touched. A slice is done
when the gate passes.

**Derivation.** A fork that turned the starter into a vertical: Golf With
Me, the fork the skills were distilled from, and the Run With Me
walkthrough in these docs.
