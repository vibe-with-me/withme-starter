# Skills roadmap — extension recipes, not features

Decided 2026-06-11 (Alex + Claude session). Status: agreed; revised 2026-09-22 and extended 2026-10 — see the dated sections at the end.

## The strategy

The starter's code stays pure handshake (the V1 invariant: nothing that ranks,
recommends, aggregates, or monetizes). Growth beyond the handshake ships as
**agent-executable skills** in `.agents/skills/` — recipes a forker (or their
AI agent) runs in their own fork. The starter provides functionality aligned
with the foundation without being accountable for feature outcomes. Skills are
also how the safety culture (RLS-first, no enumeration, block-respect, tenant
seam) survives extension: each skill bakes the discipline into what it scaffolds.

Rejected on the way here: a merch/Shopify tab — it violates the invariant, is
explicitly out of scope in the V1 spec, and open-sources the commercially
reserved layer (tag fulfillment IS the business; the starter is demand-gen).
Approved alternatives: a configurable "Get tags" fulfillment pointer defaulting
to withme's store (≈20 lines, dormant-seam pattern), and the provision-tags
operator skill below.

## Hard constraints on every skill

1. **Generic primitives, never VWM transplants** — the rewrite-don't-copy rule
   extends to skills. "Gathering," not VWM shows; "posts," not pulse.
2. **Build once, distill, discard** — implement the feature for real in a
   scratch fork, run the full review treatment (CodeRabbit + agents), THEN
   extract the skill from the working implementation. Never write a skill from
   imagination.
3. **Shared slice doc** — all skills reference one `the-slice.md` describing
   the canonical extension slice: contract → migration + RLS → RLS tests →
   API handlers → web route → mobile screen (card idiom) → e2e. Skills stay
   short; the discipline lives in one place.
4. **Skill rot mitigation** — skills target a settled substrate; periodically
   re-run each against a fresh clone (candidate for a scheduled monthly agent).

## The set, in build order

### Tier 1 — seam exercisers (cheap; can land before the public flip)
1. **make-it-yours** — rebrand/vertical: design tokens (web `tokens.css` +
   mobile `lib/tokens.ts` in lockstep), the one accent, fonts, wordmark, app
   name/scheme/bundle IDs, copy. Configuration only; no scratch fork needed.
   Proves "theming is a token swap."
2. **add-destination-type** — the spine. Full ripple of growing the destination
   union: contract member → CHECK-constraint migration → `resolve_tag` branch →
   web/mobile resolver rendering → SDK type-parity test. Worked example in the
   skill text is `{ type: 'link' }` (tag → URL redirect); the example does NOT
   get added to the starter itself. build-gathering depends on this pattern.

### Tier 2 — feature builders (build-once-distill method; wait for substrate to settle)
3. **onboarding** — profile extension + completion gating: vertical-specific
   profile fields, post-signup step flow, and **two-tier field visibility**
   (public card fields vs connections-only fields — touches the RLS visibility
   model; the part forkers get wrong alone). Likely the most-run skill.
4. **build-gathering** — entity + membership + consent + RLS; integrates via
   `{ type: 'gathering', gathering_id }` destination (tap the tag at the door,
   join the gathering). The flagship.
5. **build-feed** — posts scoped to a gathering or to connections. Constraints
   as NON-NEGOTIABLES encoded in the skill: chronological only, scoped
   visibility, block-respecting RLS, no ranking, no recommendation.

### Tier 3 — operator runbooks (independent; slot anywhere)
6. **go-live** — agent-executable deploy runbook (supabase link/push, Worker
   secrets not vars, deploy ordering via the service binding, hosted JWKS,
   tag encoding). Every pothole here was hit live in the 2026-06-11 demo deploy.
7. **provision-tags** — batch-provision UIDs, emit encode list
   (`https://<domain>/t/{UID}` per tag), printable sheet. Pairs with the
   fulfillment pointer.

### Deferred / skipped
- **add-notifications** (push for request-received/accepted): real handshake
  need but infra-heavy; if built, transactional only, never engagement. Revisit
  after the first five.
- **analytics skill**: skipped permanently — PostHog ships its own instrument-*
  skills; the starter's no-telemetry stance is part of its identity.

## Sequencing vs. the rest of the roadmap

Currently ahead of skills work, per earlier session decisions:
1. Physical tag tap (encode NTAG213 → provision UID in demo DB → tap) — the
   last unverified claim of the thesis.
2. First npm release of @withme/nfc (`nfc-v0.1.0` tag; needs NPM_TOKEN secret,
   @withme scope, LICENSE placeholder filled).
3. Open-sourcing checklist as one deliberate session: license decision
   (MIT vs Apache-2.0) + trademark review, CONTRIBUTING + templates, public
   flip, demo links into README. (The local-dev `sb_secret_` fallback in the
   test helpers is gone: they read the key from the environment.)
4. V1.1 product gaps (post-demo-feedback): account-deletion UI in /me,
   universal links/AASA so taps open the mobile app, avatar uploads
   (Supabase storage currently disabled), request-expiry cron, dev build with
   real NFC hardware.

Tier 1 skills may land before the public flip (stronger launch story);
Tier 2 waits for items 1–3.

## Revised 2026-09-22 — the shell and the gathering move into core

Decided with `docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md`
and landed across the shell PRs. Two findings from the first two derivations
(golf-with-me, tailgate-with-me) changed the strategy above:

- **The gathering is core, not a skill.** Both forks hand-built the same
  entity (a round, a tailgate) plus list/detail screens on the flat two-link
  nav before they could do anything vertical-specific — the one universal
  feature cannot be added by prose after the fact. `gatherings` +
  `gathering_members`, the `{ type: 'gathering', gathering_id }` destination,
  the `resolve_tag` summary, `app.gatherings.*`, and the Events tab ship in
  the starter (`supabase/migrations/20261008120000_add_gatherings.sql`,
  `packages/db/test/gatherings.test.ts`). Tier 2 item 4 (**build-gathering**)
  becomes **customize-gathering**: rename user-facing nouns, add fields.
  Internal identifiers stay `gathering` in a fork, as `@withme/*` packages
  stay. The V1 invariant is unchanged: no browse surface, nothing ranks or
  aggregates.
- **Merch is a tab, still a pointer.** The rejected merch/Shopify tab above
  stands as written for commerce; the approved fulfillment pointer is
  promoted from a landing-page link to a tab rendering one card and one
  "Open store" action, present only when `VITE_STORE_URL` /
  `EXPO_PUBLIC_STORE_URL` is set. No Shopify API, no cart, no product data.
- **Chrome is core.** Events, Connections, Merch, Profile on web (`_app`
  layout) and mobile (`(tabs)`). `/me` is now `/profile` — the V1.1 note
  "account-deletion UI in /me" reads `/profile`.
- **Naming.** Tier 2 item 3 ("onboarding") ships as **extend-profile**; its
  two-tier visibility work is unchanged. Tier 3's **provision-tags** is
  distilled from golf-with-me `bee9c9d`.
- **My tags goes through the contract** (`app.tags.listMine` / `update`):
  the web app keeps owning no data access, even for single-row owner CRUD.
- **Profile made whole (2026-10-11).** Two V1.1 gaps above shipped with
  milestone 3: avatar uploads (Storage enabled, the `avatars` bucket) and
  the account-deletion UI (Profile → Account, `delete_my_account()`),
  alongside My tags and the Connections segments.

## Shipped 2026-10 — the derivation skills (milestone 4)

`.agents/skills/provision-tags/` and `.agents/skills/extend-profile/`, and
an update to `make-it-yours`, each built for real in a throwaway worktree,
written down from what worked, then re-run against a fresh clone (hard
constraints 2 and 4).

- **provision-tags** (Tier 3, item 7) is a runbook over the script the
  starter already ships (`supabase/seed/provision.ts`, `bun run
  db:provision`, from golf-with-me `bee9c9d`). No code: random UIDs by
  default (48 random bits behind the `04` prefix), because an unclaimed tag
  belongs to whoever presents its UID first; the encode list handled as
  bearer capabilities, written outside the repo; chip UIDs only for tags
  claimed on the spot.
- **extend-profile** (Tier 2, item 3, "onboarding") ships the two-tier
  model: card-tier columns on `profiles`, and a connections tier in its own
  table, `profile_details`, whose policy admits the owner and accepted
  connections with no block either way. The build showed why it is not a
  `profiles_select` change: RLS is per row, and the pending-request
  recipient, the gathering co-member, and the blocker all read every column
  of a row that policy admits. `profiles_select` stays as the gathering
  migration left it. Completion gating is a UX gate in both clients over one
  contract function, `isProfileComplete`, never a policy.
- **make-it-yours** gained the store URL step (step 7), the shell heights
  (they may change, web and mobile together), and the brand surfaces the
  shell and Profile work added. go-live §3 lists `VITE_STORE_URL`, and §1
  now keeps the database password in `$HOME/.config/<name>/`, outside the
  repo.
- **customize-gathering** and **add-destination-type** now tell a fork to
  copy `resolve_tag`'s newest definition: the gatherings migration's body
  still emits `avatar_url`, which the avatars migration dropped.
- **add-marketing-site** stays a candidate until the proof run
  (milestone 5).

## Added 2026-10-12 — design-direction, the step before make-it-yours

`.agents/skills/design-direction/`, decided in
`docs/superpowers/specs/2026-10-12-design-direction-skill.md`. Claude's
`/design` (Claude Design's artboards inside Claude Code; it reads the
project's tokens first) can draw the starter's own screens for a vertical,
but left alone it would also want to implement them. The skill holds it to
the starter's design system (one accent on the primary action, eight
tokens, the card idiom) and reduces the chosen direction to the inputs
make-it-yours consumes, as `docs/brand-direction.md` in the fork, whose
Colors table a shipped script checks, deriving every required contrast
pair from it. It also collects what the proof
run found make-it-yours never asks for: the copy lines and the icon
artwork. Optional, skipped by a fork that already has a brand; its last
step, `/design-sync`, gives the fork its own design-system project so
later `/design` runs start from the fork's brand. Built once (a
bouldering-gym direction) before it was written down. No app code.
