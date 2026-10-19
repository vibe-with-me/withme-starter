# feature-dev — reference

Detail for the steps in [SKILL.md](SKILL.md). Fork choices (base branch,
prefix, tracker, plans folder, verification, review, merge) are in
[settings.md](settings.md); `<base>` below is the base branch from there.

## Design

(Step 1, when `superpowers:brainstorming` is not installed.)

1. Read what exists first: the files the feature would touch, the
   nearest shipped example in [docs/the-slice.md](../../../docs/the-slice.md),
   and the safety-model sections it comes near
   ([docs/safety-model.md](../../../docs/safety-model.md)).
2. Ask the owner one question at a time, each with your recommended
   answer, and wait. The questions that always apply: who sees it (the
   owner, connections, everyone signed in, anon), what a blocked user
   and a stranger see, the empty and the error state, what happens on
   web and on mobile, and whether it needs a new table, a new function,
   or only a new screen.
3. Offer two or three approaches when there is a real choice, with the
   one you would pick first and why.
4. Write the design doc: the problem in two sentences, the chosen
   approach, the layers table (each slice layer: what changes, or "not
   touched"), who sees what, and the tests that will prove it. Short is
   fine; missing is not.
5. Ask the owner to approve the doc as written. Their "yes" is the gate.

A design that needs a ranked list, a people search, a "people near you"
view, a count that reveals a hidden row, or a check done in UI instead
of RLS breaks an invariant. Say which one and ask how the owner wants
to proceed; do not design around it quietly.

## Plan

(Step 2, when `superpowers:writing-plans` is not installed.)

One task per layer the design touches, in slice order. Each task has:

- the files it creates or changes;
- the test it adds, its file, and what that test asserts (for a policy:
  the positive case and each refused caller);
- the checkpoint command from the table below;
- the commit message.

Tasks small enough to finish and commit in one sitting. If a task
cannot name its test, the design is not settled: go back to step 1.

## Where each layer's tests live

Run each command from the repo root. The DB suite and both e2e
harnesses need the local stack (`bun run db:start`) and the
service-role key exported in the shell
([docs/local-development.md → The service-role key](../../../docs/local-development.md#the-service-role-key)).

| Layer | Source | Tests | Command |
| --- | --- | --- | --- |
| Contract | `packages/contract/src/` | `packages/contract/test/*.test.ts`, negative cases included (unknown variants fail to parse) | `bun run --cwd packages/contract test` |
| Migration + RLS | `supabase/migrations/` | `packages/db/test/*.test.ts`, through per-user clients (`createTestUser`, `anonClient`); `admin` only for setup | `bun run --cwd packages/db test` |
| DB queries | `packages/db/src/queries/` | the same suite, through the query helper | same |
| API | `apps/api/src/` | `apps/api/test/*.test.ts`, on the harness in `apps/api/test/harness.ts` (stub bindings, a fake Supabase behind `fetch`, real JWT checks) | `bun run --cwd apps/api test` |
| Web logic | `apps/web/src/lib/` | a `*.test.ts` beside the module | `cd apps/web && bun test src/lib` |
| Web flows | `apps/web/src/routes/`, `components/` | `apps/web/e2e/*.spec.ts` (Playwright on the production build), sharing `e2e/helpers.ts` | `bun run --cwd apps/web test:e2e` |
| Mobile logic | `apps/mobile/lib/` | a `*.test.ts` beside the module | `bun run --cwd apps/mobile test` |
| Mobile screens | `apps/mobile/app/`, `components/` | none: move the logic into `lib/` and test it there; the screen is checked in step 6 | — |
| SDK | `packages/nfc-sdk/src/` | `packages/nfc-sdk/test/` (Vitest), including type parity with the contract | `bun run --cwd packages/nfc-sdk test` |
| SDK through the Worker | — | `apps/api/e2e/handshake.e2e.ts` | `bun run --cwd apps/api e2e`, with `cd apps/api && bun run dev` in another shell |

Notes:

- **No API harness yet?** If `apps/api/test/harness.ts` is not in your
  checkout, your copy of the starter predates it. Merge the starter
  ([docs/staying-current.md](../../../docs/staying-current.md)) to get
  it. Until then, an API change is tested by extending
  `apps/api/e2e/handshake.e2e.ts`, and the PR says the unit tests wait
  on the harness.
- **No web unit tests yet?** `apps/web` has no `test` script. The first
  feature that adds a `src/lib` test adds `"test": "bun test src/lib"`
  to `apps/web/package.json`, so `bun run test` (turbo) runs it from
  then on.
- **Logic both apps need** goes in the contract and is tested once
  there (`mapsSearchUrl` is the precedent), not copied into two `lib/`
  folders.
- **A screen is not tested by a unit test.** Pull its decisions (what
  to show, which state it is in, how a value formats) into a pure
  function in `lib/`, test that, and keep the component thin.

## Coverage

(Step 5.2.) In each touched TypeScript package, run its tests with an
lcov report, then look up every source file the branch added or
changed. Example for the contract; swap the folder and the test scope
for another package (`apps/api`: `bun test test`; `apps/mobile`:
`bun test lib`; `packages/db`: `bun test --timeout 20000`, stack up):

```sh
cd packages/contract
bun test --coverage --coverage-reporter=lcov
for f in $(git diff --name-only --diff-filter=AM --relative origin/<base>...HEAD -- src | grep -E '\.tsx?$' | grep -v '\.test\.'); do
  hit=$(awk -v f="SF:$f" '$0==f{on=1;next} on&&/^LH:/{print substr($0,4);exit} /^end_of_record/{on=0}' coverage/lcov.info)
  echo "${hit:-MISSING} lines hit  $f"
done
rm -rf coverage
```

`MISSING` means no test imported the file; `0` means a test imported it
and ran none of it. Either fails the gate. For a number, plain
`bun test --coverage` prints the per-file table; a changed file well
below its neighbours deserves a look at its uncovered lines.

The SDK uses Vitest: `bun run --cwd packages/nfc-sdk test -- --coverage`.

**SQL is not in any coverage report.** List what a new migration
creates and look for a test that names it:

```sh
for m in $(git diff --name-only --diff-filter=A origin/<base>...HEAD -- supabase/migrations); do
  grep -oiE 'create (or replace )?(function|policy|trigger) +"?[a-z0-9_.]+' "$m" | awk '{print $NF}' | tr -d '"' | sed 's/.*\.//'
done | sort -u | while read -r n; do
  echo "$(grep -rlw "$n" packages/db/test | wc -l | tr -d ' ') test files  $n"
done
```

A `0` is a prompt, not a verdict: triggers and policies are often
exercised by behavior rather than by name (a policy by a refused
select, a trigger by the row it writes). For each `0`, find the test
that exercises it and say which in the PR, or write one.

## Verification

(Step 6.) Start what the change needs, from the repo root:

```sh
bun run db:start
bun run db:reset && bun run db:seed     # clean demo data
bun run dev                             # API on :8786, web on :3000
```

Sign in as a demo user, or with the local phone number and code
([docs/local-development.md → The demo](../../../docs/local-development.md#the-demo)).
A flow that starts at a tap uses a demo tag's `/t/<uid>` URL.

**Web.** Drive `http://localhost:3000` with the agent's browser tools,
do the changed flow, and screenshot the screen that proves it. With no
browser tools, a throwaway script does the same:

```ts
// verify.ts in apps/web (delete it after) — run with: cd apps/web && bun run verify.ts
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3000/login');
// …sign in and walk the flow the change touched…
await page.screenshot({ path: '../../.verify-screenshots/web-<slug>.png', fullPage: true });
await browser.close();
```

**Mobile.** Start Metro and open the app in the iOS simulator through
Expo Go ([docs/local-development.md → The mobile app](../../../docs/local-development.md#the-mobile-app)):

```sh
cp -n apps/mobile/.env.example apps/mobile/.env
bun run --filter @withme/mobile dev     # press i
```

Walk the changed screen, then:

```sh
xcrun simctl io booted screenshot .verify-screenshots/mobile-<slug>.png
```

On Android: `adb exec-out screencap -p > .verify-screenshots/mobile-<slug>.png`.
Expo Go cannot read NFC; the scan screen's manual entry stands in for a
tap.

**When it cannot finish.** One retry, then write the blocker into the
PR's Verification section ("tried to verify on iOS; the simulator would
not boot") and go on. A flow blocked part-way (a system photo picker
the driver cannot reach) is verified up to that point, screenshotted
there, and the rest marked as a manual step for the owner.

## Self-review

(Step 7.) Read `git diff origin/<base>...HEAD` top to bottom and check:

- **Tests:** every behavior the design names has a test that would fail
  without the change; every refused caller in a policy test has a
  positive control; no test was loosened, skipped (`.skip`, `.only`) or
  deleted.
- **Invariants:** nothing ranks or lists people; no new response
  distinguishes "hidden" from "absent"; blocks are checked in SQL; new
  tables have `tenant_id` and per-command policies; `security definer`
  functions set `search_path = ''` and grant execute explicitly.
- **Layers:** the web app reads data only through the contract; styling
  uses tokens; mobile reads colors through `useTokens()`.
- **Seams:** if the change moved a seam a skill documents (tokens, the
  destination union, the profile tiers, tab registration, the deploy
  steps), that skill is updated in this branch
  ([CONTRIBUTING.md](../../../CONTRIBUTING.md)).
- **Hygiene:** no secrets, no `.env` files, no screenshots or encode
  lists committed, no stray `console.log`, `bun run db:types` rerun
  after a migration.

## Pull request

(Step 8.)

```sh
git push -u origin <prefix><slug>
gh pr create --base <base> --title "<area>: <what changed>" --body-file <body.md>
```

Start the body from `.github/PULL_REQUEST_TEMPLATE.md` and add:

```markdown
## Tests

| Layer | Test files | New source files covered |
| --- | --- | --- |
| Contract | packages/contract/test/… | src/schemas/… (100%) |
| Migration + RLS | packages/db/test/… | new_function, new_policy: named in … |
| … | | |

Gate: `bun run lint && bun run typecheck && bun run test` green locally,
plus `<the e2e harness>`.

## Verification

- Web: drove <flow> on the local stack; `.verify-screenshots/web-<slug>.png`
- Mobile (iOS simulator, Expo Go): drove <flow>; `.verify-screenshots/mobile-<slug>.png`

Plans: `<plans folder>/<date>-<slug>-design.md`, `<plans folder>/<date>-<slug>.md`
```

**Screenshots on the PR.** GitHub has no API for attaching an image to
a PR, and screenshots are never committed. Post the Verification
section with the local paths, then ask the owner to drag the PNGs into
it. A fork with an image host it trusts can upload there and embed the
URLs instead; never put a screenshot that shows a real person's data
somewhere public.

## Running it

Like every skill in `.agents/skills/`, this one runs by path in any
agent: "Run `.agents/skills/feature-dev/SKILL.md` for <the feature>".
Claude Code loads skills from `.claude/skills/`, so to have it offer
the skill on its own and answer `/feature-dev`, link it into that
per-machine folder (gitignored, so each clone does this once):

```sh
mkdir -p .claude/skills && ln -s ../../.agents/skills/feature-dev .claude/skills/feature-dev
```
