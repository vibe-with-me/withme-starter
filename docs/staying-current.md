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
CI runs.

**1. See what is coming.**

```sh
git fetch upstream
git log --oneline HEAD..upstream/main
```

The starter squash-merges, so each line is one PR with a title that says
what changed. Read the ones that touch migrations, the contract, or a
skill you ran; the PR description says why.

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

**5. Run the gate, then the e2e suites.**

```sh
bun run lint && bun run typecheck && bun run test
bun run --cwd apps/web test:e2e
```

The API's e2e harness needs the API running in another shell;
[Local development](local-development.md) has the table.

The RLS suite matters most. If a starter PR tightened a policy, its test
arrives with it, and your fork now has to pass it too.

**6. Open the PR, then deploy as usual.** After it merges,
`supabase db push` sends the new migrations to production (see
[Migrations](#migrations) for the one flag it may ask for).

## Where conflicts come from

| You changed | The conflict looks like | Keep |
| --- | --- | --- |
| Tokens, fonts, wordmark, copy (`make-it-yours`) | A starter PR adjusted a color, a string, or a font file you replaced. | Yours. Then read the starter's change and carry it over if it was a fix (a contrast bump, a typo) rather than taste. |
| Route files and user-facing nouns (`customize-gathering`) | Git usually follows a renamed route file. When it cannot, the starter's edit to `_app.gatherings.tsx` lands as a conflict beside your `_app.runs.tsx`. | Your names, with the starter's logic moved into them. |
| App identity, EAS ids, worker names (`app.json`, `wrangler.jsonc`) | The starter bumped a version or added a key next to your ids. | Your ids, plus the starter's new keys. |
| `bun.lock` | Almost always conflicts when both sides added dependencies. | Neither: take either side, run `bun install`, commit the result. |
| `.agents/skills/` | Only if you edited a skill. | The starter's. Skills are runbooks; the new version is written against the new code. |
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
  because your version changed its signature. For each incoming
  migration, search your own migrations for the objects it names. If you
  find one, write a new migration of yours, dated after the starter's,
  that reapplies your change on top.
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
