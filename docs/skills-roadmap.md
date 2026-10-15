# Skills roadmap — extension recipes, not features

Why the starter grows through skills instead of features, which skills
exist, which were deliberately skipped, and the product decisions a fork
inherits along with them.

## The strategy

The starter's code stays pure handshake. **The invariant:** nothing ranks,
recommends, aggregates external events, or monetizes, and there is no
browse surface **for people**. Growth beyond the handshake ships as
**agent-executable skills** in `.agents/skills/`: recipes a fork author (or
their AI agent) runs in their own fork. The starter provides functionality
aligned with the foundation without being accountable for each fork's
feature outcomes. Skills are also how the safety culture (RLS first, no
enumeration, blocks respected, the tenant seam) survives extension: each
skill bakes the discipline into what it scaffolds.

## Rules every skill follows

A fork writing its own skills should hold them to the same rules.

1. **Generic primitives.** A skill names the general thing ("gathering",
   "posts"), never one vertical's feature.
2. **Build once, distill, discard.** Implement the feature for real in a
   throwaway fork or worktree, review it, and only then write the skill
   from the working implementation. Never write a skill from imagination.
3. **One shared slice.** Every skill follows [the-slice.md](the-slice.md):
   contract → migration + RLS → RLS tests → API handlers → web route →
   mobile screen (card idiom) → e2e. Skills stay short; the discipline
   lives in one place.
4. **Re-run against a fresh clone.** Skills target a settled substrate, and
   each one is re-run against a fresh clone so drift is caught before a
   fork hits it.

## The skills

In the order a new fork usually runs them:

- **design-direction** (optional). Uses Claude's `/design` to draw the
  starter's own screens for a vertical, held to the starter's design
  system (one accent on the primary action, eight tokens, the card idiom),
  and reduces the chosen direction to `docs/brand-direction.md`, whose
  Colors table a shipped script checks for contrast. It also collects the
  copy lines and icon artwork make-it-yours asks for. Skip it if the fork
  already has a brand. No app code.
- **make-it-yours.** Rebrand and vertical: design tokens (web `tokens.css`
  and mobile `lib/tokens.ts` in lockstep), the one accent, fonts,
  wordmark, app name, scheme and bundle IDs, copy, the store URL.
  Configuration only. Proves "theming is a token swap."
- **customize-gathering.** Rename the gathering's user-facing nouns and add
  fields. Internal identifiers stay `gathering` in a fork, as the
  `@withme/*` package names do.
- **extend-profile.** Vertical-specific profile fields with two-tier
  visibility (see below) and completion gating.
- **add-destination-type.** The full ripple of growing the destination
  union: contract member → CHECK-constraint migration → `resolve_tag`
  branch → web and mobile resolver rendering → SDK type-parity test. Its
  worked example, `{ type: 'link' }`, is not in the starter itself.
- **provision-tags.** A runbook over the shipped script
  (`supabase/seed/provision.ts`, `bun run db:provision`): random UIDs by
  default, because an unclaimed tag belongs to whoever presents its UID
  first; the encode list handled as bearer capabilities, written outside
  the repo; chip UIDs only for tags claimed on the spot.
- **go-live.** The deploy runbook: Supabase link and push, Worker secrets
  (not vars), deploy order via the service binding, hosted JWKS, tag
  encoding.

## Decisions a fork inherits

- **The gathering is core, not a skill.** Every early fork hand-built the
  same entity (a round, a tailgate) and its list and detail screens before
  it could do anything vertical-specific, so `gatherings`,
  `gathering_members`, the `{ type: 'gathering', gathering_id }`
  destination and the Events tab ship in the starter.
- **Gatherings are listed to the domain; who's going is connections-only.**
  A list of gatherings is a bulletin board, not a directory: people see
  where their scene is congregating, and the tap is still how they meet.
  Every signed-in user of the tenant sees every gathering in that tenant
  (minus a block either way with the host); member rows are visible only for the viewer and their
  accepted connections; co-membership never reveals a card. A fork that
  needs private gatherings adds one column and one clause
  (customize-gathering §3). [safety-model.md](safety-model.md) has the
  enforcement and the tests.
- **Two tiers of profile data.** Card-tier fields are columns on
  `profiles`. Connections-tier fields live in a sibling table with its own
  narrower policy (`profile_links` in the starter, `profile_details` from
  extend-profile), because RLS decides rows, not columns: everyone
  `profiles_select` admits, including a pending-request recipient and a
  blocker, reads every column of the row. Completion gating is a UX gate
  over one contract function, `isProfileComplete`, never a policy.
- **Merch is a tab, still a pointer.** One card and one "Open store"
  action, present only when `VITE_STORE_URL` / `EXPO_PUBLIC_STORE_URL` is
  set. No cart, no product data, no commerce API.
- **The web app owns no data access.** Even single-row owner CRUD (My
  tags) goes through the contract (`app.tags.listMine` / `update`).

## Candidates and known gaps

- **add-marketing-site.** A one-page site for a fork (what the tag does,
  how to get one) on the same Cloudflare account. A candidate, not built.
- **Universal links / AASA.** A tap on a phone with the mobile app
  installed opens the web resolver, not the app. Needs an
  `apple-app-site-association` served from the web Worker, Android
  `assetlinks.json`, and `associatedDomains` in the mobile config.
- **Request expiry.** Requests expire after seven days by timestamp and
  expired rows are swept lazily on the next send. The stack deliberately
  has no background jobs.
- **A development build with real NFC hardware.** Expo Go cannot read
  tags; the scan screen falls back to manual entry. The development build
  path (`npx expo run:ios`, `react-native-nfc-manager`) has not been
  walked on a device yet.
- **Connect from a gathering tag.** The resolver's gathering branch offers
  Join or Open, not Connect.

## Deferred or skipped, on purpose

- **Notifications** (push on request received or accepted). A real
  handshake need but infra-heavy. If built, transactional only, never
  engagement, and as a skill.
- **Analytics.** Skipped permanently. PostHog and others ship their own
  instrumentation skills, and the starter's no-telemetry stance is part of
  its identity.
- **Commerce.** The Merch tab stays a pointer to a store URL.
