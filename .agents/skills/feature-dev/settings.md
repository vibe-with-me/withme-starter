# feature-dev — settings

The one file in this skill a fork edits. `SKILL.md` and `reference.md`
read their fork-specific choices from here, so a starter update to the
process merges cleanly while your answers stay yours. The defaults work
on a fresh clone with no accounts beyond GitHub.

Change a value by editing the line after its arrow. Leave the rest of
the file alone.

## Base branch

The branch every feature starts from and its PR targets.

→ `main`

## Branch name

Prefix plus a kebab-case slug of the feature (`feat/gathering-notes`).
A worktree, when one is used, takes the same slug.

→ prefix `feat/`

## Issue tracker

Where a feature's ticket lives, if anywhere. With `none`, the skill
links a GitHub issue in the PR when the owner names one and asks for
nothing otherwise. With a tracker, say how the agent reaches it (an MCP
server, a CLI) and what to put in the PR (`Closes #12`, `ENG-123`).

→ `none`

## Plans

Where the design doc and the implementation plan are written and
committed. Dated names (`2026-10-19-gathering-notes-design.md`) so a
fork's plans and the starter's never collide on a merge.

→ `docs/plans/`

## Verification

How a user-facing change is driven and screenshotted before the PR
(`SKILL.md` §6). Screenshots go to the folder named here, which is
gitignored and never committed.

→ screenshots: `.verify-screenshots/`
→ web: Playwright. Use the agent's browser tools (a Playwright MCP
  server, a built-in browser) when it has them; otherwise a throwaway
  Playwright script against `http://localhost:3000`.
→ mobile: the iOS simulator through Expo Go, screenshotted with
  `xcrun simctl io booted screenshot`. Android emulator
  (`adb exec-out screencap -p`) where there is no Mac. A device driver
  your agent has (for example `agent-device`) goes here if you use one.
→ mobile required: `when the change touches apps/mobile`

## Review

What reviews the branch before it merges (`SKILL.md` §7).

→ before the PR: a self-review pass over the diff (always)
→ on the PR: `CodeRabbit, if the GitHub app is installed on the repo`.
  Fix every finding or answer it in its thread. Set to `none` if
  nothing reviews PRs automatically; set to a CLI command
  (`coderabbit review --plain --base main`) to review before the PR
  instead.

## Merge

What happens once the PR is open.

→ `stop and hand the PR to the owner`

The starter's own policy, for a fork that wants it: squash-merge when CI
is green and the PR review is clean (every finding fixed or answered).
Write that here, with who may merge, to let the agent merge.
