# Proof run (PR 5 of the tabs buildout): Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Take a fresh clone of `main` (after Milestone 4) through every derivation skill and then go-live, as a fake derivation, and time each skill. The result is "runclub-with-me", a run club fork. Every place where a skill and reality disagree gets fixed in the skill and re-run. The acceptance report is the program's acceptance test: spec "Delivery" item 5, "Fresh clone → make-it-yours → customize-gathering → extend-profile → go-live, as a fake derivation, timed. This is the acceptance test for 'derivations are no longer barebones.'" The merged PR contains only skill fixes (`.agents/skills/**`), the report and this plan (`docs/**`), and, only if a fix requires it, `README.md`. Tracked privately: the Milestone 5 issue in the build-out project, decisions in the decisions log.

**Architecture:** The binding spec is `docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md` ("Delivery" item 5). The program is `docs/superpowers/program.md` milestone 5. The method is a copy of Milestone 4's fresh-clone re-runs (`plans/2026-10-11-derivation-skills-pr4.md` Tasks 7b–7d): clone, follow literally, time, log deviations, fix the skill, repeat. Two things are new here. First, the skills run **in sequence on one clone**, so their order-dependence shows up. Second, go-live comes last, behind an explicit stop for Alex.

**Tech Stack:** As in the starter: Supabase local (CLI, Docker), Bun, turbo, oxlint, bun test, Playwright, wrangler, Expo (Expo Go in the iOS simulator, driven by agent-device and simctl). Phase B option 1 adds hosted Supabase, Cloudflare Workers, and EAS Update.

**Scope guard:**
- No app code in the PR. `git diff --name-only origin/main...HEAD` lists only `.agents/skills/**` and `docs/**` (plus `README.md` if a fix needs it, with the reason in the PR body).
- An **app** defect found by the run (as opposed to a skill-text defect) becomes a tracker issue in the build-out project, like the known issues below. It is not fixed here unless Alex says so.
- Derivation code lives only in clones under `~/dev/withme-scratch/`, with `origin` removed. Those clones are never pushed and are deleted at the end.
- Nothing billable, outward-facing, or credentialed happens without Alex's go-ahead at Task 9 (Phase B).

---

## Decisions made in this plan (Alex can change any of them)

1. **The vertical: a run club.** "runclub-with-me": wordmark `runclub`, display name `Run Club`. The program manager chose it; Alex can swap in any vertical before Task 1. Only the Inputs blocks change.
2. **Gathering nouns:** run / runs, tab label `Runs`, URL `/runs`. The web routes are `_app.runs.tsx` and `_app.runs_.$id.tsx`. The mobile routes are `(tabs)/runs.tsx` and `run/[id].tsx`. customize-gathering's optional URL rename is exercised on purpose: it touches the most files and has never been run from a fresh clone.
3. **The gathering field is `route_name`, not `distance_km`.**
   - `route_name` is text, required, at most 120 characters, labelled "Route", and carried on the resolve summary (e.g. "River loop, 8 km"). It is customize-gathering's worked example (`course_name`) with a new name: the same `not null default ''` column with a `char_length` CHECK, the same `create_gathering` rebuild with the new parameter before `p_location`, the same `resolve_tag` `v_gathering_json` edit, the same summary `pick` and SDK mirror. Every minute the run measures is the skill, and every deviation is a skill defect, not an improvisation.
   - The skill does not cover a numeric `distance_km`. That field would need a zod number while the forms post strings, parsing on both clients, a decision on what Postgres `numeric` looks like in the generated types and in jsonb, and unit formatting in `gatheringLine()`. The follower would have to make all of that up, and the timing would measure invention. extend-profile has a "typed fields" scope note; customize-gathering has none.
   - The report still lists what a numeric field would need (Task 11, a static read). If Alex wants the numeric field run for real, swap it in. Expect roughly +30–60 min and 3–5 deviations, and a "Typed fields" paragraph for customize-gathering as the fix.
4. **Profile fields (extend-profile):**
   - Card tier: `pace`, label "Pace", **required** for completion (so the completion gate is exercised). The format is `^[0-9]{1,2}:[0-5][0-9]/(km|mi)$`, enforced by a zod `.regex` and a SQL CHECK named `profiles_pace_format` (e.g. `5:30/km`).
   - Connections tier: `strava_handle`, label "Strava", 1–120 characters, optional. It has the same shape as the worked example's `contact_handle`.
   - `pace` departs from the worked example's `CardLineSchema` on purpose: a pattern instead of a length. That tests the skill's "typed fields take the same steps; the CHECK mirrors the zod rule" note at a small, bounded cost.
5. **make-it-yours inputs, all seams except EAS:**
   - Accent: light `#3f6212` on ink `#ffffff` (7.08:1), dark `#a3e635` on ink `#1a2e05` (9.69:1), both computed with the WCAG formula. The follower re-verifies them.
   - Display font **Archivo** (variable, OFL; `@fontsource-variable/archivo` on web, `@expo-google-fonts/archivo` on mobile). Inter stays as the body font. Step 2 (fonts) has never been executed: Milestone 4 skipped it.
   - id `com.runclub.app`, scheme `runclub`.
   - Store `https://shop.example.com/runclub`.
   - Fork repository URL `https://github.com/example/runclub-with-me`, used only for the README badge.
   - The seed identity is rebranded to `*@demo.runclub.local` / `runclub-demo-1`, which exercises the downstream skills' "or your rebranded identity" lines.
   - Step 5 (EAS) creates an Expo project, so it moves to Phase B.
6. **make-it-yours step 6's `project_id` rename runs for real** (`project_id = "runclub"`).
   - Milestone 4 skipped it because the stack was shared, and listed the order bug as a follow-up. Today's text renames first and then runs `db:stop && db:start`, which stops the not-yet-running new project while the old stack keeps ports 553xx.
   - In Milestone 5 nothing else is in flight. The run therefore stops the shared `withme-starter` stack **once, at Task 2**, and runs the clone on its own `runclub` stack until Task 13 restores `withme-starter`.
   - Precondition: the program manager confirms that no other session (including the `determined-bell-b12635` and `exciting-noyce-50c543` worktrees) needs the stack during Phase A. If that cannot be confirmed, skip the rename, record it as skipped, and the whole run uses the shared stack inside a normal stack window.
   - **Answered 2026-10-12: skipped — the shared stack stays up for another session; the rename is recorded as not run (the M4 order bug stays a known follow-up).** The whole run uses the shared `withme-starter` stack, and nothing in the run stops it (`db:stop`).
7. **One clone, many skills.** The line clone is `~/dev/withme-scratch/proof-runclub`.
   - Each skill's result is a local commit in the clone, tagged `pre-<next-skill>`.
   - A re-run after a skill fix starts from a fresh clone of the line **at that skill's `pre-` tag**, with the fixed skill texts copied in (the deviation procedure, below). If the re-run is clean, it becomes the line.
8. **Literal following is done by a fresh subagent per skill run.** It gets only the Follower brief of its task (inputs, environment notes, logging rules) and never this plan, the Milestone 4 plan, or earlier logs. The program manager reviews its log against the task's Watch list afterwards. The Watch list holds predicted deviations and must not leak into the brief.
9. **The order of skills:** make-it-yours → customize-gathering → extend-profile → provision-tags (local) → the full gate → the simulator pass → **stop** → go-live.
   - provision-tags runs after extend-profile, so its claim check also shows the new card tier.
   - add-destination-type is not run: a run club needs no new destination type, and the spec's sequence does not name it. The report says so.
10. **Go-live is Alex's call** (Task 9): option 1, a real throwaway production run approved step by step and torn down after; or option 2, a dry run with the production leg recorded as not run. There is no default. Phase A does not depend on the answer, so ask at the start of the milestone and collect the answer by Task 9.
11. **The report** is committed as `docs/superpowers/reports/<completion-date>-proof-run.md`, a new folder. It is summarized in the PR body and the tracker updates.

---

## Ground rules for every task

- **Branch and worktree.**
  - Work in `~/dev/withme-starter/.claude/worktrees/proof-run` on branch `claude/proof-run`, created from `origin/main` after PR #10 merges (Task 0). The shell variable is `WT`.
  - Never work in, or write to, any other worktree: `with-me-derivation-starter-1f2c69` (the program manager), `derivation-skills` (M4, merged), `determined-bell-b12635`, `exciting-noyce-50c543`.
  - Local `main` is stale: always base on `origin/main` after `git fetch origin`.
- **Variables used below:**

  ```bash
  WT=~/dev/withme-starter/.claude/worktrees/proof-run
  S=~/dev/withme-scratch
  LINE="$S/proof-runclub"          # reassigned when a clean re-run becomes the line; log every reassignment
  NOTES="$S/notes/m5"
  ```

- **The stack (Decision 6).**
  - Answered 2026-10-12: skipped — the shared stack stays up for another session; the rename is recorded as not run (the M4 order bug stays a known follow-up). The whole run uses the shared `withme-starter` stack in stack windows: check the ports below are free before each use, `bun run db:reset && bun run db:seed` when done, and never `db:stop`. The bullets below that assume a `runclub` stack (Task 2 stopping the shared stack, Task 13 restoring it) read accordingly.
  - Phase A is one window, granted by the program manager before Task 1. During it, nothing else touches Docker's Supabase or ports 55320–55324, 8786, 3000, 8796, 9456, 3010, or 8081.
  - Before opening it: `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(8786|3000|8796|9456|3010|8081) '` prints nothing, and `docker system df` shows room.
  - If `supabase start` fails for lack of disk, stop and ask Alex to prune: the classifier blocks `docker rmi`, per the memory note.
  - Only Task 13 restores the `withme-starter` stack.
- **Playwright:** always `CI=1 bunx playwright test`. With other checkouts on this machine, `reuseExistingServer: !process.env.CI` could attach to their workers. This is an environment rule, not a skill deviation, so log it once.
- **The simulator** follows the memory note `ios-simulator-driving-technique.md`: agent-device + Expo Go + simctl, never `expo start --ios`, never `keyboard dismiss`, and type in chunks that never start with `-`. A skill that says `bunx expo start --ios` gets this substitution, logged once as an environment note.
- **Known local issues that are not skill defects:** log them when they bite, do not "fix" the skill for them, and leave the time they cost in the timing with a note.
  - **The PGRST303 issue.** A brand-new sign-up's first API calls can get `PGRST303` ("JWT issued at future"). The completion gate fails open (the account lands on Runs, not Profile). Relaunch, and it lands on Profile.
  - **The `vite dev` hang.** On a clone's first `vite dev` session, a server-side load of a claimed card (`/t/<claimed UID>`) can hang with 0 bytes after sign-in and claim. Restart `apps/web`'s `bun run dev`.
  - **Supabase CLI upgrade mid-run (2026-10-12).** Homebrew upgraded the `supabase` CLI 2.116.0 → 2.120.0 at 22:04:13Z, during customize-gathering run 2 (no one in this program ran brew). Resets under 2.120.0 write a newer storage schema (storage migration 72, `drop-bucketid-objname-index`) than the running `storage-api:v1.70.3` container expects, so every Storage upload fails with `42P10` until the stack is restarted under the new CLI. That restart is Alex's (an environment fix; `db:stop` is off-limits to the run). `db:reset` also stopped printing "… on branch main". `db:types` under 2.120.0 reformats `packages/db/src/types/supabase.ts` wholesale.
  - **The remote-guard gap.** The db package's test utils have no remote guard, so a shell with `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` exported would run the RLS suite against production. Never source `.env.demo-seed` outside a subshell, and never run `bun run test` / `bun test` in a shell or terminal tab that ever held production keys. Phase B checks `env | grep -c SUPABASE_SERVICE_ROLE_KEY` prints `0` before any local test.
- **No remote services in Phase A.** No `supabase link` / `projects` / `orgs`, no `wrangler deploy` or `login`, no `eas`.
  - Package installs (`bun install`, `bun add`) and the GitHub clone are fine: they are what a forker does.
  - Claude never types a credential into anything except the local stack's test accounts: the seed identity, and sign-ups on `localhost` / `127.0.0.1` with generated `@rls.test` / `@demo.runclub.local` addresses.
- **Logging.** One log per skill run, `$NOTES/<n>-<skill>-r<k>.md`. Commands, outputs (trimmed), deviations, and timestamps.
- **Timing protocol.**
  - `echo "START <skill> r<k> $(date -u +%FT%TZ)" >> "$LOG"` before the skill's first instruction, and `END` after its last checkpoint is green.
  - Waits that are not the skill's go in `PAUSE` / `RESUME` lines: a program-manager answer, a permission prompt, a Docker or disk stall. Report wall time and wall time minus pauses.
  - `bun install` of the clone counts toward setup (Task 1), not the skill.
- **What counts as a deviation.** Anywhere a literal reader had to guess, or the text and reality disagree:
  - a command fails or prints something other than the text's expected output;
  - a file, path, symbol, or count named in the text does not exist or differs;
  - a step is missing, so the next checkpoint goes red;
  - the text is ambiguous enough that two readings lead to different code.

  Not deviations: the environment notes above, and the known local issues.
- **The deviation procedure** (after the run ends, or as soon as the run cannot continue):
  1. Write it down in the log: the step, what the text says, what happened, and the reading taken.
  2. Fix the SKILL.md (or README / slice doc) in `$WT` and commit:
     `git -C "$WT" commit -am "<skill>: fixes from the proof run" -m "<what the run hit, and why the text now says what it says>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
  3. **Re-run, or record why not.**
     - A fix that changes a command, a path, an expected output, or a code block needs a re-run.
     - A wording-only fix in a run that reached the skill's final checkpoint green may skip the re-run. The log and the Done note say why.
     - At most three runs per skill. A third failing run stops the milestone and goes to the program manager and Alex.
  4. The re-run clone:

     ```bash
     R="$S/proof-runclub-<skill>-r<k>"
     rm -rf "$R"
     git clone --branch pre-<skill> "$LINE" "$R"          # the tag: a detached HEAD at the state before the skill
     git -C "$R" remote remove origin
     rsync -a --delete "$WT/.agents/skills/" "$R/.agents/skills/"
     git -C "$R" add -A .agents/skills
     git -C "$R" commit -m "skills: proof-run fixes at claude/proof-run $(git -C "$WT" rev-parse --short HEAD)"
     git -C "$R" tag -f pre-<skill>                        # the re-run starts from here
     for f in apps/api/.dev.vars apps/web/.env apps/mobile/.env; do [ -f "$LINE/$f" ] && cp "$LINE/$f" "$R/$f"; done   # gitignored, so the clone lacks them
     (cd "$R" && bun install)
     ```

     For make-it-yours itself, `pre-make-it-yours` has no env files to copy; the skill creates them.
  5. The re-run follows the same Follower brief, with `$R` as its checkout. If it is clean, set `LINE="$R"`, log it, and continue from there.
- **Commits in the clone** (the fork's own history; never pushed):
  `git -C "$LINE" add -A && git -C "$LINE" commit -m "<skill>: runclub" && git -C "$LINE" tag pre-<next-skill>`.
- **Commit messages on `claude/proof-run`:** imperative subject, the why in the body, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Done notes.** Each task ends with a `**Done YYYY-MM-DD**` paragraph written into this plan, as in M4:
  - the SHA it ran at, the log path, and the runs with their minutes;
  - each deviation with the commit that fixed it;
  - what was skipped and why;
  - anything outside the skill.

  The program manager commits the plan update with the task's fixes.

---

## Phase A — local, no billing

### Task 0: Branch, plan, baseline

**Files:** Create `docs/superpowers/plans/2026-10-12-proof-run-pr5.md` (this plan).

```bash
git -C ~/dev/withme-starter fetch origin
git -C ~/dev/withme-starter log --oneline -1 origin/main     # expect the merge of PR #10
git -C ~/dev/withme-starter worktree add "$WT" -b claude/proof-run origin/main
cd "$WT"
cp /private/tmp/claude-501/-Users-alexeisele-dev-withme-starter--claude-worktrees-with-me-derivation-starter-1f2c69/6460d7d3-0c45-4a17-95f1-8861d7fd65ba/scratchpad/m5-proof-run-plan.md docs/superpowers/plans/2026-10-12-proof-run-pr5.md
git add docs/superpowers/plans/2026-10-12-proof-run-pr5.md
git commit -m "Plan: the proof run (milestone 5)" -m "A fresh clone through every derivation skill and go-live, timed: the program's acceptance test." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
bun install
cp -n apps/api/.dev.vars.example apps/api/.dev.vars; cp -n apps/web/.env.example apps/web/.env; cp -n apps/mobile/.env.example apps/mobile/.env
mkdir -p "$NOTES" && chmod 700 "$S"
```

Then, with the stack granted (it is still `withme-starter` here):

```bash
bun run db:reset && bun run db:seed
bun run lint && bun run typecheck && bun run test
```

**Expected:**
- The gate is green.
- Post-M4 `main` carries no app change from M4, so the counts equal M3's: db 72, contract 31, nfc 48. Record the actual numbers; they are the baseline the report's arithmetic starts from.
- The API e2e check count before extend-profile is expected to be 58 (M4 Task 7c counted 66, including extend-profile's 8). Task 6 records the actual number.

Also:
- Read whatever `$S/notes/` holds from M4; leave it alone (the program manager decides whether to delete it).
- Ask the program manager for Decision 6's confirmation: may the shared stack stop for all of Phase A?
- Post the Task 9 question to Alex now (Decision 10), so the answer is ready when Phase A ends.

No other commit.

**Done 2026-10-12.** `origin/main` was 511a26c (the merge of PR #10). The worktree `$WT` was created on `claude/proof-run` from it, and the plan was committed as 806f857 and pushed (`git push -u origin claude/proof-run`). Before that commit the program manager's answers were written in: Decision 6 is answered "skipped" (the shared stack stays up for another session, so the whole run uses `withme-starter` in stack windows and never stops it), and the stack ground rule says so. `bun install` (1529 packages), the three env copies, `mkdir -p "$NOTES"` and `chmod 700 "$S"` done; M4's `$S/notes` had already been deleted by the program manager, so `$S/notes/m5` is new. Baseline gate in a stack window: the six ports were free (553xx held by the running `withme-starter` stack, as expected), `docker system df` showed 12.1 GB of images; `bun run db:reset && bun run db:seed` succeeded first time; `bun run lint && bun run typecheck && bun run test` green (2026-10-12T21:21:22Z–21:21:39Z). **Baseline counts: db 72, contract 31, nfc 48**, equal to M3's as expected. Typecheck was replayed from turbo's shared worktree cache (8/8 cached, same content hash); the tests ran fresh (the one cached task in that run is nfc's build). The stack was reset and seeded again after the tests and is left that way. Not done here, by the program manager's instruction: the Task 9 question to Alex (the program manager asks him), and Decision 6's confirmation (already answered).

---

### Task 1: The fresh clone (the line)

```bash
rm -rf "$LINE"
git clone https://github.com/vibe-with-me/withme-starter.git "$LINE"
git -C "$LINE" remote remove origin                                    # nothing in the fork can be pushed
test "$(git -C "$LINE" rev-parse HEAD)" = "$(git -C ~/dev/withme-starter rev-parse origin/main)" && echo "line = origin/main"
git -C "$LINE" tag pre-make-it-yours
(cd "$LINE" && time bun install)
```

If the GitHub clone needs credentials the shell does not have, fall back to the local object store at the same commit. Do not enter credentials.

```bash
git clone --no-checkout ~/dev/withme-starter "$LINE"
git -C "$LINE" fetch ~/dev/withme-starter refs/remotes/origin/main
git -C "$LINE" checkout -B main FETCH_HEAD
git -C "$LINE" remote remove origin
```

**Expected:**
- `line = origin/main`.
- `git -C "$LINE" status --porcelain` prints nothing.
- No `.env` / `.dev.vars` files exist yet (`ls "$LINE"/apps/web/.env 2>&1` says no such file).
- `$NOTES/1-setup.md` records the SHA, the clone source, and the `bun install` time.

**Done 2026-10-12.** `LINE=~/dev/withme-scratch/proof-runclub`, cloned from GitHub over anonymous HTTPS (no credentials; the local fallback was not needed). `origin` removed. HEAD 511a26c on `main`, equal to `origin/main`: `line = origin/main`. Tagged `pre-make-it-yours`. `bun install`: 1529 packages, 6.78 s wall (bun 1.3.10). `git status --porcelain` empty; no `.env` / `.dev.vars` files. Log: `$NOTES/1-setup.md`. No deviations.

---

### Task 2: make-it-yours (literal)

**Follower brief** (the whole prompt for the fresh subagent):

> You are rebranding a fresh fork of withme-starter at `$LINE` (give the literal path). Start at `README.md`'s "Extending a fork", then follow `.agents/skills/make-it-yours/SKILL.md` literally, top to bottom, as if you had never seen this codebase. Do not read anything under `docs/superpowers/` and do not consult other clones.
>
> Inputs:
> - wordmark `runclub`, display name `Run Club`;
> - accent light `#3f6212` / ink `#ffffff`, dark `#a3e635` / ink `#1a2e05`;
> - display font Archivo (keep Inter as the body font);
> - id `com.runclub.app`, scheme `runclub`;
> - store `https://shop.example.com/runclub`;
> - fork repo URL `https://github.com/example/runclub-with-me`;
> - rebrand the seed identity to `*@demo.runclub.local` with password `runclub-demo-1`;
> - wrangler names `runclub-api` / `runclub-web`; `project_id = "runclub"`.
>
> Do every step except step 5 (EAS). It creates a project on Expo's servers, so skip it and say so.
>
> Environment notes, which are not part of the skill: run Playwright as `CI=1 bunx playwright test`. Do not run any command against a remote service (supabase link/projects/orgs, wrangler deploy/login, eas). Do not touch any other directory under `~/dev/withme-starter`. The Supabase stack is yours for this task.
>
> Log to `$NOTES/2-make-it-yours-r<k>.md`: START/END/PAUSE/RESUME stamps (`date -u +%FT%TZ`), every command and its trimmed output, and every deviation. A deviation is any place you had to guess, or where the text and reality disagree; for each, give the step, what the text says, what happened, and what you did. Do not fix the skill. Finish with the skill's step 8 checks and a list of the deviations.

**Watch list** (the program manager's; not in the brief):
- **Step 6, the `project_id` rename (Decision 6).** Literally, the follower renames, then `bun run db:stop && bun run db:start`. Expect the stop to act on the not-running `runclub` project and the start to fail on ports held by `withme-starter`.
  - That is the deviation PR4 listed as a follow-up.
  - Fix: stop first (`bun run db:stop` with the old `project_id`), then rename, then `bun run db:start`. Note the new, empty volumes and that `db:seed` is needed again. A command changed, so re-run.
  - If the follower stalls at the port conflict, let it stop `withme-starter` from `$LINE` before the rename. The stack is granted.
- **Step 2, fonts, executed for the first time.**
  - `@fontsource-variable/archivo`'s file is named `archivo-latin-wght-normal.woff2`; Archivo also has a `wdth` axis, and the skill names only `wght`.
  - On mobile, `@expo-google-fonts/archivo` exports names like `Archivo_600SemiBold`.
  - The skill says to compare the `fonts` map in `lib/tokens.ts` against `useFonts` by eye.
- **Step 3's file list** against the post-M4 tree. The sweep must print nothing beyond the seed-identity choices.
- **Step 7 and step 8:**
  - `/merch` shows the card;
  - "Open store" has `target="_blank"`;
  - the landing page shows "Get tags";
  - the accent appears only on "Join this gathering" for `/t/04BBBBBBBBBBBB`.
- **Reviewer checks after the run:**
  - `git -C "$LINE" diff pre-make-it-yours --stat` touches no `supabase/migrations/`, no `packages/db/test/`, and no `packages/contract/src/`.
  - `grep -rn --exclude-dir={node_modules,dist,.expo,.wrangler,.turbo} '#c2410c\|#ff6a3d' "$LINE/apps"` prints nothing.

**Expected:**
- The step 1, 3, 4, 6, 7, and 8 checkpoints as the skill states them.
- `bunx expo config --type public` shows `Run Club` / `runclub` / `com.runclub.app`.
- The gate is green at the baseline counts (db 72, contract 31, nfc 48).
- `docker ps --format '{{.Names}}' | grep -c supabase_db_runclub` prints `1` once the rename is done. (The rename was skipped, Decision 6, so the container stayed `supabase_db_withme-starter` for the whole run.)

**Then:** the reviewer checks above, the deviation procedure, and a commit in the clone tagged `pre-customize-gathering`.

**Run 1 (2026-10-12).** On `$LINE` at `pre-make-it-yours` (511a26c). START 21:23:36Z, END 21:31:49Z: about 8 min wall, no pauses. Log: `$NOTES/2-make-it-yours-r1.md`. Step 5 skipped per the brief; `project_id` rename and `db:stop`/`db:start` also skipped (the shared stack, Decision 6), so the Watch list's step 6 item was not exercised. Every checkpoint run was green: lint, typecheck, test at the baseline counts (db 72, contract 31, nfc 48), Playwright 14/14, API e2e all passed, the visual check showed the accent only on "Join this gathering" in both modes. The result is uncommitted in `$LINE`'s working tree. Deviations:
- D1, step 1: the shipped light `--color-border-input` measures 2.97:1, below the 3:1 the skill requires. The follower raised the opacity from 0.46 to 0.47 (3.06:1). App defect, filed as the input-border issue; the skill now says to raise it until the fix lands upstream (b160d58).
- D2, step 1: the token comments say the accent is for Connect and Accept only; the skill's rule lists five actions. App defect, part of the input-border issue; no skill change.
- D3, step 2: the copied font file's name was unspecified. Now it is `<font>-var-latin.woff2`, with `format('woff2')` and the `wght` file only (Archivo also ships `wdth`) (b160d58).
- D4, step 3: the README title's target was unspecified. It is now the wordmark (b160d58).
- D5, steps 3/6/8: `apps/web/.env` is copied before step 3 edits the example demo-credentials line, and step 8's sweep reads `.env`. Step 3 now says to edit the line in both files, and its checkpoint greps both (b160d58).
- D6, step 4: no slug rule, and the upstream `owner`/`projectId` stay until step 5. Now the rule is the wordmark, lowercase, with hyphens, plus a warning against `eas` commands before step 5 (b160d58).
- D7, step 3: the landing card's "This is the starter app" hint was not on the surface list. It is now (b160d58).
- D8, step 8: the sweep missed `vibe-with-me` (app.json `owner`, the nfc-sdk `repository.url`) and never looked in `packages/` or `supabase/` beyond the seed. It now covers both, filters migrations and `packages/nfc-sdk/` with reasons, lists the conditional acceptable matches, and fails on the upstream `owner` (b160d58). On r1's tree it prints exactly the two expected lines: `owner` (step 5 skipped) and `project_id` (kept).
- D9, step 8: no icon artwork was supplied, so the input had a gap. Not a skill defect, and no change.

The step 8 sweep command changed, so a re-run is required (run 2, from a fresh `pre-make-it-yours` clone with b160d58's skills).

**Run 2 — Done 2026-10-12.** On `~/dev/withme-scratch/proof-runclub-make-it-yours-r2` (a fresh `pre-make-it-yours` clone with b160d58's skills). START 21:36:15Z, END 21:44:09Z: about 8 min wall. Log: `$NOTES/2-make-it-yours-r2.md`. Green: every checkpoint, lint, typecheck, test at the baseline counts, Playwright 14/14, API e2e all passed. The step 8 sweep prints exactly the two lines of the skipped sub-steps (`app.json` `owner`, step 5; `config.toml` `project_id`, Decision 6). The remaining notes were wording-only and are fixed in 77ec5f1: which ratios the token comments cite (the accent pair and the input border, each theme), and that the starter README's prose names no brand, so only the title and badge change. The other notes were input gaps (no copy or artwork supplied) or already known (the input-border issue). Run 2 reached the final checkpoint green and the fixes are wording only, so no re-run is needed. Reviewer checks passed. The line is now `LINE=~/dev/withme-scratch/proof-runclub-make-it-yours-r2`, committed as 9a58a9a ("make-it-yours: runclub") and tagged `pre-customize-gathering`.

---

### Task 3: customize-gathering (nouns, URLs, one field) (literal)

**Follower brief:**

> You are customizing the gathering in the Run Club fork at `$LINE`. Follow `.agents/skills/customize-gathering/SKILL.md` literally, §1 then §2, as if new to the codebase. Do not read `docs/superpowers/`.
>
> Inputs:
> - nouns: singular "run", plural "runs";
> - tab label `Runs`;
> - URL segment `/runs`: web `_app.runs.tsx` and `_app.runs_.$id.tsx`, mobile `(tabs)/runs.tsx` and `run/[id].tsx`;
> - one new field `route_name`: text, required, at most 120 characters, form label "Route", shown on rows, on the detail header, and on the resolve summary (a tapper sees it before joining);
> - seed value for Ada's run: "River loop, 8 km".
>
> Environment notes: Playwright as `CI=1 bunx playwright test`. No remote services. The Supabase stack is yours. The fork's seed identity is `*@demo.runclub.local` / `runclub-demo-1`.
>
> Log to `$NOTES/3-customize-gathering-r<k>.md` with the same stamps and deviation format as before. Finish with the skill's closing gate: the verification gate from `docs/the-slice.md`, including the API e2e and Playwright.

**Watch list:**
- **Callers of `create_gathering` that the skill does not name.** §2.3 names only `gatherings.test.ts`'s `createGathering()`. On post-M3 `main`, `packages/db/test/account.test.ts` calls `create_gathering` twice (lines 102 and 109). `apps/api/e2e/handshake.e2e.ts` also creates a gathering in §17 (`doomed`, line 224), besides §12. With a required `p_route_name`, all three fail, and the e2e also fails `tsc -p e2e`.
  - Expected deviation: the map and §2.3/§2.7 need "every caller: `grep -rn "create_gathering\|gatherings.create" packages apps supabase/seed`".
- **`resolve_tag`'s newest body is still `20261011120000_avatars.sql` here.** The skill's `grep … | sort | tail -1` must print it.
- **Copy.**
  - §1 says the list's title is `'Events — withme'`. After make-it-yours it is `'Events — runclub'`. This is order-dependence, and the text should say "(`'Events — <wordmark>'` after make-it-yours)".
  - The copy sweep must catch "Join this gathering?", "Create gathering", "Point my tags at this gathering", and the Playwright strings in `gatherings.spec.ts` and `shell.spec.ts`.
- **URLs.**
  - `routeTree.gen.ts` is regenerated by `bunx vite build`.
  - The mobile `gatheringHref` `/gathering/` prefix.
  - The login pages' `startsWith('/gatherings/')` / `('/gathering/')`.
  - make-it-yours step 3's page-title list now names files that no longer exist (`_app.gatherings.tsx`). This is order-dependence; record it for the report.
- **Signature.** `drop function public.create_gathering(text, timestamptz, text);` matches, and the new `(text, timestamptz, text, text)` grants are issued.
- **Safety reviewer checks:**
  - `git -C "$LINE" diff pre-customize-gathering -- supabase/migrations | grep -n 'profiles_select\|gathering_members_\|is_gathering_member\|on_block_created'` prints nothing (§3 a–c untouched).
  - `gatherings.test.ts`'s 17 original tests are unedited apart from `createGathering()`'s argument.
  - The summary carries `route_name` and nothing private.

**Expected:**
- After §1: lint, typecheck, and `CI=1 bunx playwright test` green, with 14 passed and URL assertions on `/runs`.
- After §2:
  - db 73 (72 + the CHECK case);
  - contract 32 (31 + the negative case);
  - nfc 48;
  - `bun run --cwd packages/nfc-sdk typecheck` clean;
  - `packages/db/src/types/supabase.ts` shows `route_name`;
  - API e2e ends `handshake e2e: all checks passed`;
  - Playwright 14.
- Record the actual counts.

**Then:** the reviewer checks, the deviation procedure, and a commit tagged `pre-extend-profile`.

**Run 1 (2026-10-12).** On `$LINE` at `pre-customize-gathering` (9a58a9a). START 21:44:53Z, END 21:54:41Z: about 10 min wall. Log: `$NOTES/3-customize-gathering-r1.md`. The gate was green after the deviations below: db 73, contract 33 (31 + the negative case + "a route alone is an update"), nfc 48, API e2e 59 `ok` lines ending "all checks passed", Playwright 14. The result is uncommitted in `$LINE`'s working tree, with the new migration untracked. Every deviation is fixed in 77ec5f1:
- D1, §1: the copy sweep missed both apps' `lib/my-tags.ts` (My tags: "A tap invites people to a gathering."). The sweep now covers `apps/web/src` and `apps/mobile/lib`.
- D2, §1: the list's title is `'Events — runclub'` after make-it-yours, not `'Events — withme'`. The text now says `'Events — <wordmark>'`.
- D3, §1: `profile.spec.ts` and `helpers.ts` carry copy and URLs too. The copy and URL lists now say every file under `apps/web/e2e`, with a `/gatherings` grep.
- D4, §2.1: a required field broke four existing contract fixtures and expectations. The text now says to update them, and how to find them (`grep -n starts_at`).
- D5, §2.1/§2.2: the rule for rows that predate the column. Inputs require `min(1)`; `GatheringSchema` accepts `''` (max only); the `default ''` stays. This is the fork's choice.
- D6, §2.2: `db:seed` ran before §2.7 edited the seed (PGRST202). The seed edit now comes before the first `db:seed`.
- D7, §2.2: `revoke … from public` left anon able to execute the new `create_gathering`, through Supabase's default privileges. The text now revokes `from public, anon`, and `docs/the-slice.md`'s grant rule says the same. Core's older RPCs have the same gap: the anon-execute gap.
- D8, §2.3: the anon call in 'anon can neither create nor join' needs the new argument. The text now names the argument-only changes and keeps the safety sentence for everything else.
- D9, map/§2.3: `account.test.ts` calls `create_gathering`. The map now carries a caller grep, and §2.3 and §2.7 use it.
- D10, §2.7: `handshake.e2e.ts` creates in §17 too, and the e2e reads the built SDK. The caller grep covers §17, and §2.5 now says to run the root `bun run typecheck`.
- D11, §2.7: `profile.spec.ts` creates a run. Covered by the grep, and the text says every Playwright create step needs a fill.
- D12: environment (`CI=1`; `supabase.ts` not committed per the run rules). No change.

Safety reviewer checks passed: no §3 mechanism touched, the original 17 tests changed only by the new argument (plus one added `route_name` assertion), and the summary carries `route_name` only. Commands and steps changed, so a re-run is required (run 2, from a fresh `pre-customize-gathering` clone with 77ec5f1's skills).

**Run 2 (2026-10-12).** On `~/dev/withme-scratch/proof-runclub-customize-gathering-r2` (a fresh `pre-customize-gathering` clone with 77ec5f1's skills; HEAD 9b9ec75). START 21:59:52Z, END 22:12:03Z: about 12 min wall. Log: `$NOTES/3-customize-gathering-r2.md`. The result is uncommitted in that clone's working tree, with `supabase/migrations/20261012220349_add_gathering_route_name.sql` untracked.
- Green, for everything the run touched: the §1 checkpoint (lint, typecheck, Playwright 14/14 after a reset and seed); contract 34; db 73/73 at step 3, before the CLI upgrade; API e2e §1–§17, including the new route checks (`gathering carries its route`, `… summary, route included`); typecheck 8/8; Playwright's `gatherings.spec.ts` (route on the detail header and on the anonymous resolver) and `profile.spec.ts`'s create-a-run.
- Red, environment, not skill: Homebrew upgraded the Supabase CLI 2.116.0 → 2.120.0 at 22:04:13Z, mid-run (see the known local issues). The gate's reset under 2.120.0 left the running storage container on an older schema, so every upload failed with Storage `42P10`: 7 db tests (6 in the avatars bucket suite, plus `delete_my_account`'s avatar upload; db 66/73 at the gate), API e2e from §18 on (the first `uploadAvatar`), and Playwright's `a photo replaces the initial` (13/14). Nothing gathering- or route-related failed.
- Deviations, fixed in 94361f8 except where noted:
  - D1, §2.2/§2.3: with `revoke … from public, anon`, anon's create gets `42501 permission denied for function create_gathering` before the body's `'authentication required'`, so the "untouched" anon test failed. §2.3 now changes that one create assertion to `expect(createError?.code).toBe('42501')` and calls it an argument-and-expectation change, not a safety change. The join assertion and the "everything else untouched" rule stay.
  - D2, §1: the mobile URL list left out the list screen, which `router.push`es `/gathering/[id]` for its rows. It is named now.
  - D3, §1: the checkpoint had no reset before Playwright. It now runs `bun run db:reset && bun run db:seed` first.
  - D4, §2.2: `db:types` under a different CLI rewrote `supabase.ts` (275+/415-). The text now says to check the new field semantically (grep for it), not the diff size. Environment cause: the CLI upgrade.
  - D5: the CLI upgrade itself. Environment; recorded under the known local issues (this commit), not in the skill.
  - D6, §1: vertical copy without the word "gathering": the create form's title placeholder (web and mobile), and the seed's title and console text. §1 now lists them with their files, and points at §2.2's seed edit for the title.
  - D7, §1: test titles counted as string literals. That reading matches the text. No change.
  - D8, §2.6: how the field joins the display lines. §2.6 now says the lines are composed in both apps' `lib/format-time.ts` and gives the run's pattern (a `…WhenAndWhere()` helper, "Route · when · where", used by rows and the detail header; `gatheringLine()` uses it, "Title · Route · when · where").
  - Also logged, no change: §2.5 was accurate (nfc-sdk typecheck failed before the mirror, clean after); two perl one-liners failed on brace delimiters (tooling).

Safety reviewer checks: no §3 mechanism touched; of the original 17 tests only the anon test changed (the argument, plus the create expectation now written into §2.3). Fixes D1 and D3 change an expectation and a command, so a third run (the last allowed) is required, from a fresh `pre-customize-gathering` clone with 94361f8's skills, once Alex has restarted the stack under the new CLI.

**Run 3 — Done 2026-10-12.** Before it, Alex restarted the shared stack under CLI 2.120.0 (PostgREST 16.4, storage-api v1.79.36, gotrue v2.197.0) and cleaned up stale images (Docker disk 99% → 77%). On `~/dev/withme-scratch/proof-runclub-customize-gathering-r3` (a fresh `pre-customize-gathering` clone with 40b8e70's skills; HEAD d8307db). START 22:24:35Z, END 22:34:12Z: about 10 min wall. Log: `$NOTES/3-customize-gathering-r3.md`. Every checkpoint and the gate were fully green: the §1 checkpoint (lint, typecheck 8/8, reset and seed, Playwright 14/14); contract 32, db 73, nfc 48; API e2e 59 `ok` lines ending "all checks passed" (including `gathering carries its route`); Playwright 14; typecheck 8/8. Deviations D1–D5 are fixed in b5772ed, all wording or paths:
- D1, §1: the seed's `p_location` ('The roof, 14 Loom St') is vertical copy the sweep cannot catch; now listed next to `p_title` and the console text.
- D2, §2.2: `db:types` prints "Generated TypeScript is unformatted" and CLI 2.120.0 adds `ComputedFields: never` to each of the 8 tables. Both are now named as expected (no formatter in the repo).
- D3, §1 mobile URLs: `git mv … round/[id].tsx` needs `mkdir -p` first and leaves an empty `app/gathering/`; both commands are in the text now.
- D4, §2.4: the web and mobile detail screens each declare a local `interface GatheringPatch`; now named next to `queries/gatherings.ts`.
- D5, §2.5: the root `bun run typecheck` cannot be green until steps 6–7 (mobile create screen, then `handshake.e2e.ts`). It now runs after step 7; the nfc-sdk package typecheck stays at step 5.

The run reached the gate green and the fixes are wording and paths only, so no re-run (and none is allowed: this was run 3). Observations for the report, no skill change:
- O1: the `char_length(route_name) <= 120` CHECK admits `''`. "Required" lives in the contract's `min(1)` (API only) and in `create_gathering` always supplying it, so a host's direct PostgREST update could blank the field (the host's own row; no safety boundary crossed).
- O2: the web "Join this run?" preview and mobile `gatheringHref` hints carry title and time only (from search params), so the route is not on that pre-join screen; the resolver card the tapper sees first does show it. The skill does not list these surfaces.
- O3: comments still say "Events tab" / "Open gathering", left per "replace only inside string literals and JSX text". Environment: Playwright run as `CI=1 bunx playwright test`.

Safety reviewer checks passed: the migration diff adds only the column, the column grant, the rebuilt `create_gathering`, and `resolve_tag` (its body differs from the avatars migration's only by the `'route_name'` key), so no §3 mechanism is touched; the new `create_gathering` carries `revoke execute … from public, anon` and `grant … to authenticated`; of the original 17 RLS tests only the anon test changed (the argument and the `42501` expectation §2.3 prescribes). The result is committed in that clone as 226c7ad ("customize-gathering: runclub") and tagged `pre-extend-profile`. The line is now `LINE=~/dev/withme-scratch/proof-runclub-customize-gathering-r3` at 226c7ad.

Meanwhile PR #11 (5bdd81d) merged into `main`: the PGRST303 issue is fixed by requiring PostgREST 16.3+. The forks are based on 511a26c and do not carry it.

---

### Task 4: extend-profile (both tiers, completion gate) (literal)

**Follower brief:**

> You are adding vertical profile fields to the Run Club fork at `$LINE`. Follow `.agents/skills/extend-profile/SKILL.md` literally, §1 to §9, as if new to the codebase. Do not read `docs/superpowers/`.
>
> Inputs:
> - Card tier: `pace`, label "Pace", required for completion. Format: one or two digits, a colon, two digits 00–59, then `/km` or `/mi` (e.g. `5:30/km`). The zod rule and the SQL CHECK must mirror each other; name the CHECK `profiles_pace_format`.
> - Connections tier: `strava_handle`, label "Strava", 1–120 characters, optional.
> - Seed values: Ada `5:30/km` and `@ada.runs`; Lin `6:15/km` and `@lin.runs`.
> - Test values: wherever the worked example uses `'E2E Club'` use `'5:00/km'`, and wherever it uses `'Smoke Club'` use `'5:45/km'`.
>
> This fork has already run customize-gathering: gatherings are "runs" at `/runs`, mobile `run/[id].tsx`, and `create_gathering` takes a required `p_route_name`.
>
> Environment notes:
> - Playwright as `CI=1 bunx playwright test`.
> - §7's simulator pass: drive Expo Go with agent-device and simctl per `the simulator-driving notes (agent-device + Expo Go + simctl)`, not `expo start --ios`. Start Metro with `cd apps/mobile && bunx expo start --port 8081 --clear` (no `CI=1`).
> - Known local issues, not skill defects: a brand-new sign-up may land on Runs because of `PGRST303` (relaunch the app). A claimed card's SSR may hang in `vite dev` (restart `apps/web`'s dev server).
> - No remote services. The stack is yours. Sign in only with the fork's seed identity or fresh `@rls.test` addresses on the local stack.
>
> Log to `$NOTES/4-extend-profile-r<k>.md` as before.

**Watch list:**
- **O1.** The new RLS test "a gathering co-member sees the card…" calls `create_gathering` without `p_route_name`. The skill's comment ("If customize-gathering changed create_gathering's arguments, pass them here too.") should catch it. If it fails at §3's green step instead, it is a deviation in visibility: the comment needs to be in §2's prose, not only inside the code.
- **O2.** §3's "newest" greps:
  - `resolve_tag`'s newest is now customize-gathering's migration;
  - `accept_connect_request`'s is still `avatars`;
  - the text says "In the starter both print `…avatars.sql`" and "the newest in the starter being `…delete_my_account.sql`".

  Correct behavior: copy two bodies from two files, keeping `route_name` in `v_gathering_json`. Reviewer check:

  ```bash
  grep -n "route_name" "$LINE"/supabase/migrations/*_extend_profile.sql   # at least one hit, in resolve_tag
  ```

  A stale `resolve_tag` copy silently drops `route_name` from the summary, which the API e2e and the zod parse of the resolve output would catch. Record which check caught it.
- **O3.** Stale paths in the text after the URL rename:
  - the map and "Outside the tabs" name `gathering/[id].tsx` and web `_app.gatherings_.$id.tsx`;
  - §7's Join path names `gathering/[id].tsx` and "Join this gathering?";
  - §8 names `gatherings.spec.ts`.

  Expected: no code change, but a "(renamed if you ran customize-gathering's URL step)" note.
- **O4.** §8's "the grep finds twelve" profile-creating fills: record the count after customize-gathering.
- **The pattern field.** The length test (`profiles_affiliation_length`, 81 characters) becomes a format test (`profiles_pace_format`, e.g. `'fast'`). Record whether the text made that adaptation obvious. Also check that `isProfileComplete` and the two claim forms' `disabled` condition handle `pace`.
- **the PGRST303 issue and the `vite dev` hang:** note it if either appears.
- **Safety reviewer checks:**

  ```bash
  git -C "$LINE" diff pre-extend-profile -- supabase/migrations | grep -n 'profiles_select'                  # nothing
  grep -n "strava_handle" "$LINE"/packages/db/src/queries/handshake.ts | grep -i card_columns             # nothing
  grep -rn "strava_handle" "$LINE"/packages/nfc-sdk/src                                                    # nothing
  ```

  Also: `profile_details_select` is the skill's policy with the column renamed, and nothing else.

**Expected:**
- Red at §2: 17 failures (the 14 new, the cascade test, the first `account.test.ts` test, the enumeration anon sweep), on `PGRST205` / `PGRST204`.
- Green at §3: db 87 (73 + 14).
- contract 37 (32 + 5); nfc 48.
- Lint and typecheck green after §7.
- API e2e: the baseline plus 8, ending `handshake e2e: all checks passed`.
- `CI=1 bunx playwright test`: 14 passed.
- §7's simulator checks pass.
- Record the actual numbers.

**Then:** the reviewer checks, the deviation procedure, and a commit tagged `pre-provision-tags`.

**Run 1 (2026-10-12).** On `$LINE` at `pre-extend-profile` (226c7ad). START 22:35:06Z, END 22:58:18Z: about 23 min wall, including the simulator pass. Log: `$NOTES/4-extend-profile-r1.md`. The result is uncommitted in `$LINE`'s working tree, with `packages/db/test/profile-fields.test.ts` and `supabase/migrations/20261012223915_extend_profile.sql` untracked. Every checkpoint came out as predicted:
- contract 32 → 28 pass / 4 red (the four fixtures the text names) → 37;
- db 73 → 70 pass / 17 red at §2 (the 14 new, cascade, the first `account.test.ts` test, the enumeration anon sweep; `PGRST205` / `PGRST204`) → 87 at §3;
- typecheck after §3 red only in `@withme/api` and `@withme/nfc`; after §4 only nfc; `nfc-sdk` typecheck clean after §5; lint and typecheck 8/8 after §6 and §7;
- API e2e 67 `ok` lines ending "all checks passed", including the 8 new; Playwright 14 passed on the first try; the Name grep found 12;
- the simulator pass 5/5, including the cold Connect returning to the tag and Join returning to "Join this run?".

§3's greps found two different newest files and the follower copied each: `resolve_tag` from customize-gathering's migration (`route_name` kept) and `accept_connect_request` from `avatars`. Watch list O1 (the `create_gathering` comment) worked: the follower passed `p_route_name`. No `PGRST303` seen (PostgREST 16.4).

Safety reviewer checks passed: `profiles_select` appears in the new migration only in comments; `strava_handle` is not in `CARD_COLUMNS` or the SDK; `route_name` is in the `resolve_tag` copy; `profile_details_select` is the skill's policy with the column renamed.

Deviations, fixed in f319943 except where noted:
- D16, §7/§8 (order): the simulator pass ran before §8 seeded the new fields, so seeded Lin was sent to "Finish your profile" and Ada's card showed no pace. The seed edit, with a reset and seed, now comes in §7 before the simulator checkpoint; §8 keeps the e2e. The simulator text now says Lin lands in the tabs and both cards show the card tier.
- D1/D3/D4/D9, §1/§2/§3/§6 (a field with a format rule): new note after the worked example. Use a dedicated zod schema whose regex matches the SQL CHECK class for class (`[0-9]`, not `\d`). The length tests become format tests, with malformed values and valid controls. Inputs get a format `placeholder`. A malformed value gets the generic save error. §1, §2, §3 and §6 point to the note.
- D2, §1: "it goes first" was specific to `affiliation`; now "your field in its alphabetical place".
- D5, §3: `db:reset` prints `Finished supabase db reset` with or without `on branch …` depending on the CLI version.
- D6, §2: at the red checkpoint `@withme/api` and `@withme/nfc` may already be red too.
- D8, §4: the connections-tier block goes right after `upsertOwnProfile`.
- D11/D15, map/§7/§8: "renamed if you ran customize-gathering's URL step" notes for `gathering/[id].tsx`, `gatherings.spec.ts`, and "Join this gathering?".
- D12, §7: mobile `setCurrent(saved.profile)` goes right after the update, before the `redirect` branch's `dismissTo`.
- D10/D13/D18 (labels, ids, the `Muted` line, the seed comment): one "in your vertical's words" note in §6, §7 and the seed. D7 (do not commit `supabase.ts`, the run rules), D14, D17, D19: environment, no change.

D16 changes the order of the steps, so a re-run is required: run 2 of at most 3, from a fresh `pre-extend-profile` clone with f319943's skills.

**Run 2 — Done 2026-10-12.** On `~/dev/withme-scratch/proof-runclub-extend-profile-r2` (a fresh `pre-extend-profile` clone with f319943's skills; HEAD 4e532e5). START 23:02:22Z, END 23:27:44Z: about 25 min wall, including the simulator pass. Log: `$NOTES/4-extend-profile-r2.md`. Every predicted count matched:
- contract 32 → 4 red → 37;
- db 73 → 17 red at §2 (14 × `PGRST205`, 2 × `PGRST204`, and the format test) → 87 at §3;
- typecheck after §3 red only in `@withme/api` and `@withme/nfc`; after §4 only nfc; `nfc-sdk` typecheck clean after §5;
- the gate: lint 0, typecheck 8/8, contract 37, db 87, nfc 48; API e2e 67 `ok` lines including the 8 new; Playwright 14 on the first try;
- the simulator pass 5/5 with the reordered seed (D16): Lin lands complete in the tabs and both cards show pace; the cold Connect returns to the tag and the cold Join returns to "Join this run?".

No `PGRST303` seen. Safety reviewer checks passed: `profiles_select` appears in the new migration only in comments; `CARD_COLUMNS` is `id, display_name, avatar_path, bio, pace`; `strava_handle` is not in the SDK.

Deviations 1–8: the wording ones are fixed in 6ea5df3. That covers 2 (the SQL pattern matches the zod regex's classes and anchors; JavaScript-only escapes like `\/` drop out), 3 (`resolve_tag`'s newest can be customize-gathering's migration, so the grep decides, and the new timestamp must sort after every existing one), and 5 (`autoCapitalize="none"` on a mobile format field that needs exact case). The same commit says that showing the card tier on Requests, Blocked, and a gathering's member list is optional (6, 8: the fork showed pace on Requests and Blocked, not on the member list). The rest were fork choices or environment: 1 (`pace` sorts last, not first), 4 (no commit in the fork, the run rules), 7 (Metro + agent-device in place of `expo start --ios`).

Incident (the simulator driver, not the app or the skill): a mis-tap on the Profile tab hit "Delete account". It was dismissed with "Keep my account" and nothing was deleted.

The fixes are wording only and the run was green end to end, so no re-run is needed. The line is now `LINE=~/dev/withme-scratch/proof-runclub-extend-profile-r2`, committed as 8929ce9 ("extend-profile: runclub") and tagged `pre-provision-tags`.

---

### Task 5: provision-tags, local only (literal)

**Follower brief:**

> You are provisioning tags for the Run Club fork at `$LINE`, locally. Follow `.agents/skills/provision-tags/SKILL.md` literally: §1 with `--count 3` and base URL `http://localhost:3000`, and §5 locally with the chip UID `04D00D00D00D03`. Skip §2–§4 (production and physical tags) and say so.
>
> The fork's seed identity is `lin@demo.runclub.local` / `runclub-demo-1`.
>
> Environment notes: the claimed-card SSR hang in `vite dev` is known (restart `apps/web`'s dev server). No remote services. Keep every UID out of anything except the log file.
>
> Log to `$NOTES/5-provision-tags-r<k>.md` as before.

**Watch list:**
- `DB=supabase_db_runclub`, read from the renamed `config.toml`. The `docker exec` must hit the fork's stack. (The rename was skipped, Decision 6, so `config.toml` still says `withme-starter` and the container is `supabase_db_withme-starter`.)
- The output directory is `$HOME/withme-tags/…`: the skill's path carries the upstream brand. Record it as a cosmetic finding; it is a deviation only if it confuses the follower.
- The claim as Lin turns the page into Lin's card **with her pace and without her Strava handle**. That is the cross-skill check, and the reviewer verifies it in the log or a screenshot.
- A signed-out viewer sees "Connect".
- A second account's stale claim gets "This tag has already been claimed."

**Expected:**
- §1's stdout lines (`Provisioned 3 unclaimed tags on http://127.0.0.1:55321` … `Wrote provisioned-tags.csv and provisioned-tags.html (printable).`).
- `-rw-------` modes.
- `git status --porcelain` empty, and no `provisioned-tags.*` in `$LINE`.
- Three `|unclaimed` rows.
- §5's UID comes back under `returning` and lands on "Claim this tag".

**Then:** the deviation procedure. There is no clone commit: provisioning changes no files in the fork. Tag `pre-gate` anyway.

**Run 1 (2026-10-12).** On `$LINE` at `pre-provision-tags` (8929ce9). START 23:28:38Z, END 23:35:15Z: about 7 min wall. Log: `$NOTES/5-provision-tags-r1.md`. The follower reset and seeded the stack first for a clean start, piped every UID-printing command through `tee` to the log and a redacting `sed`, and wrote the dev-server logs into the batch directory. Every expected result came out:
- §1's stdout word for word; exactly the two files, both `-rw-------`, CSV header `uid,encode_url`; `git status --porcelain` empty and no `provisioned-tags.*` at the fork root; three `|unclaimed` rows.
- End to end: signed out, the encode URL went to `/login?returnTo=%2Fclaim%2F…`; Lin signed in and claimed, and the page became Lin's card with `6:15/km` and without `@lin.runs` (the cross-skill check passed). A signed-out viewer, and a signed-in non-owner, saw Lin's card with "Connect" and no claim offer. A stale claim got "This tag has already been claimed."
- §5: the insert returned the UID (`INSERT 0 1`); a re-run returned `(0 rows)` / `INSERT 0 0`; the row is `unclaimed`; `/t/<chip>` gave `307` to `/claim/<chip>`.
- §4's retirement: the batch directory (CSV, HTML, dev-server logs) deleted, and its empty parent. Then a reset and seed; the fork's tree clean.

One `vite dev` hang: the signed-out SSR of the newly claimed card never returned under `vite dev`; a restart of `apps/web`'s dev server fixed it (1.7 s after). Because of it the stale-claim race was repeated on the second batch UID.

App observation for the report (not the skill): vite logged a React hydration mismatch on `/login?returnTo=/claim/…`. The server rendered the loading `div` (`aria-busy`), the client the form.

Deviations, fixed in d81acb5 except where noted:
- D8, §5: `$DB` "from §1" was set only inside a checkpoint snippet. §1 now names it as a normal step, and §5 derives it again for a fresh shell.
- D10, §5: the `307` to `/claim` proves nothing, since unknown UIDs redirect the same way. §5 now checks a count of the `unclaimed` row (`1`).
- D2/D3, §1: the local command prints the UIDs, and so do the `psql` checkpoint, the pages and the dev-server logs. An agent now sends stdout to `provision.log`, reads a redacted view, and puts the dev-server logs in `$OUT` so the retirement deletes them.
- D6, §1: a brand-new account meets "First, your card" (with the required profile fields) before "Claim this tag". Now said; the seeded identity is complete.
- D4, §1: the `vite dev` hang and its restart are now named in the end-to-end check.
- D11, §4: removing the batch directory's empty parent is now allowed in one phrase.
- D1 (the reset before seeding), D5 (the race repeated on another UID), D7 (the fork's identity, covered by "or your rebranded identity"), D9 (the chip UID came from the brief): follower choices or environment, no change.

§5's `$DB` is a command change, so a re-run is required: run 2 of at most 3, on `$LINE` with d81acb5's skill.

**Run 2 — Done 2026-10-12.** START 23:38:13Z, END 23:44:57Z: about 7 min wall. Log: `$NOTES/5-provision-tags-r2.md`. All checkpoints passed:
- §1's output word for word; the files `-rw-------` (`provision.log` included); `git status --porcelain` empty and no stray `provisioned-tags.*`; three `|unclaimed` rows; `/t/<UID>` gave `307` to `/claim/<UID>`, then `/login?returnTo=%2Fclaim%2F…`.
- The claim as Lin turned the page into her card with `6:15/km` and without `@lin.runs`. A signed-out viewer saw "Connect" and no claim offer. A stale claim got "This tag has already been claimed." A brand-new account got "First, your card" (Name, Pace) before "Claim this tag".
- §5: the insert returned one row, the count check printed `1`, and a re-insert returned 0 rows.
- §4: the batch directory (dev-server logs included) deleted. The follower's own search found no batch UID left in wrangler state, the vite cache, `supabase/.temp`, the notes, or its scratchpad.

One `vite dev` hang, cleared by a restart of `apps/web`'s dev server.

Deviations 1–9. D2 (§1 hard-coded `$HOME/withme-tags`), D3 (how to restart the web dev server under the agent's log redirect) and D4 (stop the dev servers before §4 deletes `$OUT`) are fixed by wording in d220c5c. The rest are follower choices or observations: D1 the required background read late, D5–D6 how the second and the brand-new accounts were exercised, D7 a signed-out "Connect" is a link (the skill's text does not imply a button, so no change), D8 the `/login` hydration mismatch (an app observation for the report, as in run 1), D9 screenshot names. Wording only, so no re-run is needed.

Final fork: `~/dev/withme-scratch/proof-runclub-provision-tags-r2` at 3d472db, tagged `pre-provision-tags` and `pre-gate` (provisioning changes no files).

---

### Task 6: The full gate on the finished fork (program manager or a verification subagent; not literal-following)

From `$LINE`, with the `runclub` stack up:

```bash
bun run db:reset && bun run db:seed
bun run lint && bun run typecheck && bun run test           # record db / contract / nfc counts
(cd apps/api && bun run dev) &                               # or a second shell; wait for :8786
(cd apps/api && bun run e2e)                                 # ends "handshake e2e: all checks passed"
(cd apps/web && CI=1 bunx playwright test)                   # 14 passed
```

Then stop the API dev server. Cross-skill checks, each logged with its output:

```bash
grep -rni --exclude-dir={node_modules,dist,.expo,.wrangler,.turbo} withme apps/ supabase/seed README.md | grep -v '@withme/'     # make-it-yours step 8 sweep, re-run after the later skills: nothing
grep -rn -i "'[^']*gathering[^']*'\|>[^<]*gathering[^<]*<" apps/web/src/routes apps/web/src/components apps/mobile/app apps/mobile/components --include='*.tsx' | grep -v "api\.app\.gatherings\|Gathering[A-Z]\|/gathering" | head    # user-facing "gathering" residue: review by eye
docker exec supabase_db_withme-starter psql -U postgres -tAc "select public.resolve_tag('04BBBBBBBBBBBB')::text" | grep -o '"route_name": *"[^"]*"\|"pace": *"[^"]*"\|strava'   # route_name and pace, never strava
```

The container is `supabase_db_withme-starter`, not `supabase_db_runclub`: the `project_id` rename was skipped (Decision 6). jsonb's text form puts a space after each colon (`"pace": "5:30/km"`), so the pattern allows one; without ` *` it prints nothing.

**Expected:**
- All green.
- The counts match Tasks 3–4 (db 87, contract 37, nfc 48, unless a run recorded otherwise).
- The sweep prints nothing.
- The residue list holds only identifiers.
- The resolve prints `route_name` and `pace` and no `strava`.

Write `$NOTES/6-gate.md`.

**Done 2026-10-12.** On `$LINE` = `~/dev/withme-scratch/proof-runclub-provision-tags-r2` at `pre-gate` (3d472db), tree clean before and after, on the shared `withme-starter` stack (container `supabase_db_withme-starter`; rename skipped). `env | grep -c SUPABASE_SERVICE_ROLE_KEY` printed `0` in the shell before any test (the remote-guard gap), and the six ports were free. START 23:46:10Z, END 23:48:18Z (about 2 min wall, per `6-raw/times.txt`). Log: `$NOTES/6-gate.md`, raw output in `$NOTES/6-raw/`.
- Gate all green: reset and seed (the runclub identity); lint; typecheck 8/8; **db 87, contract 37, nfc 48**, as Tasks 3–4 predicted; API e2e **67** `ok` lines ending "handshake e2e: all checks passed"; Playwright **14** passed. The API dev server was stopped before Playwright (which starts its own worker), so two `runclub-api` workers were never registered at once. No the `vite dev` hang hang (Playwright uses `vite preview`).
- Brand sweep (make-it-yours step 8's current command): exactly the two expected lines, `apps/mobile/app.json` `owner` (EAS step 5 skipped) and `supabase/config.toml` `project_id` (rename skipped).
- "gathering" residue: 17 lines, all identifiers (the `gathering` variable, `gatheringLine()`, `describeTag(tag, gatherings)`, the `'gathering'` destination type). No user-visible string.
- `resolve_tag('04BBBBBBBBBBBB')`: `"pace": "5:30/km"` and `"route_name": "River loop, 8 km"`, no `strava`. The plan's original pattern printed nothing because jsonb text has a space after each colon; the command above now allows it (a plan-text fix, not a skill or app defect).

---

### Task 7: The simulator pass on the finished fork

Use the memory-note technique. Boot by UDID if `simctl` reports a phantom boot. Run Metro from `$LINE/apps/mobile` (`bunx expo start --port 8081 --clear`, with `EXPO_PUBLIC_STORE_URL` set by make-it-yours), plus `cd apps/api && bun run dev`. Then `xcrun simctl openurl booted exp://127.0.0.1:8081`. Screenshots go to `$NOTES/7-sim-<n>.png`.

1. **Brand.** The header wordmark reads `runclub` in Archivo. The tabs are Runs / Connections / Merch / Profile. Merch shows the store card. The accent appears only on primary actions.
2. **Completion gate.** A new local account (`sim-<stamp>@rls.test`) lands on Profile. Save is disabled until Name and Pace are both filled. `fast` is refused and `5:30/km` saves. A relaunch with Pace emptied returns to "Finish your profile". (the PGRST303 issue may land the first try on Runs.)
3. **Runs.** Create a run with Route "Harbor 5k". The row and the detail header show the Route. Point my tags at it, then open the tag (`exp://127.0.0.1:8081/--/t/<uid>`) signed out. The summary shows the title, the time, and "Harbor 5k".
4. **Connections tier.** Two connected accounts each see the other's Strava handle in Connections. A resolve of either card shows Pace and no Strava.
5. **Cold Join.** Signed out, open `04BBBBBBBBBBBB`, choose Join, then sign up. The app lands on "Join this run?" (the renamed copy), and Join opens Profile. Save returns to "Join this run?".
6. **A provisioned tag.** One UID from Task 5 lands on the claim screen.

**Expected:** all six pass. Any failure goes through the deviation procedure for the skill whose step it traces to, or becomes a tracker issue if it is an app defect. Write `$NOTES/7-sim.md`.

**Done 2026-10-12.** On the same fork at `pre-gate` (3d472db), tree clean throughout, iPhone 17 Pro (iOS 26.5) with Expo Go, Metro and the API dev server from the fork. START 23:48:24Z, END 2026-10-13T00:01:23Z: about 13 min wall. Log: `$NOTES/7-sim.md`, screenshots `$NOTES/7-sim-*.png`. All six checks pass:
1. Brand: the `runclub` wordmark in Archivo; tabs Runs / Connections / Merch / Profile; Merch shows the store card; the accent only on the connect-kind actions ("Join this run", "Claim tag").
2. Completion gate: a new `@rls.test` account landed on Profile first time; Save stayed disabled with Name only; `fast` was refused with the generic save error and `5:30/km` saved; with Pace emptied, a relaunch returned to "Finish your profile".
3. Runs: Route "Harbor 5k" on the row and the detail header; the tag pointed at the run; signed out, the tag summary showed the title, "Harbor 5k" and the time.
4. Connections tier, both ways: Ada and Lin each see the other's Strava handle in Connections; the Requests card and both tag cards show Pace and no Strava.
5. Cold Join: signed out, Join → sign-in → a new account → "Join this run?"; Join opened Profile, and Save returned to "Join this run?".
6. A provisioned tag: Task 5's batch had been retired, so one fresh local tag was provisioned (`$HOME/runclub-tags/local-<stamp>`, files `-rw-------`, the fork's tree clean); it landed on "Claim this tag" as Lin, was then claimed for check 4, and the batch directory and its parent were deleted. No UID in any note; the one screenshot of the claim screen is redacted.

No `PGRST303` and no `vite dev` hang. The stack was reset and seeded from the fork at the end; ports free; the simulator driver's servers stopped. Observations, none of them failures:
- The route is not on the "Join this run?" preview (title and time only). The preview reads hints the tag screen passes, not the gathering; customize-gathering §2 step 6 now names them (9343b62).
- The pace error does not name the field or the format. Covered by extend-profile's format-rule note (a malformed value gets the generic save error; the input has a format placeholder).
- The run's member list shows bio, not pace: extend-profile says that display is optional.
- Two `404`s from `gatherings/get` per cold join in the API log: by design (a non-member falls back to the join card).
- `provision.ts` prints "Provisioned 1 unclaimed tags" (the plural with a count of 1). An app observation for the report.

---

### Task 8: Phase A close-out

1. Check that every skill fix is committed: `git -C "$WT" status --porcelain` prints nothing.
2. Check that `$WT` still passes `bun run lint`. This changes no app code; it confirms the skill edits left the tree clean.
3. Write the **Phase A Done note** into this plan: a table of runs per skill (minutes, deviations, fix commits), the order-dependences found (O1–O4 plus any new ones), and which known issues bit.
4. Send the program manager a five-line Phase A summary for Alex. It goes with the Task 9 stop message, if Alex has not yet answered it.
5. Leave the `runclub` stack and the line clone in place: Phase B uses them, and Task 13 cleans them up.

**Phase A — Done 2026-10-12.** `git -C "$WT" status --porcelain` empty and `bun run lint` green in `$WT` after the close-out commits. The line is `~/dev/withme-scratch/proof-runclub-provision-tags-r2` at 3d472db (`pre-gate`), on the shared `withme-starter` stack (there is no `runclub` stack: the rename was skipped).

**Runs per skill.** Minutes are wall time from the logs' START/END stamps; none had pauses. "Clean" means green at the final checkpoint with wording-only notes, so no re-run.

| Skill | Run | Minutes | Deviations | Outcome | Fix commit |
| --- | --- | --- | --- | --- | --- |
| make-it-yours | r1 | 8 (21:23:36–21:31:49) | 9 (D9 an input gap) | green; step 8 sweep command changed → re-run | b160d58 |
| make-it-yours | r2 | 8 (21:36:15–21:44:09) | 6 notes | **clean** | 77ec5f1 (wording) |
| customize-gathering | r1 | 10 (21:44:53–21:54:41) | 11 (+1 environment) | green after fixes; commands changed → re-run | 77ec5f1 |
| customize-gathering | r2 | 12 (21:59:52–22:12:03) | 8 | red on Storage `42P10` only: the CLI upgrade mid-run; expectation and command changed → re-run | 94361f8 |
| customize-gathering | r3 | 10 (22:24:35–22:34:12) | 5 (+3 observations) | **clean** | b5772ed (wording, paths) |
| extend-profile | r1 | 23 (22:35:06–22:58:18) | 19, incl. the step order (D16) | green; step order changed → re-run | f319943 |
| extend-profile | r2 | 25 (23:02:22–23:27:44) | 8 | **clean** | 6ea5df3 (wording) |
| provision-tags | r1 | 7 (23:28:38–23:35:15) | 11 | green; §5's `$DB` command changed → re-run | d81acb5 |
| provision-tags | r2 | 7 (23:38:13–23:44:57) | 9 | **clean** | d220c5c (wording) |
| gate (Task 6) | — | 2 (23:46:10–23:48:18) | plan grep only | green | this commit (plan) |
| simulator (Task 7) | — | 13 (23:48:24–00:01:23) | 5 observations | 6/6 pass | 9343b62 (customize-gathering, the join preview) |

The extend-profile minutes include its own simulator pass. Plan records: 31a5b11, 830c3e5, 14a5968, 40b8e70, 10e0e43, b3adf7b, d6656b2, 2280909, d18152b, and this commit.

**Totals.**
- Skill time on the clean path (the final run of each skill): 7:54 + 9:37 + 25:22 + 6:44 = **49 min 37 s** (about 50 min). M4's single-skill runs for comparison: make-it-yours 2, extend-profile 10.5, provision-tags 2.5.
- All nine skill runs: about 110 min.
- Phase A wall time: the Task 1 clone at 21:22:18Z to the gate's end at 23:48:18Z, **2 h 26 min**; to the simulator pass's end at 00:01:23Z, 2 h 39 min. That includes about 12 min between customize-gathering r2 and r3 while Alex restarted the stack under the new CLI.

**Order-dependences found** (what a later skill meets because an earlier one ran):
- make-it-yours → customize-gathering: page titles read `'Events — <wordmark>'`, not `'Events — withme'`. Fixed in customize-gathering (77ec5f1).
- customize-gathering → make-it-yours: the URL rename moves files that make-it-yours' page-title list names (`_app.gatherings.tsx`). Only matters if make-it-yours runs again after; recorded for the report.
- customize-gathering → extend-profile (O2): `resolve_tag`'s newest definition moves to customize-gathering's migration, while `accept_connect_request`'s stays in `avatars`, so extend-profile copies each body from its own grep. The follower did, keeping `route_name`; the text now says the grep decides (6ea5df3).
- customize-gathering → extend-profile (O3): paths and copy after the URL rename (`run/[id].tsx` for `gathering/[id].tsx`, `_app.runs_.$id.tsx`, "Join this run?"; `gatherings.spec.ts` kept its name in this fork). "Renamed if you ran customize-gathering's URL step" notes (f319943).
- customize-gathering → extend-profile (O1): `create_gathering`'s new required argument in extend-profile's new RLS test. The comment in the skill's code worked: the follower passed `p_route_name` both times.
- extend-profile → provision-tags: the end-to-end claim shows the extend-profile card tier (Lin's pace, no Strava), and a brand-new account meets "First, your card" with the required Pace before "Claim this tag" (now said, d81acb5).
- O4: the profile-creating fill grep found 12 after customize-gathering, as the text says.

The order the skills ran in (make-it-yours → customize-gathering → extend-profile → provision-tags) is the order a forker should use.

**Known issues that bit.**
- The `vite dev` hang (the claimed-card SSR hang under `vite dev`): twice, once in each provision-tags run; a restart of `apps/web`'s dev server cleared it each time.
- The PGRST303 issue (`PGRST303`): never seen after Alex's restart onto PostgREST 16.4; PR #11 (5bdd81d) fixed it on `main` by requiring PostgREST 16.3+.
- the remote-guard gap: guarded, not hit (`SUPABASE_SERVICE_ROLE_KEY` count 0 before the gate's tests).
- Environment, both fixed by Alex: the Homebrew Supabase CLI upgrade (2.116.0 → 2.120.0) mid customize-gathering r2, which broke Storage until the stack restarted; and the Docker disk cleanup (99% → 77%) before r3.

**App issues filed:** the input-border issue (the light input border at 2.97:1, and the token comments naming only Connect and Accept for the accent), the anon-execute gap (core's older RPCs revoke execute from `public` but not `anon`). App observations for the report, not filed: the `/login` hydration mismatch on `returnTo=/claim/…`, and `provision.ts`'s "Provisioned 1 unclaimed tags".

**Skipped:** make-it-yours step 5 (EAS: it creates an Expo project, so Phase B); the `project_id` rename (Decision 6, the shared stack); provision-tags §2–§4 (production provisioning and physical tags); icon artwork (none supplied).

---

## Phase B — go-live (billable, outward-facing)

### Task 9: STOP. Alex decides.

Superseded 2026-10-13 by the amendment below: not run

Nothing in this task creates anything. The program manager sends Alex the message below, after Phase A is done. The decision is recorded in the decisions log.

**What go-live would create.** These are the skills' own commands, applied to the fork:

| Where | What | From |
| --- | --- | --- |
| Supabase | Possibly a new org (`supabase orgs create "Run Club Proof"`, a free-plan org). One project, `runclub-proof`, in us-east-1, with every migration pushed (`supabase db push`): the public `avatars` bucket, auth users and demo rows from `SEED_ALLOW_REMOTE=1 bun run db:seed`, and optionally one provisioned tag (provision-tags §2, `--count 1`). | go-live §1; provision-tags §2 |
| Cloudflare | Two Workers on Alex's `workers.dev` subdomain: `runclub-api`, with three secrets (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CORS_ORIGIN`), and `runclub-web`. No custom domain, no DNS change. | go-live §2–§3 |
| Expo | A new EAS project, `runclub`, under Alex's account (`eas init`), its updates URL, and one published update on branch `demo`. No `eas build`: go-live builds nothing. | make-it-yours step 5; go-live §4 |
| Local (gitignored, in the clone or `$HOME`) | `$HOME/.config/runclub/supabase-db-password` (0600); `.env.demo-seed` with the service-role key (0600); `apps/web/.env.production`; `apps/mobile/.env.production`; `supabase/.temp/` link state; an encode list under `$HOME/withme-tags/` if provisioning runs. | go-live, provision-tags |
| Domain | None. Tags would be encoded only for a custom domain (provision-tags rule 6), and no physical tags are encoded in this run. | — |

**What it costs.** The figures are go-live's own; Alex confirms them on the dashboards.
- **Supabase.** $0 on a free-plan org, which allows two active free projects. If Alex's existing demo projects already use that allowance, the project needs a paid org. On an existing paid org, go-live puts the extra project's compute at about $10/mo, billed by the hour, so a same-day teardown costs cents. A new paid org adds its plan subscription.
- **Cloudflare Workers.** $0 on the free plan, which includes a daily request allowance.
- **EAS Update.** $0 on the free plan for one update and a handful of devices. No build minutes are used.
- **The domain.** $0: none is bought.

**Credentials Alex enters himself.** Claude never types, pastes, or reads them aloud.
- `supabase login` (browser or token).
- `bunx wrangler login` (browser OAuth).
- `bunx eas-cli login`.
- Any sign-in on the deployed app:
  - go-live §3's "verify the authed path once (sign in as the demo user via supabase-js…)". Claude writes the script to `$NOTES`, and Alex runs it.
  - The throwaway sign-up and `delete_my_account` check, which Alex does in his browser with an address that can confirm. The default SMTP only delivers to org members.
- The service-role key never appears on a command line or in a transcript. go-live's Python writes it straight to `.env.demo-seed`.

**Option 1: a real throwaway production run (Task 10a).**
- Claude runs each step only after Alex's "yes" for that step. Alex does the logins, the authed checks, and the deletes in teardown.
- It proves go-live end to end on a fork for the first time since go-live was distilled, and it is the only way to test go-live's database-push, secrets, service-binding, and JWKS checkpoints.
- Cost: about 60–90 minutes with Alex present for the logins and approvals, and $0 if a free Supabase slot exists.

**Option 2: a go-live dry run (Task 10b).**
- A read-through of every go-live command against the local fork, with everything that can be checked without an account actually checked:
  - `wrangler deploy --dry-run` bundles for both Workers;
  - the service-binding name;
  - production-mode web and mobile builds with placeholder URLs, checked for inlining;
  - the seed's remote refusal;
  - the key-extraction script against a fixture;
  - `zsh -n` on every subshell block.
- The production leg is recorded as **not run**, and the report says plainly that go-live is not proven by this milestone.
- About 30 minutes, unattended, $0.

**The program manager's recommendation**, in prose for Alex: option 1, if a free Supabase project slot is available. The acceptance sentence names go-live, and option 2 cannot test go-live's riskiest steps (`db push` on a fresh project, secrets, the service binding, JWKS, hosted `delete_my_account`). If no free slot exists and Alex does not want a paid project for an afternoon, option 2, and the report carries "go-live unproven" as an open item. **The decision is Alex's.**

No timer runs during this stop.

---

### Task 10a (option 1): A throwaway production run, step by step

Superseded 2026-10-13 by the amendment below: not run

Run it in a **dedicated terminal tab**, from `$LINE`, after Task 6's tests: no `bun test` runs in this tab afterwards (the remote-guard gap). Every **[approve]** line means: show Alex exactly what the next command creates and wait for a clear yes. Timing covers Claude's steps only; Alex's logins and approvals are PAUSE.

1. **Alex:** `supabase login`, `bunx wrangler login`, `bunx eas-cli login`. **Claude verifies** (read-only): `supabase orgs list`, `bunx wrangler whoami`, `bunx eas-cli whoami`.
2. **[approve] make-it-yours step 5 (EAS)**, literally, in `apps/mobile`: remove `owner`, `extra.eas.projectId`, and `updates.url`; then `bunx eas init`; then `bunx eas update:configure`.
   - Checkpoint: a new `projectId` ≠ `cf56d2f1-…`, and `updates.url` ends with it.
   - Watch: go-live §4.1 runs `eas-cli init --non-interactive --force` again. That is overlap between the two skills. Record which one a forker should run, and whether running both is harmless.
3. **[approve] go-live §1, the hosted database:**
   - org (new free org, or the org Alex names);
   - the password file in `$HOME/.config/runclub/`;
   - `supabase projects create runclub-proof …`;
   - `link` and `db push` via `SUPABASE_DB_PASSWORD`.

   Checkpoints:
   - `Finished supabase db push`, listing every migration, the fork's two included;
   - Alex confirms in the dashboard that the `avatars` bucket is public, 1 MiB, JPEG/WebP;
   - the key fetch writes `.env.demo-seed` with mode `-rw-------`;
   - `env | grep -c SUPABASE_SERVICE_ROLE_KEY` prints `0` in the tab afterwards.
4. **[approve] go-live §1's production seed**, in the skill's subshell. Watch: whether the seed's demo identity (`*@demo.runclub.local`) can sign in on hosted auth without SMTP. go-live's Auth note says seeded credentials are the path.
5. **[approve] go-live §2, the API Worker:** `bunx wrangler deploy` (retry rule), then the secrets subshell. Checkpoints:
   - `curl https://runclub-api.<sub>.workers.dev/health` returns `{"ok":true}`;
   - an anonymous SDK resolve of `04BBBBBBBBBBBB` (a throwaway `NfcClient` script in `$NOTES`, no credentials) returns Ada's run summary **with `route_name`**.
6. **[approve] go-live §3, the web Worker:** `apps/web/.env.production` with `VITE_STORE_URL` set, then build and deploy. Checkpoints (bodies checked with Python):
   - `/` returns 200 with `runclub`;
   - `/t/04BBBBBBBBBBBB` returns 200 with the seeded card and the route (this proves the service binding);
   - `/merch` returns 200.

   Alex runs the authed-path script and the throwaway sign-up → Profile → Account → Delete account. Record whether the confirmation email's link pointed at the deployed site or at `localhost`.
   - **Watch:** go-live never sets the Supabase Auth **Site URL / redirect URLs**, which README's Deploy step 2 does. A `localhost` link is a go-live deviation. The fix adds that step to §1 or §3 with the dashboard path.
7. **[approve] go-live §4, mobile:** `apps/mobile/.env.production` (the `EXPO_PUBLIC_*` mirrors plus the store), then `eas update --branch demo --environment production … --non-interactive`, then the `--no-bytecode` export check into `$NOTES/verify-export`.
   - Note for the report: no build targets this project, so no device can load the update. go-live's mobile checkpoint is the export check only.
8. **Optional [approve] provision-tags §2** with `--count 1` against production, stdout to the log file, the owner stop as written. Open the encode URL (a `workers.dev` URL, which rule 6 allows only because this is a throwaway). Default: run it if Alex approves; it is provision-tags' only unexercised leg.
9. **Teardown.** Alex runs the deletes, because they are permanent; Claude prints the exact list and verifies afterwards.
   - `bunx wrangler delete --name runclub-web`, then `--name runclub-api`.
   - `supabase projects delete <ref>`. The org, if a new one was made, goes in the dashboard.
   - The EAS project goes in the expo.dev dashboard (project settings).
   - Claude removes the local files: `.env.demo-seed`, both `.env.production`, `$HOME/.config/runclub/`, the encode-list directory, and `supabase/.temp/`.
   - Verify:
     - `curl -s -o /dev/null -w '%{http_code}\n' https://runclub-api.<sub>.workers.dev/health` is not 200;
     - `supabase projects list` has no `runclub-proof`;
     - `env | grep -c SUPABASE_` prints `0`.

Deviations go through the deviation procedure: the fix goes into go-live or make-it-yours. A re-run of production steps needs a new approval; the default is to fix the text and record "not re-run against production".

---

### Task 10b (option 2): A go-live dry run

Superseded 2026-10-13 by the amendment below: not run

From `$LINE`, after Task 6. Log to `$NOTES/10b-dry-run.md`. Every go-live command gets one of three labels: **verified locally**, **needs an account (not run)**, or **Alex only**.

```bash
# Workers: bundle without deploying (no login needed)
(cd apps/api && bunx wrangler deploy --dry-run --outdir "$NOTES/dry-api")        # ends "--dry-run: exiting now."
grep -n '"name"' apps/api/wrangler.jsonc; grep -n '"service"' apps/web/wrangler.jsonc   # runclub-api in both
# Web: a production build with placeholders, then check what was inlined
printf '%s\n' 'VITE_API_URL=https://runclub-api.dry-run.invalid' 'VITE_SUPABASE_URL=https://dryrunref.supabase.co' \
  'VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_dryrun' 'VITE_STORE_URL=https://shop.example.com/runclub' > apps/web/.env.production
(cd apps/web && bun run build && bunx wrangler deploy --dry-run --outdir "$NOTES/dry-web")
grep -rl 'runclub-api.dry-run.invalid' apps/web/dist | head -3        # at least one hit
grep -rl 'localhost:8786\|127.0.0.1:55321' apps/web/dist              # nothing
# Mobile: go-live §4's own verification, with placeholders
printf '%s\n' 'EXPO_PUBLIC_API_URL=https://runclub-api.dry-run.invalid' 'EXPO_PUBLIC_SUPABASE_URL=https://dryrunref.supabase.co' \
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_dryrun' 'EXPO_PUBLIC_STORE_URL=https://shop.example.com/runclub' > apps/mobile/.env.production
(cd apps/mobile && NODE_ENV=production bunx expo export --platform ios --no-bytecode --output-dir "$NOTES/dry-export")
grep -rl 'runclub-api.dry-run.invalid' "$NOTES/dry-export" | head -3   # at least one hit
grep -rl 'localhost:8786\|127.0.0.1:55321' "$NOTES/dry-export"         # nothing
rm apps/web/.env.production apps/mobile/.env.production                # placeholders must not outlive the check
# The seed refuses a remote target without the override, before any network call
SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=dummy bun run db:seed; echo "exit $?"   # "Refusing to seed non-local Supabase at https://example.supabase.co. …", exit 1
```

Also:
- Run go-live §1's key-extraction Python, unchanged, from an empty scratch directory against a fixture on stdin: `[{"name":"anon","api_key":"sb_publishable_x"},{"name":"service_role","api_key":"fixture"}]`. Expect a 3-line `.env.demo-seed` with mode `-rw-------` and `https://<ref>.supabase.co` left literal. Delete the directory afterwards.
- Copy every subshell block from go-live into `$NOTES/blocks/*.sh` and run `zsh -n` on each: no output.
- The migration chain `db push` would apply was already proven by Task 6's `db:reset` from zero. Record that as the stand-in.
- Do a static read of go-live against `README.md`'s Deploy section and make-it-yours steps 5–7. The expected findings are the Auth Site URL / redirect step (README has it, go-live does not) and the step 5 / §4.1 `eas init` overlap. Each finding is a skill fix only if the text is plainly wrong. Otherwise it goes into the report as "unverified, needs a production run".

The production leg is recorded as **not run**: every "needs an account" line goes into the report's open items.

---

## Phase C — the report

### Task 11: The acceptance report

**File:** Create `$WT/docs/superpowers/reports/<YYYY-MM-DD>-proof-run.md`. Sections:

1. **Verdict.** One paragraph: is a derivation "no longer barebones", with the evidence.
2. **The fork.** The inputs from Decisions 1–5, the SHA of `origin/main` it started from, and the clone source.
3. **Timings.** One table:

   | Skill | Run | Minutes (wall) | Minutes (minus pauses) | Deviations | Fix commit |
   | --- | --- | --- | --- | --- | --- |

   It has a row per run and a total for the clean path: setup, make-it-yours, customize-gathering, extend-profile, provision-tags, gate, simulator, go-live (or the dry run). Compare with M4's single-skill timings: provision-tags 2.5 min, extend-profile 10.5 min, make-it-yours 2 min.
4. **Deviations and fixes.** Per skill: what the text said, what happened, and the fix with its SHA. Mark each one as a text defect, an order-dependence, or an environment issue.
5. **Order-dependence.** O1–O4 and anything new. For each, say whether the skill now handles it, and state the order a forker should run the skills in.
6. **What a derivation gets for free, and what was still hand work.**
   - Free: the safety core and its RLS suite (the counts), the resolver, claim, consent, blocks, runs with membership and tag pointers, Connections, avatars, My tags, account deletion, the Merch pointer, provisioning, e2e and Playwright, CI.
   - Hand work the skills guided: the inventory of edits per skill (`git diff --stat` per tag range).
   - Hand work no skill covers: icon artwork, README prose, the store itself, a domain, SMTP, the Supabase Auth URLs (if found), EAS builds and store submission, physical encoding, a numeric gathering field (the static list from Decision 3).
7. **Known issues.** the PGRST303 issue, the `vite dev` hang, and the remote-guard gap: did each one bite, and where. Plus any new tracker issues filed during the run.
8. **Go-live.** Which option Alex chose. Option 1: each checkpoint's result, the teardown evidence, and the cost incurred. Option 2: the labeled command list and the open items.
9. **Not covered.** add-destination-type, `readTagUid` on a physical chip, physical encoding, app-store builds, multi-tenant.

Commit: `git commit -m "Docs: the proof-run report (milestone 5)" …`.

### Task 12: Program status and spec pointer

- `docs/superpowers/program.md` Status: "Milestone 4: merged (PR #10, `<sha>`)", and "Milestone 5: PR #<n> (proof run; report: `reports/<date>-proof-run.md`)".
- Spec "Delivery" item 5: append "Done: see `../reports/<date>-proof-run.md`." That is a pointer, not a rewrite.
- After the merge (Task 15), Status gets "Program complete (`<merge sha>`)".

---

## Phase D — the PR

### Task 13: Cleanup and stack restore

```bash
(cd "$LINE" && bunx supabase stop --no-backup)        # stops runclub and drops its throwaway volumes; if the classifier blocks it, ask Alex to run it
                                                      # (rename skipped, Decision 6: there is no runclub stack and no supabase_db_runclub; skip this line and never stop the shared withme-starter stack)
for d in "$S"/proof-runclub*; do rm -rf "$d"; done
rm -rf "$HOME/"*-tags/local-*                         # encode lists (local, throwaway): Task 5 used withme-tags, Task 7 runclub-tags
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(8786|3000|8796|9456|3010|8081) '   # nothing: stop leftover dev servers and Metro
(cd "$WT" && bun run db:start && bun run db:reset && bun run db:seed)        # withme-starter stack back, origin/main + the branch's (doc-only) changes
docker ps --format '{{.Names}}' | grep -c supabase_db_withme-starter          # 1
```

Also:
- Shut the simulator down (`xcrun simctl shutdown all`) and kill the agent-device daemon if it lingers.
- Keep `$NOTES` until the PR body is written (Task 14), then delete it.
- Report the stack restored to the program manager.

### Task 14: Gate, push, PR

```bash
cd "$WT"
bun run lint && bun run typecheck && bun run test        # identical counts to Task 0 (no app code)
git diff --name-only origin/main...HEAD                  # .agents/skills/**, docs/** only (README.md only if a fix needed it)
git push -u origin claude/proof-run
```

PR against `main`, titled `Proof run: a fresh clone through every skill and go-live (milestone 5)`. The body has:
- the spec link, Milestone 5, and the report link;
- the fork's inputs;
- the timing table;
- the deviations and their fix commits, per skill;
- the order-dependences;
- Alex's go-live choice and its outcome (option 1's teardown evidence, or option 2's "production leg not run" list);
- the known issues that bit;
- what was skipped and why (add-destination-type, EAS build, physical tags, the numeric field);
- "no app code", with the `git diff --name-only` output;
- the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)` at the end.

### Task 15: Review, merge, report

1. Run `superpowers:requesting-code-review` over the diff (skills and docs), and handle the findings with `superpowers:receiving-code-review`. Resolve CodeRabbit's comments on their merits, pushing back where a suggestion contradicts a documented decision.
2. Merge with a **merge commit** once CI and CodeRabbit are clean.
3. Update the tracker:
   - Milestone 5 → Done, with the report link;
   - a project status update on the build-out project: the timings, the fixes, go-live's outcome, and "program complete";
   - the decisions log gets the recorded decisions: the vertical, the field choice, the go-live option.
4. Post the milestone report to Alex (by push notification) with the verdict paragraph and the open items.
5. Commit program.md's "Program complete" line (Task 12) on a follow-up branch, or include it before the merge if the merge SHA is not needed. The program manager decides.
6. Update the memory notes: the app-shell direction note's resume point, plus a new technique note if the run taught one.

---

## Not in this milestone

- **add-destination-type**: not in the spec's sequence; a run club needs no new destination type.
- **add-marketing-site**: the spec lists it as a candidate after the proof run.
- **Fixing app defects** the run finds: each becomes a tracker issue under the build-out project.
- **A numeric gathering field**: covered as a static gap list in the report, unless Alex swaps it in (Decision 3).
- **EAS builds, store submission, a custom domain, encoding physical tags**: go-live and provision-tags do not cover them, or they need hardware.
- **A second proof run in another vertical.** If this report changes skills substantially, a follow-up run is a later decision.

---

## Amendment 2026-10-13: real rebuilds (golf now, tailgate deferred)

> This amendment replaces **Phase B** (Tasks 9, 10a, 10b), which was never run, and revises Phase C (Tasks 11–12) and Phase D (Tasks 13–15). Phase A and its Done notes stand unchanged.

**Goal.** Run the skills for real on a fork that already exists: golf-with-me. It has not launched, so it is rebuilt from a fresh withme-starter tree through the skills, starting with a design uplift, and goes live for real. The throwaway Run Club go-live is dropped: it would have shown that go-live works on a fork nobody uses. A real go-live shows that, and leaves a product running. The timings, deviations and fixes go into the same acceptance report.

**Tailgate is deferred (Alex, 2026-10-13).** tailgate-with-me will be rebuilt around real sporting events, which fill its gatherings, once Alex decides how to source the event data. It is not part of this milestone. Phase B″ below is kept as a draft for that later run.

**What stays the same.** Literal following by a fresh subagent for each skill, with timing. The Follower brief and Watch list stay separate. Skill-text fixes are committed on `claude/proof-run`. The M5 PR carries only skills, docs and the report. Anything that bills or reaches outside the machine waits for an **[approve]** from Alex.

**What is new.**
- The `design-direction` skill runs first, on a fork that already has a brand.
- make-it-yours step 6 (the `project_id` rename) runs for real.
- `add-destination-type` runs as part of a sequence.
- go-live runs for real, once. It reuses an existing EAS project and uses a Cloudflare login that can see several accounts.
- One repository outside withme-starter, golf-with-me, receives a PR.

---

### Decisions (amendment; Alex answered the open questions on 2026-10-13, see the end)

**A1. Rebuild, not merge-upgrade.** Golf has not launched: there are no users and no physical tags. The fork is rebuilt from scratch on today's starter. What the legacy fork built by hand is now either core code (gatherings, calm states, the store pointer, provisioning) or a skill (link destination, profile fields, rebrand).

**A2. Design comes first, as an uplift.**
- `design-direction` runs for golf with the existing brand as its references:
  - `PRODUCT.md`;
  - the current palette and fonts;
  - golf's `.impeccable/critique/2026-06-12T18-48-26Z__apps-web-src.md`.
- The skill says to skip itself when a brand exists. Here that is overridden on purpose, because the goal is an uplift. The follower is told so, and the report records it as a use the skill does not name.
- The run gives 2–3 named directions. Alex picks one.
- The output is `docs/brand-direction.md` in the rebuild. `contrast.ts --sheet` must print 12 `ok` lines and exit 0.
- Exactly eight color tokens.
- Golf gets icon artwork: today it ships the starter's template icons byte for byte.
- **How the artboards are made and where Alex sees them.**
  - If the session's skill list has `design` (Claude Design, a research preview), the follower runs `/design` with the skill's brief from `$WT`, so it reads the starter's `tokens.css`. The canvas is on Alex's claude.ai account and private to it, and `/design` prints its link.
  - As of 2026-10-12 the program manager's skill list has no `design` entry. The default is therefore the skill's own alternative: "hand the same brief to the agent directly". The follower draws the six boards per direction as one self-contained HTML file. The program manager publishes it as a **private Artifact** on claude.ai (the `Artifact` tool, after a `quickstart` with `intent: "design"`) and sends Alex the link. Alex compares and comments there.
  - The sheet records that link as the canvas link.
  - `/design-sync` (the skill's optional §5) is skipped.

**A3. Repo mechanics: no force push, ever.**
- Tag golf's current `main` as `legacy-2026-06` (annotated) and push the tag **[approve]**.
- The `rebuild` branch lives in a new worktree of that repo, `.claude/worktrees/rebuild`. That path is already ignored by the repo's `.git/info/exclude`.
- **Commit 1 replaces the tree** with withme-starter `origin/main` at a recorded sha. That removes golf's tracked `.supabase-demo-db-password` and its eight `supabase/.temp/*` files.
- **Program manager's refinement:** commit 1 is made with `git commit-tree` from the starter's tree, with **two parents**: `legacy-2026-06` first, the starter sha second.
  - Its tree is byte-identical to the starter's, which can be checked by tree hash.
  - The starter becomes an ancestor, so later starter fixes (the input-border and anon-execute fixes, M5's skill texts) arrive in the fork with a plain `git merge` instead of a conflict across the whole tree.
  - Alex chose two parents (answered 2026-10-13). The single-parent fallback (`git rm -r .`, `git archive | tar -x`, a normal commit) is not used.
- Commit 2 syncs the skill texts from `claude/proof-run`, because `origin/main` does not yet carry Phase A's fixes.
- Then one commit per skill. A fork-specific fix goes into its skill's commit.
- Then the PR `rebuild` → `main` **[approve]** before the push and before opening the PR. Merge with a merge commit after CI, and after CodeRabbit if it reviews these repos.
- **What CI exists:**
  - Golf (like tailgate) carries the starter's older `.github/workflows/ci.yml`: lint, typecheck, build, publint/attw, Supabase CLI 2.84.2, `bun run test`. It also carries `release.yml` (publishes `@withme/nfc` on `nfc-v*` tags) and `dependabot.yml`.
  - Golf has no `.coderabbit.yaml`. Its history has no merge commit: it was pushed straight to `main` and never had a PR. So whether CodeRabbit reviews it is unknown until the first PR (G11 records it).
  - Commit 1 brings the starter's current `ci.yml`, which adds CLI 2.120.0 and the Playwright smoke in workerd. Pushing a changed workflow file needs the `workflow` token scope. Tailgate's `docs/DEPLOY.md` notes that the stored HTTPS token lacks it, so G2 checks.
  - `release.yml` stays in the fork. It is dormant unless someone pushes an `nfc-v*` tag, and the report notes it as a make-it-yours gap.

**A4. What the rebuild does not carry.**
- The marketing sites (`apps/public`) are dropped. They stay on the legacy tag, and a later `add-marketing-site` skill will cover them.
- Also dropped:
  - golf's `.impeccable/` (it critiques the legacy UI, and G1 reads it from the legacy tag);
  - the legacy dedicated local ports.
- **Program manager's default:** `PRODUCT.md` is carried forward. It is restored from the legacy tag in the design commit, edited only where the chosen direction contradicts it (the accent's name). The design work and future `/impeccable` runs read it.
- The starter's `docs/superpowers/` is kept, as a forker would keep it.
- Golf's staging worktree and branch, `claude/staging-mobile-build-deploy-f73d84`, are superseded and left untouched. The tailgate repo is not touched at all in this milestone.

**A5. Golf mapping.**
- **Names:** wordmark `golfwithme`, display name `Golf with Me`, id `co.golfwithme.app`, scheme `golfwithme`, slug `golfwithme`, workers `golfwithme-api` / `golfwithme-web`, `project_id = "golfwithme"`.
  - The names are fixed inputs to the design brief, not proposals: the EAS project `@vibe-with-me/golfwithme` requires the slug.
  - The `project_id` is new on purpose. The legacy stack's Docker volumes are named `golf-with-me`.
- **Gathering:**
  - Nouns round / rounds, tab `Rounds`, URL `/rounds`.
  - Core `title` is the round's name and stays required, labelled "Round name".
  - customize-gathering adds a required `course_name` ("Course", 1–120). That is the skill's worked example exactly, with "Course · when · where".
  - `starts_at` is labelled "Tee time": on mobile, the date field stays "Date" and the time field reads "Tee time".
  - `location` stays optional.
  - The members heading is "Players", the legacy fork's word.
  - Join-preview hints stay title and time only (the skill's default). The golf critique flagged hint-borne course text as spoofable, and the resolver card already shows the course.
- **Profile** (extend-profile, card tier only):
  - `handicap`: `numeric(3,1)`, −10.0…54.0, optional, CHECK `profiles_handicap_range`.
  - `home_club`: text 1–80, optional, CHECK `profiles_home_club_length`.
  - The card line reads "HCP 8.4 · Pebble Creek GC".
- **The plus-handicap convention, reconsidered.** The critique flagged "-5 for +5" as a leak of the storage convention, and asked that "+5" be accepted as input.
  - Storage keeps WHS order: a plus handicap is stored negative, +2.4 as −2.4. The range CHECK and numeric ordering stay natural.
  - No surface ever shows or accepts a minus sign. Inputs accept `+2.4`, `2.4`, `12`, and blank (clear). Displays print `+2.4` for a stored −2.4. A typed `-3` is refused.
  - The rule lives in one place: two pure helpers in the contract, `parseHandicap(text)` and `formatHandicap(n)`, next to `HandicapSchema = z.number().min(-10).max(54).multipleOf(0.1)`. Both clients import them, the way they import `isProfileComplete`. Contract tests cover the helpers.
  - This is extend-profile's "typed fields take the same steps; the CHECK mirrors the zod rule" note made concrete. The skill has one sentence for it, so expect deviations and a "Typed fields" paragraph as the fix. Decision 3 of the main plan predicted roughly +30–60 minutes for a typed field.
  - Alex chose this shape (answered 2026-10-13): numeric, with the plus shown and no minus on any screen. The text-with-a-format-CHECK alternative is not used.
- **Connections-only fields:** none. A connections-tier field was considered and none is natural: handicap and home club are the introduction itself.
- **Required for completion:** none (answered 2026-10-13).
- **add-destination-type:** the `link` destination, identical to its worked example. It is reachable through the SDK and API only; the skill leaves a claim-UI option to the fork, and none is built.
- **provision-tags:** local only.

**A6. Tailgate mapping. Deferred 2026-10-13:** tailgate will be rebuilt around real sporting events once Alex decides how to source event data; not part of this milestone. The mapping below is the 2026-10-12 draft, kept for that later run; it does not model sporting events and will change.
- **Names:** wordmark `tailgatewithme`, display name `Tailgate with Me`, id `co.tailgatewithme.app`, scheme `tailgatewithme`, slug `tailgatewithme`, workers `tailgatewithme-api` / `tailgatewithme-web`, `project_id = "tailgatewithme"`.
- **Gathering:**
  - Nouns tailgate / tailgates, tab `Tailgates`, URL `/tailgates`.
  - Create heading "Host a tailgate", button "Host tailgate"; members heading "Crew".
  - `title` is labelled "Title". `location` is optional, as in core; the legacy fork required it, and making it required again would need a CHECK and RPC change no skill covers.
  - `starts_at` is labelled "Kickoff for the lot" on web; on mobile, "Date" plus "Kickoff".
  - No extra gathering field. customize-gathering therefore runs §1 (nouns and URLs) only: the first nouns-only run.
- **Profile:** card tier `team` ("Team") and `signature_dish` ("Signature dish"), each text 1–80, optional, with CHECKs `profiles_team_length` and `profiles_signature_dish_length`. The card line reads "Chiefs · Burnt-end chili".
  - A connections-only field was considered. A payment handle for chipping in is the closest fit, but payment handles invite misuse, so the answer is none.
- **add-destination-type:** link. **provision-tags:** local.

**A7. Hosting per app, free plans.**
- **Supabase:**
  - The org "Golf With Me" exists. The new project `golfwithme` is created fresh in it, in `us-east-1` unless Alex says otherwise.
  - Golf's old project `<golf-project-ref>` is paused. Alex deletes it after go-live (answered 2026-10-13).
  - Tailgate's org "Tailgate With Me" and its paused staging project `wntdmgxmrinagmqrefpt` are left as they are until the tailgate rebuild.
- **Cloudflare:**
  - Account "Golf With Me".
  - Wrangler is logged in to three accounts, so the fork pins its account with `"account_id"` in both `wrangler.jsonc` files. Committing it is fine: the id is not a secret. `CLOUDFLARE_ACCOUNT_ID` must be unset in the deploy shell.
  - Why it matters: golf's legacy workers with the same names (`golfwithme-api`, `-web`, `-public`) are live on `<legacy-subdomain>.workers.dev`, which is another account. A deploy to the wrong account would silently replace them.
- **Expo:**
  - Owner `vibe-with-me`. The EAS project is reused, not created: golf `6a004be3-f3b4-4ec5-be7d-ff58a61fc77a` (`@vibe-with-me/golfwithme`, committed in legacy `67f8bc0`).
  - The reuse means make-it-yours step 5 links rather than creates: `eas init --id <projectId>`.
- **Who does what:** every billable or outward step is **[approve]**. Alex does the logins (done for supabase, wrangler and eas on 2026-10-13; re-checked read-only at G10), the dashboard steps, the signed-in checks, and every permanent delete.

**A8. The local stack.**
- The rebuild runs make-it-yours step 6 for real, which renames `project_id`. Before G4, step 6's text is fixed to stop first (P0.1). The order bug has been known since M4, and the golf run verifies the fix instead of rediscovering it.
- The fresh tree's `project_id` is still `withme-starter`. So the stop-first step, run from the rebuild, stops the shared `withme-starter` stack: the one stack window of the rebuild.
  - The program manager confirms before G4 that no other session needs `withme-starter`.
  - `withme-starter` is restarted from `$WT` at G12.
- The ports are the same for every project, so one stack runs at a time.
- Before the stack window:
  - `colima ssh -- df -h /var/lib/docker` must show use below 85%.
  - `docker system df` is recorded.
  - Never prune or remove images or volumes. That is Alex's job, per the memory note.

**A9. Literal following, adapted to real products.**
- Each skill is still run by a fresh subagent, with timing, as in Phase A, and the logs keep the same format.
- What changes is the deviation procedure. See "Deviation procedure (amended)": a fork-specific deviation is fixed in the fork and logged rather than re-run, while skill-text defects are still fixed in `claude/proof-run`.
- Golf gets the full gate and a simulator pass (G9) before go-live. Go-live does not start unless both are green.

**A10. Report and PRs.**
- The acceptance report (Phase C) covers Run Club Phase A, the golf rebuild, and golf's go-live.
- The M5 PR (Phase D) carries only skill and doc fixes plus the report.
- A separate PR in `vibe-with-me/golf-with-me` carries the app.

**A11. Order.** Golf G0–G12, in order. The batching default (tailgate's T0–T1 right after G1) no longer applies: tailgate is deferred.

---

### Ground rules for the rebuilds (in addition to the plan's)

- **Variables:**

  ```bash
  WT=~/dev/withme-starter/.claude/worktrees/proof-run   # skill fixes land here, as in Phase A
  STARTER=~/dev/withme-starter
  S=~/dev/withme-scratch
  NOTES="$S/notes/m5"
  GOLF=~/dev/golf-with-me;      G="$GOLF/.claude/worktrees/rebuild";  GN="$NOTES/golf"
  # TAIL, T and TN (tailgate) return with the deferred Phase B″
  ```

- **Where work happens:**
  - Write only in `$G`, its re-run worktrees (`…/.claude/worktrees/rebuild-<skill>-r<k>`), `$WT` (skill fixes and plan records), and `$NOTES`.
  - Never write in golf's main checkout or its staging worktree, or anywhere in the tailgate repo.
  - Never write in the other withme-starter worktrees.
  - Read the legacy code only in G0 and G1, by the program manager. Followers never see it.
- **Tags.** The `pre-<skill>` tags are local only and are deleted at G12. Only `legacy-2026-06` is pushed. Never `git push --tags`.
- **The stack window** (A8):
  - Ports 55320–55324, 8786, 3000, 8796, 9456, 3010, and 8081 are free.
  - `env | grep -c SUPABASE_SERVICE_ROLE_KEY` prints `0` before any local test (the remote-guard gap).
  - Use `CI=1 bunx playwright test`.
  - Drive the simulator per the memory note.
- **The go-live tab:**
  - G10 runs in a dedicated terminal tab, opened after the gate.
  - No `bun test` or `bun run test` ever runs in that tab (the remote-guard gap).
  - Every block that sources `.env.demo-seed` runs in a subshell.
- **Credentials.** Claude never types, pastes, or reads aloud a password, key or token. Exceptions:
  - the local stack's test accounts;
  - the demo identity on the local stack;
  - the public account and project ids.

  Service-role keys reach only `.env.demo-seed` (0600), via go-live's Python.
- **Logs and timing** follow the plan's protocol:
  - `$GN/<task>-<skill>-r<k>.md`;
  - START, END, PAUSE and RESUME stamps;
  - Alex's choices, approvals, logins and dashboard steps are PAUSE.
- **Commits in the fork:**
  - `git -C "$G" add -A && git -C "$G" commit -m "<skill>: golfwithme" -m "<what and why>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`, then `git -C "$G" tag pre-<next-skill>`.
  - The tree is never committed with `.env*`, `.dev.vars`, `supabase/.temp/`, or `provisioned-tags.*`. The starter's `.gitignore` covers each, and `git -C "$G" status --porcelain --ignored | grep -E '\.env|\.dev\.vars|\.temp|provisioned'` shows them only as `!!`.
- **Skill sync.** Before each skill run, if `$WT`'s skill texts changed since the fork's last sync, commit a sync into the fork:

  ```bash
  rsync -a --delete "$WT/.agents/skills/" "$G/.agents/skills/" && cp "$WT/docs/the-slice.md" "$G/docs/the-slice.md"
  git -C "$G" add -A .agents/skills docs/the-slice.md
  git -C "$G" commit -m "skills: proof-run fixes at claude/proof-run $(git -C "$WT" rev-parse --short HEAD)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

  `.agents/skills/**` and `docs/the-slice.md` are the only paths `claude/proof-run` changes outside `docs/superpowers/`. Check with `git -C "$WT" diff --name-only origin/main...HEAD -- . ':!docs/superpowers'`. The final sync happens at G11, so the product repo ships the final texts.

### Deviation procedure (amended)

Every deviation is logged as in Phase A: the step, what the text says, what happened, and the reading taken. Each one is classified as one of four kinds:

1. **Skill-text defect (S).**
   - Fix it in `$WT` and commit, as in Phase A, then sync it into the fork before the next skill.
   - **Re-run** only if the fixed text would produce a different fork: a command, an order, or an expected output changed, *and* the fork's state differs from what the fixed text yields.
   - Otherwise the program manager checks the fork against the fixed text and records "verified, not re-run".
   - At most **two runs** per skill per app. A second failing run stops and goes to Alex.
2. **Fork-specific (F).** The product needs something the skill rightly leaves to the fork (the handicap helpers, the EAS link, the account pin).
   - Fix it in the fork, in that skill's commit, and log it as a fork choice with the reason.
   - If another fork would hit the same gap, also write an S note.
3. **App defect in core (A).**
   - File a tracker issue under the build-out project, as Phase A did with the input-border and anon-execute issues.
   - Fix it in the fork only if it blocks go-live, with the issue linked in the commit body.
   - Never fix it in `claude/proof-run`, because the M5 PR carries no app code.
4. **Environment (E).** Log only.

**How a re-run works.** It uses a new worktree at the tag, never a reset of the live branch before the re-run is green.

```bash
R="$GOLF/.claude/worktrees/rebuild-<skill>-r2"
git -C "$GOLF" worktree add --detach "$R" pre-<skill>
rsync -a --delete "$WT/.agents/skills/" "$R/.agents/skills/"; cp "$WT/docs/the-slice.md" "$R/docs/the-slice.md"
git -C "$R" add -A .agents/skills docs/the-slice.md && git -C "$R" commit -m "skills: proof-run fixes at claude/proof-run $(git -C "$WT" rev-parse --short HEAD)"
git -C "$R" tag -f pre-<skill>
for f in apps/api/.dev.vars apps/web/.env apps/mobile/.env; do [ -f "$G/$f" ] && cp "$G/$f" "$R/$f"; done
(cd "$R" && bun install)
# if the re-run is clean: git -C "$G" reset --hard "$(git -C "$R" rev-parse HEAD)"   (rebuild is unpushed until G11: no force push)
# then: git -C "$GOLF" worktree remove "$R"
```

---

### What Alex must do or approve, in order

**Before the start**
1. ~~Answer the open questions.~~ Done 2026-10-13: see "Answered 2026-10-13" at the end.
2. If Docker use is at or above 85% at the stack window, prune images when asked (A8).

**Golf**

3. **G1:** pick a golf direction on the private Artifact (up to three iteration rounds). Approve the icon mark.
4. **G2 [approve]:** push the tag `legacy-2026-06` to `vibe-with-me/golf-with-me`. If `gh auth status` lacks the `workflow` scope, run `gh auth refresh -h github.com -s workflow`.
5. **G10 (go-live, about 60–90 min present):**
   1. If any login has expired, log in again (`supabase login`, `bunx wrangler login`, `bunx eas-cli login`).
   2. **[approve]** link the EAS project `@vibe-with-me/golfwithme` (`eas init --id 6a004be3-…`).
   3. **[approve]** create the Supabase project `golfwithme` in "Golf With Me" (region `us-east-1` unless you say otherwise), then link it and run `db push`.
   4. In the dashboard: Storage, confirm the `avatars` bucket (public, 1 MiB, JPEG/WebP).
   5. **[approve]** the production seed.
   6. In the Cloudflare dashboard, account "Golf With Me": read out the account's workers.dev subdomain, registering one if none exists.
   7. **[approve]** the API Worker deploy and its three secrets.
   8. **[approve]** the web Worker deploy.
   9. In the Supabase dashboard: Authentication, URL Configuration. Set the Site URL and the Redirect URL.
   10. Run the authed-path check script that Claude wrote.
   11. Do a throwaway sign-up with an address that can confirm, check where the confirmation link points, then Profile → Account → Delete account.
   12. **[approve]** `eas update` to branch `demo`.
   13. Optionally, open the update in Expo Go on your phone.
6. **G11 [approve]:** push `rebuild` and open the PR into `main`. Claude merges with a merge commit after CI, and after CodeRabbit if it reviews this repo. If CodeRabbit is not installed on the repo, Claude asks you whether CI plus the code review suffices.
7. **G12, teardown** (both deletes answered yes on 2026-10-13):
   1. Delete the old Supabase project `<golf-project-ref>` (permanent).
   2. Delete the legacy workers `golfwithme-api`, `golfwithme-web` and `golfwithme-public` from the account behind `<legacy-subdomain>.workers.dev`, after the new ones are verified.
   3. Optionally, remove the legacy local Docker volumes named `golf-with-me`.
   4. Optionally, say yes to fast-forwarding the golf main checkout.

**Tailgate:** nothing in this milestone (deferred; see Phase B″). Decide later how the rebuild sources real sporting events.

**M5**

8. Nothing to approve. Claude merges the M5 PR under the operating rules and reports.

---

### P0: Pre-flight (program manager, in `$WT`)

1. **Fix make-it-yours step 6's order.** It has been known since M4.
   - Replace the `project_id` bullet with:
     - If you rename `project_id`, stop the running stack first, while `config.toml` still names it: `bun run db:stop`.
     - Then rename.
     - Then `bun run db:start`, then `bun run db:reset && bun run db:seed`. The renamed project starts on new, empty volumes.
     - A fresh fork's `project_id` is still `withme-starter`, so that stop also stops any other checkout of the starter on this machine.
   - Commit: `make-it-yours: stop the old stack before renaming project_id`.
   - **Done:** `ab153b8`.
2. **Record the amendment.**
   - Append this amendment to the plan.
   - Mark Tasks 9, 10a and 10b with one line: "Superseded 2026-10-13 by the amendment below: not run".
   - Commit: `Plan: amendment 2026-10-13, the golf rebuild (tailgate deferred)`.
   - Push `claude/proof-run`.
3. **Tracker.**
   - Append A1–A11 and the 2026-10-13 answers to the decisions log, including the tailgate deferral.
   - Create one issue under the build-out project: "Golf rebuild and go-live".
4. ~~Collect Alex's answers to the open questions.~~ Done 2026-10-13.

**Expected:** `git -C "$WT" status --porcelain` is empty and `bun run lint` is green in `$WT`.

---

## Phase B′: golf-with-me

### G0: Inventory → the inputs sheet (program manager; about 20 min; no stack)

```bash
mkdir -p "$GN" && chmod 700 "$S"
git -C "$GOLF" fetch origin
git -C "$GOLF" status --porcelain                         # empty
git -C "$GOLF" rev-parse --short origin/main              # f35d6c3
git -C "$GOLF" worktree list                              # main + staging-mobile-build-deploy-f73d84 (untouched)
git -C "$GOLF" ls-files | grep -cE '^\.supabase-demo-db-password$|^supabase/\.temp/'   # 9
git -C "$GOLF" show origin/main:apps/mobile/app.json | grep -nE '"(slug|scheme|bundleIdentifier|package|owner|projectId)"'
git -C "$GOLF" ls-tree --name-only origin/main .github/workflows; git -C "$GOLF" cat-file -e origin/main:.coderabbit.yaml 2>/dev/null || echo "no .coderabbit.yaml"
git -C "$STARTER" fetch origin && git -C "$STARTER" rev-parse origin/main   # the STARTER_SHA candidate (250edfd as of 2026-10-12)
```

**Then:**
1. **Baseline the legacy palette.** Write the legacy Colors table from `$GOLF/apps/web/src/styles/tokens.css` (light `:root` and the dark block) into `$GN/legacy-colors.md`, in the sheet's three-column format. Run `bun run "$WT/.agents/skills/design-direction/contrast.ts" --sheet "$GN/legacy-colors.md"`. Expect 12 `ok` lines; the legacy light input border is 3.08:1. Record the output; it is the "before" of the uplift.
2. **Map legacy commits to the rebuild**, in `$GN/0-inputs.md`:

   | Legacy commit | Rebuild |
   | --- | --- |
   | `8e3f88b` rebrand | G1 design-direction + G4 make-it-yours |
   | `f54a56e` link | G7 |
   | `9c0a66f` handicap and home club | G6 |
   | `17b0425` Rounds | core gathering + G5 |
   | `67f8bc0` EAS | G10 (make-it-yours step 5, linked) |
   | `bee9c9d` fulfillment and provisioning | core store pointer + G8 |
   | `7d270a3` critique fixes | a static check, item 3 |
   | `45fa484` noopener | a static check of core's "Open store" link: `rel` includes `noopener` |
   | `0605229`, `f35d6c3` `apps/public` | dropped (A4) |
   | `98c65b7` README | starter README + make-it-yours step 3 |

3. **Check the critique's P0 and P1 findings statically against the starter tree at `STARTER_SHA`.** One line each: present in core / missing (a tracker issue if it is core's) / the fork's to do.
   - Malformed `/t/<uid>` and unknown routes land on a calm card (`__root.tsx` `errorComponent` / `notFoundComponent`; UID normalization in the web loader).
   - The tap moment has a loading state.
   - A wordmark footer on the resolver.
   - The login subtitle from `returnTo`.
   - Accept carries the accent.
   - Narrow-width consent actions.

   G9 rechecks them live.
4. **Write the inputs sheet** `$GN/0-inputs.md`, holding every input the G-briefs quote:
   - A5's names and mappings, plus the copy listed in G5;
   - seed values: Ada `8.4` / `Pebble Creek GC`; Lin `+1.2` (stored −1.2, so the seed shows the plus convention) / `Riverbend Muni`; Ada's round "Saturday dawn nine", course "Pebble Creek GC", location "First tee";
   - the seed identity `*@demo.golfwithme.local` / `golfwithme-demo-1`, the legacy fork's;
   - the store: none (answered 2026-10-13);
   - the fork repo URL `https://github.com/vibe-with-me/golf-with-me`;
   - the design references and mood (G1);
   - `STARTER_SHA`;
   - the EAS project id.
5. **Check the stack window's preconditions:**
   - `colima ssh -- df -h /var/lib/docker` reads below 85%;
   - `docker system df` (record the output);
   - `docker volume ls --format '{{.Name}}' | grep -c golf-with-me` (the legacy volumes, recorded for G12).

**Expected:** `$GN/0-inputs.md` complete. The program manager reviews it against A5 and the 2026-10-13 answers.

**Done YYYY-MM-DD.** (to write)

---

### G1: design-direction, an uplift (literal; Alex picks; about 30 min of agent time plus Alex's choosing)

**Follower brief:**

> You are producing a brand direction for "Golf with Me", an existing NFC tap-to-connect app for golfers that is being rebuilt on withme-starter. Work from `$WT` (give the literal path), read-only. Follow `.agents/skills/design-direction/SKILL.md` literally, §1 to §3, as if new to this codebase. Do not read `docs/superpowers/`. Do not edit any file in `$WT`. Your outputs go to `$GN/design/` (give the literal path).
>
> This fork already has a brand, and the skill says to skip it in that case. Run it anyway: the goal is an **uplift** of the existing brand, not a new one. Pass the brand as the brief's References.
>
> Inputs:
> - Vertical and audience: "Golfers meeting at the tee or the range. A stranger taps your tag and sees your card (handicap, home club), or joins the round your tag points at, outdoors, one-handed, often in sun glare."
> - Mood: "clubhouse, dew, scorecard".
> - Brand names, **fixed, not proposed**: wordmark `golfwithme`, display name `Golf with Me`. Their treatment (case, tracking) may vary.
> - References, attached as files and quoted in the brief:
>   - `$GN/ref/PRODUCT.md` (copied from the legacy tag);
>   - the current palette in `$GN/legacy-colors.md` (one green accent, `#15803d` light and `#4ade80` dark, on cool grass neutrals);
>   - the fonts Archivo (display) and Inter (body);
>   - the critique `$GN/ref/critique.md`. Address its design points: "zero golf in the visual language beyond green neutrals", "where's the golf in the card?", and its note on the landing tagline's cadence.
> - At least one direction stays in the green family (an evolution). At least one moves further.
> - No store yet: the sheet still carries the Merch copy.
> - Icon: the app has no artwork. Each direction describes a mark for a 1024px app icon, drawn as a flat SVG shape.
>
> `/design`: if it is in your skill list, use it as the skill says. If not, take the skill's alternative: write the boards yourself as ONE self-contained HTML file, `$GN/design/boards.html`. Each named direction gets a section with its six boards (resolver card, shell, landing; light and dark) at 390×844, its eight token values per mode, its two font families, its mark as inline SVG, and one sentence on fit. Google Fonts `<link>`s are allowed in the boards only. Then stop and report the file path: the program manager shows it to the owner.
>
> After the owner picks (the program manager will tell you the direction and any changes), do §3:
> - Write the sheet to `$GN/design/brand-direction.md` from the skill's template. Names row: `golfwithme | Golf with Me | co.golfwithme.app | golfwithme`.
> - Run the skill's checks with the script's absolute path: `bun run "$WT/.agents/skills/design-direction/contrast.ts" --sheet "$GN/design/brand-direction.md"`, and `npm view` for both font packages.
> - For the Artwork rows, write the chosen mark as `$GN/design/art/icon.svg` and `android-icon-foreground.svg` (the mark inside the central 66% safe zone, transparent background). Render them:
>
>   ```bash
>   rsvg-convert -w 1024 -h 1024 icon.svg -o icon.png
>   magick icon.png -alpha off icon.png
>   rsvg-convert -w 1024 -h 1024 android-icon-foreground.svg -o android-icon-foreground.png
>   magick icon.png -define icon:auto-resize=48,32,16 favicon.ico
>   ```
>
>   All of these run inside `$GN/design/art/`.
>
> Log to `$GN/1-design-direction-r<k>.md`: START/END/PAUSE/RESUME stamps (the owner's choosing is PAUSE), the commands and trimmed outputs, and every deviation: the step, what the text says, what happened, and what you did. Finish with the skill's §3 checkpoint output and the deviation list.

**The program manager, between the boards and §3:**
- Publish `boards.html` as a private Artifact: `Artifact` `quickstart` with `intent: "design"`, then publish. Send Alex the link with one line per direction.
- Iterate at most three rounds, relaying Alex's notes to the follower via `SendMessage`.
- Record the pick and the Artifact link, which the sheet carries as the canvas link.
- Before the brief goes out, copy the references: `git -C "$GOLF" show legacy-2026-06:PRODUCT.md`. The tag does not exist yet at G1, so use `origin/main`. Do the same for the critique file, into `$GN/ref/`.

**Watch list:**
- **The skip-if-branded line.** Did the follower stall on it, or on the brief's "Brand names: propose"? Expected fix (S): an "Uplift of an existing brand" paragraph covering what goes in References, that names may be fixed, and that the legacy values are run through `contrast.ts` first.
- **The brief's copy.** It draws "Join this gathering", "Events" and "two gathering cards", the starter's nouns. customize-gathering has not run yet, so is the follower drawing "rounds" (an improvisation) or the literal text? Either way it is an order-dependence: design-direction runs before customize-gathering. Fix candidate: "use your vertical's nouns if you already know them; customize-gathering applies them later".
- **No path from mark to PNG.** The skill's Artwork rows name files, but no skill renders them. This is the first time icon artwork is produced in the program; the report lists it as hand work. A one-line `rsvg-convert` note in §3 is a fix candidate.
- **Shape.** The sheet has exactly eight token rows. The script prints 12 `ok` lines and exits 0. `npm view` prints a version for `@fontsource-variable/<font>` and `@expo-google-fonts/<font>`.
- **Icon checks.**
  - `sips -g hasAlpha "$GN/design/art/icon.png"` → `hasAlpha: no` (iOS rejects alpha).
  - `sips -g pixelWidth -g pixelHeight` → 1024 each.
- **Rules.** No direction proposes a second accent, a tinted card, or an accent tab. Reject any that does, under the skill's "What must not move".
- `git -C "$WT" status --porcelain` is empty after the run: the follower edited nothing in `$WT`.

**Expected:**
- Two or three named directions on the Artifact, and Alex's pick recorded.
- `$GN/design/brand-direction.md` with the contrast output pasted under its Colors table.
- `$GN/design/art/` holding `icon.svg`, `icon.png`, `android-icon-foreground.svg`, `android-icon-foreground.png` and `favicon.ico`.

**Done 2026-10-13.** START 02:08:16Z; boards handed over at PAUSE 02:16:47Z (about 8.5 min of agent time); the owner picked direction 1, **Dew**, unchanged except that the quiet "What's Golf with Me?" link comes out; RESUME 02:19:22Z, END 02:20:56Z. `/design` was not in the follower's skill list, so it took the fallback and drew `$GN/design/boards.html`. The Artifact (the canvas link): https://claude.ai/artifact/BVTdwCggjGK6T2rE9gZAmD. Log: `$GN/1-design-direction-r1.md`. The follower wrote nothing in `$WT`.
- Three directions (Dew, Scorecard, Clubhouse), all 12 `ok`, exit 0, on scratch Colors tables.
- Dew in the sheet `$GN/design/brand-direction.md`: accent pair 6.49:1 light and 9.13:1 dark, border-input 3.25:1 and 4.58:1 (legacy: 5.02/8.55 and 3.08 light). Archivo and Inter kept: `@fontsource-variable/*` 5.3.0, `@expo-google-fonts/*` 0.4.2.
- Art rendered in `$GN/design/art/`: `icon.png` 1024×1024 with `hasAlpha: no`; the Android foreground, with the mark in the accent on transparent inside the 66% safe zone; `favicon.ico` 48/32/16.
- Deviations 1–16 in the log. Fixed in the skill by `a06b607` (`design-direction: fixes from the golf run`): `contrast.ts` reads only the table under `## Colors` and the template's Copy header is now `copy` (D14, the bug: a verbatim sheet exited 1). Also fixed: the uplift paragraph (D1); the HTML-and-Artifact fallback for `/design` (D3); the brief matched to what the starter renders, with vertical card content as an extend-profile proposal and new card treatments flagged as code changes (D4, D5, D7, D9); the vertical's nouns and the order-dependence (D6); the wordmark weight as one setting (D8); the render commands, the checks and the Android foreground rule in §3 (D12, D13); owner changes to the boards (D15). D2, D10, D11 and D16 were the brief's own setup and needed no text change.
- No re-run. The design output is the owner's choice and stands, and the fixes are text and script only. Self-checks on `a06b607`: the golf sheet gives 12 `ok`, exit 0; the template filled with the starter's own tokens fails only the light border-input at 2.97:1 (the input-border issue).

---

### G2: Repo prep [approve] (program manager; about 10 min)

```bash
git -C "$GOLF" fetch origin
git -C "$GOLF" tag -a legacy-2026-06 -m "golf-with-me before its rebuild on withme-starter (2026-10)" origin/main
git -C "$GOLF" rev-parse --short 'legacy-2026-06^{commit}'      # f35d6c3
gh auth status 2>&1 | grep -i 'scopes'                           # record; 'workflow' needed at G11
git -C "$GOLF" remote get-url origin                             # https://github.com/vibe-with-me/golf-with-me.git
```

**[approve]**, showing Alex the tag name, the commit, and the remote:

```bash
git -C "$GOLF" push origin refs/tags/legacy-2026-06
git -C "$GOLF" ls-remote --tags origin 'legacy-2026-06*'         # the tag and its ^{} line pointing at f35d6c3…
```

**Read-only facts for G11** (record them; nothing changes):

```bash
gh pr list -R vibe-with-me/golf-with-me --state all --limit 5    # expect none: the repo never had a PR
gh api repos/vibe-with-me/golf-with-me --jq '.private, .default_branch, .allow_merge_commit'   # true, main, true
gh api repos/vibe-with-me/golf-with-me/branches/main/protection 2>&1 | head -1                  # likely 404 / not protected
```

If `allow_merge_commit` is `false`, ask Alex before G11: the merge needs a merge commit.

Then the starter's objects, fetched from the local clone (no network to the starter):

```bash
STARTER_SHA=<from $GN/0-inputs.md>
git -C "$GOLF" fetch "$STARTER" "+refs/remotes/origin/main:refs/remotes/upstream/main"
test "$(git -C "$GOLF" rev-parse refs/remotes/upstream/main)" = "$(git -C "$STARTER" rev-parse "$STARTER_SHA")" && echo "upstream = STARTER_SHA"
```

If `origin/main` moved after G0, re-record `STARTER_SHA`, and note why it moved.

**Expected:** the tag is on the remote at `f35d6c3`, `upstream = STARTER_SHA`, and the facts are recorded. No remote branch is touched.

**Done YYYY-MM-DD.** (to write)

---

### G3: The fresh-tree commit, the skills sync, the baseline (program manager; about 15 min plus install)

```bash
TREE=$(git -C "$GOLF" rev-parse "$STARTER_SHA^{tree}")
C1=$(git -C "$GOLF" commit-tree "$TREE" -p legacy-2026-06 -p "$STARTER_SHA" \
  -m "Rebuild golf-with-me on withme-starter ${STARTER_SHA:0:7}" \
  -m "The tree is withme-starter's at ${STARTER_SHA:0:7}, byte for byte; the legacy app stays on tag legacy-2026-06. The starter is the second parent, so later starter changes merge. This drops the legacy tree's tracked .supabase-demo-db-password and supabase/.temp/* (the old project is deleted after go-live) and apps/public (a later add-marketing-site)." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")
git -C "$GOLF" worktree add -b rebuild "$G" "$C1"
test "$(git -C "$G" rev-parse 'HEAD^{tree}')" = "$(git -C "$STARTER" rev-parse "$STARTER_SHA^{tree}")" && echo "tree = starter"
git -C "$G" ls-files | grep -E '^\.supabase-demo-db-password$|^supabase/\.temp/|^apps/public/' | wc -l   # 0
git -C "$G" log --oneline -1 --format='%h %p'                     # C1 with two parents: f35d6c3 and STARTER_SHA
```

Then:
1. Commit the skills sync (ground rules) and tag it `pre-design-direction`.
2. Install: `(cd "$G" && bun install)`. Per the memory note, a worktree needs its own install.
3. Copy the env files from their examples: `cp -n apps/api/.dev.vars.example apps/api/.dev.vars`, and the same for the web and mobile `.env` files.
4. Run a baseline gate in a granted window on the still-shared `withme-starter` stack. The fresh tree's `project_id` is `withme-starter`, so this resets the same stack `$WT` uses, with an identical schema: `bun run db:reset && bun run db:seed && bun run lint && bun run typecheck && bun run test`.

The copied env files are deleted again before G4: make-it-yours copies them itself (`rm apps/api/.dev.vars apps/web/.env apps/mobile/.env`).

**Expected:**
- `tree = starter`, 0 legacy files, and C1 has two parents.
- The gate is green at **db 73, contract 31, nfc 48**: Phase A's 72 plus `stack.test.ts` from PR #11. Record the actual numbers; they are golf's baseline.
- `git -C "$G" status --porcelain` is empty.

**Done YYYY-MM-DD.** (to write)

---

### G4: The design commit, then make-it-yours with the real `project_id` rename (literal; about 20–30 min)

**Program manager first** (the design-direction commit):
- `mkdir -p "$G/docs/brand"`.
- Copy the sheet to `$G/docs/brand-direction.md`.
- Copy the SVG sources to `$G/docs/brand/`. This is a fork choice: the scratch directory is deleted at the end, and the skill's "outside the repo" would lose them.
- Restore `PRODUCT.md` from `legacy-2026-06`, editing only where it contradicts the direction (A4).
- Commit `design-direction: <Direction name>` and tag `pre-make-it-yours`.
- Rendered PNGs stay in `$GN/design/art/`; make-it-yours step 8 places them.

**Follower brief:**

> You are rebranding the rebuilt Golf with Me fork at `$G` (give the literal path). Start at `README.md`'s "Extending a fork", then follow `.agents/skills/make-it-yours/SKILL.md` literally, top to bottom, as if new to the codebase. Do not read `docs/superpowers/`. Do not open anything outside `$G`, except the artwork directory named below.
>
> Your inputs are in `docs/brand-direction.md` (Names, Colors, Fonts, Copy, Artwork). In addition:
> - wrangler names `golfwithme-api` / `golfwithme-web`; `project_id = "golfwithme"`;
> - fork repository URL `https://github.com/vibe-with-me/golf-with-me`;
> - rebrand the seed identity to `*@demo.golfwithme.local` with password `golfwithme-demo-1`;
> - no store URL: skip step 7 and say so;
> - artwork files: `$GN/design/art/icon.png`, `android-icon-foreground.png` and `favicon.ico` (give the literal paths).
>
> Do every step except step 5 (EAS), which is done later, at go-live. Skip it and say so.
>
> Environment notes, which are not part of the skill:
> - Run Playwright as `CI=1 bunx playwright test`.
> - Run no command against a remote service (supabase link/projects/orgs, wrangler deploy/login, eas).
> - The local Supabase stack is yours for this task, including stopping the running `withme-starter` stack where the skill says to stop the stack.
> - Never remove Docker images or volumes.
>
> Log to `$GN/4-make-it-yours-r<k>.md`: START/END/PAUSE/RESUME stamps, every command and its trimmed output, and every deviation (the step, what the text says, what happened, what you did). Do not fix the skill. Finish with step 8's checks and the list of deviations.

**Watch list:**
- **Step 6, run for real for the first time** (P0.1's fixed text):
  - `bun run db:stop` under `withme-starter` stops the shared stack;
  - the rename follows;
  - `db:start` brings up `supabase_db_golfwithme` on 553xx;
  - then reset and seed.
  - Checks: `docker ps --format '{{.Names}}' | grep -c '^supabase_db_golfwithme$'` prints `1`, and `grep -c supabase_db_withme-starter` prints `0`. Any port conflict or stall is a deviation of the fixed text.
- **The `vibe-with-me` org in the step 8 sweep.** Expect two lines the skill calls unacceptable or does not list:
  - `"owner": "vibe-with-me"` in `app.json`. Step 5 is deferred, and after G10 the same owner stays legitimately: the fork's EAS owner *is* the upstream org.
  - The README badge `github.com/vibe-with-me/golf-with-me`: the fork lives in the upstream's GitHub org.

  Expected fix (S): a "fork in the same org" filter, acceptable when `projectId` ≠ `cf56d2f1…` and the badge names the fork's repo.
- **`golfwithme` contains `withme`.** The skill's extra filter (`grep -viE 'golfwithme|golf with me'`) must be found and used, at step 3 and step 8.
- **Fonts.** The step 2 checkpoint holds for whatever the sheet names. If it keeps Archivo, Phase A's naming fixes apply.
- **The input-border issue.** The sheet's input border already passes 3:1 (`contrast.ts`), so step 1's "raise it until the fix lands" sentence should be a no-op. Record whether the follower raised it anyway.
- **Step 8 artwork.** `icon.png` and the Android foreground replace the template files. Expect no `favicon` wiring (the web app ships none; `mkdir -p apps/web/public` for `favicon.ico`). `sips -g hasAlpha apps/mobile/assets/icon.png` → `no`.
- **Reviewer checks after the run:**
  - `git -C "$G" diff pre-make-it-yours --stat` touches no `supabase/migrations/`, `packages/db/test/` or `packages/contract/src/`.
  - The token files are value-identical to the sheet: compare all 16 values by script.

**Expected:**
- The step 1, 3, 4, 6 and 8 checkpoints as the skill states them.
- `bunx expo config --type public` shows `Golf with Me` / `golfwithme` / `co.golfwithme.app` (and the upstream owner and `projectId` until G10).
- The gate is green at G3's counts.
- The visual check shows the sheet's accent on "Join this gathering" and nowhere else, in the sheet's display face. The design-direction §4 checkpoint is the same check.

**Then:** the deviation procedure. Commit `make-it-yours: golfwithme`, tag `pre-customize-gathering`.

**Done 2026-10-13.** Run 1: START 02:48:14Z, END 02:56:51Z (about 8.5 min). Every checkpoint held. Step 6's fixed order worked the first time: stop, rename, start, reset, seed; the stack is now `golfwithme`. Gate green at G3's counts: db 73, contract 31, nfc 48. The handshake e2e and Playwright (14) were green too. Visual check: the accent shows only on "Join this gathering", in both themes. Log: `$GN/4-make-it-yours-r1.md`.
- Deviations and fixes, in `399d78f` (make-it-yours: fixes from the golf run):
  - D1: `PHOTO_FILL` in `apps/web/src/lib/avatar.ts` is a third copy of the light surface. Step 1 now names it, and its old-neutral grep reaches it.
  - D3: the sheet's wordmark treatment had no seam in the skill. Step 3 now names the places: web `.wordmark` (selector `.wordmark, .card h1.wordmark`, because `.card h1` outranked it on the landing page) and mobile `Header.tsx` (a static-weight `fonts.wordmark`, letterSpacing = em × fontSize).
  - D4: a fork in the starter's own GitHub org now has an accepted case in the step 8 sweep: the README badge naming the fork's repo, and `"owner": "vibe-with-me"` once `projectId` ≠ `cf56d2f1…`. A filter keeps the sweep pass/fail.
  - D2 (the sheet said Archivo already ships) is design-direction wording, fixed in PR 14.
- D1 and D3 were applied in the fork by following the new text. No full re-run: the rest of the run is unaffected. `PHOTO_FILL` was already `#fafcfb`. The wordmark is Archivo 750 at -0.035em on web (computed 750 / -1.12px at 32px; `$GN/design/r1-visual/wordmark-after.png`) and `Archivo_700Bold` at -0.7 on mobile. Lint, typecheck and the gate were green again (73 / 31 / 48).
- The sweep with the new filter leaves one line: `app.json`'s `"owner": "vibe-with-me"`. That is expected while step 5 is deferred to G10.
- Fork commit `fdeca00` (make-it-yours: golfwithme), tag `pre-customize-gathering`. The diff from `pre-make-it-yours` touches no migrations, db tests or contract source.

---

### G5: customize-gathering, rounds and `course_name` (literal; about 15–25 min)

**Follower brief:**

> You are customizing the gathering in the Golf with Me fork at `$G`. Follow `.agents/skills/customize-gathering/SKILL.md` literally, §1 then §2, as if new to the codebase. Do not read `docs/superpowers/`; do not open anything outside `$G`.
>
> Inputs:
> - nouns: singular "round", plural "rounds"; tab label `Rounds`;
> - URL segment `/rounds`: web `_app.rounds.tsx` and `_app.rounds_.$id.tsx`, mobile `(tabs)/rounds.tsx` and `round/[id].tsx`;
> - copy:
>   - the create heading reads "Create a round" and its button "Create round";
>   - the title field's label is "Round name", placeholder "e.g. Saturday dawn nine";
>   - the start field's label is "Tee time" on web; on mobile the date field stays "Date" and the time field reads "Tee time";
>   - the location field stays "Location (optional)", placeholder "Where to meet";
>   - the members heading reads "Players";
> - one new field `course_name`: text, required, at most 120 characters, form label "Course", shown on rows, on the detail header, and on the resolve summary. It is the skill's worked example; do not add it to the join preview's hints;
> - seed: Ada's round has title "Saturday dawn nine", course "Pebble Creek GC", location "First tee". Rewrite the seed's console text in golf words.
>
> Environment notes: Playwright as `CI=1 bunx playwright test`. No remote services. The stack is yours. The seed identity is `*@demo.golfwithme.local` / `golfwithme-demo-1`.
>
> Log to `$GN/5-customize-gathering-r<k>.md` as before. Finish with the skill's closing gate: the verification gate from `docs/the-slice.md`, including the API e2e and Playwright.

**Watch list:**
- **The "Title" → "Round name" relabel is an order-dependence inside the skill.** §1 changes the label, while §2.7's Playwright grep is `grep -rn "getByLabel('Title')"`, so after the relabel it finds nothing. Expected fix (S): "the title field's label, or yours after §1".
- **Copy the sweep cannot catch.** "Who's coming" → "Players" contains no "gathering". Expect a deviation and an addition to §1's "Copy the sweep cannot catch" list (web `_app.gatherings_.$id.tsx` line ~241, mobile `gathering/[id].tsx` line ~260).
- **Mobile's two date fields.** The labels "Date" / "Tee time" are input, and §1's text knows nothing of them. Record any guess.
- **The worked example, run exactly.** `courseWhenAndWhere()`; `gatheringLine()` reads "Title · Course · when · where"; the `42501` expectation in the anon test; the caller grep; `revoke … from public, anon`. Phase A's fixes should make this run clean. Every deviation here is a fresh one.
- **The safety reviewer checks** as in Phase A Task 3 (no §3 mechanism touched; the 17 original tests changed only by the argument and the `42501` expectation; the summary carries `course_name` only).

**Expected:**
- §1: lint, typecheck, reset and seed, Playwright 14.
- §2: db 74 (73 + the CHECK case); contract 32 or more (record it); nfc 48; `nfc-sdk` typecheck clean; `supabase.ts` has `course_name`; API e2e ends "handshake e2e: all checks passed", with the course checks; Playwright 14.

**Then:** commit `customize-gathering: golfwithme`, tag `pre-extend-profile`.

**Done 2026-10-13.** Run 1: START 03:02:09Z, END 03:22:02Z (about 20 min). Log: `$GN/5-customize-gathering-r1.md`.
- §1: Playwright 10 passed / 4 failed, then 14 after D1's exact-label fix.
- §2: contract 32; db 74 (73 + the CHECK case); `nfc-sdk` typecheck failed with TS2322 until step 5, then clean; root typecheck 8/8.
- Gate: contract 32, nfc 48, db 74, API e2e "all checks passed" (59 ok), Playwright 14.
- Migration `20261013030000_gathering_course_name.sql`.
- Safety checks passed:
  - no §3 mechanism appears in the migration diff;
  - the new `create_gathering` has `revoke … from public, anon` and a grant to `authenticated`;
  - the host column grant is re-issued with `course_name`;
  - the original tests changed only by the new argument, the anon test's `42501` expectation and the type literal;
  - the summary carries `course_name` only.
- Deviations D1–D7 in the log. Fixed in the skill by `3cd942a` (`customize-gathering: fixes from the golf run`):
  - D1: a relabel can make a Playwright `getByLabel` ambiguous. It matches a case-insensitive substring, so "Round name" also matches the profile step's `getByLabel('Name')`. The fill landed in the wrong field during the /rounds → /profile transition, and 4 specs timed out at a disabled Save. §1 now says to grep `getByLabel(` and add `{ exact: true }` where two fields could match. The fork did this at 17 sites in 4 files. Core's own e2e would benefit from `{ exact: true }` on `getByLabel('Name')` (a test-robustness candidate; nothing filed).
  - D3: §1's "Copy the sweep cannot catch" list now names the form labels (title; start, one web field, mobile `Date` + `Time`; location), the location placeholder, and the members heading "Who's coming".
  - D5: §2 step 2 now notes that newer CLIs turn `Args: never` into `Args: Record<PropertyKey, never>` for argument-less functions. Harmless.
  - D6: §2 step 7's grep is now "the title field's label, or the label you gave it in §1".
  - D2 (`CI=1`), D4 (no commit of `supabase.ts` mid-run) and D7 (the 18th test is the CHECK case the step asks for) were the brief's setup or confirmed the text, and needed no change.
- No re-run: the fork is correct, and the fixes are text only.
- Fork commit `8ea842a` (customize-gathering: golfwithme), tag `pre-extend-profile`.

---

### G6: extend-profile, card tier only, with one typed field (literal; about 45–75 min)

**Follower brief:**

> You are adding vertical profile fields to the Golf with Me fork at `$G`. Follow `.agents/skills/extend-profile/SKILL.md` literally, §1 to §9, as if new to the codebase. Do not read `docs/superpowers/`; do not open anything outside `$G`.
>
> Inputs. Both fields are **card tier**; this fork has **no connections-tier field**.
> - `handicap`, label "Handicap", optional:
>   - a WHS handicap index, stored as `numeric(3,1)` from −10.0 to 54.0, one decimal;
>   - zod `HandicapSchema = z.number().min(-10).max(54).multipleOf(0.1)`, and the SQL CHECK `profiles_handicap_range` mirrors it;
>   - a "plus" handicap is stored negative (+2.4 is stored as −2.4), but **no screen shows or accepts a minus sign**:
>     - inputs accept `+2.4`, `2.4`, `12` or blank (blank clears);
>     - every display prints `+2.4` for a stored −2.4 and `8.4` for 8.4;
>     - a typed `-3` is refused;
>   - put that rule in two pure functions in the contract, next to the schema: `parseHandicap(text: string): number | null | undefined` (`undefined` = refused) and `formatHandicap(value: number): string`, with contract tests. Both clients import them, as they import `isProfileComplete`.
> - `home_club`, label "Home club", optional, 1–80 characters, CHECK `profiles_home_club_length`.
> - The card line reads "HCP 8.4 · Pebble Creek GC". Show whichever parts are set.
> - Required for completion: no field beyond what the starter already requires.
> - Seed: Ada `8.4` and "Pebble Creek GC"; Lin `+1.2` and "Riverbend Muni".
> - Test values: wherever the worked example writes `'E2E Club'`, use home club `'E2E Links'`; for `'Smoke Club'`, use `'Smoke Links'`.
>
> This fork has already run customize-gathering: gatherings are "rounds" at `/rounds`, mobile `round/[id].tsx`, and `create_gathering` takes a required `p_course_name`.
>
> Environment notes:
> - Playwright as `CI=1 bunx playwright test`.
> - §7's simulator pass: drive Expo Go with agent-device and simctl per `the simulator-driving notes (agent-device + Expo Go + simctl)`, not `expo start --ios`. Start Metro with `cd apps/mobile && bunx expo start --port 8081 --clear`, without `CI=1`.
> - A known local issue, not a skill defect: a claimed card's SSR may hang in `vite dev`; restart `apps/web`'s dev server.
> - No remote services. The stack is yours. Sign in only with the fork's seed identity, or with fresh `@rls.test` addresses on the local stack.
>
> Log to `$GN/6-extend-profile-r<k>.md` as before.

**Watch list:**
- **The card-only path, for the first time.** The skill says "Card-only: skip `details` everywhere, including `ConnectionSchema`", but the skip lines are spread across about 1,350 lines.
  - Record every place the follower had to decide.
  - Record what was left of `profile-fields.test.ts`: the count of card-tier tests against Phase A's 14.
  - Do the `getProfile` / `updateProfile` outputs still gain `details`?
- **No required vertical field.** The skill's gate, its test "completion needs every required field", and §8's "every profile-creating fill" all assume a required field (`affiliation`). Expected deviation: whether to install the gate with `['display_name']`, or to skip it. Fix candidate (S): one paragraph, "if no vertical field is required…".
- **The typed field.** Deviations to expect:
  - the forms post strings, so where does `parseHandicap` sit;
  - what the mobile keyboard is (`numbers-and-punctuation`, because `decimal-pad` has no `+`);
  - `numeric` in the generated types (`number`) and in `resolve_tag`'s jsonb (a JSON number);
  - `isProfileComplete` accepting a non-string (already in the skill);
  - the format-rule note not fitting a numeric field.

  Record the minutes the typed field cost. T6 (tailgate's two text fields) is deferred, so the report compares them with Phase A's extend-profile run instead, and says the comparison is rough. Expected fix (S): a "Typed fields" paragraph next to "A field with a format rule".
- **The plus convention, end to end.** API e2e or contract tests show `+1.2` ↔ −1.2. Lin's seeded card shows `+1.2`. `-3` is refused with the generic save error, or refused client-side; record which.
- **Newest bodies.** `resolve_tag`'s newest is customize-gathering's migration, which carries `course_name`. `accept_connect_request`'s is `avatars`. Reviewer check: `grep -n course_name "$G"/supabase/migrations/*_extend_profile.sql` finds at least one hit, in `resolve_tag`.
- **The safety reviewer checks** as in Phase A Task 4. There is no connections tier, so `profile_details` must not exist: `grep -c profile_details "$G"/supabase/migrations/*_extend_profile.sql` prints `0`, unless the follower built it, which is a deviation.

**Expected:**
- §1 contract green, record the count; §2 red first, then §3 green, record db.
- The gate green; API e2e ends "all checks passed" with the new card-tier lines; Playwright 14.
- §7's simulator checks pass.

**Then:** commit `extend-profile: golfwithme`, tag `pre-add-destination-type`.

**Done 2026-10-13.** Run 1: START 03:23:01Z, END 03:43:22Z (about 20 min, including the simulator pass; the typed field cost about 9 min of it). Log: `$GN/6-extend-profile-r1.md`.
- §1: contract 32 → 28 pass / 4 red (the skill's four) → 39 (+7, not +5).
- §2: red at 74 pass / 4 fail, all `PGRST204`: the four card-tier tests.
- §3: db 78 (+4). Typecheck red only for `@withme/api` and `@withme/nfc`, as predicted; §4 and §5 closed them.
- Gate: lint clean, typecheck 8/8, contract 39, db 78, nfc 48; API e2e "all checks passed" (66 ok, 7 new); Playwright 14 on the first run.
- Simulator: all 8 checks pass.
  - The tag resolve shows the card line.
  - Seeded Lin is complete and shows `+1.2`.
  - `+2.4` saved → stored −2.4 → shown `+2.4`.
  - `-3` refused client-side, with no request sent.
  - The claimed tag shows `HCP +2.4`.
  - Cold Connect and cold Join each return to where they started.
  - A new account is gated to Profile.
- No `profile_details`: only a comment in the migration mentions it.
- Safety checks passed:
  - `profiles_select` untouched;
  - `CARD_COLUMNS` = `id, display_name, avatar_path, bio, handicap, home_club`;
  - `course_name` kept in the `resolve_tag` copy.
- Deviations D1–D22 in the log. Fixed in the skill by `8d9597c` (`extend-profile: card-only, no required field, typed fields (from the golf run)`):
  - Card-only path (D1, D5, D7, D10, D13, D16, D21): a "card-only fork" list near "Pick a tier": what each step skips, the card-tier red count, contract four plus the fork's own tests.
  - No required field (D2, D3, D12, D14, D17, D18, D19): a "No required vertical field" list: `['display_name']`, claim pages and Save unchanged, the seeded users already complete, no Playwright fills, and the mobile gate's new tabs-mount redirect, stated as intended.
  - Typed field (D4, D6, D8, D11, D15): "A typed field" next to the format rule: parse/format in the contract with a round-trip test, refusal before sending (an `undefined` key is dropped silently and the form says "Saved."), `numeric` rounding before the CHECK, the keyboard choice. §9 now says the counts depend on the tiers (golf: db 4, contract 7, API 7).
  - Grep (D20): §8's grep is `grep -rn "getByLabel('Name'" apps/web/e2e`, so it finds the `{ exact: true }` calls.
  - D9 (types not committed mid-run) and D22 (the test-value renames) were the brief's setup.
- No re-run: the fork is correct, and the fixes are text only.
- Fork commit `b4bbe9d` (extend-profile: golfwithme), tag `pre-add-destination-type`.

---

### G7: add-destination-type, link (literal; about 15–25 min)

**Follower brief:**

> You are adding a destination type to the Golf with Me fork at `$G`. Follow `.agents/skills/add-destination-type/SKILL.md` literally, §1 to §9, as if new to the codebase. Do not read `docs/superpowers/`; do not open anything outside `$G`.
>
> Input: the skill's worked example, unchanged: `{ type: 'link', url }`, https only, at most 2048 characters. No claim-UI change (the skill's scope note).
>
> This fork has already run customize-gathering (rounds, `course_name`) and extend-profile (card-tier `handicap` and `home_club`).
>
> Environment notes: as before. For §9's runtime check, you may provision a local tag with `bun run db:provision` from an output directory outside the repo, as the provision-tags skill describes, and claim it as a seed user. Keep every UID out of everything except your log.
>
> Log to `$GN/7-add-destination-type-r<k>.md` as before.

**Watch list:**
- **§2.** "latest definition in `20261008120000_add_gatherings.sql`" is still true after customize-gathering and extend-profile: neither touches `tags_destination_shape`. Confirm with `grep -l tags_destination_shape supabase/migrations/*`.
- **§3.** `resolve_tag` is untouched. Reviewer check: `grep -c resolve_tag "$G"/supabase/migrations/*_add_link_destination.sql` prints `0`.
- **§9's runtime check needs a tag claimed as a link, and the skill does not say how** (the claim UI only claims `profile`). Expected deviation: the follower uses an SDK script (`authed.claim`) or an owner's PostgREST update. Fix candidate (S): one sentence giving the path.
- **The trap test.** The "rejects unknown destination types" specimen is swapped to an invented type.
- `curl … /t/<UID>` prints `status=307 location=https://…`, and a profile tag still returns 200.

**Expected:**
- contract +4 or so (record it); db +2; `nfc-sdk` typecheck clean.
- API e2e with "link destination round-trips through claim and resolve" and "all checks passed"; Playwright 14.

**Then:** commit `add-destination-type: link`, tag `pre-provision-tags`.

**Done 2026-10-13.** Run 1: START 03:44:59Z, END 03:52:14Z (about 7 min). Log: `$GN/7-add-destination-type-r1.md`.
- §1: contract 39 → 44 (+5: accept, the skill's three rejects, a length reject); the trap specimen swapped to `{ type: 'teleport' }`.
- §2: reset and seed clean; no type drift.
- §3: `resolve_tag` untouched (0 mentions in the migration).
- §4: db 78 → 80 (+2). §6: `nfc-sdk` typecheck clean.
- Gate: lint clean, typecheck 8/8, contract 44, db 80, nfc 48; API e2e 67/67 with "link destination round-trips through claim and resolve"; Playwright 14.
- §9 runtime: the link tag curls `307 → https://example.com/menu`; the profile tag 200 after one web dev restart (the `vite dev` hang). Link taps are logged as scans.
- The tag was claimed as a link by a seeded-user script (the db package's local client, `claim_tag` with a link destination) against two tags provisioned locally per provision-tags §1; the output directory was deleted afterwards.
- Incident: while appending to its log, the follower used an unquoted heredoc whose backticks ran the provision command twice from the repo root. That made 20 local tags and gitignored `provisioned-tags.*` files in the repo root (mode 644). The files were deleted and the stack reset and seeded; UIDs are only in the local log; nothing was committed.
- Deviations 1–7 in the log. Fixed in the skill by `e8bc46d` (`add-destination-type: fixes from the golf run`):
  - The claim-as-link path (2): §9 now gives the seeded-user script against tags provisioned per provision-tags §1, UIDs kept in variables, the output deleted afterwards.
  - `db:provision` (3): it resolves only from the repo root, so §9 calls the script file directly, as provision-tags §1 does. The brief's environment note was wrong here; T7 reuses G7's brief, so drop that note there.
  - The heredoc incident (7): §9 warns never to paste provisioning commands into an unquoted heredoc or log append.
  - The the `vite dev` hang hang (1): §9 points at provision-tags §1's restart.
  - Observations: §1 names `destination.ts`'s stale header comment; §2's reset line may end ` on branch …`; §8 says the mobile fallback card is minimal and typecheck-only, so the hand-off and card belong to the simulator pass; §9 names the API dev port, 8786.
  - No fix: 4 (an empty parent removed with `rmdir`), 5 (one e2e capture written to `/tmp`, deleted, no UIDs), 6 (the length reject, within "a reject case per validation rule").
- No re-run: the fork is correct, and the fixes are text only.
- Fork commit `0994f01` (add-destination-type: link), tag `pre-provision-tags`.

---

### G8: provision-tags, local (literal; about 10 min)

**Follower brief:** Phase A Task 5's brief, with:
- `$G` as the checkout;
- the identity `lin@demo.golfwithme.local` / `golfwithme-demo-1`;
- the chip UID `04D00D00D00D07`;
- the log `$GN/8-provision-tags-r<k>.md`;
- "Do not open anything outside `$G` except your batch directory."

**Watch list:**
- `DB="supabase_db_golfwithme"`, read from the renamed `config.toml`: the first time the derivation meets a renamed `project_id`.
- The batch lands under `$HOME/golfwithme-tags/` (the wordmark rule, d220c5c).
- The claim as Lin shows her card with `+1.2 · Riverbend Muni`. That is the cross-skill check with G6's display rule.
- Phase A's other checks: a signed-out viewer sees "Connect"; a stale claim gets "already claimed"; a brand-new account meets "First, your card", or no profile step at all if there is no required field. Record which.

**Expected:** Phase A Task 5's outputs, plus §4's retirement. No commit (provisioning changes no files); tag `pre-gate`.

**Done 2026-10-13.** Run 1: START 03:53:23Z, END 03:58:41Z (about 5 min). Log: `$GN/8-provision-tags-r1.md`.
- `$DB` = `supabase_db_golfwithme`: the renamed `project_id` was read from `config.toml` as written.
- The batch landed under `$HOME/golfwithme-tags/` (the wordmark rule).
- §1 checkpoint: the expected output, the three files 0600, the repo clean, three `unclaimed` rows.
- End to end: signed out, `/t/<UID>` → `/claim/<UID>` → `/login?returnTo=%2Fclaim%2F<UID>`. The claim as Lin shows her card with "HCP +1.2 · Riverbend Muni" and no minus anywhere: the cross-skill check with G6 passed. A signed-out viewer sees "Connect" and no claim offer; Ada's stale claim page gets "This tag has already been claimed."
- A brand-new account gets "First, your name" (no required vertical field in this fork), then "Claim this tag" with the UID.
- §5 (local): the insert returned 1 row, the count printed 1, and a re-insert returned 0 rows.
- §4 retirement after stopping both dev servers: the batch directory and its empty parent removed, the repo clean. The stack was reset and seeded afterwards.
- One `vite dev` hang (a full load of the claimed `/t/<UID>`), cleared by the skill's restart as written.
- Deviations 1–3 in the log. Fixed in the skill by `f081728` (`provision-tags: fixes from the golf run`):
  - The profile-step heading (1): the skill now says "First, your name" without a required vertical field, "First, your card" with one.
  - Dev-server log modes (2): the logs in `$OUT` were 0644 because `umask 077` covered only the provisioning subshell (the 0700 directory kept them private); the skill now starts the dev servers under `umask 077`, with the one-line form.
  - The the `vite dev` hang hang (3): a known issue; the restart text worked, no change.
- For the report: `web-dev.log` held a React hydration-mismatch warning on `/login` (server `<div class="card" aria-busy>` vs client `<form class="card">`), unrelated to the hang.
- No re-run: the fixes are text only.
- No fork commit; tag `pre-gate` at `e15a850`.

---

### G9: The full gate and the simulator pass (program manager or a verification subagent; about 30–40 min)

**The gate.** Phase A Task 6's commands, from `$G`. Then the cross-skill checks:

```bash
grep -rniE --exclude-dir={node_modules,dist,.expo,.wrangler,.turbo} 'withme|vibe-with-me' apps/ packages/ supabase/ README.md \
  | grep -v '@withme/' | grep -v '^supabase/migrations/' | grep -v '^packages/nfc-sdk/' | grep -viE 'golfwithme|golf with me'
# expected: only app.json's owner (step 5 still deferred) and the README badge, if G4's sweep fix is not in yet
grep -rn -i "'[^']*gathering[^']*'\|>[^<]*gathering[^<]*<" apps/web/src/routes apps/web/src/components apps/mobile/app apps/mobile/components --include='*.tsx' \
  | grep -v "api\.app\.gatherings\|Gathering[A-Z]\|/gathering" | head          # identifiers only
docker exec supabase_db_golfwithme psql -U postgres -tAc "select public.resolve_tag('04BBBBBBBBBBBB')::text" \
  | grep -o '"course_name": *"[^"]*"\|"handicap": *[-0-9.]*\|"home_club": *"[^"]*"'   # course, 8.4, Pebble Creek GC
```

**The simulator pass**, as in Phase A Task 7: iPhone 17 Pro, Expo Go, Metro and the API from `$G`. Screenshots to `$GN/9-sim-*.png`.

1. **Brand.** The wordmark `golfwithme` in the sheet's display face. Tabs Rounds / Connections / Profile (no Merch unless there is a store). The accent only on primary actions. The new icon is not visible in Expo Go; say so.
2. **Handicap.**
   - A new `@rls.test` account saves `+2.4` and sees `+2.4` on its card.
   - `-3` is refused.
   - `54.1` is refused.
   - Blank clears the field.
   - Lin's card shows `+1.2`.
3. **Rounds.**
   - Create "Sunday nine" with Course "Riverbend Muni".
   - The row and the header show the course.
   - Point the tags at the round.
   - The tag opened signed out shows the title, the course and the tee time.
   - The heading reads "Players".
4. **Cold Join.** Signed out, Join leads to sign-up, then to "Join this round?", and Join completes.
5. **Link.** A tag claimed as a link (from G7's method) opened at `exp://127.0.0.1:8081/--/t/<uid>` hands off to Safari with the URL. Coming back shows the "Open link" card.
6. **Provisioned tag.** A fresh local tag lands on "Claim this tag".
7. **Critique recheck** (G0's list, live): the malformed `/t/banana` gets a calm card on web and mobile; the tap moment shows a loading card; the resolver shows the wordmark footer.

**Expected:** the gate is green and its counts are recorded; the sweep prints only the expected lines; checks 1–7 pass. Any failure goes through the deviation procedure, and G10 does not start until all are green. Write `$GN/9-gate-sim.md`.

**Done 2026-10-13.** By a verification subagent, on `$G` at `pre-gate` (`e15a850`), tree clean before and after, on the `golfwithme` stack. START 03:59:45Z, END 04:22:13Z (about 22 min: the gate about 2 min, the simulator pass about 21). Log: `$GN/9-gate-sim.md`, raw output in `$GN/9-raw/`.
- Gate green at G7's counts: lint clean, typecheck 8/8, db 80, contract 44, nfc 48, API e2e 67 `ok` lines ending "all checks passed", Playwright 14.
- Sweep: with the brand filter (`golfwithme|golf with me`) and the same-org append, it prints only `apps/mobile/app.json`'s `"owner": "vibe-with-me"` line, as expected while EAS (step 5) is deferred to G10.
- "gathering" residue: identifiers only (variables, the `'gathering'` destination type, `describeTag`'s argument, select keys, doc comments). No user-visible "gathering"; every device surface read "round".
- `resolve_tag('04BBBBBBBBBBBB')` shows handicap 8.4, home_club "Pebble Creek GC", course_name "Pebble Creek GC".
- Simulator 7/7 (iPhone 17 Pro, Expo Go):
  1. Brand: the Archivo wordmark, tabs Rounds / Connections / Profile, no Merch, the accent on primaries only; the icon is not visible in Expo Go.
  2. Handicap: `+2.4` saved and shown; `-3` and `54.1` refused; blank clears; Lin's card reads `+1.2`.
  3. Rounds: the course shows in the row and the header; "Players".
  4. Cold Join: sign-up, then "Join this round?", then Join completes.
  5. Link: the hand-off to Safari works, and coming back shows the "Open link" card.
  6. Provisioned tag: lands on "Claim this tag".
  7. Critique recheck: `/t/banana` gets the calm card on web and mobile; the loading card shows; the web footer shows the wordmark.
- Findings:
  - The web resolver's footer wordmark rendered in Inter 400, not the display face: `WordmarkFooter`'s link had no `wordmark` class. Fixed in the fork by `0618f8c` (`make-it-yours: the footer wordmark uses the display face`; `pre-gate` moved to it; lint, typecheck 8/8, db 80, contract 44, nfc 48 green; computed style now Archivo Variable 750 at -0.035em). Fixed in the skill by `f13f6fe`.
  - The step 8 sweep needed the brand filter to be usable on a brand containing `withme` (36 brand lines without it). `f13f6fe` puts `grep -viE '<wordmark>|<display name>'` in the command block itself.
  - Mobile wordmark 700 vs web 750: the nearest static weight, by design.
  - For the report (core): the malformed-tag card's copy ("Give it another tap in a moment" / "…live link…") is also the network-failure copy, so it reads as transient.
  - "Join this round?" shows no course: by the brief (the preview reads the hints the tag screen passes).
  - Players and request rows show the bio, not the handicap: extend-profile makes that display optional.
  - The the `vite dev` hang dev hang reproduced (a full `load` of the claimed `/t/<UID>` in `vite dev`), even right after a restart. A note for the `vite dev` hang issue.
  - One provisioned UID reached the subagent's session transcript only (local; the batch was deleted and the stack reset). It is in no log, raw file or screenshot.
- No re-run: the gate and the simulator passed, and the fork fix is one class name, re-gated above.

---

### G10: go-live, step by step (Alex present; about 60–90 min; a dedicated terminal tab)

The follower is the program manager: go-live is approval-gated throughout, so it is not a fresh subagent. Read `.agents/skills/go-live/SKILL.md` literally and log against it in `$GN/10-go-live.md`. Every **[approve]** shows Alex exactly what the next command creates, and waits. Deploy from `rebuild` HEAD and record that sha.

0. **Pre-flight** (read-only):
   - `env | grep -cE 'SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_ACCOUNT_ID'` prints `0`.
   - `supabase orgs list` shows "Golf With Me"; record its id.
   - `supabase projects list` shows `<golf-project-ref>` paused.
   - `bunx wrangler whoami` lists three accounts; record the "Golf With Me" account id.
   - `bunx eas-cli whoami` names Alex's user, a member of `vibe-with-me`.
   - If any login fails: PAUSE, and Alex logs in.
1. **[approve] make-it-yours step 5, linking the existing EAS project** (a fork-specific deviation from the step's "creates a fresh project"). In `$G/apps/mobile`:
   - Remove `extra.eas.projectId` and `updates.url` (keep `"owner": "vibe-with-me"`).
   - Run:

     ```bash
     bunx eas-cli init --id 6a004be3-f3b4-4ec5-be7d-ff58a61fc77a --non-interactive
     bunx eas-cli update:configure --non-interactive
     bunx eas-cli project:info            # @vibe-with-me/golfwithme, ID 6a004be3-…
     ```

   - Checkpoint: `bunx expo config --type public` shows owner `vibe-with-me`, `projectId` `6a004be3-…` (≠ `cf56d2f1-…`), and `updates.url` ending in it.
   - Commit `make-it-yours (step 5): link @vibe-with-me/golfwithme`.
   - Watch: go-live §4.1's `eas-cli init --non-interactive --force`. Run it after the link and record whether it is a no-op. That is the step 5 / §4.1 overlap carried over from Phase A.
2. **[approve] go-live §1 in "Golf With Me":**
   - The password file `$HOME/.config/golfwithme/supabase-db-password` (0600).
   - `supabase projects create golfwithme --org-id <golf org id> --region us-east-1 --db-password "$DB_PASS"`.
     - **If it fails on the free-project limit:** stop and ask Alex (answered 2026-10-13: proceed, stop at the first limit error).
   - Wait until `supabase projects list` shows it healthy.
   - Then `link` and `db push`, through `SUPABASE_DB_PASSWORD`.
   - Checkpoint: `db push` lists **seven** migrations (the starter's four, plus course name, extend profile, link destination) and ends `Finished supabase db push`.
   - **Alex:** in the dashboard, Storage: `avatars` is public, 1 MiB, JPEG/WebP.
   - Run the key fetch from the `$G` root. Checks: `ls -l .env.demo-seed` shows `-rw-------`; `git -C "$G" check-ignore .env.demo-seed` prints the path; `env | grep -c SUPABASE_SERVICE_ROLE_KEY` prints `0`.
3. **[approve] the production seed**, in the skill's subshell. It creates the demo identity, Ada's round, and the demo tags.
   - The unclaimed `04AAAAAAAAAAAA` stays for the demo. provision-tags says to claim or delete it before real users arrive, and the report carries that as an open item.
4. **Cloudflare account pin** (a fork-specific deviation, and a go-live gap):
   - Add `"account_id": "<Golf With Me id>"` to `apps/api/wrangler.jsonc` and `apps/web/wrangler.jsonc`.
   - `bunx wrangler deploy --dry-run` in each app is green.
   - Commit `go-live: pin the Golf With Me Cloudflare account`.
   - **Alex:** read out the account's workers.dev subdomain `<gsub>` from the dashboard, registering one if the account has none. `<gsub>` must not be `vibe-with-me`.
   - Expected fix (S): go-live §2 gains "if `wrangler whoami` lists more than one account, pin `account_id` in both configs before the first deploy", plus the subdomain note.
5. **[approve] go-live §2, the API Worker:**
   - `cd apps/api && bunx wrangler deploy`, retrying on 5xx.
   - The printed URL must be `https://golfwithme-api.<gsub>.workers.dev`. **If it is on `<legacy-subdomain>.workers.dev`, stop:** the wrong account was used.
   - The secrets subshell, with `CORS_ORIGIN=https://golfwithme-web.<gsub>.workers.dev`. `bunx wrangler secret list` names the three.
   - Checkpoints:
     - `curl -s https://golfwithme-api.<gsub>.workers.dev/health` returns `{"ok":true}`;
     - an anonymous SDK resolve of `04BBBBBBBBBBBB`, as a throwaway `bun -e` run from `$G/apps/api` so `@withme/nfc` resolves, with nothing written to the tree: `claimed`, Ada's card with `handicap` 8.4 and her home club, and the gathering summary with `course_name`.
6. **[approve] go-live §3, the web Worker:**
   - `apps/web/.env.production`: the API URL, the Supabase URL, the publishable key, and `VITE_DEMO_CREDENTIALS=ada@demo.golfwithme.local / golfwithme-demo-1` (answered 2026-10-13: seed production and show the demo credentials). No store.
   - `bun run build && bunx wrangler deploy` → `https://golfwithme-web.<gsub>.workers.dev`.
   - Checkpoints, with the bodies checked in Python:
     - `/` returns 200 with `golfwithme`;
     - `/t/04BBBBBBBBBBBB` returns 200 with Ada's card and the course (this proves the service binding);
     - `/t/banana` returns a calm card, not a 500.
   - **Alex:** in the Supabase dashboard, Authentication → URL Configuration:
     - Site URL `https://golfwithme-web.<gsub>.workers.dev`;
     - Redirect URLs `https://golfwithme-web.<gsub>.workers.dev/**`.

     go-live does not have this step and README's Deploy step 2 does. Expected fix (S): add it to go-live §3 with the dashboard path.
   - **Alex:** run `$GN/authed-check.ts`, which Claude writes. It signs in as the demo user with supabase-js and the publishable key, then calls the app router's `profile.get`, so it exercises JWKS.
   - **Alex:** a throwaway sign-up on the live site, with an address that can confirm. The default SMTP delivers only to org members. Record the host the confirmation link points at: the workers.dev origin, not `localhost:3000`. Then Profile → Account → Delete account succeeds. If it fails with `permission denied for table users`, stop.
7. **[approve] go-live §4, mobile:**
   - `apps/mobile/.env.production`: the `EXPO_PUBLIC_*` mirrors.
   - `bunx eas-cli update --branch demo --environment production --message "golfwithme rebuild <sha>" --non-interactive` prints the update group.
   - The export check: `NODE_ENV=production bunx expo export --platform ios --no-bytecode --output-dir "$GN/verify-export"`. The production URLs are present; `localhost:8786` and `127.0.0.1:55321` are absent.
   - Optional, **Alex:** expo.dev → the project → Updates → the group → Preview, opened in Expo Go on his phone.
   - Note for the report: no build exists for this runtime and channel, so the export check is the automated mobile checkpoint, as in go-live.
8. **No production provisioning.** There is no custom domain, and provision-tags rule 6 forbids encoding a `workers.dev` origin.
9. **Record:**
   - the deployed sha;
   - the three URLs (the API Worker, the web Worker, and the EAS update group's link);
   - the project ref;
   - every checkpoint's result;
   - the minutes, with the PAUSEs.

   Afterwards, `env | grep -c SUPABASE_` prints `0` in the tab.

Deviations go through the procedure. Re-running a production step needs a new approval. By default, the text is fixed and the step is recorded "not re-run against production".

**G10 progress 2026-10-13** (not Done; the owner's checks are pending):
- EAS linked (`9c15802`).
- DB: the existing project `<golf-project-ref>`, reset by Alex (`db reset --linked`), with all 7 migrations; no new project.
- Keys fetched (`.env.demo-seed` 0600; legacy `anon`, no publishable key). The `avatars` bucket verified via the API. Seed done.
- Cloudflare pin `5d36727`; the subdomain `golfwithme` registered by Alex.
- API `https://golfwithme-api.golfwithme.workers.dev`: `/health` ok after ~2 min; the anonymous SDK resolve of `04BB…` returns Ada, handicap 8.4, Pebble Creek GC, the round and its course.
- Web `https://golfwithme-web.golfwithme.workers.dev` (deployed by Alex): `/`, `/t/04BB…` and `/t/banana` verified; the bundle has the production URLs and no localhost.
- Mobile: update group `16e2daa9-474b-47e5-a0c8-8c7dafc85964` on branch `demo`; the export check shows the production URLs and no localhost.
- go-live text fixed from the run (`1dc8508`).
- **Pending:** the Auth URL configuration, the authed check, and the throwaway sign-up + delete.

**Done 2026-10-14.** Live at `https://golfwithme-web.golfwithme.workers.dev` and `https://golfwithme-api.golfwithme.workers.dev`; EAS update group `16e2daa9-474b-47e5-a0c8-8c7dafc85964` on `demo`. Alex's checks done: the Auth URLs set in the dashboard, the authed check returned Ada's profile through JWKS, the throwaway sign-up confirmed at the workers.dev origin. The delete check found the profile-less delete loop (the web shell's profile gate loops `/profile` ↔ `/login` for a profile-less session; the server-side deletion succeeded): fixed in starter PR 15 (`776e26e`), golf web redeployed with the fix. Open: the hosted project's PostgREST is 14.5, below the 16.3 floor the local guard enforces (report §7). Not cleanly timed: the step spread over 2026-10-13/14 around Alex's logins, dashboard steps and checks. Cost so far $0: no new project, worker account or build. Log: `$GN/10-go-live.md`; the report's §4 has the step-by-step.

---

### G11: The golf PR and merge (program manager; about 30–60 min including CI)

1. **Final skill sync** if `$WT` moved. Then the full gate from `$G`, with the counts unchanged since G9 apart from the sync, plus:
   - `git -C "$G" log --oneline legacy-2026-06..rebuild --first-parent`, which lists commit 1, the syncs, and one commit per skill;
   - `git -C "$G" diff --stat <deployed sha> HEAD`, which shows only skill texts, if anything.
2. **Push readiness.** `gh auth status` shows the `workflow` scope (commit 1 changes `ci.yml`). If it does not, Alex runs `gh auth refresh -h github.com -s workflow`, or the push goes over SSH (`git@github.com:vibe-with-me/golf-with-me.git`).
3. **[approve]** `git -C "$G" push -u origin rebuild`, then the PR:
   - command: `gh pr create -R vibe-with-me/golf-with-me --base main --head rebuild --title "Rebuild Golf with Me on withme-starter, live" --body-file "$GN/pr-body.md"`;
   - body: why (A1); the tree check (`tree = starter`); the commit list; the brand direction and its contrast output; the inputs; the gate counts; the simulator results; the go-live URLs and checkpoints; what was dropped (A4); the legacy tag; the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
4. **Review.** The diff is the whole tree, so CodeRabbit may skip it for size. The review covers the per-skill commits: `superpowers:requesting-code-review` over `pre-make-it-yours..rebuild`, because commit 1 is verified by its tree hash.
   - Wait about 15 min for CodeRabbit. Record whether it reviewed.
   - Handle the findings with `superpowers:receiving-code-review`.
5. **Merge.** Once CI is green and CodeRabbit is clean (or, if it does not review this repo, once Alex agrees): `gh pr merge <n> -R vibe-with-me/golf-with-me --merge`. Then `git -C "$GOLF" fetch origin` and `git -C "$GOLF" log --oneline -1 origin/main`, which shows the merge commit.

**G11 progress 2026-10-14** (not Done; the merge is pending): PR vibe-with-me/golf-with-me#5 is open at `c64b4db` with 0 unresolved review threads (CodeRabbit did review the repo; its ten comments were handled, six of them as skill-text fixes in `d325151`, listed below). CI and CodeRabbit are re-running on that push; the merge commit follows once both are clean.

**Done YYYY-MM-DD.** (to write)

**Golf PR review fixes 2026-10-14.** CodeRabbit on golf PR 5 flagged six skill-text issues; fixed in the starter's skills in `d325151` (Skills: fixes from the golf PR review), for the next skill sync into golf:
1. add-destination-type §9: the claim script reads `DEMO_EMAIL` / `DEMO_PASSWORD` from the environment; no committed password.
2. go-live §3: the authed check runs as `( trap 'rm -f authed-check.ts' EXIT; bun … )`, so a failed check fails the command.
3. go-live §4 and troubleshooting: the npx fallback pins `eas-cli@24.13.0` (the version the golf go-live ran on 2026-10-13, from the npx cache; also the npm latest on 2026-10-14) instead of `@latest`.
4. provision-tags §1: the checkpoint's `psql` prints counts by status (`unclaimed|3`), so no UID reaches the terminal.
5. design-direction §2–3: the committed sheet uses repo-relative paths and describes the canvas, or marks a private link "private link, owner only".
6. customize-gathering §1: an optional URL rename also updates `docs/the-slice.md`'s detail-file citations.

---

### G12: Teardown and local cleanup (Alex for the deletes; about 15 min)

**Alex** (permanent; Claude prints the exact list and verifies afterwards):
- `supabase projects delete <golf-project-ref>`, or in the dashboard.
- The legacy workers in the account behind `<legacy-subdomain>.workers.dev`, once the new ones are verified (answered 2026-10-13). With that account selected, per command: `bunx wrangler delete --name golfwithme-public`, then `golfwithme-web`, then `golfwithme-api`.
- Optional: the legacy local volumes, `docker volume ls --format '{{.Name}}' | grep golf-with-me`, then `docker volume rm …`.

**Claude:**

```bash
(cd "$G" && bun run db:stop)                                   # the golfwithme stack; volumes kept (use --no-backup only if Alex wants them gone)
rm -f "$G/.env.demo-seed"                                      # refetchable with `supabase projects api-keys`; the password file in $HOME/.config/golfwithme stays
rm -rf "$HOME/golfwithme-tags"                                 # local encode lists (G8, G9)
git -C "$GOLF" tag -l 'pre-*' | xargs -n1 git -C "$GOLF" tag -d
(cd "$WT" && bun run db:start && bun run db:reset && bun run db:seed)   # withme-starter back
docker ps --format '{{.Names}}' | grep -c '^supabase_db_withme-starter$'  # 1
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(8786|3000|8796|9456|3010|8081) '  # nothing
```

After the merge: `git -C "$GOLF" worktree remove "$G"`. The `.env.production` files go with it; a redeploy writes them again.

Optional, with Alex's yes: fast-forward the main checkout, `git -C "$GOLF" merge --ff-only origin/main && (cd "$GOLF" && bun install)`. It deletes the working-tree copy of `.supabase-demo-db-password`, which is harmless once the project is gone.

**Verify:**
- `supabase projects list` has no `<golf-project-ref>`.
- `curl -s -o /dev/null -w '%{http_code}\n' https://golfwithme-web.<legacy-subdomain>.workers.dev/` is not 200, if the legacy workers were deleted.
- The new URLs still answer 200.

**Done YYYY-MM-DD.** (to write)

---

## Phase B″: tailgate-with-me

**Deferred 2026-10-13: tailgate will be rebuilt around real sporting events once Alex decides how to source event data; not part of this milestone.**

The T sections below are the 2026-10-12 draft, kept for that later run. They predate the decision: they model a tailgate as a free-form gathering with no event data (T5 adds no field), and they assume A6's mapping and the unconfirmed EAS project `fe37d421-…`. Their "open question" references point to the 2026-10-12 list, which "Answered 2026-10-13" replaced. Expect T0, T1, T5 and T6 to be rewritten, and the stack and approval steps to be re-checked, before any of it runs.

Each T task is its G twin with the substitutions below: `$T` and `$TN`, the names from A6, and the "Tailgate With Me" org, account and EAS project. Every Follower brief is written out in full from the G brief, with its inputs swapped. It never says "as golf did". Only the differences are listed here.

### T0: Inventory → inputs sheet

The same as G0, plus:
- `git -C "$TAIL" rev-parse --short origin/main` prints `47dc022`.
- The worktrees: main, `naming-cheer-tailgate-9859b4` (detached), and `staging-mobile-build-deploy-ce5652`. All untouched.
- Tracked strays: `supabase/.temp/cli-latest` only.
- `app.json` has no `owner`, `projectId` or `updates`.
- Read-only from the staging worktree: `apps/mobile/app.json` shows `projectId` `fe37d421-…` and owner `vibe-with-me` (uncommitted). Alex confirms it in open question 7.
- `supabase/.temp/project-ref` there names `wntdmgxmrinagmqrefpt`.
- **The legacy palette sheet:** warm neutrals, ember `#c4220c` / `#ff5c33`, Oswald + Inter. The ninth token `accent-hover` is left out of the table and noted.
- **The commit map:**

  | Legacy commit | Rebuild |
  | --- | --- |
  | `f17c92c` rebrand | T1 + T4 |
  | `a211693` link | T7 |
  | `92d2aeb` team and dish | T6 |
  | `f44546b` Tailgates | core + T5 |
  | `9233943` fulfillment, calm states, demo | core + T8 |
  | `01e5528` card polish ("identity hierarchy, tailgate block, states") | a static check: where the polish changed layout, it is not carried (design-direction varies look, not structure); list it as a fork follow-up candidate |
  | `3c09c89` dedicated ports | dropped (A8) |
  | `39cfab5` `apps/public` | dropped (A4) |
  | `47dc022` `docs/DEPLOY.md` | go-live; its Auth-URL and SSH notes go into T10 and the go-live fixes |

- **Legacy workers.** `docs/DEPLOY.md` was never executed (the README has an `example.workers.dev` URL). Alex confirms whether any `tailgatewithme-*` workers exist in any account.
- **Inputs:**
  - the seed identity `*@demo.tailgatewithme.local` / `tailgatewithme-demo-1`;
  - seed values: Ada "Chiefs" / "Burnt-end chili"; Lin "Eagles" / "Smoked queso"; Ada's tailgate "Lot C before the Chiefs game", location "Lot C, row 12";
  - the repo `https://github.com/vibe-with-me/tailgate-with-me`.

### T1: design-direction, an uplift

G1's brief, with these inputs:
- **Vertical:** "Tailgaters in a stadium lot before kickoff: a stranger taps your tag and sees your card (team, signature dish), or joins the tailgate your tag points at, loud, one-handed, in sunlight, on stadium Wi-Fi."
- **Mood:** "ember, asphalt, kickoff".
- **Names, fixed:** `tailgatewithme` / `Tailgate with Me`.
- **References:**
  - `PRODUCT.md` ("Loud crowd, calm app"; the anti-references);
  - the legacy palette;
  - Oswald and Inter;
  - the legacy icon set (`apps/mobile/assets/icon.png`: a white rounded-square outline with a center dot, on ember).
- **Icon rule:** keep the mark (the skill copies a logo, it never redraws one). If the chosen accent changes, re-draw the same geometry as `icon.svg` in the new accent and render it as in G1. The legacy Android foreground is 512 px; the new one is 1024.
- **The legacy ninth token:** say in "Not this" that `accent-hover` is dropped: eight tokens only.

**Watch, in addition to G1's:**
- Does the brief's "eight token values" collide with the legacy nine?
- Is the copied mark treated as a logo (not redrawn by an artboard)?

### T2: Repo prep [approve]

G2 with `$TAIL`, the tag at `47dc022`, and `vibe-with-me/tailgate-with-me`. The same read-only facts.

### T3: Fresh tree, sync, baseline

G3 with `$T`.
- `STARTER_SHA` is `origin/main` at T3. It may differ from golf's if the starter merged app fixes in between; record it and say why.
- The removed-file check is `supabase/.temp/cli-latest` and `apps/public/`, so 0 remain.
- The baseline counts are recorded.

### T4: Design commit + make-it-yours (with the rename)

G4 with these differences:
- `project_id = "tailgatewithme"`; workers `tailgatewithme-api` / `-web`; seed identity `*@demo.tailgatewithme.local` / `tailgatewithme-demo-1`; the artwork from T1; no store.
- **The stack.** The program manager re-confirms that `withme-starter` is free. Step 6 stops it again, since G12 restarted it.

**Watch:** the brand filter `tailgatewithme|tailgate with me`, and the same `vibe-with-me` sweep lines. If G4 fixed the sweep, this checks the fix.

### T5: customize-gathering, nouns only (§1)

**Brief inputs:**
- nouns "tailgate" / "tailgates"; tab `Tailgates`;
- the URL `/tailgates`: web `_app.tailgates.tsx` and `_app.tailgates_.$id.tsx`, mobile `(tabs)/tailgates.tsx` and `tailgate/[id].tsx`;
- the create heading "Host a tailgate", its button "Host tailgate";
- "Title", placeholder "e.g. Lot C before the Chiefs game";
- start label "Kickoff for the lot" on web; on mobile, "Date" and "Kickoff";
- "Location (optional)", placeholder "e.g. Lot C, row 12";
- the members heading "Crew";
- **no new field**;
- seed title, location and console text in tailgate words.

**Watch:**
- **The nouns-only path.** Does the follower know to stop after §1? The skill's closing gate sits at the end of §2. Expected fix (S): "a fork with no new field stops after §1's checkpoint and runs the verification gate".
- "Who's coming" → "Crew", and "Create a gathering" → "Host a tailgate". The heading is caught by the sweep; the members heading is not (see G5).
- The seed's `p_title` and `p_location` are edited without §2.2. §1's "Copy the sweep cannot catch" covers them.

**Expected:**
- db, contract and nfc counts unchanged from T3's baseline;
- Playwright 14, with URL assertions on `/tailgates`;
- API e2e "all checks passed".

### T6: extend-profile, card tier only, two text fields

**Brief inputs:**
- `team` ("Team") and `signature_dish` ("Signature dish"): card tier, optional, 1–80, with CHECKs `profiles_team_length` / `profiles_signature_dish_length`;
- the card line "Chiefs · Burnt-end chili";
- no connections tier;
- no required field beyond the starter's (or per open question 2);
- seed Ada "Chiefs" / "Burnt-end chili", Lin "Eagles" / "Smoked queso";
- test values: `'E2E Club'` → team `'E2E Crew'`; `'Smoke Club'` → `'Smoke Crew'`.

**Watch:** the card-only path a second time, with any G6 skill fixes in. These are the worked example's own shapes (text, length CHECK), so this is the cleanest data point. The report compares T6's minutes with G6's to price the typed field.

### T7: add-destination-type, link

G7 with `$T`. If G7 fixed the §9 claim-as-link sentence, this checks the fix.

### T8: provision-tags, local

G8 with:
- the identity `lin@demo.tailgatewithme.local` / `tailgatewithme-demo-1`;
- the chip UID `04D00D00D00D09`;
- `DB=supabase_db_tailgatewithme`;
- batches under `$HOME/tailgatewithme-tags/`;
- the claim showing "Eagles · Smoked queso".

### T9: Gate and simulator

G9 with:
- the brand filter `tailgatewithme|tailgate with me`;
- the container `supabase_db_tailgatewithme`;
- the resolve grep `'"team": *"[^"]*"\|"signature_dish": *"[^"]*"'`.

**Simulator** checks 1, 3, 4, 5, 6 and 7, with check 2 replaced: Team and Signature dish save and show on the card. The members heading reads "Crew". The join preview reads "Join this tailgate?".

### T10: go-live

G10 with:
- the org "Tailgate With Me";
- the project `tailgatewithme`, password file `$HOME/.config/tailgatewithme/`;
- the Cloudflare account "Tailgate With Me", subdomain `<tsub>`, workers `tailgatewithme-api` / `-web`;
- `VITE_DEMO_CREDENTIALS=ada@demo.tailgatewithme.local / tailgatewithme-demo-1`.

**EAS:**
- `app.json` has no `owner` (the legacy fork removed it, and the fresh tree carries the starter's `vibe-with-me` owner, which is the right one).
- `bunx eas-cli init --id fe37d421-0732-4fb3-90ed-e78263f519c9 --non-interactive` → `@vibe-with-me/tailgatewithme`.
- If Alex finds no such project (open question 7): **[approve]** the literal step 5 instead. Set `owner` to `vibe-with-me` first, so `eas init` does not land the project under the personal account.

**Checkpoint:** the resolve shows `team` and `signature_dish`; `/t/04BBBBBBBBBBBB` shows Ada's card and her tailgate.

### T11: The tailgate PR and merge

G11 with `vibe-with-me/tailgate-with-me`, titled `Rebuild Tailgate with Me on withme-starter, live`.

### T12: Teardown

G12 with these deletes:
- the staging project `wntdmgxmrinagmqrefpt` (Alex);
- any legacy `tailgatewithme-*` workers T0 found (Alex);
- the `tailgate-with-me` volumes, optional (Alex);
- the stack stopped, `withme-starter` restarted, tags deleted, the worktree removed after the merge (Claude).

The staging worktrees stay as they are (A4).

---

## Phase C (revised): the report

### Task 11 (revised): The acceptance report

**File:** `$WT/docs/superpowers/reports/<YYYY-MM-DD>-proof-run.md`. The sections of the original Task 11, extended:

1. **Verdict.** Is a derivation "no longer barebones"? The evidence now includes a real product, rebuilt and live.
2. **The forks.**
   - Run Club (Phase A, local, throwaway).
   - Golf with Me (rebuilt and live): the inputs, `STARTER_SHA`, the legacy tag, the chosen direction with its Artifact link, and the PR link.
   - Tailgate with Me: one line, deferred 2026-10-13 until the sporting-event data source is decided.
3. **Timings.** One table per fork: a row per run, wall minutes and minutes minus pauses, the deviations, and the fix commit. Clean-path totals per fork.
   - Comparisons:
     - G6 against Phase A's extend-profile run, a rough price of a typed field (the cleaner T6 comparison is deferred with tailgate);
     - customize-gathering with a field, golf against Run Club;
     - first-time skills (design-direction, add-destination-type, go-live);
     - Alex's time (all PAUSE) as its own column.
4. **Deviations and fixes**, per skill across the two forks, each classed S, F, A or E.
5. **Order-dependence.** Phase A's list plus anything new: design before customize-gathering's nouns, the relabel against §2.7's grep, card-only extend-profile after a gathering field, link after extend-profile. Then the recommended order: design-direction → make-it-yours → customize-gathering → extend-profile → add-destination-type → provision-tags → gate and simulator → go-live.
6. **What a derivation gets free, and what was hand work.**
   - Free: Phase A's list.
   - Hand work: icon rendering, the EAS link, the Cloudflare account pin, the Auth URLs, the workers.dev subdomain, `PRODUCT.md`, the handicap convention.
   - Still not covered: SMTP, a custom domain, physical encoding, EAS builds and store submission, the marketing site, `release.yml` in a fork, and the unclaimed demo tag in production.
7. **Known issues.** the known issues (PGRST303, the `vite dev` hang, the remote guard, the input border, anon execute), and any new issues, with where each one bit.
8. **Go-live.** Golf: each checkpoint, the URLs, the cost incurred (expected $0), the teardown of the old project and workers, and the Auth Site URL finding. The superseded Run Club options are named in one line.
9. **Not covered.** `readTagUid` on a physical chip; encoding; app-store builds; multi-tenant; add-marketing-site; golf's legacy staging branch (the tab bar, EAS staging builds); the tailgate rebuild (deferred).

Commit `Docs: the proof-run report (milestone 5)`.

**Done 2026-10-14.** The report is `docs/superpowers/reports/2026-10-14-proof-run.md`, committed as `f257198` (`Docs: the proof-run acceptance report (Milestone 5)`). Its eight sections carry the nine above: the verdict; the two runs, each with its timing table, the comparisons and the order-dependences (3–5); what a fork gets free and what is by hand, with the not-covered list (6, 9); go-live as it went (8); the core defects table (7); the skill text changes per skill (4); open items; and the time budget against the plan. Written before the golf PR merged and before G12, and it says so.

### Task 12 (revised): Program status and the spec pointer

As originally written. Status also links the golf PR and its live URLs, and notes tailgate as deferred.

**Done 2026-10-14.** `program.md` Status: Milestone 4 reads merged (PR #10, `511a26c`, 2026-10-12); Milestone 5 reads done, PR pending, with Run Club (local, timed), golf rebuilt and live (the PR at `c64b4db` and the two URLs), the tailgate deferral and the report path. The spec's Delivery item 5 gained a dated italic note in the style of the 2026-10-12 amendment, pointing at the report, naming what was proven (Run Club, golf) and what was deferred (tailgate, physical tags, an EAS build). `docs/skills-roadmap.md` gained a five-line "Proven 2026-10-14" section pointing at the report. The "Program complete" line waits for the merge (Task 15).

---

## Phase D (revised): the M5 PR

### Task 13 (revised): Cleanup

```bash
for d in "$S"/proof-runclub*; do rm -rf "$d"; done                      # Phase A's clones
rm -rf "$HOME"/withme-tags/local-* "$HOME"/runclub-tags 2>/dev/null     # Phase A's encode lists, if any remain
docker ps --format '{{.Names}}' | grep -c '^supabase_db_withme-starter$'   # 1 (restored at G12)
docker ps --format '{{.Names}}' | grep -c '^supabase_db_golfwithme$'       # 0
lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(8786|3000|8796|9456|3010|8081) '   # nothing
xcrun simctl shutdown all
```

- Keep `$NOTES` until the PR body is written (Task 14), then delete it. Delete `$GN/design/art/` with it: the sources are in the fork's `docs/brand/`.
- `git -C "$GOLF" worktree list` shows only main and the untouched staging worktree.

### Task 14 (revised): Gate, push, PR

As originally written, with these changes:
- `git diff --name-only origin/main...HEAD` lists `.agents/skills/**` and `docs/**` only.
- The PR body gains:
  - the golf PR and live URLs;
  - golf's timing table;
  - the design direction;
  - the go-live outcome;
  - Alex's list as it actually ran;
  - one line on the tailgate deferral.

### Task 15 (revised): Review, merge, report

As originally written, with these changes:
- **Tracker:**
  - Milestone 5 Done;
  - the golf rebuild issue Done, with its PR link;
  - the decisions log gains A1–A11 and Alex's answers, including the tailgate deferral;
  - the build-out project status update.
- **Memory notes:**
  - update the app-shell direction note's resume point, naming the tailgate deferral;
  - add a technique note (fork rebuild mechanics, a two-parent commit 1, `eas init --id`, the wrangler account pin, the workers.dev subdomain, the Auth Site URL);
  - add golf's live URLs and project ref to a project memory.

---

### Time budget (estimates; the logs give the real ones)

| | Golf |
| --- | --- |
| Inventory | 20 min |
| design-direction | 30 min + Alex |
| Repo prep + fresh tree + baseline | 30 min |
| make-it-yours | 20–30 min |
| customize-gathering | 15–25 min |
| extend-profile | 45–75 min |
| add-destination-type | 15–25 min |
| provision-tags | 10 min |
| Gate + simulator | 30–40 min |
| go-live (Alex present) | 60–90 min |
| PR + merge | 30–60 min |
| Teardown | 15 min |
| **Total** | **about 6–8 h wall**, about 2 h of it Alex's |

Cost: $0 expected, on the free plans everywhere. If `supabase projects create` hits the free-project limit, the run stops and asks (answer 1 below).

---

### Answered 2026-10-13

Alex accepted every default, and deferred tailgate.

1. **Supabase free-project headroom.** Proceed; stop at the first `projects create` limit error and ask.
2. **Required for completion.** None: `handicap` and `home_club` are optional, and the follower meets the skill's no-required-field gap.
3. **Handicap.** `numeric(3,1)`, a plus handicap stored negative, with the plus shown and no minus on any screen (`parseHandicap` / `formatHandicap`).
4. **Store URLs.** None: no Merch tab, no "Get tags" link; make-it-yours step 7 is skipped.
5. **Production demo data.** Seed production and show the demo credentials on the landing page. No SMTP; SMTP is an open item in the report.
6. **Golf's legacy workers.** Alex deletes `golfwithme-api`, `-web` and `-public` on `<legacy-subdomain>.workers.dev` after the new ones are verified (G12).
7. **Golf's old Supabase project.** Alex deletes `<golf-project-ref>` after go-live (G12).
8. **Commit 1's shape.** Two parents: `legacy-2026-06` first, the starter sha second.
9. **Tailgate.** Deferred: it will be rebuilt around real sporting events once Alex decides how to source event data. The tailgate EAS project question (`fe37d421-…`) returns with that run. Batching (A11) no longer applies.
