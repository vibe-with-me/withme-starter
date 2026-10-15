<!--
One slice per PR. Say what changed and why in two or three sentences, and
link the issue. CONTRIBUTING.md and docs/the-slice.md explain the checklist.
-->

## What

## Why

Closes #

## Checklist

- [ ] **One slice, in order.** Contract → migration + RLS → RLS tests → API
      → web → mobile → e2e, each layer present if the change touches it
      ([docs/the-slice.md](https://github.com/vibe-with-me/withme-starter/blob/main/docs/the-slice.md)). Layers not
      touched are listed below as "not touched", not skipped silently.
- [ ] **RLS tests cover the negative space.** For any policy or
      security-definer change, a test in `packages/db/test` asserts what a
      stranger, a non-owner, a blocked user, and anon must *not* see, with
      a positive control so it cannot pass red.
- [ ] **Gate green locally.** `bun run lint && bun run typecheck && bun run
      test` against the local stack, plus the e2e harness this slice
      touches.
- [ ] **Invariant respected.** Nothing here ranks, recommends, aggregates,
      or monetizes, and no new path lists people someone has not met.
- [ ] **Stack unchanged.** No framework port, no alternate database, only
      Workers-compatible dependencies in `apps/api`.
- [ ] **Skill updated if a seam moved.** If this touches tokens, the
      destination union, the profile tiers, tab registration, or the deploy
      steps, the skill in `.agents/skills/` that documents that seam is
      updated in this PR.

## Layers

<!-- One line per layer: the file, or "not touched". -->

- Contract:
- Migration + RLS:
- RLS tests:
- API:
- Web:
- Mobile:
- E2E:
