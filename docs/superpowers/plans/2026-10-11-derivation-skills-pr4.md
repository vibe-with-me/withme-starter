# Derivation skills (PR 4 of the tabs buildout): Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship three things. Two new agent-executable skills: `provision-tags` (Tier 3, item 7) and `extend-profile` (Tier 2, item 3, the roadmap's "onboarding", with its two visibility tiers and the completion gate). The third is an update to `make-it-yours` covering the store URL, the shell height tokens, and the brand surfaces the shell and Profile work added. Each skill is first executed for real in a throwaway worktree. The skill is then written down from what actually worked and re-run literally against a fresh clone (the skill-rot check). The merged PR contains only `.agents/skills/**`, docs (`docs/**`, `README.md`), and one `.gitignore` addition (a comment and two names). Tracked privately as Milestone 4.

**Architecture:** The binding spec is `docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md`, in particular "Skills changes" and "Delivery" item 4. The program is `docs/superpowers/program.md` milestone 4. The roadmap is `docs/skills-roadmap.md`, both the original Tier 2/3 entries and the 2026-09-22 revision. The skills follow the existing skills in form: frontmatter `name`/`description` with "Use when…", a map of where things live, numbered steps in slice order, checkpoints with exact commands, a "what must not move" section, and scope notes. Every skill cites `docs/the-slice.md` and ends on its verification gate. References:

- golf-with-me `bee9c9d`, whose script already ships in the starter as `supabase/seed/provision.ts` / `bun run db:provision`. `provision-tags` is a runbook over it and adds no code.
- tailgate-with-me `92d2aeb` (card fields: column + CHECK, `resolve_tag` and `accept_connect_request` replaced, `CARD_COLUMNS`, SDK parity). `extend-profile` adds a real build of the connections-only tier, red-first.

**Tech Stack:** Postgres/Supabase RLS + security-definer functions, zod 4 + oRPC contract, Hono API Worker, TanStack Start/Router (`_app` layout), Expo Router (`(tabs)`, `Stack.Protected`), bun test, Playwright, the Supabase CLI and `docker exec … psql` for local inspection.

**Scope guard:**
- No app code in the PR. `git diff --name-only origin/main...HEAD` must list only `.agents/skills/**`, `docs/**`, `README.md`, and `.gitignore` (Task 1's comment and two ignore lines, nothing else in it).
- App code is written only in scratch worktrees and clones under `~/dev/withme-scratch/`. These are never pushed and are deleted at the end.
- No new endpoint, RPC, or policy in the starter. No enumeration surface: no "list unclaimed tags" and no "provision" endpoint.
- `profiles_select` is never edited.
- Nothing vertical-specific: the worked examples are generic (`affiliation`, `contact_handle`).

---

## Decisions made in this plan

1. **`provision-tags` is a runbook, not code.**
   - The starter already ships the golf script (`supabase/seed/provision.ts`, ported in `88383fe`).
   - The skill defaults to the script's random UIDs: 48 CSPRNG bits behind the `04` prefix. An unclaimed tag is claimed by whoever presents its UID first, and `claim_tag` is callable by any signed-in client straight through PostgREST, so entropy is the defense.
   - The encode list is treated as a set of bearer capabilities. The script writes `provisioned-tags.{csv,html}` into its working directory, and at `origin/main` the repo does not ignore those names. Task 1 adds the ignore line, but the skill still runs the script file from an output directory outside the repo (an ignored file in a checkout is still a capability list sitting in a working tree, and older forks lack the line), and sends production stdout to a file so UIDs stay out of agent transcripts.
   - Chip (hardware) UIDs are documented as a second mode with their cost. `readTagUid` in `apps/mobile/lib/nfc.ts` reads the chip's own UID, not the URL. Chip UIDs are readable and run-assigned, so they are only for tags claimed on the spot.
   - Production provisioning is not executed without Alex's explicit OK (program operating rule).
2. **go-live gets one safety fix, found while reading `bee9c9d`.**
   - That commit committed `.supabase-demo-db-password`, and go-live §1 still writes that file into the repo root, which `.gitignore` at `origin/main` does not cover.
   - The go-live text moves the password file to `$HOME/.config/<name>/`.
   - Task 1 also adds `.supabase-demo-db-password` and `provisioned-tags.*` to `.gitignore`, one commit with the skill, as the backstop for anyone who runs an older copy of either runbook. This is the PR's only change outside skills and docs.
3. **The connections tier is a sibling table `public.profile_details`, and `profiles_select` stays byte-identical.**
   - The spec says the tier "touches `profiles_select`". This plan reads that as "is defined against `profiles_select` and must be proven narrower than it", not "edits it".
   - RLS decides rows, not columns. Every viewer `profiles_select` admits reads every column, and that includes:
     - the pending-request recipient
     - the gathering co-member
     - the blocker
   - customize-gathering §3b already binds that policy to stay byte-identical except the gathering bridge.
   - Task 2 proves the leak with a red test against a naive `profiles.contact_handle` column before the real design is built. Flag this reading in the PR body.
   - **This is a spec deviation, and it is signed off.** The binding spec says the tier "touches `profiles_select`"; this plan adds `profile_details` instead. Approved by Alex 2026-10-11 (the decisions log); no stop needed. Task 2 Step 3's naive-leak output is still produced, as the evidence the PR body cites.
   - Task 6 amends the spec's Skills-changes line to describe the sibling table, with a dated note, so the binding spec and the shipped skill agree.
4. **Worked example.**
   - Card tier: `affiliation` (text 1–80, required for completion).
   - Connections tier: `contact_handle` (text 1–120, optional).
   - Golf's `home_club` and tailgate's `team` are both `affiliation`; a contact handle is the canonical connections-only field.
5. **Completion gating is UX, never safety.**
   - `REQUIRED_PROFILE_FIELDS` and `isProfileComplete()` live in `packages/contract/src/schemas/profile.ts`, the one package both clients import.
   - Web gates in `_app.tsx`'s `ShellRoute` component (today's `!profile` check before its `<Navigate to="/profile">`, widened; not a `throw redirect` from the loader, which M3's comment there explains blanks the page). Mobile gates in `(tabs)/_layout.tsx` once per signed-in account.
   - Columns stay nullable, so pre-existing rows and the claim flow's minimal profile stay valid. No policy or RPC reads completion.
6. **API shape.**
   - `app.profile.get` / `update` return `{ profile, details }`.
   - `ConnectionSchema` gains `details: ProfileDetailsSchema.nullable()`.
   - `accept_connect_request` returns `details`: it is the one definer read of `profile_details`, after the connection row exists.
   - Writes are update-then-insert, not PostgREST `.upsert()`. Its `ON CONFLICT DO UPDATE` sets `profile_id`, which the column grant forbids. Confirmed in Task 4a: the swapped-in `.upsert()` fails `42501` "permission denied for table profile_details" on every save, the first one included (no conflict needed).
7. **RLS tests red first.** `extend-profile` orders tests before the migration on purpose. This departs from the slice's 2/3 order: the boundary is specified before the policy that enforces it. That gives 14 new tests, plus `profile_details` added to the enumeration anon sweep and to both deletion tests (`cascade.test.ts`, through the auth admin API, and M3's `account.test.ts`, through `delete_my_account()`).
8. **make-it-yours.**
   - A new step 7, "Merch store pointer". The old step 7 becomes step 8.
   - The shell-heights paragraph is rewritten so heights may change, in lockstep.
   - Three missed brand surfaces are added: `CalmStates.tsx` "withme home", the `login.tsx` hint, and `WordmarkFooter` in `t.$uid.tsx`. Milestone 3 added no `withme` string (the sweep at `7932548` matches the same files as at `4fa6c98`); its one new user-facing system string, `expo-image-picker`'s `photosPermission` in `app.json`, joins step 3 as voice copy.
   - go-live §3's `.env.production` block gains `VITE_STORE_URL`.
9. **Docs.**
   - `docs/the-slice.md` gains one safety bullet ("Two tiers of profile data") so the discipline lives in one place (roadmap hard constraint 3).
   - `README.md` gains a short "Extending a fork" skills list; today it has none.
   - The roadmap gets a dated section.
   - `program.md` gets a status section.
10. **`add-marketing-site` is not in this milestone.** The spec lists it as "Candidate, after the proof below", and Delivery PR 4 names only the three skills.
11. **Scratch and the shared stack.**
    - Scratch worktrees live in `~/dev/withme-scratch/<name>` (`git worktree add … -b scratch/<name> origin/main`).
    - Fresh clones live in `~/dev/withme-scratch/fresh-<skill>`, with `origin` removed right after cloning so nothing can be pushed.
    - All of them share the one local Supabase stack (`project_id = "withme-starter"`, ports 553xx), and `db:reset` from any checkout replaces the database with that checkout's migrations. Scratch work therefore runs only inside a declared stack window (ground rules).
12. **Phasing against Milestone 3.**
    - Phase A runs alongside M3, in stack windows the program manager grants:
      - Task 0
      - Task 1 (provision-tags)
      - Task 2 (extend-profile's database and RLS core, which is M3-independent)
    - Phase B starts only after M3 merges:
      - Task 3 (rebase; resolve the Milestone 3 markers)
      - Task 4a (extend-profile on post-M3 main: cherry-pick the core, redo §3, §4–§5 green)
      - Task 4b (extend-profile §6–§8, API e2e and Playwright green)
      - Task 4c (extend-profile simulator pass)
      - Task 4d (write extend-profile's SKILL.md, consistency check)
      - Task 5 (make-it-yours)
      - Task 6 (docs, including the spec amendment)
      - Task 7a (static name check of every skill)
      - Task 7b (fresh-clone re-run: provision-tags)
      - Task 7c (fresh-clone re-run: extend-profile)
      - Task 7d (fresh-clone re-run: make-it-yours)
      - Task 8 (PR)
13. **Milestone 3 markers (resolved in Task 3, 2026-10-12).**
    - Spots that depended on Milestone 3's code carried an inline "M3 check" marker in the SKILL.md texts. Examples: the avatar column (`avatar_url` → `avatar_path`), the Profile tab's sections, the segmented Connections tab, `delete_my_account`, and M3's new copy.
    - Task 3 resolved every one against M3's merged code (`7932548`). No marker may come back: `grep -rn 'M3-CHEC[K]' .agents docs README.md` (the bracket keeps the pattern from matching itself) must print nothing before Task 8.

---

## Ground rules for every task

- **Branch.**
  - Work in `~/dev/withme-starter/.claude/worktrees/derivation-skills` on branch `claude/derivation-skills`, created from `origin/main` in Task 0. (`.claude/worktrees/with-me-derivation-starter-1f2c69` holds Milestone 3's finished branch; never work or write there.)
  - Do not reuse `claude/connections-profile`, which is the name in use for Milestone 3.
  - Local `main` is stale (`02147a7`): always base on `origin/main` after `git fetch origin`.
- **Stack windows.**
  - Before any `bun run db:*`, `bun run test`, API e2e, or Playwright run in a scratch worktree or clone, ask the program manager to confirm no Milestone 3 task is using the stack or ports 8786/3000/8796/9456/3010.
  - During the window, nothing else touches the stack.
  - Close every window from the M4 worktree with `bun run db:reset && bun run db:seed`; its migrations equal `origin/main`'s. Then report the window closed.
  - **Hand the stack back to Milestone 3.** An M4 reset loads `origin/main`'s migrations and drops M3's unmerged ones. So when an M4 window closes, the executor tells the program manager, and Milestone 3 runs `bun run db:reset && bun run db:seed` from its own worktree before its next database command.
  - The opposite holds too: before an M4 window opens, M3 must be at a point where its database can be wiped (no half-run migration, no test data it still needs). The program manager confirms that when granting the window.
  - Never `bun run db:stop` the shared stack, and never rename `project_id` in a scratch checkout (a second stack would collide on the 553xx ports).
  - Always run Playwright as `CI=1 bunx playwright test`. `reuseExistingServer: !process.env.CI` would otherwise attach to another checkout's API worker on 8796.
- **Scratch rules.**
  - Scratch branches may hold local commits, so Task 4a can cherry-pick Task 2. They are never pushed.
  - Keep a running log of commands and outputs at `~/dev/withme-scratch/notes/<skill>.md`. It feeds the SKILL.md corrections and the PR body.
- **The skill text below is the target, not gospel.** Where the scratch run disagrees (a command, an output line, an error code), the SKILL.md written to the repo matches what actually happened. Note each correction in the log.
- **Gate on the M4 branch:** `bun run lint && bun run typecheck && bun run test`. It stays green; no app code changes.
- **Commit messages:** imperative subject, the why in the body, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Escaping:** shell-quote paths containing `$`, `[`, or `(`.

---

### Task 0: Baseline

**Files:** none.

```bash
cd ~/dev/withme-starter/.claude/worktrees/derivation-skills
git fetch origin
git switch -c claude/derivation-skills origin/main
git log --oneline -1          # expect the merge of PR #8 (or later, if M3 already merged)
bun install
cp -n apps/api/.dev.vars.example apps/api/.dev.vars; cp -n apps/web/.env.example apps/web/.env; cp -n apps/mobile/.env.example apps/mobile/.env
# stack window (ground rules) for the next two lines
bun run db:reset && bun run db:seed
bun run lint && bun run typecheck && bun run test
mkdir -p ~/dev/withme-scratch/notes && chmod 700 ~/dev/withme-scratch
```

Expected: the gate is green. At `4fa6c98` the db suite counts 57 and the contract suite 24. Record the actual numbers as the baseline. No commit.

---

### Task 1: `provision-tags` (Phase A: may run alongside M3)

**Files:**
- Create: `.agents/skills/provision-tags/SKILL.md`
- Modify: `.agents/skills/go-live/SKILL.md` (the password-file fix only)
- Modify: `.gitignore` (two lines: the password file and the encode list)

**Step 1: Scratch worktree.**

```bash
git -C ~/dev/withme-starter worktree add ~/dev/withme-scratch/provision-tags -b scratch/provision-tags origin/main
cd ~/dev/withme-scratch/provision-tags
bun install
cp apps/api/.dev.vars.example apps/api/.dev.vars; cp apps/web/.env.example apps/web/.env; cp apps/mobile/.env.example apps/mobile/.env
```

**Step 2 (stack window): execute the draft skill literally from the scratch worktree.**

1. `bun run db:reset && bun run db:seed`.
2. Follow §1 of the SKILL.md text below, every command, every checkpoint.
3. Also prove the four facts the rules depend on, and log each output:
   - **The repo-root pothole.** From the scratch root, run `bun run db:provision -- --count 1`. Expect `git status --porcelain` to show `?? provisioned-tags.csv` and `?? provisioned-tags.html`, untracked and not ignored (the scratch worktree is `origin/main`, without Step 5b's ignore line: this is the gap that line closes). Then `rm provisioned-tags.csv provisioned-tags.html`.
   - **The count bound.** `(cd "$OUT" && bun run "$REPO/supabase/seed/provision.ts" --count 0)` prints `--count must be an integer between 1 and 1000` and exits 1.
   - **The remote gate.** `(cd "$OUT" && SUPABASE_URL=https://example.supabase.co bun run "$REPO/supabase/seed/provision.ts" --count 1)` prints `Refusing to provision against non-local Supabase at https://example.supabase.co. Set SEED_ALLOW_REMOTE=1 to override.` and exits 1, without touching the network.
   - **Unknown and unclaimed look alike.** With `cd apps/api && bun run dev` running, resolve one provisioned UID and one never-provisioned UID through the SDK or the web loader. Both answer `unclaimed`.
4. Run §5 (the chip-UID insert) literally against the local DB with `04D00D00D00D01`. Expect the `returning` row. Then open `http://localhost:3000/t/04D00D00D00D01` (dev servers up): it lands on "Claim this tag" showing that UID.
5. Claim one batch UID in the browser as `lin@demo.withme.local` / `withme-demo-1`. Expect the page to become Lin's card. A second account's claim says "This tag has already been claimed."
6. Close the window.

**Step 3: production (optional, stop and ask).** Ask Alex whether to run §2 against the hosted demo project with `--count 1`; it writes one row to production. Default: not run. The PR body says so.

**Step 4: write the SKILL.md** from what happened. Target text, to be corrected to the scratch run:

````markdown
---
name: provision-tags
description: Use when an operator needs physical NFC tags ready to encode, sell, or hand out for a withme-starter app or fork — batch-provisioning unclaimed tag rows, the encode list of https://<domain>/t/{UID} URLs, and a printable sheet, locally or against production.
---

# provision-tags — make tags the app will recognize

A tag is a row before it is a sticker. `public.tags` holds one row per UID;
a row starts `unclaimed`, and the first signed-in person who opens its URL
and presses "Claim tag" owns it (`claim_tag`). This runbook creates those
rows in a batch, writes the URL each tag must carry, and prints a sheet to
encode from. It pairs with the Merch pointer (`VITE_STORE_URL`): the store
sells tags; this is how they come to exist.

Distilled from golf-with-me `bee9c9d`, whose script ships in the starter as
`supabase/seed/provision.ts` (`bun run db:provision`). The skill adds no
code: every step runs the shipped script against the shipped schema.

**REQUIRED BACKGROUND:** the safety discipline in `docs/the-slice.md` (no
enumeration; operator actions on the service role only) and, for
production, `.agents/skills/go-live/SKILL.md` §1 (the keys file, the
owner's OK).

## What is already in the starter (the map)

| Piece | Where |
| --- | --- |
| The script | `supabase/seed/provision.ts`, wired as `db:provision` in the root `package.json` |
| Its service-role client | `admin` from `packages/db/src/test-utils/index.ts` — reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, local defaults otherwise |
| The row | `public.tags` in `supabase/migrations/20260610120000_initial_handshake_schema.sql`: `uid` CHECK `^[0-9A-F]{14}$`, `tags_state_consistent`, no anon policy, owner-only `tags_select_own` / `tags_update_own` |
| First tap wins | `public.claim_tag`, same migration |
| Unknown and unclaimed look alike | `public.resolve_tag` answers `unclaimed` for both (newest definition: the last migration that defines it) |
| The tap | web `apps/web/src/routes/t.$uid.tsx` → `claim.$uid.tsx`; mobile `apps/mobile/app/t/[uid].tsx` → `claim/[uid].tsx` |
| The in-app reader | `readTagUid` in `apps/mobile/lib/nfc.ts` — reads the chip's own UID, not the URL (§5) |
| After the claim | the owner's Profile → "My tags" on both platforms (web `apps/web/src/components/MyTags.tsx`, mobile `apps/mobile/components/MyTags.tsx`), over `app.tags.listMine` / `app.tags.update`: re-point a tag (the card or one of their gatherings) and "Turn off" / "Turn on" (`status` `disabled` / `claimed`, `OwnerTagStatusSchema` in `packages/contract/src/schemas/tag.ts`). A gathering's detail screen also points all of them at once (`TagPointer` in web `_app.gatherings_.$id.tsx`, mobile `app/gathering/[id].tsx`). No owner control releases a tag back to `unclaimed`; deleting the account does (`delete_my_account`: claimed tags reset, their scans erased) |

## The rules this runbook will not bend

1. **UIDs come from the script, never from you.** It draws 6 bytes from
   `crypto.getRandomValues` behind the NXP-style `04` prefix: 48 random bits
   per tag. Never sequential, never hand-picked, never derived from an order
   number or a customer. An unclaimed tag is claimed by whoever presents its
   UID first, and the entropy is the only thing between a guesser and your
   customer's tag: the API Worker rate-limits claims per user
   (`apps/api/src/routers/public.ts`), but any signed-in client can call
   `claim_tag` directly through PostgREST.
2. **The encode list is a set of bearer capabilities** until each tag is
   claimed. It goes to a directory outside the repo (mode `700`), never
   into git, an issue, a chat, or a shared drive. The script writes
   `provisioned-tags.csv` and `.html` into its working directory. The
   starter's `.gitignore` covers `provisioned-tags.*` as a backstop (forks
   cut before it do not), but an ignored file in a checkout is still a
   capability list sitting in a working tree — so every command below runs
   the script from an output directory. Production batches also send stdout
   to a file, so the UIDs stay out of terminal scrollback and agent
   transcripts.
3. **Provision what you are about to encode.** Unclaimed inventory is
   claimable inventory: batches of tens, not thousands held in advance.
4. **Provisioning is an operator action on the service-role key** — never an
   endpoint, an RPC, a policy, or a button. Do not add a "provision" or
   "list unclaimed tags" surface to the API or the apps: it would be an
   enumeration surface for exactly the rows that can be stolen.
5. **Production writes need the owner's explicit OK**, as in go-live. The
   script refuses a non-local `SUPABASE_URL` unless `SEED_ALLOW_REMOTE=1`.
6. **The domain you encode is forever.** Tags are locked read-only after
   writing. Encode the web origin you will own for the life of the tags (a
   custom domain), not a `*.workers.dev` URL tied to a worker name.

## Inputs to collect before you start

- Count: 1–1000 per run (the script enforces it).
- Base URL: the `https` web origin that serves `/t/<UID>`, no trailing
  path (e.g. `https://tags.acme.com`); locally `http://localhost:3000`.
- Target: the local stack, or production (needs `.env.demo-seed` from
  go-live §1 and the owner's OK).
- An output directory outside the repo, new for every batch (the script
  overwrites `provisioned-tags.*` in place).

## 1. Rehearse locally

Stack up (`bun run db:start`). From the repo root:

```sh
REPO="$(git rev-parse --show-toplevel)"
OUT="$HOME/withme-tags/local-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT" && chmod 700 "$OUT"
(cd "$OUT" && bun run "$REPO/supabase/seed/provision.ts" --count 3 --base-url http://localhost:3000)
```

Running the file directly instead of `bun run db:provision` is deliberate:
the script writes into the current directory, and this keeps that
directory out of the repo. Imports still resolve from the script's own
folder.

**Checkpoint:**

- stdout starts `Provisioned 3 unclaimed tags on http://127.0.0.1:55321`,
  lists three `04…  http://localhost:3000/t/04…` lines, and ends
  `Wrote provisioned-tags.csv and provisioned-tags.html (printable).`
- `ls "$OUT"` lists exactly `provisioned-tags.csv` and
  `provisioned-tags.html`; `head -1 "$OUT/provisioned-tags.csv"` is
  `uid,encode_url`.
- `git -C "$REPO" status --porcelain` prints nothing, and
  `ls "$REPO"/provisioned-tags.* 2>/dev/null` prints nothing (the ignore
  line would hide a stray copy from `git status`, so look for the file).
- The rows exist and are unclaimed:

  ```sh
  DB="supabase_db_$(sed -n 's/^project_id = "\(.*\)"/\1/p' "$REPO/supabase/config.toml")"
  UIDS=$(tail -n +2 "$OUT/provisioned-tags.csv" | cut -d, -f1 | sed "s/.*/'&'/" | paste -sd, -)
  docker exec "$DB" psql -U postgres -tAc "select uid, status from public.tags where uid in ($UIDS) order by uid"
  ```

  prints three `04…|unclaimed` lines.
- End to end, with both dev servers up (`cd apps/api && bun run dev` and
  `cd apps/web && bun run dev`): open one encode URL. Signed out, it asks you
  to sign in, then shows "Claim this tag" with the UID. Sign in as the seed's
  demo user (`lin@demo.withme.local` / `withme-demo-1`, or your rebranded
  identity) and press "Claim tag": the page becomes that user's card.
  Another account's claim on the same URL says "This tag has already been
  claimed."

## 2. Provision the real batch

Production (owner's OK first; the keys file from go-live §1):

```sh
REPO="$(git rev-parse --show-toplevel)"
OUT="$HOME/<brand>-tags/$(date +%Y%m%d)-batch-<n>"
mkdir -p "$OUT" && chmod 700 "$OUT"
(
  set -a && source "$REPO/.env.demo-seed" && set +a
  cd "$OUT" && SEED_ALLOW_REMOTE=1 bun run "$REPO/supabase/seed/provision.ts" \
    --count <n> --base-url https://<your-domain> > provision.log
)
head -1 "$OUT/provision.log"
```

**Checkpoint** (without printing the UIDs):

- the first log line reads `Provisioned <n> unclaimed tags on https://<ref>.supabase.co`;
- `tail -n +2 "$OUT/provisioned-tags.csv" | wc -l` prints `<n>`;
- `tail -n +2 "$OUT/provisioned-tags.csv" | cut -d, -f2 | grep -vc '^https://<your-domain>/t/04[0-9A-F]\{12\}$'`
  prints `0` (every URL is on your domain and well-formed).

Do not paste the CSV anywhere to check it.

## 3. Encode, lock, verify

For each row of `provisioned-tags.html` (print it or open it locally):

1. Write the URL to the tag as an NDEF URI record (NXP TagWriter or any
   NFC writer app).
2. Read the tag back in the writer app and compare the URL with the sheet
   row. Then lock the tag read-only — irreversible, so compare first.
3. Tap it with a phone: the OS opens `https://<your-domain>/t/<UID>` and the
   page shows "Claim this tag" with the UID — compare it with the sheet.
   **Do not press "Claim tag"** on a tag that is going to someone else: the
   first claim owns it.

## 4. Ship and retire the list

Ship the tags. The encode list has then done its job: keep the CSV only if
your fulfillment records need it — offline, access-limited — and otherwise
delete the batch directory. A claimed tag's UID keeps resolving (that is
the product) but can no longer be claimed.

## 5. The chip's own UID (in-app reading)

The mobile scanner's "Read NFC tag" (`readTagUid`) reads the chip's
hardware UID, not the URL written on it. For a tag carrying a
script-generated UID:

- a tap through the phone's OS — the normal path — opens the URL and works;
- the in-app reader resolves the chip's UID instead, which was never
  provisioned, and lands on the claim screen for an unknown tag. Typing the
  URL's UID into the scanner's manual field works.

If in-app reading must work for a batch, provision the chips' own UIDs
instead. Read each one with your writer app, then run:

```sql
insert into public.tags (uid) values ('04A1B2C3D4E5F6'), ('04A1B2C3D4E5F7')
on conflict (uid) do nothing
returning uid;
```

Locally: `docker exec "$DB" psql -U postgres -c "<that sql>"` (with `$DB`
from §1). In production: the Supabase dashboard's SQL editor, with the
owner's OK. Then encode `https://<your-domain>/t/<that UID>`.

Know the cost: a chip UID is readable by anyone in NFC range and assigned
in runs by the manufacturer, so one tag from a batch hints at its
neighbours. Use chip UIDs only for tags claimed on the spot by whoever
holds them (your staff, a demo), never for tags that sit unclaimed in a
shipment. Both kinds of UID live in the same table.

## What must not move

- No API route, RPC, policy, or screen creates tags or lists unclaimed ones;
  provisioning stays a service-role script run by an operator.
- `resolve_tag` keeps answering `unclaimed` for an unknown UID exactly as
  for a provisioned one: the public resolver must not reveal which UIDs
  exist.
- `claim_tag` stays atomic and first-claim-wins
  (`update … where status = 'unclaimed'`). A fork that wants pre-assigned
  tags (claim codes, binding to an order) builds that as its own slice with
  RLS tests, not by loosening this.
- `claim_tag` is the one place existence leaks, knowingly: it answers
  `tag not found` (`P0003`) for an unknown UID and `tag is not claimable`
  (`P0002`) for a claimed or disabled one. The risk is low: `resolve_tag`
  already tells anyone that a UID is claimed or disabled, and a guess that
  hits an unclaimed UID is a claim, not an oracle answer, so rule 1's
  entropy is what protects it. That holds only while nothing lists
  unclaimed UIDs, and this runbook never exposes such a list: it lives in
  `$OUT`, on the operator's machine.
- `tags.uid` stays immutable: the column grant
  (`grant update (destination, status)`) is what stops an owner from
  re-keying a row onto a future batch.
- The service-role key never appears on a command line, in the repo, or in a
  client bundle (go-live §1).
- The seed's demo UIDs are public — the README prints them, and
  `04AAAAAAAAAAAA` is seeded unclaimed (`supabase/seed/index.ts`). If you
  seeded production for a demo, claim or delete that row before real users
  arrive.

## Scope notes

- No QR codes, no label layout, no print service: the sheet is a plain table
  for whoever writes the tags. A QR sheet puts the capability on paper; if
  you add one, it inherits rule 2.
- Re-pointing and turning off a claimed tag belong to its owner (Profile →
  My tags, in the map); a tag goes back to `unclaimed` only when its owner
  deletes their account. The operator has no client path to someone else's
  tag, by design.
````

**Step 5: the go-live fix.** In `.agents/skills/go-live/SKILL.md` §1 make the following edits.

Replace

```
echo "$DB_PASS" > .supabase-demo-db-password && chmod 600 .supabase-demo-db-password
```

with

```
mkdir -p "$HOME/.config/<name>" && (umask 077 && printf '%s\n' "$DB_PASS" > "$HOME/.config/<name>/supabase-db-password")   # outside the repo
```

In the link/push block, replace both occurrences of `-p "$(cat .supabase-demo-db-password)"` with `-p "$(cat "$HOME/.config/<name>/supabase-db-password")"`. The literal path, not a variable: the link/push block usually runs in a later shell than the create block, where a variable set there is gone and `cat ""` would pass an empty password.

Add a row to the gotcha index:

`| git status shows .supabase-demo-db-password, or the repo has one | an older copy of this runbook wrote it into the repo root (the starter's .gitignore now ignores the name; older forks do not): move it to $HOME/.config/<name>/ and never commit it |`

Verify the edited lines run as written in the scratch worktree, each in its own shell. Substitute `<name>` with `withme-scratch-check` and set `DB_PASS=check` in the first shell. Run the `mkdir` line there; in a new shell, run `cat "$HOME/.config/withme-scratch-check/supabase-db-password"` (prints `check`) and `ls -l "$HOME/.config/withme-scratch-check/supabase-db-password"` (shows `-rw-------`). Then `rm -r "$HOME/.config/withme-scratch-check"`.

**Step 5b: the `.gitignore` backstop.** In the M4 worktree, append to `.gitignore`, after the `supabase/.temp/` block:

```
# Operator secrets an older go-live or provision run may have left in the repo root.
.supabase-demo-db-password
provisioned-tags.*
```

Check: `touch .supabase-demo-db-password provisioned-tags.csv provisioned-tags.html && git status --porcelain` prints only ` M .gitignore` (and the skill files); then `rm .supabase-demo-db-password provisioned-tags.csv provisioned-tags.html`.

**Step 6: verify and commit.**

```bash
cd ~/dev/withme-starter/.claude/worktrees/derivation-skills
git add .agents/skills/provision-tags/SKILL.md .agents/skills/go-live/SKILL.md .gitignore
git commit -m "Add provision-tags: batch tags, encode list, printable sheet

An operator runbook over the shipped provision script (from golf-with-me
bee9c9d): random UIDs because an unclaimed tag belongs to its first
claimant, the encode list kept out of the repo as bearer capabilities,
chip UIDs only for tags claimed on the spot. go-live stops writing the
database password file into the repo.

.gitignore gains .supabase-demo-db-password and provisioned-tags.*: go-live
§1 historically wrote the password file into the repo root, and a fork
(golf-with-me bee9c9d) committed it; the provision script writes its
encode list into whatever directory it runs from. The runbooks route
around both; the ignore lines catch anyone running an older copy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `extend-profile`, the safety core, red first (Phase A: M3-independent)

**Files:** none in the M4 branch. All work is in `~/dev/withme-scratch/extend-profile-core`.

**Step 1: Worktree.**

```bash
git -C ~/dev/withme-starter fetch origin
git -C ~/dev/withme-starter worktree add ~/dev/withme-scratch/extend-profile-core -b scratch/extend-profile-core origin/main
cd ~/dev/withme-scratch/extend-profile-core && bun install
cp apps/api/.dev.vars.example apps/api/.dev.vars; cp apps/web/.env.example apps/web/.env; cp apps/mobile/.env.example apps/mobile/.env
```

**Step 2 (stack window opens):** `bun run db:reset && bun run db:seed && bun run test`. Expect green at the baseline.

**Step 3: Prove the naive design leaks.** This is the evidence for Decision 3.

Create `supabase/migrations/20261011000000_naive_contact_column.sql`:

```sql
alter table public.profiles add column contact_handle text;
```

Create `packages/db/test/naive-leak.test.ts`:

```ts
// Scratch only: a connections-only column on profiles, read by viewers
// profiles_select admits for other reasons.
import { beforeAll, describe, expect, it } from 'bun:test';
import { assertStackRunning, connectUsers, createTestUser, type TestUser } from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

async function plant(owner: TestUser): Promise<void> {
  const { error } = await owner.client.from('profiles').update({ contact_handle: '@secret' }).eq('id', owner.id);
  expect(error).toBeNull();
}

async function read(viewer: TestUser, owner: TestUser): Promise<unknown> {
  const { data } = await viewer.client.from('profiles').select('contact_handle').eq('id', owner.id);
  return data?.[0]?.contact_handle ?? null;
}

describe('a contact column on profiles', () => {
  it('stays hidden from a pending-request recipient', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await plant(alice);
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    expect(await read(bob, alice)).toBeNull();
  });

  it('stays hidden from a gathering co-member', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await plant(alice);
    const { data } = await alice.client.rpc('create_gathering', {
      p_title: 'Scratch',
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await bob.client.rpc('join_gathering', { p_gathering_id: (data as { id: string }).id });
    expect(await read(bob, alice)).toBeNull();
  });

  it('stays hidden from someone who blocked the owner', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await plant(alice);
    await connectUsers(alice, bob);
    await bob.client.from('blocks').insert({ blocker_id: bob.id, blocked_id: alice.id });
    expect(await read(bob, alice)).toBeNull();
  });
});
```

Run `bun run db:reset && cd packages/db && bun test test/naive-leak.test.ts`. Expected: 3 fail, each with `Received: "@secret"`. Paste the output into the log.

Optional, about 5 minutes: delete the pending-request clause from a scratch copy of `profiles_select` and re-run `bun test`. The first naive test goes green, but `enumeration.test.ts` "the recipient of a pending request sees the requester card" goes red. That shows no `profiles_select` edit can fix the leak without taking card access away.

Then remove both scratch files and run `bun run db:reset`.

**Spec deviation (Decision 3): the sibling table instead of a `profiles_select` edit.** Approved by Alex 2026-10-11 (the decisions log); no stop needed. Log the Step 3 output as the evidence for the PR body and go on.

**Step 4: Contract.** Apply SKILL §1 (Task 4d's text) literally. Then `cd packages/contract && bun test`; expect baseline +4, green.

**Step 5: RLS tests, red.**
1. Apply SKILL §2: `profile-fields.test.ts`, plus the enumeration and cascade additions.
2. Run `bun run db:reset && cd packages/db && bun test`.
3. Expected: the 14 new tests, the extended cascade test, and the enumeration test "anon cannot select any rows from any handshake table" fail. Every failure is on the missing table or column (an `error` not null, or `profiles_affiliation_length` absent), never on a data assertion that happened to pass. The cascade and enumeration additions are red only because they check `error`; a `data ?? []` assertion would pass against a missing table.
4. Log the failure list.
5. Typecheck for `@withme/db` is red until `db:types`; this is the expected window.

**Step 6: Migration, green.**
1. Apply SKILL §3. The card-function replacements copy the newest definitions at this base, which have `avatar_url` before M3.
2. Run `bun run db:reset && bun run db:seed && bun run db:types`.
3. Run `cd packages/db && bun test`. Expect the baseline +14, all green.
4. Run `bunx turbo run typecheck --continue`. Expected red only in `@withme/api` and `@withme/nfc`, whose layers come in Task 4a. (Plain `bun run typecheck` halts at the first red package, so it cannot show that the others are green.)

**Step 7:** `git add -A && git commit -m "scratch: extend-profile core"` (local only), then close the stack window. Record in the log every place the SKILL §1–§3 text was wrong.

---

### Task 3: The M3 gate: rebase and resolve the markers (Phase B starts)

**Precondition:** Milestone 3 is merged into `origin/main`.

```bash
cd ~/dev/withme-starter/.claude/worktrees/derivation-skills
git fetch origin && git rebase origin/main
grep -rn 'M3-CHEC[K]' .agents docs README.md
```

Then resolve each marker against M3's merged code, reading the files and not guessing:

| Marker | Where to look |
| --- | --- |
| Avatar key on the card (`avatar_url` vs `avatar_path`) | `packages/contract/src/schemas/profile.ts`, the newest `resolve_tag` / `accept_connect_request` definitions |
| Profile tab sections and labels | `apps/web/src/routes/_app.profile.tsx`, `apps/mobile/app/(tabs)/profile.tsx` |
| Connections tab segments and row components | `apps/web/src/routes/_app.connections.tsx`, `apps/mobile/app/(tabs)/connections.tsx` |
| My tags, and whether `app.tags.update` takes `status` | `packages/contract/src/contract/app.ts` |
| Account deletion path for the cascade test | `delete_my_account` migration, `packages/db/test/` |
| `upsertOwnProfile` shape | `packages/db/src/queries/handshake.ts` |
| New brand copy | `grep -rni --exclude-dir={node_modules,dist,.expo,.wrangler,.turbo} withme apps/ \| grep -v '@withme/'` |

Edit the SKILL.md texts in place, both the committed provision-tags and the drafts in this plan. Commit only if a committed file changed: `git commit -m "provision-tags: describe My tags as Milestone 3 shipped it" …`.

**Done 2026-10-12** against `7932548` (the merge of PR #9). The rebase was clean. What M3 shipped, and where the texts now say so:
- Avatar key: `avatar_path` (a bucket path, never a URL) on `ProfileSchema`, `PublicProfileSchema`, `CARD_COLUMNS`, `PublicProfileCard`, and both card functions, whose newest definitions are in `20261011120000_avatars.sql`. The photo has its own endpoints (`uploadAvatar` / `removeAvatar`), so `UpdateProfileInputSchema` has no avatar key.
- Profile: web `_app.profile.tsx` is `IdentityForm` (one `<form className="card">`: heading, `AvatarField` when a profile exists, Name, Bio, a status line, Save), then `<MyTags>` (`components/MyTags.tsx`, heading "My tags"), then `<AccountSection>`. Mobile `(tabs)/profile.tsx` is one `Card` (`Title`, `AvatarPicker`, Name and Bio `Field`s, Save `Button`), then `<MyTags />`, then `<AccountSection />`.
- Connections: three segments (Connections, the default with no `?tab`; Requests; Blocked). Rows are `PersonRow`: web's is local to `_app.connections.tsx` (`profile`, `sub`, children), mobile's is exported from `components/ui.tsx` (`name`, `path`, `sub`, children). Both show one `sub` line.
- My tags: `app.tags.update` takes `status` (`OwnerTagStatusSchema`: `claimed` / `disabled`) as well as `destination`; the controls are "Turn off" / "Turn on". No owner release; `delete_my_account` releases.
- Deletion: `cascade.test.ts` still deletes through `admin.auth.admin.deleteUser`; M3 added `account.test.ts`, which deletes through `delete_my_account()` (definer: deletes the `auth.users` row, so the same FK cascade runs). extend-profile §2 now extends both.
- `upsertOwnProfile`: patch `{ display_name?: string; bio?: string | null }`, first-create insert `{ id, display_name, bio }`, and a `23505` race retry that re-sends `patch`.
- Brand copy: the sweep matches the same files as at `4fa6c98`; M3 added no `withme` string.
- Beyond the markers: web's completion gate is not in the `_app` loader but in `ShellRoute` (`<Navigate>`), and the e2e profile helpers live in `apps/web/e2e/helpers.ts`. §6, §8, and Task 7a now say so.

---

### Task 4a: `extend-profile` on post-M3 main: the core, §3–§5 green (Phase B)

**Files:** none in the M4 branch. All work is in `~/dev/withme-scratch/extend-profile`.

**Step 1: Worktree on post-M3 main, carrying the core.**

```bash
git -C ~/dev/withme-starter worktree add ~/dev/withme-scratch/extend-profile -b scratch/extend-profile origin/main
cd ~/dev/withme-scratch/extend-profile && bun install
cp apps/api/.dev.vars.example apps/api/.dev.vars; cp apps/web/.env.example apps/web/.env; cp apps/mobile/.env.example apps/mobile/.env
git cherry-pick scratch/extend-profile-core
```

Conflicts are expected in:
- `packages/db/src/types/supabase.ts`: take theirs, then regenerate.
- The migration's card-function bodies: redo them by following SKILL §3's instruction literally against M3's newest definitions; this is a test of that instruction.
- The contract fixtures (the avatar key).

Then apply the one §2 addition the core does not carry (Task 3 added it to the skill text after Task 2 ran): the `profile_details` row and check in `packages/db/test/account.test.ts`'s first test.

**Step 2 (stack window): §3 green on post-M3 main.**
1. Run `bun run db:reset && bun run db:seed && bun run db:types && bun run test`.
2. Expected: db at the post-M3 baseline +14, contract +4, all green, including the extended cascade, account, and enumeration tests. `bun run typecheck` red only in `@withme/api` and `@withme/nfc`.

**Step 3: §4–§5 literally.**
1. Follow SKILL §4 (queries and API) and §5 (SDK mirror) as written. Hit each checkpoint: after §4, `bunx turbo run typecheck --continue` has `@withme/api` and `@withme/db` green and `@withme/nfc` red; after §5, `bun run --cwd packages/nfc-sdk typecheck` is clean.
2. Confirm or correct Decision 6's claim that `.upsert()` fails on the column grant: in the scratch worktree only, swap `upsertOwnDetails` for a one-line `.upsert({ profile_id: userId, ...details })`, run `cd packages/db && bun test`, log the result, then revert the swap. The db suite never calls the query functions, so it stays green with the swap; add a throwaway test that calls `upsertOwnDetails` as the owner (first save, then a second) to see the result, and delete it with the revert.
3. `bun run lint && bun run typecheck && bun run test`: green.

**Step 4:** `git add -A && git commit -m "scratch: extend-profile §3–§5"` (local only). Close the stack window (ground rules, including the hand-back to M3). Log every place the SKILL §3–§5 text was wrong.

**Done 2026-10-12** on `7932548`. The post-M3 baseline (before the cherry-pick) is db 72, contract 31, nfc 48; after §3, db 86 and contract 35. The cherry-pick conflicted in `contract/app.ts` (imports), `contract/test/schemas.test.ts` (imports, the sorted keys line, M3's appended describes), and `supabase.ts`. The fixtures auto-merged. The migration did not conflict, because it is a new file, but its card bodies still emitted `avatar_url`; they were redone from `20261011120000_avatars.sql`. Each checkpoint held, read with `bunx turbo run typecheck --continue`. Corrections are in §1, §3, and §4.

---

### Task 4b: `extend-profile` §6–§8, API e2e and Playwright green (Phase B)

**Files:** none in the M4 branch. Same scratch worktree.

**Step 1 (stack window): §6–§8 literally.**
1. `bun run db:reset && bun run db:seed`.
2. Follow SKILL §6 (web), §7 (mobile, code only: the simulator check is Task 4c), and §8 (seed and e2e) as written. Hit each `bun run lint && bun run typecheck` checkpoint.
3. `bun run db:reset && bun run db:seed`: the seed's new block runs without throwing.

**Step 2: The gate.**

```bash
bun run lint && bun run typecheck && bun run test       # db: post-M3 baseline +14; contract +4
cd apps/api && bun run dev   # separate shell
cd apps/api && bun run e2e   # ends "handshake e2e: all checks passed", including the 8b/9 extend-profile lines
cd apps/web && CI=1 bunx playwright test
```

Expected: all green. A Playwright failure on a profile-creating step means a `getByLabel('Affiliation')` fill is missing: fix the spec and log which step the skill's grep missed.

**Step 3:** `git add -A && git commit -m "scratch: extend-profile §6–§8"` (local only). Close the stack window with the hand-back.

**Done 2026-10-12** on `7932548` + the 4a commits. Every §6–§8 checkpoint was green except §7's first lint (`no-shadow`, below). The seed block ran clean (Ada and Lin carry both tiers). Gate: db 86, contract 35, nfc 48; the API e2e ends "handshake e2e: all checks passed" with all eight extend-profile lines; Playwright 14 passed on the first run. The §8 grep found all 12 profile-creating fills (no Playwright miss). Confirmed: a Profile-page save with Contact empty writes a `profile_details` row with `contact_handle` null (a claim-page first profile writes none), and both render no line. Corrections went to §1 and §2 (null wording), §6 (the `ShellRoute` comment, the always-sent `details`), and §7 (the gate parenthetical, the `current` state, the claim title).

---

### Task 4c: `extend-profile` simulator pass (Phase B)

**Files:** none in the M4 branch. Same scratch worktree.

Use the established technique (agent-device + Expo Go + simctl), not the native simulator tool, which refuses to attach on this Mac. Its rules:
- Boot by UDID: `xcrun simctl list devices | grep 'iPhone 17 Pro'`, then `xcrun simctl boot <UDID>`. If agent-device times out on a "Booted" device with no display, shut it down and boot it again by UDID.
- Expo Go for the project's SDK must be installed (`xcrun simctl listapps booted | grep host.exp.Exponent`). If it is missing, stop and ask before downloading it.
- Metro: `cd apps/mobile && bunx expo start --port 8081` (no `CI=1`: CI mode disables reloads). Open the project with `xcrun simctl openurl booted exp://127.0.0.1:8081`; deep links are `exp://127.0.0.1:8081/--/t/<uid>`, never `withme://`.
- Drive with `bunx agent-device … --platform ios --device "iPhone 17 Pro"`. Re-snapshot before every click (refs renumber). Never `keyboard dismiss`: close the keyboard with the on-screen `return` key. Type in chunks, and no chunk may start with `-`. Tap tab-bar items by point from a fresh snapshot.
- Screenshots: `xcrun simctl io booted screenshot ~/dev/withme-scratch/notes/extend-profile-<n>.png`.

**Step 1 (stack window):** `bun run db:reset && bun run db:seed`, the API dev server up (`cd apps/api && bun run dev`), Metro up as above.

**Step 2: The checks**, one screenshot each:
1. A fresh sign-up (a new local test account, recorded in the log) lands on Profile, "Create your profile".
2. Name + Affiliation + Save: the tabs work.
3. Clear Lin's affiliation behind the app's back (Save will not allow an empty one):
   `docker exec supabase_db_withme-starter psql -U postgres -c "update public.profiles set affiliation = null where id = (select id from auth.users where email = 'lin@demo.withme.local')"`.
   Sign in as Lin and relaunch the project: the tabs mount sends her to Profile, "Finish your profile".
4. As Lin, still incomplete, open `exp://127.0.0.1:8081/--/t/04BBBBBBBBBBBB`: Ada's card renders with her affiliation line and no `@ada.listens`. The `t/[uid]` screen is not behind the gate, by design.
5. Restore Lin's affiliation in the app. As Ada, accept Lin's pending request under Connections → Requests: Ada sees `@lin.reads`; signed in as Lin, Lin sees `@ada.listens`.

**Step 3:** Stop Metro and the API. Close the stack window with the hand-back.

**Done 2026-10-12** on `a1a73da`, with no scratch fixes. All five checks passed (screenshots `notes/extend-profile-{1,2,3,4,5,5a,5b}.png`).
- Three of four fresh sign-ups landed on Events. Their first `profile.get` (and, for the first two, also `gatherings.listMine`) got a 500: PostgREST answered 401 `PGRST303` "JWT issued at future". That is a sub-second token race on the local stack, not the scratch code or the skill (`listMine` is untouched by extend-profile). A relaunch sent the account to Profile. §7's checkpoint now says so.
- The `expo start --ios` command in §7 is left as is: it fails only on this Mac's Xcode setup, hence Expo Go + simctl here.
- A follow-up investigation of the race on main has been filed separately.

---

### Task 4d: Write `extend-profile`'s SKILL.md (Phase B)

**Files:**
- Create: `.agents/skills/extend-profile/SKILL.md`

**Step 1: Write the SKILL.md.**
1. Write it from the scratch result (Tasks 2 and 4a–4c, and the log), using the target text below.
2. Consistency check: every path in `git -C ~/dev/withme-scratch/extend-profile diff --name-only origin/main` appears in the skill's map or steps. Every file the skill tells a fork to edit appears in that diff.
3. `grep -n 'M3-CHEC[K]' .agents/skills/extend-profile/SKILL.md` prints nothing.

Target text, to be corrected to the scratch build:

````markdown
---
name: extend-profile
description: Use when a withme-starter fork needs vertical profile fields — a team, a club, a handicap on the card, or contact details only connections may see — or wants signed-in users to finish their profile before using the app. Covers both visibility tiers and the completion gate, contract to mobile.
---

# extend-profile — vertical fields, in two visibility tiers

Every derivation extends the profile (golf-with-me: handicap and home club;
tailgate-with-me `92d2aeb`: team and signature dish). Those forks put every
field on the card. Most verticals also want a second kind of field — a
phone number, a handle — that only people you accepted may read. That
second tier is the part a fork gets wrong alone, so it was built for real,
RLS tests first, before this was written down.

**REQUIRED BACKGROUND:** `docs/the-slice.md`. Both tiers follow the slice
(contract → RLS tests → migration → API → web → mobile → e2e), with one
deliberate swap: the RLS tests come before the migration, so the boundary
is written down before the policy that enforces it. The safety discipline
there binds every step here.

## Pick a tier for every field, first

| | Card tier | Connections tier |
| --- | --- | --- |
| Who reads it | anyone holding your tag (anonymous resolve), the recipient of your pending request, your gathering co-members, someone who blocked you, your connections | you, and your accepted connections while neither has blocked the other |
| Where it lives | a column on `public.profiles` | `public.profile_details`, one row per profile |
| Examples | team, home club, handicap, role | phone, email, social handle |

A field that must not reach a stranger holding your tag is connections
tier. A field nobody else should read is neither: do not collect it.

**Why the connections tier is not a column on `profiles`.** RLS decides
rows, not columns: every viewer `profiles_select` admits reads every column
of the row. In the build this skill was distilled from, a `contact_handle`
column on `profiles` was readable — through PostgREST, with the publishable
key — by a gathering co-member, by the recipient of a pending request, and
by someone who had blocked the owner. No edit to `profiles_select` closes
that without taking away the card those viewers are meant to see.
`profiles_select` stays byte-identical (customize-gathering §3b); the
connections tier gets its own table and its own, narrower policy.

The worked example: a card-tier `affiliation` ("Riverside GC", "Chiefs",
"Acme Corp"; 1–80 chars; required for completion) and a connections-tier
`contact_handle` (1–120 chars; optional). Rename both to your vertical's
words before you start and keep the shapes. A fork with only one tier skips
the other tier's lines.

## The map

| Layer | Card tier | Connections tier |
| --- | --- | --- |
| Contract | `packages/contract/src/schemas/profile.ts` (`ProfileSchema`, `PublicProfileSchema`, `UpdateProfileInputSchema`) | `schemas/profile.ts` (`ProfileDetailsSchema`), `schemas/connection.ts` (`ConnectionSchema.details`), `contract/app.ts` (`profile.get` / `profile.update` outputs) |
| SQL | `public.profiles`; every function that builds a card (`resolve_tag`, `accept_connect_request`) | `public.profile_details` and its policies; `accept_connect_request` |
| RLS tests | `packages/db/test/profile-fields.test.ts` (both tiers), `enumeration.test.ts`, `cascade.test.ts`, `account.test.ts` | same |
| Queries | `CARD_COLUMNS`, `ProfileCard`, `upsertOwnProfile` in `packages/db/src/queries/handshake.ts` | `DETAILS_COLUMNS`, `getOwnDetails`, `upsertOwnDetails`, `listConnections` (same file) |
| API | `apps/api/src/routers/app.ts`: `getProfile`, `updateProfile` | same; `acceptRequest` and `connectionsList` pass it through |
| SDK | `PublicProfileCard` in `packages/nfc-sdk/src/client.ts` | never |
| Web | `components/ProfileCard.tsx`, `_app.profile.tsx`, `claim.$uid.tsx` | `_app.profile.tsx`, `_app.connections.tsx` (its local `PersonRow`) |
| Mobile | `app/t/[uid].tsx`, `(tabs)/profile.tsx`, `claim/[uid].tsx` | `(tabs)/profile.tsx`, `(tabs)/connections.tsx`, `PersonRow` in `components/ui.tsx` |
| Gate | `isProfileComplete` (contract) → web `routes/_app.tsx` (`ShellRoute`), mobile `(tabs)/_layout.tsx` | — |

Outside the tabs, `apps/mobile/app/gathering/[id].tsx` (join),
`apps/mobile/app/t/[uid].tsx` (connect), and `apps/web/src/routes/t.$uid.tsx`
(connect) also call `app.profile.get`, and check only that a profile exists
(`!profile`) before acting. (`claim.$uid.tsx` on both platforms calls it
too, and asks for the required fields itself: §6, §7.) They
intentionally skip the completion gate: it is a UX gate on entering the
shell, not a check every screen repeats, and an incomplete profile is
still a valid card. Their `const { profile } = …` keeps working with the
new `{ profile, details }` output; leave the checks as they are.

## 1. Contract

`packages/contract/src/schemas/profile.ts`, beside the existing schemas:

```ts
/** Card tier: a free-text line on the card. Crosses the anonymous resolve boundary. DB CHECK mirrors it. */
export const CardLineSchema = z.string().min(1).max(80);

/**
 * Connections tier: read only by the owner and accepted connections. Never
 * part of PublicProfileSchema, never on resolve, a pending request, or a
 * gathering member list. DB CHECK mirrors it.
 */
export const ProfileDetailsSchema = z.object({
  contact_handle: z.string().min(1).max(120).nullable(),
});

export type ProfileDetails = z.infer<typeof ProfileDetailsSchema>;
```

- `ProfileSchema` (the owner's own row): add
  `affiliation: CardLineSchema.nullable()`.
- `PublicProfileSchema`'s `pick`: add `affiliation: true`. Nothing from
  `ProfileDetailsSchema` ever joins this pick.
- `UpdateProfileInputSchema`: add
  `affiliation: CardLineSchema.nullable().optional()` and
  `details: ProfileDetailsSchema.optional()`. Its doc comment opens "Name
  and bio."; make it name the new fields too.
- The completion rule, after the `Profile` type:

```ts
/**
 * Fields a profile needs before the signed-in shell opens. A UX gate, never
 * a safety boundary: the columns stay nullable, and no policy or RPC reads
 * completion. Both clients import this one definition.
 */
export const REQUIRED_PROFILE_FIELDS = ['display_name', 'affiliation'] as const satisfies readonly (keyof Profile)[];

export function isProfileComplete(profile: Profile | null | undefined): profile is Profile {
  if (!profile) return false;
  return REQUIRED_PROFILE_FIELDS.every((field) => {
    const value = profile[field];
    return typeof value === 'string' && value.trim() !== '';
  });
}
```

`packages/contract/src/schemas/connection.ts`: `ConnectionSchema` gains
`details: ProfileDetailsSchema.nullable()` — a connection is the one place
the other person's details travel. It is `null` when they have no
`profile_details` row, and `{ contact_handle: null }` when their row holds
no handle (every Profile-page save writes the row, §6); clients read
`details?.contact_handle`, so the two look the same.

`packages/contract/src/contract/app.ts`: `getProfile`'s output becomes
`z.object({ profile: ProfileSchema.nullable(), details: ProfileDetailsSchema.nullable() })`,
and `updateProfile`'s becomes
`z.object({ profile: ProfileSchema, details: ProfileDetailsSchema.nullable() })`.

`packages/contract/test/schemas.test.ts`:

- add `affiliation: null` to every profile-card fixture (the key is
  required-nullable, so every existing fixture fails to parse without it);
- add `'affiliation'` to the expected keys in "exposes only card-safe fields"
  (they are sorted: `['affiliation', 'avatar_path', 'bio', 'display_name', 'id']`);
- add:

```ts
describe('profile tiers', () => {
  const card = {
    id: '9b2c8f43-1b1a-4f7e-9d3c-2a6c1e5b8d90',
    display_name: 'Alex',
    avatar_path: null,
    bio: null,
    affiliation: null,
  };

  it('the card carries the card tier and never the connections tier', () => {
    const keys = Object.keys(PublicProfileSchema.shape);
    expect(keys).toContain('affiliation');
    expect(keys).not.toContain('contact_handle');
    expect(keys).not.toContain('details');
  });

  it('rejects empty and oversized fields in either tier', () => {
    expect(UpdateProfileInputSchema.safeParse({ affiliation: '' }).success).toBe(false);
    expect(UpdateProfileInputSchema.safeParse({ affiliation: 'x'.repeat(81) }).success).toBe(false);
    expect(UpdateProfileInputSchema.safeParse({ details: { contact_handle: '' } }).success).toBe(false);
    expect(
      UpdateProfileInputSchema.safeParse({ details: { contact_handle: 'x'.repeat(121) } }).success,
    ).toBe(false);
  });

  it('a connection always carries the details key, null without a details row', () => {
    const connection = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      created_at: '2026-10-11T00:00:00Z',
      profile: card,
    };
    expect(ConnectionSchema.safeParse(connection).success).toBe(false);
    expect(ConnectionSchema.safeParse({ ...connection, details: null }).success).toBe(true);
  });

  it('completion needs every required field, not just a row', () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(isProfileComplete({ display_name: 'Alex', affiliation: null } as Profile)).toBe(false);
    expect(isProfileComplete({ display_name: 'Alex', affiliation: '  ' } as Profile)).toBe(false);
    expect(isProfileComplete({ display_name: 'Alex', affiliation: 'Riverside GC' } as Profile)).toBe(true);
  });
});
```

(import `ConnectionSchema`, `isProfileComplete`, `UpdateProfileInputSchema`
and `type Profile` from `'../src/index.ts'`).

**Checkpoint:** `cd packages/contract && bun test` — all green, four more
than before.

## 2. RLS tests, red first

New file `packages/db/test/profile-fields.test.ts`:

```ts
// extend-profile: two visibility tiers. The card tier rides every card; the
// connections tier reaches the owner and accepted connections only. The
// negative space is the spec: every viewer profiles_select admits beyond a
// connection (pending-request recipient, gathering co-member, blocker) and
// anon read nothing from profile_details, and get no oracle trying.
import { beforeAll, describe, expect, it } from 'bun:test';
import {
  admin,
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
  pendingRequestId,
  provisionTag,
  type TestUser,
} from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

async function setDetails(user: TestUser, contact_handle: string): Promise<void> {
  const { error } = await user.client
    .from('profile_details')
    .insert({ profile_id: user.id, contact_handle });
  expect(error).toBeNull();
}

/** Invisible means an empty, error-free select: a policy error is not invisibility. */
async function expectNoDetails(viewer: TestUser, owner: TestUser): Promise<void> {
  const { data, error } = await viewer.client
    .from('profile_details')
    .select('contact_handle')
    .eq('profile_id', owner.id);
  expect(error).toBeNull();
  expect(data).toEqual([]);
}

async function seesCard(viewer: TestUser, owner: TestUser): Promise<boolean> {
  const { data, error } = await viewer.client.from('profiles').select('id').eq('id', owner.id);
  expect(error).toBeNull();
  return (data ?? []).length === 1;
}

describe('card tier', () => {
  it('rides the anonymous resolve', async () => {
    const alice = await createTestUser('Alice');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });
    const { error } = await alice.client
      .from('profiles')
      .update({ affiliation: 'Riverside GC' })
      .eq('id', alice.id);
    expect(error).toBeNull();

    const { data } = await anonClient().rpc('resolve_tag', { p_uid: uid });
    const resolved = data as { status: string; profile: { affiliation: string | null } };
    expect(resolved.status).toBe('claimed');
    expect(resolved.profile.affiliation).toBe('Riverside GC');
  });

  it('is length-checked at the database boundary', async () => {
    const alice = await createTestUser('Alice');
    for (const affiliation of ['', 'x'.repeat(81)]) {
      const { error } = await alice.client.from('profiles').update({ affiliation }).eq('id', alice.id);
      expect(error?.message).toContain('profiles_affiliation_length');
    }
  });

  it('rides the card accept returns', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await alice.client.from('profiles').update({ affiliation: 'Riverside GC' }).eq('id', alice.id);
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    const { data, error } = await bob.client.rpc('accept_connect_request', {
      p_request_id: await pendingRequestId(alice, bob),
    });
    expect(error).toBeNull();
    expect((data as { profile: { affiliation: string | null } }).profile.affiliation).toBe(
      'Riverside GC',
    );
  });
});

describe('connections tier', () => {
  it('the owner writes and reads their own row, which carries the tenant seam', async () => {
    const alice = await createTestUser('Alice');
    await setDetails(alice, '@alice');
    const { data: updated, error } = await alice.client
      .from('profile_details')
      .update({ contact_handle: '@alice2' })
      .eq('profile_id', alice.id)
      .select('contact_handle');
    expect(error).toBeNull();
    expect(updated).toEqual([{ contact_handle: '@alice2' }]);
    const { data: row } = await admin
      .from('profile_details')
      .select('tenant_id')
      .eq('profile_id', alice.id)
      .single();
    expect(row?.tenant_id).toBeTruthy();
  });

  it('an accepted connection reads it, both ways', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice');
    await setDetails(bob, '@bob');
    await connectUsers(alice, bob);
    const { data: aliceSees } = await alice.client
      .from('profile_details')
      .select('contact_handle')
      .eq('profile_id', bob.id);
    const { data: bobSees } = await bob.client
      .from('profile_details')
      .select('contact_handle')
      .eq('profile_id', alice.id);
    expect(aliceSees).toEqual([{ contact_handle: '@bob' }]);
    expect(bobSees).toEqual([{ contact_handle: '@alice' }]);
  });

  it('a stranger and anon read nothing', async () => {
    const alice = await createTestUser('Alice');
    const stranger = await createTestUser('Stranger');
    await setDetails(alice, '@alice');
    await expectNoDetails(stranger, alice);
    const { data, error } = await anonClient().from('profile_details').select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('a pending-request recipient sees the card, not the details', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice');
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    expect(await seesCard(bob, alice)).toBe(true);
    await expectNoDetails(bob, alice);
  });

  it('a gathering co-member sees the card, not the details, even through an embed', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice');
    // If customize-gathering changed create_gathering's arguments, pass them here too.
    const { data: gathering, error } = await alice.client.rpc('create_gathering', {
      p_title: 'Rooftop listening session',
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(error).toBeNull();
    const { error: joinError } = await bob.client.rpc('join_gathering', {
      p_gathering_id: (gathering as { id: string }).id,
    });
    expect(joinError).toBeNull();

    expect(await seesCard(bob, alice)).toBe(true);
    await expectNoDetails(bob, alice);
    const { data: embedded } = await bob.client
      .from('profiles')
      .select('id, details:profile_details(contact_handle)')
      .eq('id', alice.id);
    expect(embedded).toEqual([{ id: alice.id, details: null }]);
  });

  it('a block ends access both ways, and the blocker does not inherit it', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice');
    await setDetails(bob, '@bob');
    await connectUsers(alice, bob);
    const { error } = await bob.client
      .from('blocks')
      .insert({ blocker_id: bob.id, blocked_id: alice.id });
    expect(error).toBeNull();

    // the blocker still sees the blocked card (their block list) ...
    expect(await seesCard(bob, alice)).toBe(true);
    // ... but neither reads the other's details any more
    await expectNoDetails(bob, alice);
    await expectNoDetails(alice, bob);
  });

  it('resolve_tag never carries it, not even for a connection', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice.private');
    await connectUsers(alice, bob);
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });
    for (const client of [anonClient(), bob.client]) {
      const { data, error } = await client.rpc('resolve_tag', { p_uid: uid });
      expect(error).toBeNull();
      expect(JSON.stringify(data)).not.toContain('@alice.private');
    }
  });

  it('accept hands the new connection the requester details, null without a details row', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    await setDetails(alice, '@alice');
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    const { data, error } = await bob.client.rpc('accept_connect_request', {
      p_request_id: await pendingRequestId(alice, bob),
    });
    expect(error).toBeNull();
    expect((data as { details: unknown }).details).toEqual({ contact_handle: '@alice' });

    await carol.client.rpc('send_connect_request', { p_recipient: bob.id });
    const { data: bare } = await bob.client.rpc('accept_connect_request', {
      p_request_id: await pendingRequestId(carol, bob),
    });
    expect((bare as { details: unknown }).details).toBeNull();
  });

  it("writing another profile's details is refused the same way whether or not a row exists", async () => {
    const alice = await createTestUser('Alice');
    const carol = await createTestUser('Carol');
    const mallory = await createTestUser('Mallory');
    await setDetails(alice, '@alice'); // alice has a row; carol does not; the third id is nobody

    const refusals: Array<{ code?: string; message?: string }> = [];
    for (const profile_id of [alice.id, carol.id, crypto.randomUUID()]) {
      const { error } = await mallory.client
        .from('profile_details')
        .insert({ profile_id, contact_handle: '@mallory' });
      refusals.push({ code: error?.code, message: error?.message });
    }
    expect(refusals[0]?.code).toBe('42501');
    expect(refusals[1]).toEqual(refusals[0]);
    expect(refusals[2]).toEqual(refusals[0]);

    // an update aimed at someone else's row changes nothing, silently
    const { data: touched, error } = await mallory.client
      .from('profile_details')
      .update({ contact_handle: '@mallory' })
      .eq('profile_id', alice.id)
      .select('contact_handle');
    expect(error).toBeNull();
    expect(touched).toEqual([]);
    const { data: kept } = await admin
      .from('profile_details')
      .select('contact_handle')
      .eq('profile_id', alice.id)
      .single();
    expect(kept?.contact_handle).toBe('@alice');
  });

  it('profile_id and tenant_id are immutable through the client', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    await setDetails(alice, '@alice');
    const { error: rekey } = await alice.client
      .from('profile_details')
      .update({ profile_id: bob.id })
      .eq('profile_id', alice.id);
    expect(rekey?.code).toBe('42501');
    const { error: retenant } = await alice.client
      .from('profile_details')
      .update({ tenant_id: crypto.randomUUID() })
      .eq('profile_id', alice.id);
    expect(retenant?.code).toBe('42501');
  });

  it('is length-checked at the database boundary', async () => {
    const alice = await createTestUser('Alice');
    await setDetails(alice, '@alice');
    for (const contact_handle of ['', 'x'.repeat(121)]) {
      const { error } = await alice.client
        .from('profile_details')
        .update({ contact_handle })
        .eq('profile_id', alice.id);
      expect(error?.message).toContain('profile_details_contact_handle_length');
    }
  });
});
```

**What the block test proves.** Inserting the block fires the
`on_block_created` trigger, which deletes the pair's connection (and any
pending request), and `accept_connect_request` refuses a blocked pair. So
after a block there is no connection left for the policy's `exists` to
find: the test exercises the trigger. The policy's two `is_blocked`
clauses are defense in depth, for a connection row that outlives a block
some other way; keep them.

Three existing files grow. Every addition checks `error`: a `data ?? []`
assertion passes against a table that does not exist, which is a false
red-phase green.

- `enumeration.test.ts`, "anon cannot select any rows from any handshake
  table": do not add `'profile_details'` to the loop's list (its
  `data ?? []` would pass on a missing table). After the loop, add:

  ```ts
      // Connections tier: anon holds Supabase's default select grant and no
      // policy, so RLS answers with an empty, error-free result. A permission
      // error would also hide the rows, but it is not what this schema does;
      // an error here means the table is missing or a grant changed.
      const { data: details, error: detailsError } = await anon.from('profile_details').select('*');
      expect(detailsError).toBeNull();
      expect(details).toEqual([]);
  ```

- `cascade.test.ts` (deletion through the auth admin API,
  `admin.auth.admin.deleteUser`): after Alice is created, give her a row
  and check it landed:

  ```ts
      const { error: detailsError } = await alice.client
        .from('profile_details')
        .insert({ profile_id: alice.id, contact_handle: '@alice' });
      expect(detailsError).toBeNull();
  ```

  and after the deletion (the test already declares `error`, so these are
  renamed):

  ```ts
      // Connections tier: gone with the profile (foreign-key cascade).
      const { data: details, error: detailsReadError } = await admin
        .from('profile_details')
        .select('*')
        .eq('profile_id', alice.id);
      expect(detailsReadError).toBeNull();
      expect(details).toEqual([]);
  ```

- `account.test.ts` (deletion as the account holder does it:
  `delete_my_account()`, a definer function that deletes the caller's
  `auth.users` row, so the same foreign-key cascade runs). In the first
  test, "removes the caller and cascades: …", insert the same row right
  after the four users are created, with the same error check, and among
  the assertions after `delete_my_account` add, with the file's own helper:

  ```ts
      expectEmpty(await admin.from('profile_details').select('*').eq('profile_id', alice.id));
  ```

  Keep both deletion paths: the cascade test pins the foreign key, the
  account test the route a real user takes. No change to
  `delete_my_account`, the `app.profile.deleteAccount` comment, or either
  client's `DELETE_COPY` (`components/AccountSection.tsx`): the details
  row is part of "your profile" and goes with it.

**Checkpoint (red):** `cd packages/db && bun test` — the fourteen new
tests, the cascade test, the first `delete_my_account` test in
`account.test.ts`, and the enumeration test "anon cannot select any rows
from any handshake table" fail, each on the missing table or column
(an `error` that is not null, or a missing `profiles_affiliation_length`).
A new test that passes now asserts nothing: fix it before going on. `bun
run typecheck` is red for `@withme/db` until §3 regenerates the types.

## 3. Migration — both tiers, one additive file

New file `supabase/migrations/<UTC-timestamp>_extend_profile.sql`:

```sql
-- extend-profile: vertical fields in two visibility tiers.
--
--   Card tier: columns on public.profiles. They ride every card (the
--   anonymous resolve, a pending request, a gathering member list, a block
--   list, a connection), so everyone profiles_select admits reads them.
--
--   Connections tier: public.profile_details, one row per profile, readable
--   by the owner and by accepted connections with no block in either
--   direction. Never columns on profiles: RLS decides rows, and every viewer
--   of a profiles row reads every column of it.
--
-- profiles_select is not touched. The CHECKs mirror @withme/contract.

-- =============================================================== card tier ==

alter table public.profiles
  add column affiliation text
    constraint profiles_affiliation_length
    check (affiliation is null or char_length(affiliation) between 1 and 80);

-- ======================================================== connections tier ==

create table public.profile_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  tenant_id uuid not null default private.current_tenant_id(),
  contact_handle text
    constraint profile_details_contact_handle_length
    check (contact_handle is null or char_length(contact_handle) between 1 and 120),
  updated_at timestamptz not null default now()
);

create trigger profile_details_set_updated_at
  before update on public.profile_details
  for each row execute function private.set_updated_at();

alter table public.profile_details enable row level security;

-- The owner writes their own row. profile_id and tenant_id are immutable
-- through the client (the tags column-grant idiom). No delete policy:
-- account deletion cascades through the foreign key.
revoke insert, update on public.profile_details from authenticated;
grant insert (profile_id, contact_handle) on public.profile_details to authenticated;
grant update (contact_handle) on public.profile_details to authenticated;

-- The owner, or an accepted connection with no block either way. Nothing
-- else: not a pending request, not a shared gathering, not the blocker.
create policy profile_details_select on public.profile_details
  for select to authenticated
  using (
    tenant_id = private.current_tenant_id()
    and (
      profile_id = (select auth.uid())
      or (
        not private.is_blocked((select auth.uid()), profile_id)
        and not private.is_blocked(profile_id, (select auth.uid()))
        and exists (
          select 1 from public.connections c
          where (c.user_a = (select auth.uid()) and c.user_b = profile_details.profile_id)
             or (c.user_b = (select auth.uid()) and c.user_a = profile_details.profile_id)
        )
      )
    )
  );

create policy profile_details_insert_own on public.profile_details
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and tenant_id = private.current_tenant_id());

create policy profile_details_update_own on public.profile_details
  for update to authenticated
  using (profile_id = (select auth.uid()) and tenant_id = private.current_tenant_id())
  with check (profile_id = (select auth.uid()) and tenant_id = private.current_tenant_id());
```

**Every function that builds a card** gets the card tier. Find them:

```sh
grep -ln "'display_name', v_profile.display_name" supabase/migrations/*.sql
```

It lists every file that ever defined a card builder, not only the newest
(in the starter: the initial schema, `add_gatherings`, and `avatars`). In
the starter the functions are `public.resolve_tag` and
`public.accept_connect_request`. Find each one's **newest** definition,
the last file that defines it:

```sh
grep -l 'function public.resolve_tag' supabase/migrations/*.sql | grep -v _extend_profile | sort | tail -1
grep -l 'function public.accept_connect_request' supabase/migrations/*.sql | grep -v _extend_profile | sort | tail -1
```

In the starter both print `supabase/migrations/20261011120000_avatars.sql`.
The `grep -v` matters when you redo this migration, after a rebase for
instance: it already defines both functions and would otherwise be its own
newest. Copy each newest definition whole into this migration as `create or replace
function`, restating every attribute (`language plpgsql`, `stable` or
`volatile`, `security definer`, `set search_path = ''`). Then:

- in the `'profile', jsonb_build_object(…)` add
  `'affiliation', v_profile.affiliation`;
- in `accept_connect_request` only: declare `v_details jsonb := null;`, add
  after the `select * into v_profile …` line

  ```sql
    -- The pair is connected now (inserted above), so the requester's
    -- connections tier is the new connection's to read. No row: stays null.
    select jsonb_build_object('contact_handle', d.contact_handle) into v_details
      from public.profile_details d
     where d.profile_id = v_req.requester_id;
  ```

  and add `'details', v_details` beside `'profile'` in the returned object.

`resolve_tag` never reads `profile_details`. Same signatures keep their
grants.

```sh
bun run db:reset && bun run db:seed && bun run db:types
```

**Checkpoint (green):** `db:reset` ends `Finished supabase db reset`;
`cd packages/db && bun test` is all green, fourteen more than before;
`git diff packages/db/src/types/supabase.ts` shows `affiliation` and a
`profile_details` table — commit it.

## 4. Queries and API

`packages/db/src/queries/handshake.ts`:

- `CARD_COLUMNS`: append `, affiliation`. `ProfileCard`: add
  `affiliation: string | null`. Gathering member lists and block lists use
  the same constant, so they carry the card tier with no further change.
- `upsertOwnProfile`: its patch type is
  `{ display_name?: string; bio?: string | null }`; add
  `affiliation?: string | null`. In the first-create `.insert({ id, display_name, bio })`,
  add `affiliation: patch.affiliation ?? null` after `bio`. The update path
  and the `23505` race retry send `patch` whole, so they need nothing. (The
  avatar is not in this patch: `setOwnAvatarPath` in `queries/avatars.ts`
  owns it.)
- The connections tier:

```ts
/** Connections tier. Never part of CARD_COLUMNS: RLS lets only the owner and connections read it. */
export const DETAILS_COLUMNS = 'contact_handle';

export interface ProfileDetails {
  contact_handle: string | null;
}

export async function getOwnDetails(db: Db, userId: string): Promise<ProfileDetails | null> {
  const { data, error } = await db
    .from('profile_details')
    .select(DETAILS_COLUMNS)
    .eq('profile_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Update, then insert. Not .upsert(): PostgREST's ON CONFLICT DO UPDATE sets
 * every payload column, profile_id included, and the column grant forbids
 * updating it, so Postgres refuses every upsert (42501), the first save
 * included. The profile row must exist first (foreign key).
 */
export async function upsertOwnDetails(
  db: Db,
  userId: string,
  details: ProfileDetails,
): Promise<ProfileDetails> {
  const update = () =>
    db
      .from('profile_details')
      .update(details)
      .eq('profile_id', userId)
      .select(DETAILS_COLUMNS)
      .maybeSingle();
  const { data: updated, error } = await update();
  if (error) throw error;
  if (updated) return updated;
  const { data, error: insertError } = await db
    .from('profile_details')
    .insert({ profile_id: userId, ...details })
    .select(DETAILS_COLUMNS)
    .single();
  if (insertError) {
    // Lost a create race (two first saves): the row exists now, update it.
    if (insertError.code === '23505') {
      const { data: raced, error: retryError } = await update();
      if (retryError) throw retryError;
      if (raced) return raced;
    }
    throw insertError;
  }
  return data;
}
```

- `listConnections`: embed the tier under each side's card, and lift it out:

```ts
       a:profiles!connections_user_a_fkey(${CARD_COLUMNS}, details:profile_details(${DETAILS_COLUMNS})),
       b:profiles!connections_user_b_fkey(${CARD_COLUMNS}, details:profile_details(${DETAILS_COLUMNS}))`,
```

```ts
  return (data ?? []).flatMap((row) => {
    const other = row.user_a === userId ? row.b : row.a;
    if (!other) return [];
    const { details, ...profile } = other;
    return [{ id: row.id, created_at: row.created_at, profile, details: details ?? null }];
  });
```

  and `ConnectionRow` gains `details: ProfileDetails | null`. (The primary
  key is the foreign key, so PostgREST embeds one object or null; if your
  generated types say array, the relationship lost `isOneToOne` — check the
  migration, not the mapper.)

`apps/api/src/routers/app.ts` (import `getOwnDetails`, `upsertOwnDetails`):

```ts
const getProfile = appProcedure.profile.get.handler(async ({ context }) => {
  const userId = requireUser(context);
  const [profile, details] = await run(context, () =>
    Promise.all([getOwnProfile(context.db, userId), getOwnDetails(context.db, userId)]),
  );
  return { profile: profile as Profile | null, details };
});

const updateProfile = appProcedure.profile.update.handler(async ({ input, context }) => {
  const userId = requireUser(context);
  const { details, ...patch } = input;
  // The profile first: the details row references it.
  const profile = await run(context, () =>
    Object.keys(patch).length > 0
      ? upsertOwnProfile(context.db, userId, patch)
      : getOwnProfile(context.db, userId),
  );
  if (!profile) throw new ORPCError('BAD_REQUEST', { message: 'Profile required' });
  const saved = await run(context, () =>
    details ? upsertOwnDetails(context.db, userId, details) : getOwnDetails(context.db, userId),
  );
  return { profile: profile as Profile, details: saved };
});
```

`acceptRequest` and `connectionsList` need no change: the RPC's `details`
and the query's rows pass straight through, and the contract validates
them. `uploadAvatar`, `removeAvatar`, and `deleteAccount` need none either:
the photo endpoints keep returning `{ profile }` alone.

**Checkpoint:** `bunx turbo run typecheck --continue` — `@withme/api` and
`@withme/db` green; `@withme/nfc` red until §5. (Plain `bun run typecheck`
stops scheduling at the first failure: uncached, `@withme/nfc` fails and
`@withme/api` never runs.)

## 5. SDK mirror (card tier only)

`packages/nfc-sdk/src/client.ts`: `PublicProfileCard` gains
`affiliation: string | null;`. The connections tier never appears in the
SDK — nothing it resolves may carry it.

**Checkpoint:** `bun run --cwd packages/nfc-sdk typecheck` — clean (it must
be the typecheck: the parity assertions are type-level).

## 6. Web

- `apps/web/src/components/ProfileCard.tsx`: `CardProfile` gains
  `affiliation: string | null`; under the name,
  `{profile.affiliation ? <p className="hint">{profile.affiliation}</p> : null}`.
- **The gate**, `apps/web/src/routes/_app.tsx`. The loader passes the
  details through, and `ShellRoute` — the layout's component, which already
  sends a session without a profile to `/profile` with a `<Navigate>` —
  widens its `!profile` check. Keep it in the component: the comment above
  `ShellRoute` explains why a `throw redirect` from the loader blanks the
  page. Import `isProfileComplete` from `@withme/contract`, then the two
  edits below, and make that comment's opening line ("A session without a
  profile is sent to create one") say "without a complete profile
  (`isProfileComplete`)" and "create or finish one":

```ts
  loader: async () => {
    const { profile, details } = await asSignedInAccount(() => api.app.profile.get());
    return { profile, details };
  },
```

```tsx
  if (!isProfileComplete(profile) && pathname !== '/profile') {
```

- `apps/web/src/routes/_app.profile.tsx`. The page is `IdentityForm`
  (one `<form className="card">`: the heading, `AvatarField` once a profile
  exists, Name, Bio, the `role="status"` line, Save), then `MyTags`, then
  `AccountSection`. Only `ProfilePage`'s read and `IdentityForm` change. `ProfilePage` reads
  `const { profile, details } = useLoaderData({ from: '/_app' });` and
  renders `<IdentityForm profile={profile} details={details} />`;
  `IdentityForm` takes `details: ProfileDetails | null` (import the type
  from `@withme/contract`) and adds

```tsx
const [affiliation, setAffiliation] = useState(profile?.affiliation ?? '');
const [contact, setContact] = useState(details?.contact_handle ?? '');
```

  the `api.app.profile.update` payload in `save` gains

```ts
  affiliation: affiliation.trim() === '' ? null : affiliation.trim(),
  details: { contact_handle: contact.trim() === '' ? null : contact.trim() },
```

  (`details` is always sent, so the first save here creates the
  `profile_details` row even with Contact empty. From then on accept and
  the connections list return `{ contact_handle: null }` for that person,
  not `null`. Both render nothing: every reader goes through
  `details?.contact_handle`. Do not special-case the empty field.)

  the `<h1>` becomes
  `{!profile ? 'Create your profile' : isProfileComplete(profile) ? 'Your profile' : 'Finish your profile'}`,
  Save's `disabled` becomes `busy || !displayName.trim() || !affiliation.trim()`,
  and the fields go after Bio, before the status line:

```tsx
<div className="field">
  <label htmlFor="affiliation">Affiliation</label>
  <input
    id="affiliation"
    required
    maxLength={80}
    placeholder="Your club, team, or company"
    value={affiliation}
    onChange={(e) => setAffiliation(e.target.value)}
  />
</div>
<div className="field">
  <label htmlFor="contact_handle">Contact</label>
  <input
    id="contact_handle"
    maxLength={120}
    placeholder="Phone, email, or handle"
    aria-describedby="contact_handle-hint"
    value={contact}
    onChange={(e) => setContact(e.target.value)}
  />
  <p className="hint" id="contact_handle-hint">Only your connections see this.</p>
</div>
```

- `apps/web/src/routes/claim.$uid.tsx`, the inline first-profile form: every
  place that creates a profile asks for the required fields. Add an
  `affiliation` state and the same Affiliation field, send
  `{ display_name, affiliation }`, disable Continue until both are filled,
  and retitle it "First, your card".
- `apps/web/src/routes/_app.connections.tsx`. Every list renders the
  file's local `PersonRow` (`profile`, `sub`, children), which shows one
  `sub` line. Give it a second, optional line:

```tsx
function PersonRow({
  profile,
  sub,
  detail,
  children,
}: {
  profile: CardProfile;
  sub?: string | null;
  detail?: string | null;
  children: ReactNode;
}) {
```

  and after its `{sub ? <span className="sub">{sub}</span> : null}`:

```tsx
        {detail ? <span className="sub">{detail}</span> : null}
```

  Then only the Connections segment (the default, no `?tab`) passes it:
  `detail={connection.details?.contact_handle}` on its `PersonRow`. The
  Requests and Blocked segments may pass the card tier as `detail`
  (`request.requester.affiliation`, `block.user.affiliation`); they never
  show details (they do not have them).

No new CSS: `.hint`, `.sub`, and `.field` exist. Tokens only.

**Checkpoint:** `bun run lint && bun run typecheck`.

## 7. Mobile

- `apps/mobile/app/t/[uid].tsx`, both card branches, after `<Title>`:
  `{result.profile.affiliation ? <Muted>{result.profile.affiliation}</Muted> : null}`.
- **The gate**, `apps/mobile/app/(tabs)/_layout.tsx` (web's is `ShellRoute`
  in `routes/_app.tsx`): once per signed-in account, on entering the tabs.

```tsx
import { isProfileComplete } from '@withme/contract';
import { router, Tabs } from 'expo-router';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/use-session';

// inside TabsLayout, before the return:
const { session } = useSession();
const userId = session?.user.id;
// A failed check never locks anyone out: the screens' own states handle errors.
useEffect(() => {
  if (!userId) return;
  let live = true;
  api.app.profile
    .get()
    .then(({ profile }) => {
      if (live && !isProfileComplete(profile)) router.navigate('/profile');
    })
    .catch(() => undefined);
  return () => {
    live = false;
  };
}, [userId]);
```

- `apps/mobile/app/(tabs)/profile.tsx`. The screen is one identity `Card`
  (`Title`, `AvatarPicker` once a profile exists, the Name and Bio
  `Field`s, the status and error lines, the Save `Button`), then
  `<MyTags />`, then `<AccountSection />`; only the `Card` changes. Add
  `affiliation` and `contact` state. `load` reads
  `({ profile, details }: { profile: Profile | null; details: ProfileDetails | null })`
  (its annotation today names `profile` alone; import `ProfileDetails` from
  `@withme/contract`) and sets them from `profile.affiliation` and
  `details?.contact_handle`. `save` sends the same payload as web. For the
  `Title`, keep the loaded or saved `Profile` in state (`load` has it, and
  `api.app.profile.update` returns it) and apply web's rule with
  `isProfileComplete`. Do not name that state `profile`: `load`'s
  destructure and `AvatarPicker`'s `onChange={(profile) => …}` would shadow
  it, and `oxlint --deny-warnings` fails on `no-shadow`. Use
  `const [current, setCurrent] = useState<Profile | null>(null);`, then
  `setCurrent(profile)` in `load`, `setCurrent(saved.profile)` after the
  update in `save`, and
  `{!current ? 'Create your profile' : isProfileComplete(current) ? 'Your profile' : 'Finish your profile'}`.
  After the Bio `Field`:

```tsx
<Field
  label="Affiliation"
  value={affiliation}
  onChangeText={setAffiliation}
  maxLength={80}
  placeholder="Your club, team, or company"
/>
<Field
  label="Contact"
  value={contact}
  onChangeText={setContact}
  maxLength={120}
  autoCapitalize="none"
  placeholder="Phone, email, or handle"
/>
<Muted>Only your connections see your contact.</Muted>
```

  with Save disabled until name and affiliation are filled.
- `apps/mobile/app/claim/[uid].tsx`: the Affiliation field in the
  first-profile form, sent with the name; Continue disabled until both are
  filled; the `Title` "First, your name" becomes "First, your card", as on
  web.
- `PersonRow` in `apps/mobile/components/ui.tsx` (`name`, `path`, `sub`,
  children) gains `detail?: string | null`, rendered after the `sub` `Text`
  as a second `Text` with the same `numberOfLines={2}` and
  `[styles.personSub, { color: t.inkMuted }]`, when non-null. In
  `apps/mobile/app/(tabs)/connections.tsx`, the Connections segment's
  `PersonRow` passes `detail={connection.details?.contact_handle}`; the
  Requests and Blocked segments may pass the card tier's `affiliation`,
  never details.

**Checkpoint:** `bun run lint && bun run typecheck`, then a simulator pass
(`cd apps/mobile && bunx expo start --ios --clear`, API dev server up): a
new account lands on Profile and cannot be left incomplete without being
sent back on the next tabs mount; two connected accounts see each other's
contact in Connections; a tag resolve shows the affiliation and no contact.

On the local stack a brand-new sign-up can land on Events instead. The
first API calls made within a second of sign-up can hit PostgREST's
`PGRST303` ("JWT issued at future"; the API logs "unexpected database
error"), and the gate fails open by design. Relaunch and the account is
sent to Profile. Every tab's first call can fail the same way, so it does
not come from the gate.

## 8. Seed and e2e

`supabase/seed/index.ts`, after the two `createDemoUser` lines:

```ts
// extend-profile: both demo users fill both tiers. They are not connected
// (Lin's request is pending, and they share a gathering), so each sees the
// other's affiliation and neither sees the other's contact — the boundary,
// in the demo.
for (const [user, affiliation, contact_handle] of [
  [ada, 'Loom St Listening Club', '@ada.listens'],
  [lin, 'Riverside Readers', '@lin.reads'],
] as const) {
  const { error: cardError } = await user.client
    .from('profiles')
    .update({ affiliation })
    .eq('id', user.id);
  if (cardError) throw cardError;
  const { error: detailsError } = await user.client
    .from('profile_details')
    .insert({ profile_id: user.id, contact_handle });
  if (detailsError) throw detailsError;
}
```

`apps/api/e2e/handshake.e2e.ts`:

- after §8 (profile round-trip):

```ts
// 8b. extend-profile: the card tier rides every card, the connections tier only a connection
const extended = await bobApp.profile.update({
  affiliation: 'E2E Club',
  details: { contact_handle: '@e2e.bob' },
});
assert(extended.profile.affiliation === 'E2E Club', 'profile.update writes the card tier');
assert(extended.details?.contact_handle === '@e2e.bob', 'profile.update writes the connections tier');
assert(
  (await bobApp.profile.get()).details?.contact_handle === '@e2e.bob',
  'profile.get returns own details',
);
await aliceApp.profile.update({ details: { contact_handle: '@e2e.alice' } });
```

- in §9, after the inbox assertions:

```ts
assert(inbox.requests[0]?.requester.affiliation === 'E2E Club', 'the requester card carries the card tier');
assert(!JSON.stringify(inbox).includes('@e2e.bob'), 'a pending request never carries the connections tier');
```

- in §9, after `accepted` and the two lists:

```ts
assert(accepted.connection.details?.contact_handle === '@e2e.bob', 'accept hands the new connection the details');
assert(bobConns.connections[0]?.details?.contact_handle === '@e2e.alice', 'a connection reads the other side\'s details');
assert(!JSON.stringify(await anon.resolve(uid)).includes('@e2e.alice'), 'resolve never carries the connections tier');
```

`apps/web/e2e/`: affiliation is required for completion, so every step
that creates a profile — `grep -n "getByLabel('Name').fill" apps/web/e2e/*.ts`,
on the Profile form and the claim page's first-profile form, including the
shared `signUpWithProfile` and `claimFreshTag` in `helpers.ts` — fills
`getByLabel('Affiliation')` right after (steps that only assert a Name
value need nothing). Then extend `handshake.spec.ts`, after its last
assertion (Bob sees Smoke Ada under `/connections`):

```ts
  // --- extend-profile: the connections tier reaches the new connection ------
  await ada.goto('/profile');
  await ada.getByLabel('Contact', { exact: true }).fill('@smoke.ada');
  // exact: a staged My tags row adds a "Save where … points" button
  await ada.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(ada.getByText('Saved.')).toBeVisible();
  await bob.goto('/connections'); // the Connections segment is the default
  await expect(bob.getByText('@smoke.ada')).toBeVisible();
```

## 9. The gate

The verification gate from `docs/the-slice.md`, then
`cd apps/api && bun run e2e` (API dev server in another shell) ending
`handshake e2e: all checks passed`, and
`cd apps/web && bun run test:e2e`.

## What must not move

1. `profiles_select` stays byte-identical, and `profiles` keeps no anon
   policy. Never widen either to deliver a field.
2. A connections-tier field never lives on `profiles`, and never appears in
   `CARD_COLUMNS`, `PublicProfileSchema`, the SDK's `PublicProfileCard`,
   `resolve_tag`, a pending request, a gathering member list, or a block
   list.
3. `profile_details_select` admits the owner, or an accepted connection
   with no block in either direction — nothing else. A gathering, request,
   or "nearby" clause makes the field card tier: move the field instead.
4. Writes are the owner's own row only; `profile_id` and `tenant_id` stay
   out of the update grant; there is no delete policy (account deletion
   cascades through the foreign key).
5. Exactly one definer function reads `profile_details`:
   `accept_connect_request`, after it has inserted the connection.
   `resolve_tag` never does.
6. Writing someone else's details fails the same way whether or not they
   have a row, and for an id that is nobody's: no existence oracle.
7. Completion is UX: no policy, RPC, or constraint reads it, and the
   columns stay nullable, so the claim flow's first profile and every
   pre-existing row stay valid. `isProfileComplete` is the only definition;
   both clients import it from the contract.
8. The new table carries the tenant seam, and every policy predicates on it.

## Scope notes

- Typed fields (a numeric handicap, an enum) take the same steps; the CHECK
  mirrors the zod rule (golf-with-me used a numeric range CHECK).
- Per-field visibility toggles — the owner choosing a tier per field — are a
  third tier with their own policy and tests; not in this skill.
- A multi-step onboarding flow: point the gate at a focused route outside
  the shell (like `claim.$uid.tsx`) instead of `/profile`. The gate stays
  one function.
- Search or filtering by a field value ("everyone at Riverside GC") is an
  enumeration surface: never.
````

**Step 2: Commit.**

```bash
cd ~/dev/withme-starter/.claude/worktrees/derivation-skills
grep -rn 'M3-CHEC[K]' .agents/skills/extend-profile && exit 1
git add .agents/skills/extend-profile/SKILL.md
git commit -m "Add extend-profile: vertical fields in two visibility tiers

Card-tier columns ride every card; the connections tier lives in its own
table whose policy admits the owner and accepted connections only. A
column on profiles would leak to pending-request recipients, gathering
co-members, and blockers (proven red in the scratch build), so
profiles_select stays as it is. Completion gating is a UX gate over one
contract function. Distilled from tailgate-with-me 92d2aeb plus a full
red-first build.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Done 2026-10-12.** `.agents/skills/extend-profile/SKILL.md` was written from the target text above, matched to the scratch diff (`scratch/extend-profile` @ `a1a73da`) and the run log. The committed SKILL.md is now the authority; the target text above is not re-synced. Where the SKILL.md differs from the target:
- Map: full app prefixes (`apps/web/src/`, `apps/mobile/`), and a Seed / e2e row naming all four web e2e files the build touched.
- §1: the `UpdateProfileInputSchema` comment's new wording; the pre-edit contract red (four fail in the starter, and which); five fixtures; the keys sorted by `.toSorted()`; `UpdateProfileInputSchema` is already imported; the describe is appended at the end of the file.
- §2: "rides the card accept returns" checks its `affiliation` update's error (Phase A correction 1); the red checkpoint names `PGRST205` / `PGRST204` (Phase A correction 2); the exact placement of the cascade and account additions.
- §3: how to pick the timestamp; a "Newest: …" comment over each copied body; diff each copy against its source (the older bodies still emit `avatar_url`); the checkpoint adds the one-to-one relationship and `bunx turbo run typecheck --continue` red only in `@withme/api` and `@withme/nfc` (Phase A correction 5, also fixed in Task 2 Step 6.4).
- §6: the exact `@withme/contract` import; the claim page's exact payload and Continue condition; its error copy "Could not save your name. Try again." becomes "Could not save your profile. Try again." (not in the scratch build: copy only, no test reads the string).
- §7: the profile screen's imports (`Muted`, `isProfileComplete`), where `contact` is set in `load`, `const saved = …`, `exists` left alone; the mobile claim screen gets the same copy change.
- §8: the grep's twelve hits by file and the fill value; §9: the expected outcome.
Consistency check: every path in `git diff --name-only origin/main` of the scratch build appears in the skill, the migration as `supabase/migrations/<UTC-timestamp>_extend_profile.sql`. Every file the skill tells a fork to edit is in that diff; `packages/db/src/types/supabase.ts` is regenerated by `db:types`, not hand-edited. Files the skill names only to read or leave alone: `20261011120000_avatars.sql`, `20261011130000_delete_my_account.sql`, `queries/avatars.ts`, `components/AccountSection.tsx`, `apps/mobile/app/gathering/[id].tsx`, `apps/web/src/routes/t.$uid.tsx`, `docs/the-slice.md`. `grep -n 'M3-CHEC[K]'` prints nothing; `bun run lint` is green.

**Review fixes 2026-10-12.** An independent review's findings, code proven in scratch first (`scratch/extend-profile` @ `8f6e7f1`: db 86, contract 36, API e2e and Playwright 14 green):
- I1: the mobile gate navigated to `/profile` while already on it, which replaced the params and dropped `redirect`. Red on the simulator for both cold paths (a new sign-up via Join on the seeded tag, and via Connect with the tag pointed at the profile): Save stayed on Profile. The gate now skips the navigate when `usePathname()` is `/profile` (read through a ref); both paths then return to the gathering or the tag. §7 has the guard, the reason, and the cold check.
- I2: `isProfileComplete` accepts a set non-string value (a numeric handicap completes at 0), with a contract case; scope notes say a required field needs its input and `disabled` condition in all four forms.
- I3: customize-gathering and add-destination-type copy `resolve_tag`'s newest definition, not the gatherings migration's (which emits the dropped `avatar_url`); "What must not move" #9.
- Minor: one-tier forks, `db:start` before the red run, `grep -E` finders and how to read the function names, the e2e blocks by their comment markers, the mobile profile list, the schema imports, no `.upsert()`, the live-users rollout note, duplicates trimmed, and the tenant predicate on `accept_connect_request`'s details read (plus no `anon`/`public` policy in #3).

---

### Task 5: The make-it-yours update (Phase B)

**Files:**
- Modify: `.agents/skills/make-it-yours/SKILL.md`, `.agents/skills/go-live/SKILL.md` (§3's env block only)

**Step 1: Scratch worktree.** Create `~/dev/withme-scratch/make-it-yours` from `origin/main` (post-M3) with `bun install` and the three `.env` copies. Run the brand sweep:

```bash
grep -rni --exclude-dir={node_modules,dist,.expo,.wrangler,.turbo} withme apps/ supabase/seed README.md | grep -v '@withme/'
```

Diff the list against step 3's named files. Expected new surfaces (the same at `4fa6c98` and post-M3 `7932548`; Task 3 ran the sweep and M3 added no `withme` string to `apps/`, `supabase/seed`, or `README.md`):
- `CalmStates.tsx` (two "withme home" links)
- `login.tsx:92` (the hint)
- `t.$uid.tsx` (`WordmarkFooter`)

Log anything else the sweep finds. M3's one new user-facing system string carries no brand and so does not show up here: `expo-image-picker`'s `photosPermission` in `apps/mobile/app.json` (edit 4 below).

**Step 2:** Apply the edits below. Then execute the new step 7 and the edited step 1 paragraph literally in the scratch worktree:
1. Set `VITE_STORE_URL=https://shop.example.com` and `EXPO_PUBLIC_STORE_URL=https://shop.example.com`.
2. With dev servers up, `/merch` shows the card, "Open store" opens a new tab, and the landing page shows "Get tags".
3. Unset the URLs and restart: the Merch tab is gone and `/merch` returns to `/gatherings`.
4. Set `--shell-nav-height: 64px` and `SHELL.headerHeight: 64`. The web header and the mobile header grow together; check with a screenshot in the simulator.
5. Revert.

**Step 3: Edits** (exact old → new):

1. Execution rules:
   - `- Steps 1–6 are independent of each other. Skip any seam you're keeping.` becomes `- Steps 1–7 are independent of each other. Skip any seam you're keeping.`
   - `- Run the final checkpoint (step 7) once at the end regardless.` becomes `- Run the final checkpoint (step 8) once at the end regardless.`
2. The Inputs bullet that begins `- Optional: a merch store URL (` (four lines, ending `a deploy-time var).`) becomes:
   `- Optional: a store URL for the Merch tab and the landing page's "Get tags" link — step 7.`
3. Step 1. The sentence from `The shell tokens (\`--shell-nav-height\`,` through `normally stay untouched.` becomes:

   > The shell's heights are layout, not brand, but a new display font or a taller wordmark can outgrow them. `--shell-nav-height` (the header, 56px) is mirrored on mobile as `SHELL.headerHeight` in `lib/tokens.ts`: the two move together. `--shell-tab-height` (the web bottom bar, 60px) is web-only; the mobile tab bar keeps React Navigation's default height. `--shell-max-width` is the content column. The 720px nav breakpoint is the literal `@media (max-width: 719.98px)` in `apps/web/src/styles/app.css`, documented in the `tokens.css` comment (CSS variables cannot drive media queries): change both or neither.

   Append to step 1's checkpoint:

   > If you changed the header height, `grep -n 'shell-nav-height:' apps/web/src/styles/tokens.css` and `grep -n 'headerHeight' apps/mobile/lib/tokens.ts` show the same number.
4. Step 3's surface list. After the `AppShell.tsx` bullet, insert:

   ```
   - `apps/web/src/components/CalmStates.tsx` — the "withme home" link on
     the not-found and error cards (two places).
   - `apps/web/src/routes/login.tsx` — the `<p className="hint">withme</p>`
     above the sign-in heading (besides its page title).
   - `apps/web/src/routes/t.$uid.tsx` — `WordmarkFooter`, the only brand
     mark a stranger who tapped a tag sees.
   ```

   After the `nfcPermission` bullet, insert (Milestone 3's surface; Task 3 found no other):

   ```
   - `apps/mobile/app.json` — the `expo-image-picker` plugin's
     `photosPermission` string ("Choose a photo for your profile."), the
     iOS prompt before the photo library opens. It carries no brand;
     rewrite it only for voice.
   ```

   In the **Caution** paragraph below the list (M3 moved the shared sign-up and profile steps into `apps/web/e2e/helpers.ts` and added specs), replace

   ```
   smoke test selects by those strings — update
   `apps/web/e2e/handshake.spec.ts` to match or e2e will fail.
   ```

   with

   ```
   specs select by those strings — update every match of
   `grep -rn "getByRole\|getByLabel\|getByText" apps/web/e2e`, the shared
   steps in `apps/web/e2e/helpers.ts` included, or e2e will fail.
   ```
5. Step 3:
   - `the step 7 sweep greps it` becomes `the step 8 sweep greps it`.
   - `final sweep in step 7 catches everything.` becomes `final sweep in step 8 catches everything.`
6. Step 6. The `project_id` bullet keeps its text; add nothing (see "Not in this milestone").
7. Rename `## 7. Icons + final gate` to `## 8. Icons + final gate`. Insert before it:

   ````markdown
   ## 7. Merch store pointer (optional)

   The Merch tab and the landing page's "Get tags" link exist only when a
   store URL is set: a pointer to where your tags are sold, never commerce.
   Skip this step if you have no store yet; the tab stays absent.

   - Local: uncomment and set `VITE_STORE_URL=https://…` in `apps/web/.env`
     and `EXPO_PUBLIC_STORE_URL=https://…` in `apps/mobile/.env`, the same URL
     in both. Restart the dev servers (Vite and Metro read env at start;
     start Metro with `--clear`).
   - Production: the same lines in `apps/web/.env.production` and
     `apps/mobile/.env.production` (go-live §3 and §4). Both bundlers inline
     the value at build time: changing it means a rebuild and redeploy on
     web and an `eas update` on mobile.
   - The value is public — it is baked into both bundles. Use the plain
     storefront URL, https only, with no tokens or tracking parameters you
     would not print on a flyer.
   - Copy: the card reads "Tags and gear from the store." in
     `apps/web/src/routes/_app.merch.tsx` and `apps/mobile/app/(tabs)/merch.tsx`;
     the tab label is `Merch` in `AppShell.tsx` and `(tabs)/_layout.tsx`.
     Rewrite it in your voice; keep one card and one "Open store" action.
   - Leave `VITE_STORE_URL: ''` in `apps/web/playwright.config.ts` alone: the
     smoke pins the tab absent on purpose (`shell.spec.ts`).

   **Checkpoint:** `grep -n '^VITE_STORE_URL=https://' apps/web/.env` and
   `grep -n '^EXPO_PUBLIC_STORE_URL=https://' apps/mobile/.env` each print one
   line, with the same URL. With both dev servers up, `/merch` shows the card,
   "Open store" opens the store in a new tab, and the landing page shows
   "Get tags".
   ````

8. go-live §3's `.env.production` block: after the `VITE_DEMO_CREDENTIALS=…` line add `VITE_STORE_URL=https://<your-store>        # optional: the Merch tab`.
9. The intro. After the opening paragraph (the one ending "see `docs/the-slice.md` and the other skills."), add one line:

   > **REQUIRED BACKGROUND:** the safety discipline in `docs/the-slice.md`. A rebrand moves no boundary: if a copy or config change seems to need a policy, an RPC, or a new card field, stop, because that is another skill's work.

**Step 4: Verify and commit.**

```bash
grep -n 'step 7\|(step 7)\|Steps 1–6' .agents/skills/make-it-yours/SKILL.md   # only the new "## 7. Merch" heading and step-8 references remain
grep -c '^## ' .agents/skills/make-it-yours/SKILL.md                            # the step count grew by one
grep -c 'REQUIRED BACKGROUND' .agents/skills/make-it-yours/SKILL.md             # 1
git add .agents/skills/make-it-yours/SKILL.md .agents/skills/go-live/SKILL.md
git commit -m "make-it-yours: the store URL step, shell heights, missed brand surfaces

The Merch pointer gets its own step with a checkpoint and the production
var; the shell heights may change, in lockstep with mobile; the not-found
card, sign-in hint, resolver footer, and the photo-permission prompt join
the list of places the brand and voice render.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Done 2026-10-12** in `ba018ad`, against `7932548`. Log: `~/dev/withme-scratch/notes/make-it-yours.md`.
- Sweep: nothing beyond the three expected surfaces; every other match is already named in steps 3, 4, or 6.
- Edits 1–9 applied as written, with three corrections from reading and running them:
  - Step 3's "the first five" became "the first eight": the three new mark surfaces sit above the page-title bullet.
  - Step 7's Local bullet adds "then relaunch the app": after a `--clear` Metro restart, a running Expo Go kept the old bundle (no Merch tab) until it was terminated and reopened.
  - Step 4's first grep also prints the Inputs bullet's "— step 7." pointer, which is correct. `## 7.` itself never matches `step 7`.
- Step 2, all pass. With the store set: the landing page shows "Get tags", the Merch tab is present, `/merch` shows the card, and "Open store" (`target="_blank"`) opens `https://shop.example.com/` in a new tab. The mobile Merch tab also appears after the relaunch. With the store unset: no "Get tags", no Merch tab on web or mobile, and `/merch` lands on `/gatherings`. At 64 the web header box measures 64 at both widths (56 before), and the mobile header grows 8pt while the tab bar stays the same. Both checkpoint greps print 64. The scratch run was then reverted.

---

### Task 6: Docs: roadmap, slice, README, program status, spec amendment

**Files:** Modify `docs/skills-roadmap.md`, `docs/the-slice.md`, `README.md`, `docs/superpowers/program.md`, `docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md`.

1. **`docs/skills-roadmap.md`.**
   - Change the status line to: `Status: agreed; revised 2026-09-22 and extended 2026-10 — see the dated sections at the end.`
   - Append:

   ```markdown
   ## Shipped 2026-10 — the derivation skills (milestone 4)

   `.agents/skills/provision-tags/` and `.agents/skills/extend-profile/`, and
   an update to `make-it-yours`, each built for real in a throwaway worktree,
   written down from what worked, then re-run against a fresh clone (hard
   constraints 2 and 4).

   - **provision-tags** (Tier 3, item 7) is a runbook over the script the
     starter already ships (`supabase/seed/provision.ts`, `bun run
     db:provision`, from golf-with-me `bee9c9d`). No code: random 48-bit UIDs
     by default because an unclaimed tag belongs to whoever presents its UID
     first; the encode list handled as bearer capabilities, outside the repo;
     chip UIDs only for tags claimed on the spot.
   - **extend-profile** (Tier 2, item 3, "onboarding") ships the two-tier
     model: card-tier columns on `profiles`, and a connections tier in its own
     table whose policy admits the owner and accepted connections only. The
     build showed why it is not a `profiles_select` change: RLS is per row,
     and the pending-request recipient, the gathering co-member, and the
     blocker all read every column of a row that policy admits.
     `profiles_select` stays as the gathering migration left it. Completion
     gating is a UX gate in both clients over one contract function, never a
     policy.
   - **make-it-yours** gained the store URL step, the shell heights, and the
     brand surfaces the shell and Profile work added.
   - **add-marketing-site** stays a candidate until the proof run
     (milestone 5).
   ```

2. **`docs/the-slice.md`**, "The safety discipline": after the "Block-respecting visibility" bullet, insert:

   ```markdown
   - **Two tiers of profile data.** A profile field is either card tier — a
     column on `profiles`, readable by anyone holding the owner's tag and by
     every viewer `profiles_select` admits — or connections tier: a sibling
     table whose select policy admits the owner and accepted connections
     only, with no block in either direction. Never put a connections-tier
     field on `profiles`: RLS is per row, so the pending-request recipient,
     the gathering co-member, and the blocker would read it.
     `.agents/skills/extend-profile/` is the recipe.
   ```

3. **`README.md`**: insert before "## Principled non-goals":

   ```markdown
   ## Extending a fork

   Growth beyond the handshake ships as agent-executable skills in
   `.agents/skills/`, each built for real before it was written down and
   bound by the slice and safety discipline in
   [`docs/the-slice.md`](docs/the-slice.md):

   - `make-it-yours` — rebrand: tokens, fonts, wordmark, app identity, store URL.
   - `customize-gathering` — the gathering's nouns and fields.
   - `extend-profile` — vertical profile fields, card or connections-only, and completion gating.
   - `add-destination-type` — grow what a tag can point at.
   - `provision-tags` — batch tags, the encode list, a printable sheet.
   - `go-live` — Supabase, Cloudflare Workers, EAS Update.
   ```

4. **`docs/superpowers/program.md`**: append:

   ```markdown
   ## Status

   - Milestone 1: merged (PR #6; follow-up #7).
   - Milestone 2: merged (PR #8).
   - Milestone 3: merged (PR #9).
   - Milestone 4: in review (this PR).
   - Milestone 5: waiting on 4.
   ```

   M3 merged as `7932548` (PR #9); confirm with `git log --merges --oneline origin/main -3`.

5. **`README.md`, "Encoding NFC tags"**: point it at `provision-tags` and make it agree with the skill. Today it says `{UID}` is the chip's immutable NTAG213 UID; the skill's default is a random, script-generated UID, and the chip's own UID is its §5 alternative. Replace the paragraph's opening, through `**lock the tag to read-only**.` (that line continues with "The heavy lookup…"; keep the rest of it),

   ```markdown
   Tags encode one **permanent URL**: `https://<your-domain>/t/{UID}`, where
   `{UID}` is the tag's immutable 7-byte NTAG213 UID (14 hex chars). Use any NFC
   writer app (e.g. NXP TagWriter) to write the URL as an NDEF URI record, then
   **lock the tag to read-only**.
   ```

   with

   ```markdown
   Tags encode one **permanent URL**: `https://<your-domain>/t/{UID}`, where
   `{UID}` is 14 hex chars (`04` and 12 more) naming a row in `public.tags`.
   By default it is random, generated by `bun run db:provision` rather than
   read from the chip, because an unclaimed tag belongs to whoever presents
   its UID first. The [`provision-tags`](.agents/skills/provision-tags/SKILL.md)
   skill is the runbook: it creates the rows and the encode list, and its §5
   covers using the chip's own 7-byte NTAG213 UID instead, and what that
   costs. Use any NFC writer app (e.g. NXP TagWriter) to write the URL as an
   NDEF URI record, then **lock the tag to read-only**.
   ```

   The rest of the section (the lookup in the API Worker, mutable destinations) stays.

6. **The spec amendment**, `docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md`, "Skills changes" (`grep -n 'profiles_select' docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md`; at `4fa6c98` it is line 186). Replace

   ```markdown
   - New `extend-profile` (the roadmap's "onboarding"): distilled from
     tailgate-with-me `92d2aeb`, plus a real build of the connections-only
     field-visibility tier before it is written down (touches `profiles_select`
     and needs its own RLS tests).
   ```

   with

   ```markdown
   - New `extend-profile` (the roadmap's "onboarding"): distilled from
     tailgate-with-me `92d2aeb`, plus a real build of the connections-only
     field-visibility tier before it is written down. The tier is a sibling
     table, `public.profile_details`, with its own select policy (the owner,
     or an accepted connection with no block either way) and its own RLS
     tests, proven narrower than `profiles_select`, which stays
     byte-identical. *Amended 2026-10-11, approved by Alex 2026-10-11
     (the decisions log): this line first said the tier "touches `profiles_select`".
     RLS decides rows, not columns, so a connections-only column on
     `profiles` would reach every viewer that policy admits (the
     pending-request recipient, the gathering co-member, the blocker).*
   ```

**Verify:**
- `ls .agents/skills` lists six skills.
- `grep -n 'extend-profile\|provision-tags' README.md docs/the-slice.md docs/skills-roadmap.md docs/superpowers/program.md` hits each file.
- `grep -n 'NTAG213' README.md` hits only the new "Encoding NFC tags" text, which names `provision-tags`.
- `grep -n 'touches .profiles_select.' docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md` hits only inside the dated amendment note; `grep -n 'profile_details' docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md` hits once.
- `bun run lint` is still green.

**Commit:** `git commit -m "Docs: the derivation skills in the roadmap, the slice, the README, and the spec" …` (body: the two-tier rule now lives in the slice; README lists the skills and its tag-encoding section matches provision-tags; program status; the spec's extend-profile line amended to the sibling table Alex approved on 2026-10-11, the decisions log), ending with the Co-Authored-By line.


**Done 2026-10-12.** Edits 1–6 applied, with these departures from the text above:
- The spec amendment reads "*Amended 2026-10-12, approved by Alex 2026-10-11 (the decisions log)*": the amendment was made today; the approval date is the decisions log decision comment's.
- The roadmap section also records go-live (§3's `VITE_STORE_URL`, §1's password file moved to `$HOME/.config/<name>/`) and the customize-gathering / add-destination-type fix (copy `resolve_tag`'s newest definition), and names `profile_details` and `isProfileComplete`. Its "re-run against a fresh clone" becomes true in Tasks 7b–7d, before the PR merges.
- README "Encoding NFC tags": `{UID}` is "14 uppercase hex chars", with "`04` and 12 more" only for the random default (a chip UID from §5 need not start `04`).
- program.md status adds the merge shas (`4fa6c98`, `7932548`) and M3's merge date.
- Verify: `grep -n 'NTAG213' README.md` also hits line 21, the "How it works" diagram (`NTAG213 tag ──encodes──▶ …`). It names the tag type, not the UID, so it stays. Every other check passed: six skills; each of the four files names a new skill; `touches .profiles_select.` only inside the amendment note; `profile_details` once in the spec; no `M3-CHEC[K]` marker; `bun run lint` green.

---

### Task 7a: Static name check of every skill

Every command, path, table, and function the skills name, checked at HEAD without running the skills. Tasks 7b–7d then re-run each skill from a fresh clone.

**Step 1: No markers, no app code.**

```bash
grep -rn 'M3-CHEC[K]' .agents docs README.md            # nothing
git diff --name-only origin/main...HEAD                # only .agents/skills/**, docs/**, README.md, .gitignore
git diff origin/main...HEAD -- .gitignore | grep '^[+-][^+-]'   # exactly Task 1's three added lines (the comment and two names)
```

**Step 2: List every name each skill relies on, and check each at HEAD.**

1. List the names:

   ```bash
   for s in provision-tags extend-profile make-it-yours go-live; do
     grep -oE '`[^`]+`' .agents/skills/$s/SKILL.md | sort -u > ~/dev/withme-scratch/notes/tokens-$s.txt
   done
   ```

2. Classify every token as one of:
   - checked below;
   - created by the skill (e.g. `profile_details`, `upsertOwnDetails`);
   - an example or placeholder (`<UID>`, `affiliation`, `acme`).
3. A token in none of those classes is a finding: fix the skill.
4. Then run the checks, in a stack window for the `docker exec` lines.

**provision-tags**

```bash
test -f supabase/seed/provision.ts && jq -r '.scripts["db:provision"]' package.json    # bun run supabase/seed/provision.ts
grep -n 'SEED_ALLOW_REMOTE\|getRandomValues\|count < 1 || count > 1000\|provisioned-tags.csv\|provisioned-tags.html\|onConflict' supabase/seed/provision.ts
grep -n 'SUPABASE_URL\|SUPABASE_SERVICE_ROLE_KEY\|export const admin' packages/db/src/test-utils/index.ts
grep -n "uid text primary key check\|tags_state_consistent\|policy tags_select_own\|policy tags_update_own\|grant update (destination, status)" supabase/migrations/20260610120000_initial_handshake_schema.sql
grep -n 'claim:\${userId}' apps/api/src/routers/public.ts
grep -n 'export async function readTagUid' apps/mobile/lib/nfc.ts
for f in 'apps/web/src/routes/t.$uid.tsx' 'apps/web/src/routes/claim.$uid.tsx' 'apps/mobile/app/t/[uid].tsx' 'apps/mobile/app/claim/[uid].tsx'; do test -f "$f" || echo "MISSING $f"; done
grep -n "Claim this tag\|'Claim tag'\|This tag has already been claimed" 'apps/web/src/routes/claim.$uid.tsx'
grep -n "04AAAAAAAAAAAA\|lin@demo" supabase/seed/index.ts
grep -n '^project_id' supabase/config.toml
grep -n '^\.env\.\*' .gitignore                                                      # covers .env.demo-seed
grep -n '^\.supabase-demo-db-password$\|^provisioned-tags\.\*$' .gitignore             # 2 lines (Task 1)
grep -n "tag is not claimable' using errcode = 'P0002'\|tag not found' using errcode = 'P0003'" supabase/migrations/20260610120000_initial_handshake_schema.sql   # 2
grep -n 'provision-tags' README.md                                                   # the Encoding NFC tags section links it
grep -n 'listMine\|UpdateMyTagInputSchema' packages/contract/src/contract/app.ts
grep -n 'export const OwnerTagStatusSchema\|status: OwnerTagStatusSchema' packages/contract/src/schemas/tag.ts   # My tags: update takes status (M3)
grep -n '>My tags<\|SectionHeader>My tags\|Turn off' apps/web/src/components/MyTags.tsx apps/mobile/components/MyTags.tsx
grep -n 'function TagPointer' 'apps/web/src/routes/_app.gatherings_.$id.tsx' 'apps/mobile/app/gathering/[id].tsx'
grep -n 'claimed tags reset\|delete from auth.users' supabase/migrations/20261011130000_delete_my_account.sql
docker exec supabase_db_withme-starter psql -U postgres -tAc "select proname from pg_proc where proname in ('claim_tag','resolve_tag') and pronamespace = 'public'::regnamespace order by 1"
```

**extend-profile**

```bash
for f in packages/contract/src/schemas/profile.ts packages/contract/src/schemas/connection.ts \
  packages/contract/src/contract/app.ts packages/contract/test/schemas.test.ts \
  packages/db/src/queries/handshake.ts packages/db/src/queries/gatherings.ts \
  packages/db/test/enumeration.test.ts packages/db/test/cascade.test.ts packages/db/test/account.test.ts \
  packages/db/src/test-utils/index.ts apps/api/src/routers/app.ts \
  packages/nfc-sdk/src/client.ts packages/nfc-sdk/test/client-types.test.ts \
  apps/web/src/components/ProfileCard.tsx apps/web/src/routes/_app.tsx \
  apps/web/src/routes/_app.profile.tsx 'apps/web/src/routes/claim.$uid.tsx' \
  apps/web/src/routes/_app.connections.tsx 'apps/mobile/app/t/[uid].tsx' \
  'apps/mobile/app/(tabs)/profile.tsx' 'apps/mobile/app/claim/[uid].tsx' \
  'apps/mobile/app/(tabs)/connections.tsx' 'apps/mobile/app/(tabs)/_layout.tsx' \
  apps/mobile/lib/use-session.ts apps/mobile/lib/api.ts apps/mobile/components/ui.tsx \
  apps/api/e2e/handshake.e2e.ts apps/web/e2e/handshake.spec.ts supabase/seed/index.ts \
  'apps/mobile/app/gathering/[id].tsx'; do
  test -f "$f" || echo "MISSING $f"; done
grep -n 'api.app.profile.get' 'apps/mobile/app/gathering/[id].tsx' 'apps/mobile/app/t/[uid].tsx' 'apps/web/src/routes/t.$uid.tsx'   # the three ungated callers
grep -ln 'function private.on_block_created' supabase/migrations/*.sql
grep -n "private.is_blocked(v_user, v_req.requester_id)" supabase/migrations/*.sql   # accept refuses a blocked pair
grep -n 'export const CARD_COLUMNS\|export interface ProfileCard\|export async function getOwnProfile\|export async function upsertOwnProfile\|export async function listConnections' packages/db/src/queries/handshake.ts   # 5
grep -n 'CARD_COLUMNS' packages/db/src/queries/gatherings.ts
grep -n 'export const ProfileSchema\|export const PublicProfileSchema\|export const UpdateProfileInputSchema' packages/contract/src/schemas/profile.ts
grep -n 'export const ConnectionSchema' packages/contract/src/schemas/connection.ts
grep -n 'const getProfile\|const updateProfile\|const acceptRequest\|const connectionsList\|ORPCError' packages/contract/src/contract/app.ts apps/api/src/routers/app.ts
grep -n 'export interface PublicProfileCard' packages/nfc-sdk/src/client.ts
grep -n 'export interface TestUser\|export async function createTestUser\|export async function connectUsers\|export async function pendingRequestId\|export async function provisionTag\|export function anonClient\|export const admin\|export async function assertStackRunning' packages/db/src/test-utils/index.ts   # 8
grep -n "'profiles',$\|'blocks',$" packages/db/test/enumeration.test.ts
grep -n 'requireSession\|asSignedInAccount\|function ShellRoute\|!profile && pathname\|Navigate to="/profile"' apps/web/src/routes/_app.tsx
grep -n 'function IdentityForm\|useLoaderData({ from: .\/_app. })' apps/web/src/routes/_app.profile.tsx
grep -n 'function PersonRow' apps/web/src/routes/_app.connections.tsx apps/mobile/components/ui.tsx
grep -n 'expectEmpty\|delete_my_account' packages/db/test/account.test.ts
grep -n 'export async function setOwnAvatarPath' packages/db/src/queries/avatars.ts
grep -n '"@withme/contract"' apps/web/package.json apps/mobile/package.json
grep -n 'export function useSession' apps/mobile/lib/use-session.ts
grep -n 'export function Muted\|export function Field' apps/mobile/components/ui.tsx
grep -n '\.card \.hint\|\.row-body \.sub\|^\.field ' apps/web/src/styles/app.css
grep -n 'createDemoUser(' supabase/seed/index.ts
grep -n '^// 8\. \|^// 9\. \|^// 10\. ' apps/api/e2e/handshake.e2e.ts
grep -n "getByLabel('Name').fill" apps/web/e2e/*.ts                                  # specs and helpers.ts
grep -n 'export async function signUpWithProfile\|export async function claimFreshTag' apps/web/e2e/helpers.ts
jq -r '.scripts["db:types"]' package.json
grep -ln "'display_name', v_profile.display_name" supabase/migrations/*.sql
grep -lE 'create (or replace )?function public\.resolve_tag' supabase/migrations/*.sql | grep -v _extend_profile | sort | tail -1              # the skill's finders (§3): 20261011120000_avatars.sql
grep -lE 'create (or replace )?function public\.accept_connect_request' supabase/migrations/*.sql | grep -v _extend_profile | sort | tail -1   # same file
docker exec supabase_db_withme-starter psql -U postgres -tAc "select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname, p.proname) in (('public','resolve_tag'),('public','accept_connect_request'),('public','create_gathering'),('public','join_gathering'),('public','claim_tag'),('public','send_connect_request'),('private','is_blocked'),('private','current_tenant_id'),('private','set_updated_at')) order by 1"   # 9 rows
docker exec supabase_db_withme-starter psql -U postgres -tAc "select polname from pg_policy where polrelid = 'public.profiles'::regclass order by 1"   # includes profiles_select
docker exec supabase_db_withme-starter psql -U postgres -tAc "select to_regclass('public.connections'), to_regclass('public.profile_details')"   # connections | (null) — the skill creates the second
```

**make-it-yours and go-live**

```bash
for f in apps/web/src/routes/index.tsx apps/web/src/components/AppShell.tsx apps/web/src/components/CalmStates.tsx \
  apps/web/src/routes/login.tsx 'apps/web/src/routes/t.$uid.tsx' apps/web/src/routes/__root.tsx \
  'apps/web/src/routes/claim.$uid.tsx' apps/web/src/routes/_app.connections.tsx apps/web/src/routes/_app.gatherings.tsx \
  'apps/web/src/routes/_app.gatherings_.$id.tsx' apps/web/src/routes/_app.profile.tsx apps/web/src/routes/_app.merch.tsx \
  apps/mobile/components/Header.tsx 'apps/mobile/app/t/[uid].tsx' apps/mobile/app.json supabase/seed/index.ts; do
  printf '%s ' "$f"; grep -ci withme "$f"; done                         # every count >= 1
grep -n 'Tags and gear from the store' apps/web/src/routes/_app.merch.tsx 'apps/mobile/app/(tabs)/merch.tsx'
grep -n 'photosPermission' apps/mobile/app.json                                    # M3's voice-copy surface
grep -n 'Playwright' -A3 .agents/skills/make-it-yours/SKILL.md | grep -n 'helpers.ts'      # the Caution names the shared steps
grep -n "label: 'Merch'\|title: 'Merch'" apps/web/src/components/AppShell.tsx 'apps/mobile/app/(tabs)/_layout.tsx'
grep -n 'shell-nav-height: 56px\|shell-tab-height: 60px\|shell-max-width' apps/web/src/styles/tokens.css
grep -n 'headerHeight: 56' apps/mobile/lib/tokens.ts
grep -n '719.98px' apps/web/src/styles/app.css apps/web/src/styles/tokens.css
grep -n 'STORE_URL' apps/web/.env.example apps/mobile/.env.example apps/web/src/env.d.ts apps/web/playwright.config.ts
grep -n 'VITE_STORE_URL' .agents/skills/go-live/SKILL.md
grep -cF 'cat "$HOME/.config/<name>/supabase-db-password"' .agents/skills/go-live/SKILL.md   # 2: link and push, both via SUPABASE_DB_PASSWORD, use the literal path (-F: some greps read a mid-pattern $ as an anchor)
grep -n 'PASS_FILE' .agents/skills/go-live/SKILL.md                                        # nothing
grep -n '^## The safety discipline' docs/the-slice.md                                       # make-it-yours points here
```

**customize-gathering and add-destination-type** (only the lines `f22a9c4` changed: copy the newest card-function body)

```bash
for s in customize-gathering add-destination-type; do
  git show f22a9c4 -- .agents/skills/$s/SKILL.md | grep '^+[^+]' | grep -oE '`[^`]+`' | sort -u > ~/dev/withme-scratch/notes/tokens-$s-f22a9c4.txt
done
grep -lE 'create (or replace )?function public\.resolve_tag' supabase/migrations/*.sql | sort | tail -1   # 20261011120000_avatars.sql
grep -n 'drop column avatar_url' supabase/migrations/20261011120000_avatars.sql                       # the column the older bodies emit
grep -n 'v_gathering_json jsonb\|security definer\|search_path' supabase/migrations/20261011120000_avatars.sql | head -4   # the newest body keeps what customize-gathering edits
```

Expected: no `MISSING`, every grep hits (the two marked "nothing" print nothing), and the `docker exec` lines return the commented rows. Any miss is fixed in the skill text (or, if the app moved, in the skill's description of it) before Step 3.

**Step 3: Re-run the skills from fresh clones.** Tasks 7b–7d, one clone and one stack window each, in any order. Each starts from the M4 branch's committed state, so first: `git -C ~/dev/withme-starter/.claude/worktrees/derivation-skills status --porcelain` prints nothing.

**Done 2026-10-12** at `de386d3`, the stack reset to `origin/main` (`7932548`) + seed. Log and token lists: `~/dev/withme-scratch/notes/7a.md`, `tokens-<skill>.txt`, `tokens-<skill>.classified.txt`.
- Step 1: clean (no marker; only the allowed paths; `.gitignore` is the comment and the two names).
- Step 2: 590 tokens across the four skills, plus the `f22a9c4` lines of customize-gathering and add-destination-type. Every token is checked, created by the skill, or an example, placeholder, expected output, or external reference. No skill text needed a fix. Every check hit and the `docker exec` lines returned the commented rows.
- Three check lines changed here, not in the skills: the two extend-profile finders now match the skill's `grep -lE 'create (or replace )?function public\.…' | grep -v _extend_profile` (both still print `20261011120000_avatars.sql`). The go-live count is `grep -cF`, because a `grep` backed by ugrep read the mid-pattern `$` as an anchor and printed 0 (`/usr/bin/grep` printed 2). The `f22a9c4` block is new.

---

### Task 7b: Fresh-clone re-run: `provision-tags`

**Step 1: The clone.** A re-run (after a fix) repeats this step, and the `rm -rf` removes the old clone first.

```bash
S=~/dev/withme-scratch
rm -rf "$S/fresh-provision-tags"
git clone --branch claude/derivation-skills ~/dev/withme-starter "$S/fresh-provision-tags"
git -C "$S/fresh-provision-tags" remote remove origin       # nothing in a scratch clone can be pushed
cd "$S/fresh-provision-tags"
# setup as the README Quickstart does it, plus the mobile copy it leaves out
cp apps/api/.dev.vars.example apps/api/.dev.vars; cp apps/web/.env.example apps/web/.env; cp apps/mobile/.env.example apps/mobile/.env
bun install
```

**Step 2 (stack window): follow the skill literally** from the top, with no knowledge from earlier tasks. Time it and log every deviation.
- Run §1 with `--count 3` and §5 with `04D00D00D00D02`.
- Expected:
  - the §1 stdout lines;
  - three `|unclaimed` rows;
  - `git status --porcelain` empty, and no `provisioned-tags.*` in the clone's root;
  - the claim as Lin turns the page into Lin's card;
  - the chip UID lands on "Claim this tag".
- Skip §2–§4 (production / physical tags), and say so in the log.

**Step 3:** Any deviation means: fix the SKILL.md in the M4 worktree, commit (`git commit -m "provision-tags: fixes from the fresh-clone run" …`), and repeat this task from Step 1. Close the window from the M4 worktree, with the hand-back to M3.

**Done 2026-10-12** in two runs. Log: `~/dev/withme-scratch/notes/provision-tags-fresh.md`, screenshots in `notes/7b-shots/`. §2–§4 were skipped (production, physical tags).
- Run 1 (`6d05ebf`, about 6 min) found two deviations, fixed in `b02fcf3`. First, §1 began at `db:start`, but its end-to-end check signs in as a seeded demo user and runs both dev servers. It now opens with the Quickstart setup: env files, `db:start`, `db:seed`. Second, macOS prints `-rw-------@`, and the checkpoint now says so.
- Run 2 (`b02fcf3`, about 2.5 min) had no skill deviation, and every expected result passed:
  - the §1 stdout lines;
  - three `|unclaimed` rows;
  - `git status --porcelain` empty, and `find` showed no `provisioned-tags.*` in the clone's root;
  - signed out, the encode URL went to `/login?returnTo=%2Fclaim%2F<UID>`;
  - Lin's claim turned the page into her card ("This is your tag.");
  - a signed-out viewer saw her card with "Connect" and no claim;
  - a second account's stale claim got "This tag has already been claimed.";
  - §5's `04D00D00D00D02` came back under `returning` and landed on "Claim this tag" with that UID.
- §5's in-app reader (`readTagUid` on a chip) needs a physical tag and was not exercised.
- Outside the skill: in both runs, on the clone's first `vite dev` session, a fresh server-side load of any claimed card (`/t/<claimed UID>`, the seeded `04BBBBBBBBBBBB` too) hung with 0 bytes after the sign-in and claim flow. `/login` and `/claim` loaded. Restarting `apps/web`'s `bun run dev` cleared it. This is an app/dev-server issue, reported to the program manager, and the skill text is unchanged.

---

### Task 7c: Fresh-clone re-run: `extend-profile`

**Step 1: The clone.** As Task 7b Step 1, with `fresh-extend-profile` in place of `fresh-provision-tags` in all four places (the `rm -rf` included).

**Step 2 (stack window): follow the skill literally**, all of §1–§9, with the worked example as written. Time it and log every deviation.
- Expected:
  - red at §2: the 14 new tests, the cascade test, the first `account.test.ts` test, and the enumeration anon sweep;
  - green at §3 (db baseline +14);
  - contract baseline +4;
  - lint and typecheck green after §7;
  - API e2e ending `handshake e2e: all checks passed`;
  - `CI=1 bunx playwright test` green;
  - the simulator checks from §7, driven with Task 4c's technique (agent-device + Expo Go + simctl), not `expo start --ios`.

**Step 3:** Any deviation means: fix the SKILL.md in the M4 worktree, commit (`git commit -m "extend-profile: fixes from the fresh-clone run" …`), and repeat this task from Step 1. Close the window from the M4 worktree, with the hand-back to M3.

**Done 2026-10-12** in two runs. Log: `~/dev/withme-scratch/notes/extend-profile-fresh.md`, screenshots `notes/fresh-ep-*.png`.
- Run 1 (`069ec3a`, about 20 min with the simulator pass) went green everywhere, and found three places where a literal reader had to guess. All three were fixed as text in `0353083`:
  - §1 said "beside the existing schemas", but `CardLineSchema` must sit above `ProfileSchema`, which uses it;
  - §3 said `db:reset` "ends" with `Finished supabase db reset`, but outside a terminal a JSON line follows it;
  - §7's cold check needs a tag that shows Connect, and the seed has none. It now says to claim `04AAAAAAAAAAAA` as Lin first. It also names where the Join path lands ("Join this gathering?", not the tag).
- Run 2 (`0353083`, about 10.5 min) had no skill deviation, and every expected result passed:
  - red at §2: 17 of 86 tests failed (the 14 new tests, the cascade test, the first `account.test.ts` test, and the enumeration anon sweep), on `PGRST205`/`PGRST204`;
  - db went from 72 to 86 at §3;
  - contract went from 31 to 36. That is +5, not the +4 above: the review added a fifth contract case, and the skill says five;
  - nfc-sdk passed 48;
  - lint and typecheck were green;
  - API e2e passed 66 checks, the eight extend-profile lines among them, ending `handshake e2e: all checks passed`;
  - `CI=1 bunx playwright test` passed 14.
- The simulator checks used agent-device + Expo Go + simctl:
  - a new account lands on Profile;
  - relaunching with an incomplete profile lands on "Finish your profile";
  - two connected accounts each see the other's contact in Connections;
  - a resolve shows the affiliation and no contact;
  - cold Connect returns to the tag, and cold Join returns to "Join this gathering?".
- Run 2 did not re-check the relaunch gate or the two-sided contacts. The fixes were text-only, and run 1 had passed both.
- Neither run saw `PGRST303`. Expo Go started each run signed in as an account the reset had deleted, so the run signed out first. The skill text is unchanged for these.

---

### Task 7d: Fresh-clone re-run: `make-it-yours`

**Step 1: The clone.** As Task 7b Step 1, with `fresh-make-it-yours` in place of `fresh-provision-tags` in all four places.

**Step 2 (stack window): follow the skill literally.** Time it and log every deviation.
- Inputs:
  - wordmark `acme`, display name `Acme`;
  - accent `#0f766e` / ink `#ffffff` (light), `#2dd4bf` / ink `#042f2e` (dark), each verified ≥ 4.5:1 with a contrast checker before editing;
  - id `com.acme.app`, scheme `acme`;
  - store `https://shop.example.com`.
- Run steps 1, 3, 4, 6, 7, 8.
- Skip:
  - step 2 (fonts optional: "Skip if keeping");
  - step 5 (EAS: creates an Expo project, so stop and ask Alex; default skip);
  - step 6's `project_id` rename (shared stack).
- Expected:
  - the step 3 and step 8 sweeps print nothing beyond the acceptable matches;
  - `bunx expo config --type public` shows `Acme` / `acme`;
  - the gate is green;
  - `CI=1 bunx playwright test` green (copy selectors untouched);
  - `/merch` behaves per step 7.

**Step 3:** Any deviation means: fix the SKILL.md in the M4 worktree, commit (`git commit -m "make-it-yours: fixes from the fresh-clone run" …`), and repeat this task from Step 1. Close the window from the M4 worktree, with the hand-back to M3.

**Done 2026-10-12** in two runs. Log: `~/dev/withme-scratch/notes/make-it-yours-fresh.md`, check script `notes/7d-verify.cjs`, screenshots `notes/7d-*.png`. Steps 2 (fonts), 5 (EAS: no `eas` command was run) and step 6's `project_id` rename were skipped. Contrast, computed with the WCAG formula: light `#0f766e`/`#ffffff` 5.47:1, dark `#2dd4bf`/`#042f2e` 7.77:1.
- Run 1 (`bcef319`, about 7 min) passed every expected result, and found four places where the text and the starter disagree. All four were fixed as text in `ef48bdf`:
  - the Inputs never asked for the fork's repository URL, which step 3's README badge needs;
  - step 1 put the accent on "the Connect/claim buttons", but it also sits on Accept, Join, and mobile's "Read NFC tag" (`btn--connect` / `kind="connect"`);
  - step 8 listed six icon files, but `app.json` wires only `icon.png` and `android-icon-foreground.png`, so the other four change nothing until they are wired in;
  - step 8 expected the accent on Connect, but the seeded `04BBBBBBBBBBBB` is Ada's gathering invite. It shows "Join this gathering" and no Connect button, and the accent is on Join.
- Run 2 (`ef48bdf`, about 2 min) had no skill deviation, and every expected result passed:
  - the step 3 and step 8 sweeps printed nothing;
  - `bunx expo config --type public` showed `Acme` / `acme` / `com.acme.app`, with no schema errors;
  - the gate was green (contract 31, db 72, nfc 48);
  - `CI=1 bunx playwright test` passed 14;
  - with the store set, a Playwright script against both dev servers passed 22 of 22 checks:
    - the `acme` wordmark and titles;
    - "Get tags" on the landing page;
    - the accent only on "Join this gathering", in light and dark;
    - the `/merch` card;
    - "Open store" with `target="_blank"`, opening `https://shop.example.com/`.
- Run 1 also checked the store unset: no "Get tags", no Merch tab, and `/merch` landed on `/gatherings`. Run 2 skipped that check, because the fixes were text-only and outside step 7.
- The seed identity was rebranded (`*@demo.acme.local`). No test hardcodes it.
- Outside the skill:
  - the shipped `tokens.css` comment cites 4.8:1 for `#c2410c`/`#ffffff`, which computes to 5.18:1;
  - `packages/nfc-sdk` still points its `repository.url` at upstream, and no sweep covers `packages/`.
  Neither was changed. The known web dev-server hang did not occur, since this run has no claim flow.

---

### Task 8: Cleanup, gate, PR

**Step 1: Remove every scratch artifact.**

```bash
for w in provision-tags extend-profile-core extend-profile make-it-yours; do
  git -C ~/dev/withme-starter worktree remove --force ~/dev/withme-scratch/$w
  git -C ~/dev/withme-starter branch -D scratch/$w
done
rm -rf ~/dev/withme-scratch/fresh-*
rm -rf "$HOME/withme-tags"
git -C ~/dev/withme-starter worktree list    # no withme-scratch entries
git -C ~/dev/withme-starter branch --list 'scratch/*'   # nothing
git ls-remote --heads origin 'scratch/*'                     # nothing: never pushed
```

Keep `~/dev/withme-scratch/notes/` until the PR body is written, then delete it. Restore the stack from the M4 worktree: `bun run db:reset && bun run db:seed`.

**Step 2: Gate on the M4 branch.**

```bash
bun run lint && bun run typecheck && bun run test       # identical counts to Task 0's baseline (post-M3)
git diff --name-only origin/main...HEAD                 # .agents/skills/**, docs/**, README.md, .gitignore only
```

**Step 3: Push and open the PR against `main`.** Title: `Add the derivation skills: provision-tags, extend-profile, make-it-yours update`.

The body includes:
- the spec link and Milestone 4;
- the three skills, the go-live fix, and the `.gitignore` backstop;
- Decision 3, the sibling table instead of a `profiles_select` edit (approved by Alex 2026-10-11, the decisions log; the spec line amended in Task 6), with the red naive-leak output from Task 2 as evidence;
- the red-then-green RLS counts;
- per-skill scratch results and fresh-clone timings, including what was skipped and why (production provisioning, EAS, fonts, `project_id`);
- the corrections the scratch runs forced into each skill;
- the M3 reconciliation (which markers, resolved how);
- "no app code" with the `git diff --name-only` output, and the `.gitignore` lines with their reason;
- "Not in this milestone".

End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

**Step 4:** Request review with `superpowers:requesting-code-review`. Handle findings with `superpowers:receiving-code-review`, resolving CodeRabbit comments on their merits. Merge with a merge commit once CI and CodeRabbit are clean. Report the milestone to the program manager for Alex and the tracker update.

**Final review fixes 2026-10-12.** Skills and docs only, no app code. provision-tags: an explicit owner stop (project ref, count, base URL) before §2's batch and §5's production insert; `batch-<k>` for the batch, `<n>` for the count; `mkdir "$OUT"` refuses a reused directory; the `SUPABASE_SERVICE_ROLE_KEY:?` guard; §4 retires printed sheets, `provisioned-tags.html` and `provision.log`, says what to do when a list was committed (delete or disable those unclaimed rows), and that account deletion releases a tag whose UID is already known. go-live: the seed and secrets blocks source `.env.demo-seed` in a subshell, so the service role never stays exported for a later `bun test` in `packages/db` (code guard: the remote-guard gap); `supabase link` and `supabase db push` take the password from `SUPABASE_DB_PASSWORD` (the CLI reference for `link`, Supabase's SASL-auth troubleshooting guide for `db push`), never `-p`; a committed password file means a password reset; `VITE_STORE_URL` is commented out in the example. extend-profile: the gate's cadence per platform in "What must not move" item 7, and why `updateProfile`'s two writes are not a transaction. README: owners claim, re-point, or turn off; account deletion releases tags. program.md: milestone 4 names PR #10.

---

## Not in this milestone

- **`add-marketing-site`**: the spec lists it as a candidate after the proof run (milestone 5).
- **Typechecking `supabase/seed/provision.ts`**: `supabase/seed/tsconfig.json` includes only `index.ts`.
- **A `--uids-file` option for chip UIDs**: §5 uses SQL instead.
- **make-it-yours step 6's `project_id` rename order.** `db:stop` after the rename stops the new, not-running project, while the old stack keeps the ports. The fix is to stop first, then rename. It is unverified here because verifying it would disrupt the shared stack. Follow-up.
- **Out-of-roadmap skills**: build-feed, notifications, and universal links/AASA.
