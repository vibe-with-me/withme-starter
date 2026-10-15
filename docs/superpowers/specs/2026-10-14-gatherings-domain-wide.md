# Gatherings are listed domain-wide; who's going is connections-only

Decided 2026-10-14 (Alex + Claude). Status: shipping in one PR with the
docs that restate it. Revises the "no browse surface" clause of the
2026-09-22 app-shell spec and the 2026-06-11 roadmap.

## The gap

The starter shipped the gathering invitation-only: a gathering was visible
to its host and members, nobody else, and the only way in was a tap on a
member's tag or a forwarded link. That was the safety culture applied
wholesale — "no browse surface, ever" — and it protected one thing well:
nobody can list people they have not met.

It also hid the thing that makes Vibe With Me useful. An app-wide list of
shows is how people find out where their scene is congregating tonight;
the tap is still how they meet. A fork whose users cannot see the rounds,
runs, or tailgates happening in their domain has a calendar, not a scene.

## The decision

Vibe With Me's balance, carried over whole:

1. **The gathering is listed to the domain.** Every signed-in user of the
   tenant sees every gathering (title, time, place, a headcount), in
   start-time order, in a "Happening" section at the top of the Events tab.
   Minus a block in either direction with the host: a viewer the host
   blocked, and a viewer who blocked the host, see no gathering and no
   headcount, exactly like a gathering that does not exist. Nothing ranks,
   recommends, or filters; "around them" means "in their domain", because
   the location is free text and there is no geo. Nearby sorting is a
   separate decision, not bundled here.
2. **Who's going is connections-only.** A member list is readable only
   where the row is the viewer's own or belongs to an accepted connection
   of the viewer. Joining a gathering reveals your membership to the people
   you have already connected with and to nobody else. The host sees the
   same list as everyone: their connections among the members, plus the
   count. Hosting is not a way to collect strangers' cards.
3. **The headcount is a security-definer read** that re-states the
   gathering's visibility, so a hidden gathering has no count either
   (`public.gathering_member_counts(uuid[])`).
4. **The card bridge is gone.** `profiles_select` returns to the initial
   schema's text; `private.shares_gathering` is dropped. Co-membership
   never reveals a card. Connections already see each other's cards, and
   strangers must not.
5. **Joining barely changes.** `join_gathering` stays the only way in and
   its block check becomes symmetric to match rule 1: a viewer who blocked
   the host reads the gathering as nonexistent, so they cannot join it
   either, with the same `'gathering not found'`. Blocking still evicts,
   and the tag is still the invitation: a tap deep-links to the detail,
   which now also offers Join to anyone who found the gathering in the
   feed.

The V1 invariant is reworded, not loosened: nothing ranks, recommends,
aggregates external events, or monetizes; **there is no browse surface for
people**. A list of gatherings is a bulletin board, not a directory.

## What a stranger learns, stated plainly

A listed gathering exposes its `host_id` to the tenant through the entity
(the API answers under the caller's RLS; a signed-in user could read the
same column through PostgREST directly). The id is not a card: the host's
name, photo, and bio stay hidden until the viewer and the host connect. What
an id allows is one consent-gated `send_connect_request`, which the host
receives with the requester's card and may decline or block, and which the
rate-limit ledger caps at ten per hour. A tap-bound request (the request
carries the tag UID, not a profile id) would close even that, and is a
candidate follow-up; it is not in this change.

## Not in this change

- A per-gathering `listed | invite_only` flag. Vibe With Me has none for
  meetups; a fork that needs private gatherings adds one column and one
  clause, and customize-gathering §3 says where.
- Vibe With Me's opt-in "Show me in the crowd" attendee tab. The
  connections-only list is the whole feature here.
- Connect from a gathering tag. The gathering branch of the resolver offers
  Join or Open, not Connect; a host whose only tag points at their
  gathering cannot be connected to through it. Pre-existing; a follow-up.

## Surfaces

- **Events tab (web and mobile).** Create form; "Happening" (every upcoming
  gathering in the domain, each row with time, place, "N going", a Hosting
  or Going mark where it applies, and the names of the viewer's
  connections who are going); "Yours" (hosting or joined, past included).
  Empty states: "Nothing happening yet. Create the first one." and "Join
  one above, or create your own."
- **Detail.** Header, when and where, "N going"; Join for a non-member
  (the accent: it is the consent moment); Leave for a member; Edit and
  Delete for the host; "point my tags here" for members only, since a tag
  whose owner is not a member degrades to the profile card. "Who's going"
  lists the viewer and their connections, Host marked.
- **Resolver.** Unchanged card; the Join/Open choice now reads membership
  from the detail's member list instead of from whether the detail loads.
- **Seed.** Lin hosts a second gathering Ada has not joined, so Ada's
  Happening shows the feed working.

## Tests

`packages/db/test/gatherings.test.ts` is rewritten where the boundary
moved and extended where it is new: a stranger sees the gathering and the
headcount but no member rows; co-members' cards stay hidden until they
connect; a viewer blocked by the host, and one who blocked the host, see
neither gathering nor count; the count includes members the viewer cannot
see; a block between connected co-members hides their rows from each other
and leaves both memberships intact. `grants.test.ts` drops
`shares_gathering` and gains `gathering_member_counts`. Both e2e harnesses
walk the new boundary: the API suite asserts the member list a joiner sees
is their own row until they connect; the web smoke has the guest join from
the feed, see the count and not the host, connect through the host's tag,
and then see the host in who's going.
