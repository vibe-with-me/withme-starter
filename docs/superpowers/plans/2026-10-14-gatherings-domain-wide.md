# Gatherings domain-wide Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Every signed-in user sees every upcoming gathering in their domain with a headcount; who's going shows only the viewer and their accepted connections; the docs say so.

**Architecture:** One additive migration rewrites two select policies (gatherings: tenant-wide minus a block either way with the host; gathering_members: own row or a connection's row on a visible gathering), restores `profiles_select` to the initial schema, drops the `shares_gathering` bridge, and adds a definer headcount function that re-states the gathering's visibility. The contract gains `GatheringListItemSchema` and `app.gatherings.list`; `listMine` moves to `GET /me/gatherings`; `get` gains `member_count`. Both Events tabs grow a "Happening" section; the detail offers Join to any viewer. Spec: `docs/superpowers/specs/2026-10-14-gatherings-domain-wide.md`.

**Tech Stack:** Supabase (Postgres RLS, security-definer SQL), Zod + oRPC contract, TanStack Start (web), Expo Router (mobile), bun test (RLS), Playwright (web e2e).

---

## Ground rules

- Slice order: contract → migration + RLS tests → API → web → mobile → e2e → docs (`docs/the-slice.md`).
- Gate at every commit: `bun run lint && bun run typecheck && bun run test` (stack up). Typecheck is red in `packages/db` between Task 2 and Task 3 (tests call the new RPC before the types are regenerated) and in `apps/api` between Task 1 and Task 4 (the contract names a handler the router does not implement yet).
- `supabase/config.toml` may be edited locally to run this worktree's stack on free ports; never commit it. Stage files by name.
- Commit messages: imperative subject, the why in the body, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Contract

**Files:** `packages/contract/src/schemas/gathering.ts`, `packages/contract/src/contract/app.ts`, `packages/contract/test/schemas.test.ts`.

1. Add `GatheringListItemSchema = GatheringSchema.extend({ member_count, is_member, members })` and its type.
2. `app.gatherings.list` → `GET /gatherings` → `{ gatherings: GatheringListItem[] }` (upcoming, tenant-wide). `listMine` → `GET /me/gatherings`, same output. `get` output gains `member_count`.
3. Test: a list item parses; a negative `member_count` fails.
4. Commit: `Contract: gatherings.list, a list item with the viewer's view of who is going`.

### Task 2: Migration + RLS tests (TDD)

**Files:** `supabase/migrations/20261014220000_gatherings_domain_wide.sql`, `packages/db/test/gatherings.test.ts`, `packages/db/test/grants.test.ts`, `supabase/seed/index.ts`.

1. Rewrite the tests first (the spec's Tests section lists them). Run `bun run --cwd packages/db test` → the new assertions fail against the old policies.
2. Write the migration: `gatherings_select`, `gathering_members_select`, `profiles_select` (initial text), `drop function private.shares_gathering`, `public.gathering_member_counts(uuid[])` with `revoke … from public, anon` and `grant … to authenticated, service_role`.
3. `bun run db:reset && bun run db:seed` (seed adds Lin's gathering), then the db suite → green.
4. Commit: `DB: gatherings listed to the domain; who's going is connections-only`.

### Task 3: Types + queries + API

**Files:** `packages/db/src/types/supabase.ts` (`bun run db:types`), `packages/db/src/queries/gatherings.ts`, `apps/api/src/routers/app.ts`, `apps/api/e2e/handshake.e2e.ts`.

1. Queries: `listUpcomingGatherings(db, userId)`, `listMyGatherings(db, userId)` returning list rows enriched by one `gathering_members` select (RLS: self + connections) and one `gathering_member_counts` RPC; `getGathering` unchanged; `getGatheringMemberCount`.
2. Handlers: `list`, `listMine`, `get` (+ `member_count`).
3. API e2e §13 and §16 assert the new boundary; a blocked viewer's `get` is NOT_FOUND.
4. Commit: `API: gatherings.list with headcount and the viewer's connections going`.

### Task 4: Web

**Files:** `apps/web/src/routes/_app.gatherings.tsx`, `_app.gatherings_.$id.tsx`, `t.$uid.tsx`, `apps/web/e2e/gatherings.spec.ts`.

1. Events tab: Happening + Yours; rows with "N going", Hosting/Going, connections' names.
2. Detail: Join for non-members, "N going", TagPointer for members only; JoinCard stays for NOT_FOUND.
3. Resolver: membership from the member list.
4. e2e: guest joins from the detail, sees the count and not the host; connects through the host's profile tag; sees the host in who's going; the feed shows the gathering.
5. Commit: `Web: the Events tab lists what is happening in the domain`.

### Task 5: Mobile

**Files:** `apps/mobile/app/(tabs)/gatherings.tsx`, `app/gathering/[id].tsx`, `app/t/[uid].tsx`. Mirror Task 4. Commit: `Mobile: the Events tab lists what is happening in the domain`.

### Task 6: Docs

**Files:** `README.md`, `docs/the-slice.md`, `docs/skills-roadmap.md`, `docs/superpowers/program.md`, `docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md` (one-line revision note), `.agents/skills/customize-gathering/SKILL.md`, contract and UI comments. Commit: `Docs: gatherings are listed to the domain; who's going is connections-only`.

### Task 7: Gate, review, PR

`bun run lint && bun run typecheck && bun run test`; `cd apps/web && bunx playwright test`; API e2e. Code review subagent; open the PR against `main`; note that PR 17's four gathering lines get the new wording when this branch syncs.
