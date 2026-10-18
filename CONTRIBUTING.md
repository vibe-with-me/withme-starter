# Contributing to withme-starter

Thanks for helping. This file is short on purpose: it says what the repo
will and will not take, and points at the docs that explain why. Read the
[README](README.md) first; it is the product and the thesis in one page.

Maintained on a best-effort basis, no support SLA. v0.x: breaking changes
expected.

## What the repo takes

**The V1 invariant.** The starter's job is the moment after a physical tap.
It has nothing that ranks, recommends, aggregates, or monetizes, and it will
not grow any. Software that decides who you should meet is a different
product, and the no-enumeration promise depends on not building one. A
proposal that needs any of those four is off-thesis here; a fork can build
it, the skills will not. [What this is not](README.md#what-this-is-not)
says the same thing at more length.

**The stack is fixed.** TanStack Start, Hono, oRPC, Cloudflare Workers,
Supabase, Bun. The tests, the skills, and the deploy runbook all assume
them. Framework ports (Next.js, Express, another database) are out of scope
and will be closed without debate. [docs/stack.md](docs/stack.md) explains
each choice; fork freely if you want different ones.

**Bugs, safety regressions, doc fixes, and extensions that respect the two
rules above** are welcome. So is a new skill, or a fix to an existing one,
when it comes from a real fork (see below).

## How a change ships

Every change enters the codebase as one vertical slice, in a fixed order:
contract, migration and RLS, RLS tests, API, web, mobile, e2e.
[docs/the-slice.md](docs/the-slice.md) is that map, with the real file that
plays each role today. Read it before you open a PR; the review will ask
where each layer of your slice is, and a slice nobody can walk end to end
is not done.

Docs-only changes are the exception: they need no slice. Check that every
link and file name you cite still exists.

Two things the slice doc says that are worth repeating:

- **Tests are the spec.** Every safety property exists twice: once in SQL,
  once as a test in `packages/db/test` that fails if it regresses. A
  migration that changes a policy without a test asserting the new boundary
  is half a change. Cover the negative space: what a stranger, a non-owner,
  a blocked user, and anon must *not* see.
- **The web and mobile apps own no data access.** Every read and write goes
  through the contract and the API, which runs as the signed-in user, never
  as an admin.

Three rules for migrations, because several PRs are often open at once
and forks merge every one of them:

- **A new migration sorts last.** Name it with a timestamp later than both
  now and the newest file in `supabase/migrations` on `main`, and recheck
  right before you merge: if another PR landed one after yours, rename
  yours. Hosted projects apply migrations with `supabase db push`, which
  refuses a file older than one already applied (the starter's demo does
  this on every merge to `main`).
- **Redefining a function starts from its newest body.** Several
  migrations restate the same function (`delete_my_account`,
  `create_gathering`, `resolve_tag`). Copy the latest definition, found
  with `grep -l 'function public.<name>' supabase/migrations/* | sort |
  tail -1`, and add your lines to it. Starting from an older one silently
  drops whatever landed since.
- **Say when you redefine something forks change.** The skills tell forks
  to change these, so a starter migration that redefines one replaces the
  fork's version on its next sync with no git conflict:
  - functions `create_gathering` (customize-gathering), `resolve_tag`,
    `report_gathering` (customize-gathering, extend-profile),
    `accept_connect_request` and `report_user` (extend-profile);
  - the host's column grant on `public.gatherings` (customize-gathering);
  - the `tags_destination_shape` constraint (add-destination-type).

  A PR that redefines one says so in its title ("redefines
  `create_gathering`") and in its description, which also says what a
  fork re-applies. When it changes a signature, it drops the old one with
  `drop function if exists`, and the description notes that a fork may
  have a different signature of its own to drop (docs/staying-current.md,
  Migrations). `bun run sync:check` is the fork's side of this.

## The verification gate

With the local stack up (`bun run db:start`, then `bun run db:reset &&
bun run db:seed`), from the repo root:

```sh
bun run lint && bun run typecheck && bun run test
```

All three must be green before you open a PR, and the e2e harness your
slice touches must pass too. [Local development](docs/local-development.md)
has the setup, the ports, and the fixes for what goes wrong on a fresh
machine.

## Review

A PR merges when CI is green and CodeRabbit's review is clean, meaning its
findings are either fixed or answered. CI runs lint, typecheck, build, the
RLS suite against Supabase local, and the Playwright smoke; it is the same
gate as above plus the production-build smoke. Keep PRs to one slice. A PR
that bundles a refactor with a feature gets asked to split.

## Skills are recipes, not features

[`.agents/skills/`](.agents/skills/) holds runbooks that a fork (or its AI
agent) runs to turn the starter into its own app: a rebrand, vertical
profile fields, a new destination type, a deploy. They are **extension
recipes, not features in core**. The feature a skill produces lives in the
fork that ran it; the starter stays pure handshake.

Three consequences for contributions:

- A feature idea that belongs to one vertical is a skill candidate, not a
  PR against the app. Open a feature issue and say so.
- A skill is written from a working implementation, never from
  imagination: build it for real in a fork, then distill the steps. The
  issue template asks which fork it was built in.
- A change to a seam a skill documents (tokens, the destination union, the
  profile tiers, the tab registration, the deploy steps) has to update that
  skill in the same PR, or the skill rots.

How a skill is written. Skills must work in any agent that reads
`.agents/skills/`, so they stand alone: no dependency on another plugin's
skills.

- **The `description` says when to use the skill, never what it does.**
  Start with "Use when…" and name the situations that call for it (a new
  profile field, a rebrand, a first deploy). Do not summarise the steps:
  an agent that finds the workflow in the description follows that
  summary instead of reading the skill.
- **`SKILL.md` is a runbook an agent can read in one pass.** Long code,
  SQL, templates, worked examples and troubleshooting tables go in files
  beside it (`reference.md`, `variants.md`, `troubleshooting.md`), linked
  from the step that needs them. Golf-sized depth on one vertical goes to
  [docs/run-with-me.md](docs/run-with-me.md) → Variations.
- **Every step ends with a checkpoint** that names the command and what
  passing output looks like. Counts and file lists that change as the
  starter grows are commands, not numbers: say what to run and what its
  output means. The shared rules (run it before claiming it, never loosen
  a test, what to do when one fails) live once, in
  [docs/the-slice.md → Checkpoints](docs/the-slice.md#checkpoints); each
  skill's preamble points there.

How a skill change is validated. Reading it is not enough: an agent runs
the changed skill literally, word by word, on a fresh clone of the
starter (or a throwaway fork), the way Golf With Me's rebuild did. Where
the skill is missing a step, has steps out of order, or says something
the code contradicts, the agent writes it down in an `UPSTREAM-SNAGS.md`
kept outside the PR: what the skill said, what happened, and what it did
instead. Fix each snag in the skill, then run the changed skill again on
a fresh clone; repeat until a run is clean, and merge only after that
clean run. Mention the runs and the snag count in the PR description.

[docs/skills-roadmap.md](docs/skills-roadmap.md) records which skills
exist, which were deliberately skipped, and the decisions behind both.

## Labels

| Label | Means |
| --- | --- |
| `help wanted` | A maintainer would take a PR for this and has written down enough to start. |
| `good first issue` | Scoped to one layer of the slice, or docs only; a first PR fits here. |
| `skill` | Belongs in `.agents/skills/`: a new recipe, a fix to one, or a seam change that must update one. |
| `invariant` | The proposal needs a discussion about the V1 invariant before anyone writes code. Expect it to be closed or re-scoped, not merged as written. |

## Releasing `@vibewithme/nfc` (maintainers)

`.github/workflows/release.yml` publishes the SDK to npm when an `nfc-v*`
tag is pushed. It runs three jobs, each with only the permissions it needs:

- **`build`** (read-only) installs, lints, typechecks, builds, tests, and
  checks the package, then packs the tarball and records its SHA-256.
- **`publish`** is the only job that can get an npm OIDC token. It runs
  no project code: it downloads that tarball, refuses it if the hash
  changed, and publishes it.
- **`github-release`** creates the GitHub Release once the publish lands.

Four things gate the publish:

- **The tag.** A ruleset on `refs/tags/nfc-v*` lets only repository admins
  create a release tag and blocks moving, deleting, or force-pushing one.
  Admins can bypass the ruleset, so don't move or delete a published tag:
  a published version stays tied to the commit it was built from.
- **The `npm` environment.** The `publish` job runs in it, and it accepts
  only `nfc-v*` tags. Once the repo is public, a maintainer must approve
  each deployment before that job starts.
- **npm trusted publishing.** There is no npm token. npm accepts a publish
  of `@vibewithme/nfc` only from this repository's `release.yml` running
  in the `npm` environment, and the package refuses tokens that bypass
  2FA. Renaming the workflow file or the environment breaks the publish
  until the package's Trusted Publisher settings on npmjs.com match.
- **The version check.** The tag must match `packages/nfc-sdk/package.json`,
  and lint, typecheck, build, tests, and the publish-artifact checks must
  pass before anything is published.

To cut a release:

1. Merge a PR that bumps `version` in `packages/nfc-sdk/package.json`.
2. Tag that commit on `main` and push the tag:
   `git tag nfc-v0.2.0 && git push origin nfc-v0.2.0`.
3. In the Actions tab, open the Release run. Once `build` is green,
   approve the `npm` deployment ("Review deployments"). Until the repo is
   public the environment has no reviewer, and `publish` starts right away.
4. `publish` publishes with provenance, then `github-release` creates the
   GitHub Release.

## Where things go

- **Bugs and proposals:** [Issues](https://github.com/vibe-with-me/withme-starter/issues),
  using the templates.
- **Questions and "would this fit":** Discussions, once the repo is public.
- **Security issues** (anything that lets someone see a card, a connection,
  or a gathering they should not): do not open a public issue. Use
  GitHub's private vulnerability report on the Security tab, or contact a
  maintainer directly.

## License

MIT. By contributing you agree your contribution is licensed the same way.
