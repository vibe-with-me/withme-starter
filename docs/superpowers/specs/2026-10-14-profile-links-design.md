# Profile links — design

**Date:** 2026-10-14
**Status:** approved by implementation (this PR)
**Origin:** vibe-with-me's connections editor ("Stay connected — link your
socials so vibes can find you"), generalized for every derivation.

## What it is

A person adds the places they can be reached — Instagram, TikTok, X,
WhatsApp, a website, a phone number — to their profile, one row per
platform, from a picker that offers every platform the starter knows. The
list is the payoff of a connection: a stranger who taps the tag sees the
card and nothing else; once a request is accepted, each side sees the
other's links on the Connections tab, tappable where the platform has a
public page.

Vibe-with-me showed locked placeholders on the public profile ("Unlock")
to nudge people toward connecting. The starter does not: the card carries
exactly what a stranger may know, and the resolver stays byte-identical.
A fork that wants the teaser can add a card-tier count later.

## Decisions

- **Connections tier, never card tier.** A handle is contact information.
  Per `docs/the-slice.md` ("Two tiers of profile data") it lives in a
  sibling table, `public.profile_links`, readable by the owner and by
  accepted connections with no block in either direction. `profiles_select`
  and `resolve_tag` are untouched.
- **One row per platform.** The primary key is `(profile_id, platform)`.
  One Instagram, one website. A fork that needs several websites relaxes
  the key; the starter does not guess.
- **The platform list is data.** `LINK_PLATFORMS` in
  `packages/contract/src/schemas/link.ts` is the registry: label, input
  kind (`handle | phone | email | url`), placeholder, whether the handle is
  written with an `@`, and the public URL builder (null for Discord and
  Signal, which have no public page). Adding a platform is one entry there
  plus one line in the database's shape function. The starter ships
  sixteen generic platforms; the music services vibe-with-me carries are a
  vertical's choice, not the starter's.
- **Canonical values, enforced twice.** Clients normalize what was typed
  (`normalizeLinkValue`: strip a leading `@`, collapse a phone number to
  digits with an optional `+`, lowercase an email, give a bare domain its
  `https://`). The contract accepts only the canonical shape, and
  `private.is_link_value(platform, value)` restates the same regexes as a
  CHECK, so a direct PostgREST write cannot store what the API would
  refuse. Values are capped at 200 characters.
- **Save the whole list.** The editor is a form: add rows from the picker,
  type, remove, then Save sends every row in order to `app.links.replace`
  (`PUT /me/links`), which calls `set_my_links(jsonb)`: one transaction
  that deletes the platforms no longer listed and upserts the rest with
  `sort_order` = position. The RPC is `security invoker`, so the table's
  owner-only policies are the boundary; the RPC only supplies the
  transaction. No per-row endpoints, no ids over the wire.
- **Order is the list's order.** A new link goes to the end; each row's
  quiet Up / Down ("Move Instagram up") swaps it with its neighbour in the
  draft, and Save links stores it through the same `sort_order`. Focus
  stays on the moved row's control and the new position is announced. No
  drag-to-reorder.
- **A connection carries links.** `ConnectionSchema` gains
  `links: ProfileLink[]` (always present, `[]` when the other person has
  none). `app.connections.list` embeds them through RLS, and
  `accept_connect_request` returns them with the new connection.

## The slice

1. **Contract.** `schemas/link.ts` (registry, `LinkPlatformSchema`,
   `ProfileLinkSchema`, `ProfileLinksInputSchema`, `normalizeLinkValue`,
   `linkHref`, `linkLabel`); `ConnectionSchema.links`; `app.links`
   (`listMine`, `replace`). Tests pin every kind's canonical form, the
   rejections, and that the card schema never grows a links key.
2. **RLS tests, red first.** `packages/db/test/links.test.ts`: owner CRUD
   through the RPC; a connection reads both ways; stranger, anon,
   pending-request recipient, gathering co-member and blocker read nothing
   (empty, error-free); `resolve_tag` never carries a link; accept returns
   them; another profile's rows cannot be written; the CHECK refuses bad
   shapes; deletion cascades. `enumeration.test.ts` gains the anon select.
3. **Migration.** `profile_links` with the tenant seam, the shape CHECK,
   per-command policies, column grants (`value`, `sort_order` only),
   `set_my_links`, and `accept_connect_request` restated to emit `links`.
4. **API.** `links.listMine` / `links.replace` on `context.db`;
   `connections.list` maps the embed; `requests.accept` passes through.
5. **Web.** `components/LinksEditor.tsx` on the Profile page (profile row
   required first, like the photo); link chips under each row on the
   Connections tab. Tokens only.
6. **Mobile.** `components/Links.tsx` on the Profile screen; chips in the
   Connections list via `PersonRow`'s new `extra` slot, opened with
   `Linking.openURL`.
7. **E2E.** `apps/web/e2e/profile.spec.ts`: add two links, save, reload;
   a second user connects and sees them on Connections; the resolver card
   never shows them.

## Out of scope

Drag-to-reorder, multiple rows per platform, locked teasers on the card,
music platforms, OAuth-prefilled handles.
