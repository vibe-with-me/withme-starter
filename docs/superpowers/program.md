# The build-out program — how the rest of the starter gets built

Decided 2026-10-07 (Alex + Claude). Status: running.

The starter grows from the bare handshake into a fully fledged starter in
five milestones, each one pull request. The spec that binds every milestone
is `specs/2026-09-22-app-shell-and-tabs-design.md`. Progress is tracked in
the Linear project "withme-starter Build-Out" (ENG-744 to ENG-748, with
ENG-749 holding the decisions only Alex can make).

## Milestones

1. **Shell shipped.** PR 1 (the tab shell on web and mobile) merged, plus
   the cross-tab account-switch follow-up.
2. **Events in core.** The gathering moves from the `build-gathering` skill
   into the app; the roadmap is revised; the skill becomes
   `customize-gathering`.
3. **Connections and Profile made whole.** In-page tabs, the state ladder,
   avatar upload through storage, My tags, account deletion.
4. **Derivation skills.** `provision-tags`, `extend-profile`, the
   make-it-yours update.
5. **Proof run.** A fresh clone through every skill and go-live, timed.
   That report is the acceptance test for the program.

Milestones 2 and 3 share files and run in sequence; 4 touches no app code
and runs alongside 3; 5 waits for all.

## The loop every milestone runs

1. A written plan in `plans/`, derived from the spec section and any
   reference implementation (the golf and tailgate forks), in the shape of
   `plans/2026-09-22-app-shell-pr1.md`: bite-sized tasks, complete code,
   exact commands, one commit each.
2. A fresh subagent per task, followed by a spec-compliance review and a
   code-quality review; fixes loop until both approve. The program manager
   session never edits app code itself.
3. The verification gate from `../the-slice.md` after every task, plus the
   simulator pass for mobile work.
4. A pull request against `main`, CodeRabbit's comments resolved on their
   merits (pushed back where the suggestion contradicts a documented
   decision), then a merge commit once CI and CodeRabbit are clean.
5. A milestone report to Alex and a status update on the Linear project.

## Operating rules

- Claude merges once CI and CodeRabbit are clean, with a merge commit so the
  per-change history survives.
- Anything that bills (Supabase projects, Cloudflare deploys, EAS builds)
  stops and asks Alex first.
- Alex fixes the local environment when told exactly what to run.
- The safety invariants of the starter are not negotiable in any milestone:
  nothing ranks, recommends, aggregates, or monetizes; no enumeration
  surface; blocks absolute and invisible; the tenant seam on every table.

## Status

- Milestone 1: merged (PR #6; follow-up #7).
- Milestone 2: merged (PR #8, `4fa6c98`).
- Milestone 3: merged (PR #9, `7932548`, 2026-10-12).
- Milestone 4: merged (PR #10, `511a26c`, 2026-10-12).
- Milestone 5: done 2026-10-14, PR pending; the criterion was covered in
  two halves, not one run. Run Club: a fresh clone through the skills,
  local and timed, no go-live (Phase A). Golf with Me: a fork rebuilt on a
  fresh starter tree through the skills and a real go-live
  (vibe-with-me/golf-with-me#5, open at `c64b4db`;
  https://golfwithme-web.golfwithme.workers.dev,
  https://golfwithme-api.golfwithme.workers.dev); tailgate deferred
  (ENG-756). Report: `reports/2026-10-14-proof-run.md`.
