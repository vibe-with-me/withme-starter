# App shell and tabs for withme-starter — Design

Date: 2026-09-22
Status: Approved 2026-09-22

## Goal

A fresh fork of the starter should look and behave like a real app on day
one: a styled tab shell on web and mobile with **Events, Connections, Merch,
Profile**, each tab fully fledged, so a derivation stops hand-building
navigation and a gathering before it can do anything vertical-specific.

Evidence this is the right cut: both existing forks (golf-with-me,
tailgate-with-me) hand-built a gathering plus list/detail screens on the
starter's flat two-link nav, extended the profile card with vertical fields,
and added a marketing site. Neither has tabs. The skills-only strategy from
2026-06-11 produced correct but barebones derivations because chrome and the
one universal feature can't be added by prose after the fact.

## Decisions

- **The shell is core code, not a skill.** Web: a pathless `_app` layout
  route owning the session guard and the chrome. Mobile: an Expo Router
  `(tabs)` group inside the existing `Stack.Protected` gate.
- **The gathering moves into core.** This revises the 2026-06-11 roadmap
  ("growth ships as skills"). The V1 invariant still holds: nothing ranks,
  recommends, aggregates, or monetizes, and there is no browse surface.
  `build-gathering` becomes `customize-gathering` (rename user-facing nouns,
  add fields). Internal identifiers stay `gathering` in a fork, the same
  rule make-it-yours applies to `@withme/*` packages.
- **Tabs: Events, Connections, Merch, Profile.** No home/Tap tab. Claimed
  tags live in a "My tags" section under Profile. On mobile the scanner is a
  header action available from every tab; web has no scanner (tags resolve
  by URL).
- **Merch is a pointer, not commerce.** One configured store URL
  (`VITE_STORE_URL` / `EXPO_PUBLIC_STORE_URL`, renamed from `*_GET_TAGS_URL`).
  The tab renders a single card with an "Open store" action: new tab with
  `noopener noreferrer` on web, `expo-web-browser` on mobile. When the URL is
  unset the tab does not exist (filtered from `navItems`; `href: null` on
  mobile). No Shopify API, no cart, no product data in the starter.
  vibe-with-me's in-house commerce is explicitly not ported. This revises
  the roadmap's rejected-merch-tab paragraph: the approved fulfillment
  pointer is promoted to a tab.
- **Styling stays on the token system.** Web `tokens.css` + vanilla CSS,
  mobile `lib/tokens.ts` + `StyleSheet`, in lockstep as today. No Tailwind,
  no NativeWind. The one-accent rule extends to navigation: the active tab
  is marked with ink weight and a 2px ink underline, never the accent, which
  remains reserved for Connect and Accept.
- **Icons.** `lucide-react` on web (one new dependency). Feather from
  `@expo/vector-icons` on mobile (already shipped with Expo; Feather is
  lucide's ancestor and the four glyphs match: `calendar`, `users`,
  `shopping-bag`, `user`).
- **Routes.** `/me` becomes `/profile` (a redirect route keeps old links
  working). Login's default destination becomes `/gatherings`. `/` stays the
  SSR'd landing card and, when a session is present client-side, shows
  "Open the app" instead of redirecting.
- **My tags goes through the contract.** New `app.tags.listMine` and
  `app.tags.update` (destination and status only, mirroring the column
  grant). The web app keeps owning no data access, per the README. The
  gathering detail's "point my tags here" uses the same endpoint;
  customize-gathering inherits it.
- **Avatar upload replaces the URL field.** Storage enabled in
  `supabase/config.toml`; an `avatars` bucket with per-user folder policies
  (`(storage.foldername(name))[1] = auth.uid()::text`), public read.
  `profiles.avatar_url` is replaced by `avatar_path` with a regex CHECK
  (`<user-uuid>/<uuid>.(webp|jpg)`), so an off-origin avatar is
  unrepresentable and every client builds the URL from its own configured
  Supabase URL. Clients resize to a 512px square before upload; the API
  receives a `File` through oRPC, validates type and size (≤ 1 MB), and
  writes to storage **with the caller's JWT**, never service-role.
- **Account deletion.** `public.delete_my_account()` as a `security definer`
  function that deletes the caller's `auth.users` row; existing cascades and
  the tag-reset behavior do the rest. Exposed as `app.profile.deleteAccount`
  and a confirm-gated action in Profile → Account.

## Web architecture

```
src/routes/
  __root.tsx                 document shell (unchanged)
  index.tsx                  landing; "Open the app" when signed in
  login.tsx, auth.callback.tsx, t.$uid.tsx, claim.$uid.tsx   outside the shell
  me.tsx                     redirect -> /profile
  _app.tsx                   pathless layout: guard once, prefetch profile, <AppShell>
  _app.gatherings.tsx        Events tab: list mine + create
  _app.gatherings_.$id.tsx   detail (un-nesting underscore, per build-gathering)
  _app.connections.tsx       Connections tab
  _app.merch.tsx             Merch tab (redirects to /gatherings when unset)
  _app.profile.tsx           Profile tab
src/components/
  AppShell.tsx               navItems -> top nav (>= breakpoint) or bottom bar
  EmptyState.tsx, ListStates.tsx   the loading/error/empty ladder
  ProfileCard.tsx, CalmStates.tsx  (existing)
```

- `_app.tsx` runs `requireSession` in `beforeLoad` once, loads the profile,
  and sends a session without a profile to `/profile?returnTo=<intended>`
  (today's per-route behavior, centralized). The layout sets `ssr: false`,
  which children inherit; confirm at implementation against the installed
  TanStack Start version.
- `AppShell` is driven by one `navItems` array `{ to, label, icon }`.
  Above `--shell-breakpoint` (720px) it renders wordmark + horizontal nav +
  `<main id="main">`; below, `<main>` + a fixed bottom bar with
  `env(safe-area-inset-bottom)` padding and a spacer. Includes a skip link.
  Active state via router `activeProps`.
- New tokens: `--shell-nav-height`, `--shell-tab-height`,
  `--shell-max-width`, `--text-xs`. (The 720px breakpoint is a documented
  constant in tokens.css: CSS variables cannot drive media queries.) Mobile
  mirrors the header height as `SHELL.headerHeight`.
- `/claim/$uid` and `/t/$uid` stay chrome-free focused flows.

## Mobile architecture

```
app/
  _layout.tsx        Stack + Stack.Protected (unchanged shape)
  index.tsx          redirect by session -> /(tabs)/gatherings or /login
  login.tsx, scan.tsx, t/[uid].tsx, claim/[uid].tsx, gathering/[id].tsx   stack screens
  (tabs)/_layout.tsx Tabs: tokens-styled bar, Feather icons, shared header with scan action
  (tabs)/gatherings.tsx  (tabs)/connections.tsx  (tabs)/merch.tsx  (tabs)/profile.tsx
components/
  ui.tsx             existing primitives + EmptyState, ListStates, SectionHeader
  Header.tsx         wordmark + scan button (Feather has no NFC glyph; a scan-frame icon), used by the tabs layout
```

- Detail screens push over the tab bar as stack screens, so the bar stays a
  top-level-only surface. `home.tsx` is removed; its content dissolves into
  the tabs.
- Default `Tabs` bar styled through tokens first. A custom `tabBar` only if
  the default cannot hit the design; nothing in the design requires it.
- New Expo deps, all first-party: `expo-web-browser`, `expo-image-picker`,
  `expo-image-manipulator`.

## Tab contents

**Events (`/gatherings`).** My gatherings (hosting and joined) in start-time
order, a create form with sensible time pre-fill, rows to detail. Detail:
header, member rows with a "Host" tag, leave for members, host-only edit
and delete, and "point my tags here". Non-members get NOT_FOUND from `get`
and see a calm "Join this gathering?" card (build-gathering §4). Empty
state: "Tap a host's tag to join one, or create your own." No browse.

**Connections.** In-page segmented tabs: Connections, Requests (count
badge), Blocked. Each list uses the state ladder: loading → error with
retry → typed empty state → content. Actions unchanged; Accept keeps the
accent.

**Merch.** One card: title, one line of copy, "Open store".

**Profile.** Sections: identity (avatar upload, name, bio), My tags (each
claimed tag: UID, current destination, re-point to a gathering or reset to
profile, disable), Account (sign out, delete account with confirmation).
Vertical fields arrive later via the extend-profile skill.

## Data and contract changes

Contract (`packages/contract`): `schemas/gathering.ts` (entity, summary,
member, create input) and the `gathering` destination member;
`ResolveOutputSchema` gains the always-present nullable `gathering` summary;
`app.gatherings.{create,get,join,leave,listMine}`; `app.tags.{listMine,update}`;
`profile.avatar_url` → `avatar_path`; `app.profile.{uploadAvatar,deleteAccount}`.
SDK client mirrors gain the destination member and summary type; the parity
test enforces it under `bun run typecheck`.

Migrations (additive, one each): `add_gatherings.sql` (ported from
golf-with-me `17b0425`, generic nouns, all four safety mechanisms from
build-gathering §1 plus the `resolve_tag` replacement), `avatars.sql`
(bucket, policies, `avatar_path` + CHECK, drop `avatar_url`),
`delete_my_account.sql`. Seed updated for `avatar_path`.

## Skills changes

- `docs/the-slice.md`: steps 5 and 6 gain "a top-level section registers a
  tab in `navItems` / `(tabs)`"; the styling rule adds "the accent never
  marks navigation state"; the web-owns-no-data-access rule is restated
  against the My tags precedent.
- `docs/skills-roadmap.md`: a dated "Revised 2026-09-22" section recording
  gathering-in-core and the merch pointer tab, with the two-fork evidence.
- `build-gathering` → `customize-gathering`: rename user-facing nouns
  (copy, routes, tab label), add fields (contract → additive migration →
  screens → tests). Internal identifiers stay `gathering`.
- `make-it-yours`: the store URL variables; the two shell height tokens.
- New `provision-tags`: distilled from golf-with-me `bee9c9d`.
- New `extend-profile` (the roadmap's "onboarding"): distilled from
  tailgate-with-me `92d2aeb`, plus a real build of the connections-only
  field-visibility tier before it is written down. The tier is a sibling
  table, `public.profile_details`, with its own select policy (the owner,
  or an accepted connection with no block either way) and its own RLS
  tests, proven narrower than `profiles_select`, which stays
  byte-identical. *Amended 2026-10-12, approved by Alex 2026-10-11
  (ENG-749): this line first said the tier "touches `profiles_select`".
  RLS decides rows, not columns, so a connections-only column on
  `profiles` would reach every viewer that policy admits (the
  pending-request recipient, the gathering co-member, the blocker).*
- Candidate, after the proof below: `add-marketing-site`.

## Testing

- RLS (`packages/db/test`): the ten gathering tests from build-gathering §5;
  `tags` owner select/update and stranger denial for `listMine`/`update`;
  avatars bucket: cross-user write denied, public read, path regex rejects
  off-folder and off-extension values; `delete_my_account`: connections,
  requests, blocks gone, tags reset to unclaimed, scans erased.
- Contract tests: new schemas with negative cases; `gathering: null` added to
  every existing claimed-resolve fixture.
- API e2e: the gathering flow (create → point tag → anonymous resolve carries
  summary → join → member list carries cards → leave → NOT_FOUND).
- Web e2e: extend the smoke so both strangers see each other in the
  Connections tab afterward; add a shell spec (unauth `/connections` →
  login; tabs render; active state; Merch tab absent when unset).
- Mobile: typecheck plus a simulator pass per PR; the starter has no
  automated UI tests today and this design does not add a harness.
- The verification gate from `docs/the-slice.md` on every PR.

## Delivery

Five PRs, in order, each passing the gate:

1. **Shell.** Web layout + AppShell, mobile `(tabs)`, existing screens
   moved, `/profile` rename with redirect, Merch pointer tab, the slice doc
   update, the web shell e2e spec.
2. **Gathering in core.** The port, the tests, the e2e extension, the
   roadmap revision, README update, `customize-gathering` replacing
   `build-gathering`.
3. **Connections and Profile.** In-page tabs and the state ladder; My tags
   endpoints and section; avatars bucket + upload; delete account.
4. **Skills.** `provision-tags`, `extend-profile`, `make-it-yours` update.
5. **Proof.** Fresh clone → make-it-yours → customize-gathering →
   extend-profile → go-live, as a fake derivation, timed. This is the
   acceptance test for "derivations are no longer barebones."
   *Done 2026-10-14: see `../reports/2026-10-14-proof-run.md`. Covered
   by two runs, not one: Run Club, a fresh clone through the skills
   locally, timed, no go-live; and Golf with Me, a fork rebuilt on a fresh
   starter tree through the skills and a real go-live. No single run was a
   fresh clone through go-live. Deferred: the tailgate
   rebuild (ENG-756), physical tags, an EAS build.*

**Precondition.** The Playwright web smoke is out of CI (dev-SSR stall,
`ci.yml` note). PR 1 rewrites every web route. Spend a bounded hour on the
stall first; if it does not give, run `bun run test:e2e` locally per PR and
say so in each PR body.

## Out of scope

Shopify API or any in-app commerce; feeds; push notifications; universal
links / AASA (V1.1); a Tailwind or NativeWind port; a mobile UI test
harness; renaming internal `gathering` identifiers in forks.
