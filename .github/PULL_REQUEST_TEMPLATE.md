<!-- Read CONTRIBUTING.md first. One change per PR, built in the order docs/the-slice.md sets. -->

## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Slice layers touched

- [ ] Contract (`packages/contract`)
- [ ] Migration + RLS (`supabase/migrations`)
- [ ] RLS tests (`packages/db/test`)
- [ ] API (`apps/api`)
- [ ] Web (`apps/web`)
- [ ] Mobile (`apps/mobile`)
- [ ] E2E (`apps/api/e2e`, `apps/web/e2e`)
- [ ] Skills or docs only

## RLS tests

<!-- A migration that changes a policy without a test asserting the new boundary is half a change. -->

- [ ] Added or changed an RLS test: <!-- which file, and which boundary it asserts -->
- [ ] No RLS test needed: <!-- why; e.g. no migration, no new read or write path -->
- [ ] A new read or write path answers "what does a blocked party see?" with "exactly what a stranger sees".

## The gate, run locally

With the stack up (`bun run db:start`, then `bun run db:reset && bun run db:seed`):

- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run test`
- [ ] The e2e harness this slice touches (`bun run --cwd apps/web test:e2e` or `bun run --cwd apps/api e2e`)
