# Admin foundation — plan

Design: [2026-10-23-admin-foundation-design.md](2026-10-23-admin-foundation-design.md).
Slice order; each task names its test and checkpoint.

1. **Contract.** `packages/contract/src/schemas/admin.ts` (list item,
   report, detail), `src/contract/admin.ts` (`session`, `reports.list`,
   `reports.get`), `contract.admin` in `src/index.ts`.
   Test: `packages/contract/test/admin.test.ts` — a list row and a detail
   parse; an unknown reason, a non-uuid id and a missing key fail.
   Checkpoint: `bun run --cwd packages/contract test`.
   Commit: "Contract: the admin surface".

2. **Migration + RLS.** `supabase/migrations/<ts>_admin_foundation.sql`:
   `private.operators`, `private.is_operator()`, `public.is_operator()`,
   `public.admin_list_open_reports()`, `public.admin_get_report(uuid)`,
   `public.reports.resolved_by`. Then `db:reset` and `db:types`.
   Tests (written first): `packages/db/test/admin.test.ts` (refusals for a
   non-operator and anon with positive control, order, purge, detail
   shape, nulls after deletion, unknown id, tenant seam, PostgREST cannot
   reach the table); `grants.test.ts` (signed-in list, private helper
   closed, gathering reader reason); `cascade.test.ts` (role gone after
   deletion, `resolved_by` set null).
   Checkpoint: `bun test` in `packages/db` against the 557xx stack.
   Commit: "DB: operators and the admin read functions".

3. **DB queries.** `packages/db/src/queries/admin.ts` (`isOperator`,
   `listOpenReports`, `getReportForOperator`), exported from the index.
   Test: the same `admin.test.ts`, one test through the helpers.
   Commit with task 2.

4. **API.** `adminProcedure` in `apps/api/src/lib/orpc.ts`,
   `apps/api/src/routers/admin.ts`, `admin` in the RPC handler.
   Test: `apps/api/test/admin.test.ts` on the harness.
   Checkpoint: `bun run --cwd apps/api test`, coverage for the new files.
   Commit: "API: adminProcedure and the admin router".

5. **Web.** `apps/web/src/routes/admin.tsx` (layout: `ssr: false`, the
   session and operator check, not-found otherwise) and
   `admin.index.tsx` (heading, three "coming soon" sections).
   Test (written first): `apps/web/e2e/admin.spec.ts`.
   Checkpoint: `bun run --cwd apps/web test:e2e admin --repeat-each=3`.
   Commit: "Web: the guarded /admin area".

6. **Seed and docs.** Local operator in `supabase/seed`, `db:operator`
   script; safety-model "Operators", moderation "Your first operator",
   testing map rows. Checkpoint: `bun run db:seed` prints the operator;
   links resolve. Commit: "Seed and docs: operators".

7. **E2E harnesses.** API e2e admin block in
   `apps/api/e2e/handshake.e2e.ts`; the whole web e2e suite.
   Checkpoint: `bun run --cwd apps/api e2e` and
   `bun run --cwd apps/web test:e2e`.
