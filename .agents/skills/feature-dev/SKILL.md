---
name: feature-dev
description: Use when starting a new feature, an enhancement, or any change to app behavior that will end in a pull request, in a withme-starter app or fork. Not for a typo, a docs-only change, or a whole-app skill in .agents/skills/ (make-it-yours, go-live, provision-tags), which carries its own steps.
---

# feature-dev — from idea to pull request, with gates

A feature moves through eight steps, and each one ends at a gate. The
gates exist because the easy steps to skip are the ones that cost most
later: the starter itself was built without a test gate, and its API,
mobile logic and push jobs went untested until a catch-up PR wrote them
months afterwards. Here, a layer's tests ship in the same PR as the
layer, or the PR does not open.

This is a process skill, not a recipe: it builds nothing by itself. It
runs a feature through [docs/the-slice.md](../../../docs/the-slice.md),
which owns the build order, and points to the docs that own the rest.

**First, read [settings.md](settings.md).** It holds what a fork
chooses: base branch, branch prefix, issue tracker, where plans go, how
the app is verified, what reviews the PR, and who merges. This file
says "the base branch", "the plans folder" and so on for those values.

**How to run it.** In any agent that reads `.agents/skills/` (Claude
Code, Codex, Cursor and others): "Run `.agents/skills/feature-dev/SKILL.md`
for <the feature>". To get `/feature-dev` in Claude Code, link it into
`.claude/skills/` once per clone
([reference.md → Running it](reference.md#running-it)).

**Other skills are optional.** Where a step names a skill (for example
`superpowers:brainstorming`), use it if your agent has it installed. If
not, the plain steps in [reference.md](reference.md) do the same job.
Nothing here depends on a plugin.

**Checkpoints.** Every step ends with one. Run it and read the output
before calling the step done; never loosen a test to pass one; after
two failed attempts, stop and tell the owner
([docs/the-slice.md → Checkpoints](../../../docs/the-slice.md#checkpoints)).

<HARD-GATE>
No implementation code before steps 1–3 pass: an approved design, a
plan, and a branch with the plan committed. No pull request before
steps 5–7 pass: every touched layer has its tests, the gate is green,
the change was seen working in the running app, and the diff was
reviewed. The owner can waive a gate in words for this feature; say so
in the PR. Nothing else waives one.
</HARD-GATE>

## 1. Design

Talk the feature through with the owner before any code: what it does,
for whom, which layers of the slice it touches, the empty and error
states, and what a stranger, a blocked user and anon see. Ask one
question at a time and wait for each answer.
(`superpowers:brainstorming` if installed; otherwise
[reference.md → Design](reference.md#design).)

Before the questions, look in `.agents/skills/` for a recipe that
covers the change: a field or a new noun on a gathering is
`customize-gathering`, a profile field is `extend-profile`, a new tag
destination is `add-destination-type`. When one does, its steps are the
build steps for step 4 (the files, the functions to redefine, the tests
to extend), and this skill's gates still apply around them. Name the
recipe in the design doc.

Hold the design against the starter's invariants before writing it
down. Nothing ranks, recommends, aggregates or monetizes; there is no
browse or search surface for people; RLS decides access, not UI; no
response tells a caller whether a row they cannot see exists; a blocked
party sees exactly what a stranger sees; new tables carry the tenant
seam ([docs/skills-roadmap.md](../../../docs/skills-roadmap.md),
[docs/safety-model.md](../../../docs/safety-model.md),
[docs/the-slice.md → The safety discipline](../../../docs/the-slice.md#the-safety-discipline)).
A design that breaks one goes back to the owner as a question, not
forward as a plan. A written brief (a ticket, a handed-over task)
answers what it covers; it does not approve the design
([reference.md → Design](reference.md#design)).

**Checkpoint:** a design doc in the plans folder, named
`YYYY-MM-DD-<slug>-design.md`, that the owner has approved in words.
It lists every slice layer as touched or "not touched".

## 2. Plan

Turn the design into tasks in slice order: contract → migration + RLS →
RLS tests → API → web → mobile → e2e. Every task that adds or changes
code names the test that pins it and the file the test goes in
([reference.md → Where each layer's tests live](reference.md#where-each-layers-tests-live)).
A task with no test is a planning bug: fix the plan.
(`superpowers:writing-plans` if installed; otherwise
[reference.md → Plan](reference.md#plan).)

A change inside one file of one layer can use the design doc as its
plan, but the design doc still names the tests.

**Checkpoint:** `YYYY-MM-DD-<slug>.md` in the plans folder, and every
code task in it names a test file.

## 3. Branch and commit the plan

Start from the latest base branch, never from another feature branch
unless the owner asks for a stack:

```sh
git fetch origin && git switch --no-track -c <prefix><slug> origin/<base>
```

Use a worktree named after the slug if your agent works in worktrees
(`git worktree add --no-track ../<slug> -b <prefix><slug> origin/<base>`). A fresh
worktree needs its own `bun install`, and the two plan files are still
untracked in the old checkout: move them into the worktree's plans
folder. Then commit the plans on their own, before any code:

```sh
git add <plans folder> && git commit -m "docs: plan <feature>"
```

**Checkpoint:** `git log --oneline origin/<base>..HEAD` shows exactly
the plan commit, and `git status` is clean.

## 4. Build the slice, tests with each layer

Work the plan in order. For each layer: write its test first and watch
it fail for the stated reason, then write the code, then watch the test
pass (`superpowers:test-driven-development` if installed). Commit when
a layer is green, not at the end. A layer with no code of its own for
the feature (an API handler that forwards the contract's patch) still
gets tests: they pin the earlier layer's behaviour through this one,
may pass on their first run, and say which layer they pin. Independent
tasks can go to subagents (`superpowers:subagent-driven-development`); coupled ones run
in sequence.

The layer rules (tenant seam, per-command policies, thin handlers, the
card idiom, tokens only) are in
[docs/the-slice.md](../../../docs/the-slice.md). The local stack, ports,
demo accounts and the service-role key are in
[docs/local-development.md](../../../docs/local-development.md).

A migration is applied and its types regenerated as soon as it is
written (`bun run db:reset && bun run db:types`, then `bun run db:seed`
for the demo data), before its tests can pass and before the queries
and API use it
([reference.md → Notes](reference.md#where-each-layers-tests-live)).

**Checkpoint, per layer:** that layer's test command from
[reference.md → Where each layer's tests live](reference.md#where-each-layers-tests-live)
passes, and the commit is made.

## 5. Test gate

The gate this skill exists for. Before anything else, prove every
touched layer is tested:

1. **Every touched layer has tests in this branch.** Read
   `git diff --stat origin/<base>...HEAD` against the layer table in
   [reference.md](reference.md#where-each-layers-tests-live). A layer
   with source changes and no test changes fails the gate. Where no
   test can pin a change (a pure style change, say), ask the owner to
   waive this item and record the waiver in the PR.
2. **Coverage on each touched package with a unit suite.** Run
   `bun test --coverage` in it (scoped as its `test` script is) and
   find every new or changed source file in the table. Web routes,
   components and mobile screens are gated by the e2e and step 6
   instead. A new file at
   0%, or missing from the table, fails the gate: Bun lists only files
   a test loaded, so missing means untested.
   [reference.md → Coverage](reference.md#coverage) has the commands.
3. **Every new SQL object is named in a test.** Each function, policy,
   trigger and constraint in a new migration, and each change to a
   function it redefines, is exercised by a test in
   `packages/db/test`, negative space included (a stranger, a
   non-owner, a blocked user, anon), each with a positive control.
4. **The verification gate is green.** `bun run lint && bun run
   typecheck && bun run test` against the local stack, plus the e2e
   harness the slice extended
   ([docs/the-slice.md → The verification gate](../../../docs/the-slice.md#the-verification-gate)).

**Checkpoint:** all four, with the commands' last lines read. Missing
tests are written now, in this branch, never "in a follow-up".

## 6. See it working

Tests pass in isolation; this step watches the feature work. For any
change a person can see, run the app, drive the changed flow along its
happy path as a user would, and save a screenshot of the result to the
screenshots folder. Web and mobile each get their own run when both
changed. Use the methods in settings.md;
[reference.md → Verification](reference.md#verification) has the
commands and the demo sign-in.

Reset the demo data first (`bun run db:reset && bun run db:seed`): the
RLS suite leaves test users behind.

A change with no visible surface (a policy, a job, an API-only field)
skips the drive with one line in the PR: "no UI to verify". When the
tooling itself is broken, try once more, then stop and tell the owner
what blocked it. Go on only if they waive the drive, and record the
waiver in the PR.

**Checkpoint:** one screenshot per changed platform in the screenshots
folder, the "no UI to verify" line, or the owner's waiver.

## 7. Review

Read the whole diff as a reviewer would, with the checklist in
[reference.md → Self-review](reference.md#self-review): a test for every
behavior, the invariants, no secrets, no leftover debugging, docs and
skills updated where a seam moved
([CONTRIBUTING.md](../../../CONTRIBUTING.md)). Fix what it finds and
rerun the step 5 gate (`superpowers:requesting-code-review` if
installed). If settings.md names a reviewer that runs before the PR (a
CLI), run it now. A reviewer that runs on the PR is handled in step 8.
Either way, address every finding, nitpicks included: fix it, or answer
it with the reason.

**Checkpoint:** the self-review checklist passes, and the gate from
step 5.4 is green after the last fix.

## 8. Pull request

Push the branch and open the PR against the base branch. Fill in the
repo's template (`.github/PULL_REQUEST_TEMPLATE.md`): the Layers section
lists each layer's file or "not touched". Add a **Tests** section (each
layer and its test files, the coverage of new files) and a
**Verification** section (what was driven on which platform, and the
screenshot paths). Link the plans and, if settings.md names a tracker,
the ticket. [reference.md → Pull request](reference.md#pull-request)
has a body to start from and how the screenshots get onto the PR.

CI and the PR reviewer from settings.md run after the PR opens. Fix
what they find on this branch, rerun the gate before each push, and
answer every reviewer finding in its thread (fixed, or why not). Then
follow the merge line in settings.md.

**Checkpoint:** the PR is open, CI is green, every reviewer finding is
fixed or answered, and the Tests and Verification sections are filled in.

## Red flags: stop and go back

| You notice | Go back to |
| --- | --- |
| Writing code with no approved design | 1 |
| A plan task with no test file next to it | 2 |
| Code on a branch cut from an old or unrelated base | 3 |
| "I'll write the tests in a follow-up" | 4: tests ship with their layer |
| A layer changed in the diff with no test change beside it | 5 |
| A new file at 0%, or not in the coverage table | 5 |
| A new policy or function no test names | 5 |
| "The tests pass, so it works" for a UI change | 6 |
| Skipping a reviewer finding because it is a nitpick | 7, or 8 for a reviewer on the PR |
| Loosening a test, policy or CHECK to get a checkpoint green | Stop: tell the owner |
