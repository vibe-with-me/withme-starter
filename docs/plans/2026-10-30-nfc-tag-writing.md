# Writing NFC tags in the app: plan

Design: [2026-10-30-nfc-tag-writing-design.md](2026-10-30-nfc-tag-writing-design.md),
approved by the owner. Slice order; each test is written first and seen failing.

## 1. Contract

- **Files:** `packages/contract/src/schemas/tag.ts` (`MAX_OWNED_TAGS = 25`,
  `MintedTagSchema`), `packages/contract/src/contract/app.ts` (`app.tags.mint`,
  `POST /me/tags`).
- **Test:** `packages/contract/test/schemas.test.ts`: the output accepts a UID
  and rejects a malformed one.
- **Checkpoint:** `bun run --cwd packages/contract test`.

## 2. Migration + RLS

- **Files:** `supabase/migrations/20261030120000_mint_my_tag.sql`,
  `packages/db/src/types/supabase.ts` (regenerated).
- **Tests:** `packages/db/test/mint-tag.test.ts`: the row's shape; anon and a
  caller with no profile refused; the 25th succeeds and the 26th fails; a
  claimed sticker counts; concurrent mints cannot pass the cap; `claim_tag`
  cannot take a minted row; a stranger cannot update it; a stranger's tap shows
  the card; a blocked viewer gets the inactive answer.
  `packages/db/test/grants.test.ts`: the RPC joins the expected list.
- **Checkpoint:** `bun run db:reset && bun run db:types`, then
  `bun run --cwd packages/db test`.

## 3. API

- **Files:** `apps/api/src/routers/app.ts` (`tagsMint`).
- **Test:** `apps/api/test/app.test.ts`: returns the UID, needs a session, and
  the RPC's `P0004` surfaces as `TOO_MANY_REQUESTS`.
- **Checkpoint:** `bun run --cwd apps/api test`.

## 4. Web

Not touched.

## 5. Mobile logic

- **Files:** `apps/mobile/lib/tag-writer.ts` (record decoding, sticker decisions,
  lock policy, the write sequence over a small session interface, the URL-first
  read decision).
- **Test:** `apps/mobile/lib/tag-writer.test.ts`: every row of the design's
  sticker table; no mint before the check; no lock before the read-back passes;
  `http` never locks; each failure in the design's Errors; a matching URL, a
  foreign URL refused, and no NDEF falling back to the chip UID.
- **Checkpoint:** `bun run --cwd apps/mobile test`.

## 6. Mobile radio and screens

No logic left to test, so these are checked by the owner on a device (design →
What cannot be tested here).

- **Files:** `apps/mobile/lib/nfc.ts` (the real session, `writeTag`, URL-first
  `readTagUid`), `apps/mobile/app/write-tag.tsx`, `apps/mobile/app/_layout.tsx`,
  `apps/mobile/components/MyTags.tsx`, `apps/mobile/app/scan.tsx`,
  `apps/mobile/app.json`.
- **Checkpoint:** `bun run typecheck && bun run lint`, and the simulator shows no
  write buttons.

## 7. Docs and skills

- **Files:** `docs/nfc-tags.md`, `.agents/skills/provision-tags/SKILL.md`,
  `apps/mobile/README.md`.
- **Checkpoint:** every claim checked against the code as built.

## 8. Whole gate

`bun run lint && bun run typecheck && bun run test`, the coverage check on each
touched package, and the e2e harness. The harness gains no new flow, because no
web flow changed.
