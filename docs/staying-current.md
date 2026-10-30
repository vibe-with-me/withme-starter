# Staying current with the starter

The starter keeps changing after you fork it: security fixes, new building
blocks, skills that learned from the last derivation. This page is how a
fork takes those changes in.

The short version: **keep the starter as a git remote and merge it.** Your
fork shares history with the starter, so every update is an ordinary
`git merge`, and git only asks you about the lines you both changed.
Rails starters such as Bullet Train and Jumpstart Pro work the same way,
and Golf With Me takes its starter fixes this way today.

## Why a merge, and not something else

- **No upgrade tool to learn.** The starter has no CLI and no version
  numbers to bump. Updates are commits, and you already know how to read
  those.
- **The starter is built to merge cleanly.** The skills change a fork
  through seams: tokens, copy files, new migrations, new files.
  Internal names stay `gathering` and packages stay `@withme/*` in every
  fork, so a starter fix to `gatherings` still lands on your "runs".
- **You see everything.** A merge brings every starter change into your
  diff for review. Nothing updates underneath you.

The cost is that you resolve conflicts where you and the starter edited
the same lines. The rest of this page keeps those rare and small.

## One-time setup

A fork made with GitHub's **Fork** button shares the starter's history
and already has your repository as `origin`. Add the starter as a second
remote, and tell `gh` which repository is yours (with two remotes and no
default, `gh pr create` asks, or targets the starter):

```sh
git remote add upstream https://github.com/vibe-with-me/withme-starter.git
git fetch upstream
gh repo set-default <org>/<app>
```

Do this at step 0, before your first skill, and the rest is routine.

**A private app** cannot use the Fork button (a fork of a public
repository stays public, and GitHub will not fork a repository into the
organization that owns it). Clone the starter and push it to a new
private repository. The clone's `origin` is the starter, so rename it to
`upstream` and add your repository as `origin` before the first push; the
history is shared, so everything below works unchanged:

```sh
git clone https://github.com/vibe-with-me/withme-starter.git <app>
cd <app>
gh repo create <org>/<app> --private
git remote rename origin upstream
git remote add origin https://github.com/<org>/<app>.git
git push -u origin main
gh repo set-default <org>/<app>
```

**If your fork has no shared history** (made with "Use this template", or
copied in as files), git sees two unrelated projects and the first merge
conflicts on every file. Fix that once by recording the starter commit
you copied as an ancestor, without changing any of your files:

```sh
git fetch upstream
git merge -s ours --allow-unrelated-histories <starter commit you copied>
```

`-s ours` keeps your tree exactly as it is; the merge only teaches git
where your fork came from. If you do not know the exact commit, use the
one closest to your copy's date (`git log upstream/main --until=<date>`).
Any later change in between shows up as a normal conflict on the next
merge.

## Taking an update

Do this on a branch, like any other change, and merge it through a PR so
CI runs. Merge that PR with a **merge commit, never a squash** (step 6
says why).

**1. See what is coming.**

```sh
git fetch upstream
git log --oneline HEAD..upstream/main
```

The starter squash-merges, so each line is one PR with a title that says
what changed. Read the ones that touch migrations, the contract, or a
skill you ran; the PR description says why.

Then find the migrations that will undo yours. A starter migration that
redefines a function you changed (`create_gathering` after
customize-gathering, `resolve_tag` after extend-profile), re-issues a
column grant you widened, or re-adds a constraint you replaced merges
with no conflict, and when it runs, the starter's version replaces yours:
your field silently stops being written. This lists each one:

```sh
bun run sync:check
```

The first sync that brings the script in has neither the script nor the
`sync:check` entry yet (both arrive with that merge), so that once, run
the starter's copy straight from `upstream/main`:

```sh
bash <(git show upstream/main:scripts/upstream-redefines.sh) HEAD upstream/main
```

It prints `<incoming migration> redefines <name>; yours: <your
migrations>` per hit, or that there are none. It matches names, not
bodies, so read each hit: the incoming file against yours. One that
changes what you changed (a body you extended, a grant you widened) is a
follow-up migration to write after the merge (see
[Migrations](#migrations), "Objects you both changed"); one that leaves
it alone needs nothing. A starter PR that does this says so in its
title ("redefines create_gathering"), so the step 1 log shows it too.

**2. Merge.**

```sh
git switch -c starter-sync
git merge upstream/main
```

**3. Resolve conflicts.** See [Where conflicts come from](#where-conflicts-come-from)
below. In short: your brand and your nouns win; the starter's logic,
policies, and tests win.

**4. Reinstall and regenerate.**

```sh
bun install
bun run db:reset
bun run db:types
```

`db:reset` replays every migration, the starter's and yours, in filename
order on a clean local database. That replay is the real test of a merge:
it fails if a starter migration and one of yours disagree.

A starter change can add a key to an `.env.example` that your own `.env`
does not have yet (`EXPO_PUBLIC_WEB_URL` arrived this way). Each of these
prints the keys one side has and the other lacks; copy the new ones over:

```sh
diff <(grep -oE '^[A-Z_][A-Z0-9_]*=' apps/mobile/.env.example | sort) <(grep -oE '^[A-Z_][A-Z0-9_]*=' apps/mobile/.env | sort)
diff <(grep -oE '^[A-Z_][A-Z0-9_]*=' apps/web/.env.example | sort) <(grep -oE '^[A-Z_][A-Z0-9_]*=' apps/web/.env | sort)
diff <(grep -oE '^[A-Z_][A-Z0-9_]*=' apps/api/.dev.vars.example | sort) <(grep -oE '^[A-Z_][A-Z0-9_]*=' apps/api/.dev.vars | sort)
```

**4b. Put new starter code in your words.** New starter files arrive in
the starter's nouns, paths and brand, with no conflict to warn you: a page
title that says "— withme", a `navigate` to `/gatherings`, a spec that
clicks "Events", a test that calls `create_gathering` without your
field's argument. Typecheck and the tests catch some; nothing catches the
copy. Sweep what the merge brought in, in two passes, so the real hits
are not buried under internal names (on the merge commit, `HEAD^1` is
your `main` before it):

```sh
git diff --name-only --diff-filter=d HEAD^1 HEAD -- apps packages supabase/seed > /tmp/sync-files

# 1. Copy: string literals and JSX text that read as words (a space, or a
#    capital first letter), so `gathering_id` and `feed.gatherings` stay out.
xargs perl -ne 'while (/(["\x27`])((?:\\.|(?!\1).)*?)\1|>([^<>{}]+)</g) { my $s = $2 // $3;
  print "$ARGV:$.: $s\n" if $s =~ /\b(withme|[Gg]atherings?|Events?|Discover|Yours|Hosting|[Gg]oing)\b/ && $s =~ /\s|^[A-Z]/ }
  close ARGV if eof' < /tmp/sync-files

# 2. Paths and calls: a URL a person visits, and callers of create_gathering.
xargs grep -nE "['\"\`]/gatherings?\b|create_gathering|gatherings\.create" < /tmp/sync-files
```

Every line of pass 1 is something a person reads, a spec clicks, or a
test names; change the ones in the starter's words. Its word list is the
starter's own labels that `customize-gathering` §1 renames: the nouns,
the tab ("Events"), the segments ("Discover", "Yours"), the marks
("Hosting", "Going") and the counter ("N going", "N of M going"). If you
renamed more, add your starter originals to the list. Pass 2's paths take
your route names; its callers take your fields' arguments.

Internal identifiers stay as they are (`gathering` in code, `@withme/*`),
as everywhere else. What a person reads or a URL they visit takes your
words: the same rules as `make-it-yours` step 3 and `customize-gathering`
§1.

**5. Run the gate, then the e2e suites.**

```sh
bun run lint && bun run typecheck && bun run test
bun run --cwd apps/web test:e2e
```

The API's e2e harness needs the API running in another shell;
[Local development](local-development.md) has the table.

The RLS suite matters most. If a starter PR tightened a policy, its test
arrives with it, and your fork now has to pass it too.

**6. Open the PR, merge it with a merge commit, then deploy as usual.**
Not "Squash and merge", even if every other PR in your repo is squashed
(the starter's are). The merge commit's second parent is what makes the
starter's commits ancestors of your `main`; a squash drops it, so the
next sync starts from the old merge base and asks you to resolve every
conflict you already resolved. If the repository allows only squash
merges, turn on **Settings → General → Allow merge commits**. The
setting covers every pull request in the repository, and GitHub can't
limit it to sync PRs, so keep squashing ordinary PRs by habit. A branch ruleset or protection rule on
`main` can still refuse it: remove **Require linear history**, and add
**Merge** to the pull-request rule's allowed merge methods (Settings →
Rules → Rulesets). Keep the rest (no deletion, no force push, PRs and CI
required). Without branch protection you can also merge locally with
`git switch main && git merge --no-ff starter-sync` and push `main` (the
switch matters: on `starter-sync` itself the merge has nothing to do); a
protected `main` refuses that push unless your account can bypass its
rules: on a ruleset's bypass list with the mode set to **Always** (a
**Pull requests only** bypass still refuses a direct push), or an admin
under a classic protection rule that doesn't include administrators.
Afterwards, check
(fetch `origin` only, so `upstream/main` is still the commit you merged):

```sh
git fetch origin
git merge-base --is-ancestor upstream/main origin/main && echo "synced"
```

It prints `synced` when the merge kept the starter's history; silence
means the PR was squashed, and the next sync will replay this one's
conflicts. After it merges, `supabase db push` sends the new migrations
to production (see [Migrations](#migrations) for the one flag it may ask
for).

## Where conflicts come from

| You changed | The conflict looks like | Keep |
| --- | --- | --- |
| Tokens, fonts, wordmark, copy (`make-it-yours`) | A starter PR adjusted a color, a string, or a font file you replaced. | Yours. Then read the starter's change and carry it over if it was a fix (a contrast bump, a typo) rather than taste. |
| Route files and user-facing nouns (`customize-gathering`) | Git usually follows a renamed route file. When it cannot, the starter's edit to `_app.gatherings.tsx` lands as a conflict beside your `_app.runs.tsx`. A new starter test can also assert the old path or noun (`/gathering/…` in `apps/mobile/lib/gathering-link.test.ts`) and merge with no conflict at all: then `bun run test` is what tells you. | Your names, with the starter's logic moved into them, and in its tests. |
| Tokens you added yourself, that the starter later adds too | No conflict: the starter's export lands elsewhere in the file, and the file now declares it twice (a fork that added its own `displaySize` to `apps/mobile/lib/tokens.ts` before the starter shipped one). `bun run typecheck` names the duplicate. | The starter's, with your values. Delete your own export and move the values into the starter's. |
| App identity, EAS ids, worker names (`app.json`, `wrangler.jsonc`) | The starter bumped a version or added a key next to your ids. | Your ids, plus the starter's new keys. |
| `bun.lock` | Almost always conflicts when both sides added dependencies. | Neither: take either side, run `bun install`, commit the result. |
| `.agents/skills/` | Only if you edited a skill. | The starter's. Skills are runbooks; the new version is written against the new code. |
| `AGENTS.md` | Only if you edited it. | Both: keep your lines, and take the starter's changes to the skill list. |
| `apps/site` (`add-marketing-site`) | Never: the starter has no `apps/site`. Your site is a copy of the skill's `site/` template, so a fix to the template arrives in `.agents/skills/add-marketing-site/site/` and does not reach your copy. | Yours. When the merge changes that template, diff it against `apps/site` and carry the fixes over by hand. |
| A starter file you rewrote for your own feature | Real conflicts, every time that file changes. | Decide case by case. This is the cost to avoid (below). |

## Migrations

Migrations are where a merge can be clean and still be wrong, because git
does not know SQL.

- **Name order.** Migrations run in filename (timestamp) order. A starter
  migration written last week sorts before the one you wrote yesterday.
  Locally, `db:reset` handles that. On a hosted project that already ran
  yours, `supabase db push` stops and says a local migration would be
  inserted before the last remote one. Read the starter migration, check
  it does not depend on anything of yours, and push with
  `supabase db push --include-all`.
- **Objects you both changed.** A starter migration that recreates a
  function, policy, or view you altered replaces your version, or fails
  because your version changed its signature. `bun run sync:check` (step
  1) lists the functions, column grants and constraints; policies and
  views you check by hand. For each hit that changes what you changed
  (it matches names, so read it first), write a new migration of yours,
  dated after the starter's, that starts from the starter's new body
  (that incoming file) and reapplies your lines on it.
- **Signatures you changed.** A fork that added an argument has a
  function the starter's `drop function if exists …(<old signature>)`
  does not name, so after the merge both versions exist: yours as a second
  overload that misses the starter's new behaviour, and PostgREST picks
  between them by argument names. In that follow-up migration, drop your
  signature too, so one version is left (`select oid::regprocedure from
  pg_proc where proname = '<name>'` lists them).
- **Never edit a migration that has run.** That goes for the starter's and
  yours. Fix forward with a new file; editing one that has already run
  makes the merge and production disagree.

## Keeping merges cheap

- **Change the starter through the skills where one fits.** They touch the
  seams the starter keeps stable, so their edits rarely meet a starter
  change.
- **Add, do not rewrite.** A new route, a new migration, or a new component
  in its own file never conflicts. A rewritten starter file conflicts
  every time the starter touches it.
- **Keep internal names.** `gathering`, `@withme/*`, and the contract's
  procedure names stay as they are. Rename what users read, not what code
  calls.
- **Do not reformat starter files.** A formatter run over the whole repo
  turns every later starter change into a conflict.
- **Merge little and often.** The starter is v0.x, and breaking changes
  are expected. A month of changes is a quick merge; six months is an
  afternoon.

## Taking one fix early

When a single starter fix cannot wait for a full merge, cherry-pick it:

```sh
git cherry-pick <sha>
```

The next full merge finds the same change on both sides and does not conflict over it.

## Sending fixes back

If you fix something in your fork that is not specific to your vertical
(a policy gap, a broken step in a skill, a pothole in `go-live`), open a
PR against the starter. Once it merges, your next sync brings the same
change back and the two copies match, so you are not carrying a private
patch. [CONTRIBUTING](../CONTRIBUTING.md) has the rules; a skill fix
found by a real fork is the most welcome kind.
