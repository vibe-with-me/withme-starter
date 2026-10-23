# Admin foundation — design

Issue: [#134](https://github.com/vibe-with-me/withme-starter/issues/134),
part of #100. Blocks #135 (reports queue), #136 (tag inventory) and #137
(gatherings).

**Brief and approval.** The design is the issue's "Shape" and
"Acceptance criteria", written by the owner (Alex). The session that
handed this over, acting for the owner, said to build it as one PR and
resolved the one open question: add `resolved_by uuid` to
`public.reports` here ("Alex's lean"). No recipe in `.agents/skills/`
covers an admin surface; this is a new seam.

## The problem

Every admin page in #100 must read what normal users can't (reports, any
card, any gathering), and the API Worker holds no service-role key: every
query runs under the caller's JWT and RLS. So the way in is an operator,
a signed-in person the database recognises as one, and every admin read
or write is a security-definer function that checks that first.

## Approach

- **`private.operators`** (`user_id` → `public.profiles` on delete
  cascade, `tenant_id` with the seam default, `granted_at`). RLS on, no
  policies, no privilege for anon or authenticated. Rows are written only
  by SQL (the SQL Editor, a migration, or the local seed). No function
  makes an operator.
- **`private.is_operator()`**: stable, security definer,
  `search_path = ''`; true when `auth.uid()` has a row for the current
  tenant. Not executable by any client role.
- **`public.is_operator()`**: the one door to that answer for the API
  (PostgREST does not expose `private`). Authenticated only; it answers
  about the caller and nobody else, so it is not an oracle.
- **`public.admin_list_open_reports()`**: 42501 for a non-operator before
  anything else, then `private.purge_expired_reports()`, then the
  moderation.md "Open reports" columns for open reports in the tenant,
  `child_safety` first, then oldest first (id breaks ties).
- **`public.admin_get_report(p_id)`**: 42501 first, then the purge, then
  `{ report, card, gathering, open_reports_about_them }`: the report row
  (without the reporter's id), the reported person's current card (null
  once the account is gone), the current gathering when `gathering_id` is
  set (null once deleted), and the open-report count about that person.
  An id that is not a report in the tenant is P0003 (NOT_FOUND), which an
  operator may learn.
- **`public.reports.resolved_by uuid`** → `public.profiles` on delete set
  null. Nothing writes it yet; #135's resolve function fills it in.
- **API**: `contract.admin` (session, reports.list, reports.get).
  `adminProcedure` builds on the `appProcedure` check, then calls
  `public.is_operator()` through the caller's client and throws FORBIDDEN.
  Every `admin.*` handler is built on it. A 42501 from an admin function
  (an operator removed mid-session) also answers FORBIDDEN.
- **Web**: an `admin` layout route (`/admin`), `ssr: false`. Signed in and
  an operator: a heading and the three sections, each "coming soon".
  Anyone else, signed out included, gets the app's normal not-found page,
  so the URL never confirms an admin area exists. (The issue's shape says
  `requireSession`, which would send a signed-out visitor to /login with
  `returnTo=/admin`; the acceptance criteria say not-found for signed out,
  and that is what this does.) No link to `/admin` anywhere in the app.
- **Seed**: a local-only operator account
  (`operator@demo.withme.local`), never on a hosted project (the demo
  logins are shared). `bun run db:operator <email>` makes any local
  account an operator, the same way.

## Layers

| Layer | Change |
| --- | --- |
| Contract | `schemas/admin.ts`, `contract/admin.ts`, `contract.admin` in `index.ts` |
| Migration + RLS | `<ts>_admin_foundation.sql` |
| RLS tests | `admin.test.ts` (new), `grants.test.ts`, `cascade.test.ts` |
| DB queries | `queries/admin.ts` |
| API | `adminProcedure` in `lib/orpc.ts`, `routers/admin.ts`, `index.ts` |
| Web | `routes/admin.tsx`, `routes/admin.index.tsx` |
| Mobile | not touched (web only, by the issue) |
| E2E | `apps/api/e2e/handshake.e2e.ts` (admin block), `apps/web/e2e/admin.spec.ts` |
| Seed / docs | `supabase/seed`, safety-model, moderation, testing |

## Who sees what

| Caller | `is_operator` | admin functions | `/admin` |
| --- | --- | --- | --- |
| anon | refused (no grant) | refused (no grant) | not found |
| signed in, not an operator | `false` | 42501, nothing read | not found |
| operator of another tenant | `false` | 42501 | not found |
| operator | `true` | the tenant's reports | the admin home |

A blocked party: blocks don't apply to operators (they read every report
in the tenant). The reported person and the reporter still read nothing.

## Tests that prove it

- `packages/db/test/admin.test.ts`: non-operator and anon get 42501 and
  no data from both functions; positive control as an operator; order
  (child_safety first, then oldest); expired reports purged first; detail
  shape (card, gathering, count; null card after deletion, null gathering
  after deletion); unknown id P0003; tenant seam (an operator row in
  another tenant is refused, a report in another tenant is invisible);
  operators table unreachable through PostgREST.
- `grants.test.ts`: the new RPCs in the signed-in list, `private.is_operator`
  executable by no client role, `admin_get_report` in the gathering
  readers with its reason.
- `cascade.test.ts`: an operator who deletes their account loses the role,
  and a report they resolved keeps its row with `resolved_by` cleared.
- `apps/api/test/admin.test.ts`: adminProcedure (UNAUTHORIZED with no
  token, FORBIDDEN when `is_operator` is false, no admin query made),
  the handlers' mapping.
- `apps/api/e2e/handshake.e2e.ts`: UNAUTHORIZED anon, FORBIDDEN
  non-operator, an operator lists and gets a report through the Worker.
- `apps/web/e2e/admin.spec.ts`: operator sees the admin home; a normal
  user and a signed-out visitor see the not-found page.
