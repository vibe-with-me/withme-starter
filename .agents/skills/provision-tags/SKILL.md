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

Distilled from the provisioning script a real fork (golf-with-me) built and
used; that script ships in the starter as
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
| Its service-role client | `admin` from `packages/db/src/test-utils/index.ts` — reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; with the URL unset it targets the local stack, and with the key unset on a local target `supabase/seed/local-env.ts` takes the local key from `supabase status` |
| The row | `public.tags` in `supabase/migrations/20260610120000_initial_handshake_schema.sql`: `uid` CHECK `^[0-9A-F]{14}$`, `tags_state_consistent`, no anon policy, owner-only `tags_select_own` / `tags_update_own` |
| First tap wins | `public.claim_tag`, same migration |
| Unknown and unclaimed look alike | `public.resolve_tag` answers `unclaimed` for both (newest definition: the last migration that defines it) |
| The tap | web `apps/web/src/routes/t.$uid.tsx` → `claim.$uid.tsx`; mobile `apps/mobile/app/t/[uid].tsx` → `claim/[uid].tsx` |
| The in-app reader | `readTagUid` in `apps/mobile/lib/nfc.ts` — reads the chip's own UID, not the URL (§5) |
| After the claim | the owner's Profile → "My tags" on both platforms (web `apps/web/src/components/MyTags.tsx`, mobile `apps/mobile/components/MyTags.tsx`), over `app.tags.listMine` / `app.tags.update`: re-point a tag (the card or one of their gatherings) and "Turn off" / "Turn on" (`status` `disabled` / `claimed`, `OwnerTagStatusSchema` in `packages/contract/src/schemas/tag.ts`). A gathering's detail screen also points all of them at once (`TagPointer` in web `_app.gatherings_.$id.tsx`, mobile `app/gathering/[id].tsx`). No owner control releases a tag back to `unclaimed`; deleting the account does (`delete_my_account`: claimed tags reset, their scans erased) |

## The rules this runbook will not bend

1. **UIDs come from the script — or, in §5, from the chip itself — never
   from you.** The script draws 6 bytes from
   `crypto.getRandomValues` behind the NXP-style `04` prefix: 48 random bits
   per tag. Never sequential, never hand-picked, never derived from an order
   number or a customer. An unclaimed tag is claimed by whoever presents its
   UID first, and the entropy is the only thing between a guesser and your
   customer's tag: the API Worker rate-limits claims per user
   (`apps/api/src/routers/public.ts`), but any signed-in client can call
   `claim_tag` directly through PostgREST.
2. **The encode list is a set of bearer capabilities** until each tag is
   claimed. It goes to a directory outside the repo, readable only by you
   (`umask 077`), never into git, an issue, a chat, or a shared drive. The
   script writes `provisioned-tags.csv` and `.html` into its working
   directory. The starter's `.gitignore` covers `provisioned-tags.*` as a
   backstop (forks cut before it do not), but an ignored file in a checkout
   is still a capability list sitting in a working tree — so every command
   below runs the script from an output directory. Production batches also
   send stdout to a file, so the UIDs stay out of terminal scrollback and
   agent transcripts.
3. **Provision what you are about to encode.** Unclaimed inventory is
   claimable inventory: batches of tens, not thousands held in advance.
4. **Provisioning is an operator action on the service-role key** — never an
   endpoint, an RPC, a policy, or a button. Do not add a "provision" or
   "list unclaimed tags" surface to the API or the apps: it would be an
   enumeration surface for exactly the rows that can be stolen.
5. **Production writes need the owner's explicit OK**, as in go-live. The
   script refuses a non-local `SUPABASE_URL` unless `SEED_ALLOW_REMOTE=1`,
   exiting 1 before any query with
   `Refusing to provision against non-local Supabase at https://<ref>.supabase.co. Set SEED_ALLOW_REMOTE=1 to override.`
6. **The domain you encode is forever.** Tags are locked read-only after
   writing. Encode the web origin you will own for the life of the tags (a
   custom domain), not a `*.workers.dev` URL tied to a worker name.

## Inputs to collect before you start

- Count: 1–1000 per run. The script enforces it: anything else prints
  `--count must be an integer between 1 and 1000` and exits 1.
- Base URL: the `https` web origin that serves `/t/<UID>`, no trailing
  path (e.g. `https://tags.acme.com`); locally `http://localhost:3000`.
- Target: the local stack, or production (needs `.env.demo-seed` from
  go-live §1 and the owner's OK).
- An output directory outside the repo, new for every batch (the script
  overwrites `provisioned-tags.*` in place).

## 1. Rehearse locally

A checkout set up as the README Quickstart does it: the env files copied
(`apps/api/.dev.vars`, `apps/web/.env`), the stack up (`bun run db:start`),
and seeded (`bun run db:seed`: the end-to-end check below signs in as a
demo user; the seed is local-only and safe to re-run). From the repo root:

```sh
REPO="$(git rev-parse --show-toplevel)"
OUT="$HOME/<wordmark>-tags/local-$(date +%Y%m%d-%H%M%S)"
(
  set -e
  umask 077
  mkdir -p "$(dirname "$OUT")"
  mkdir "$OUT"
  cd "$OUT"
  bun run "$REPO/supabase/seed/provision.ts" --count 3 --base-url http://localhost:3000
)
```

`<wordmark>` is your brand's lowercase wordmark (make-it-yours): the
starter's is `withme`, so its batches land under `$HOME/withme-tags/`,
and a rebranded fork's under its own name. §2 uses the same parent.

Running the file directly instead of `bun run db:provision` is deliberate:
the script writes into the current directory, and this keeps that
directory out of the repo. Imports still resolve from the script's own
folder. The `umask 077` subshell makes the new directories and both files
readable only by you, and `mkdir "$OUT"` (no `-p`) stops it on a reused
directory before the script runs.

Name the local database container too; the checkpoint below and §5 use it:

```sh
DB="supabase_db_$(sed -n 's/^project_id = "\(.*\)"/\1/p' "$REPO/supabase/config.toml")"
```

Even locally, the script prints every UID to the terminal, and so do the
app's pages and the dev servers' logs. An agent running this rehearsal
keeps them out of its transcript as §2 does: append `> provision.log` to
the `bun run` line, read the log through a redacted view
(`sed 's/04[0-9A-F]\{12\}/04<UID>/g' "$OUT/provision.log"`), keep the
checkpoint's `psql` to counts by status as written below (pipe any query
that selects `uid` through the same `sed`), and write the dev servers'
logs into `$OUT` so §4's retirement deletes them.

**Checkpoint:**

- stdout (or `provision.log`) starts
  `Provisioned 3 unclaimed tags on http://127.0.0.1:55321`, lists three
  `  04…  http://localhost:3000/t/04…` lines, and ends
  `Wrote provisioned-tags.csv and provisioned-tags.html (printable).`
- `ls -l "$OUT"` lists exactly `provisioned-tags.csv` and
  `provisioned-tags.html` (plus `provision.log` if you redirected), both
  `-rw-------` (macOS may print `-rw-------@`: the `@` marks extended
  attributes, not a permission);
  `head -1 "$OUT/provisioned-tags.csv"` is `uid,encode_url`.
- `git -C "$REPO" status --porcelain` prints nothing, and
  `find "$REPO" -maxdepth 1 -name 'provisioned-tags.*'` prints nothing (the
  ignore line would hide a stray copy from `git status`, so look for the
  file; use `find`, not an `ls` glob, which zsh turns into a
  `no matches found` error).
- The rows exist and are unclaimed:

  ```sh
  UIDS=$(tail -n +2 "$OUT/provisioned-tags.csv" | cut -d, -f1 | sed "s/.*/'&'/" | paste -sd, -)
  docker exec "$DB" psql -U postgres -tAc "select status, count(*) from public.tags where uid in ($UIDS) group by status"
  ```

  prints one line, `unclaimed|3`: counts only, so no UID reaches the
  terminal.
- End to end, with both dev servers up (`cd apps/api && bun run dev` and
  `cd apps/web && bun run dev`; an agent adds `> "$OUT/api-dev.log" 2>&1`
  and `> "$OUT/web-dev.log" 2>&1`, and starts each under `umask 077` so
  those logs, which carry the UIDs, are 0600 like the batch files:
  `(umask 077; cd apps/web && bun run dev > "$OUT/web-dev.log" 2>&1)`, the
  same for `apps/api`): open one encode URL signed out.
  `/t/<UID>` goes to `/claim/<UID>`, which sends you to sign in
  (`/login?returnTo=%2Fclaim%2F<UID>`). Sign in there as the seed's demo
  user (`lin@demo.withme.local` / `withme-demo-1`, or your rebranded
  identity; its profile is complete), and you return to "Claim this tag"
  with the UID. Press "Claim tag": the page becomes that user's card ("This
  is your tag."). From then on the encode URL shows that card to everyone
  else, with "Connect", and never offers a claim. A second account that
  presses "Claim tag" on a claim page it opened before the claim landed
  gets "This tag has already been claimed." A brand-new account first gets
  the profile step before "Claim this tag": "First, your name" (Name
  only) in the starter and in a fork whose extend-profile required no
  vertical field, "First, your card" (Name plus the required fields) when
  it made one required; fill it in, or use a second seeded user.
  If `/t/<UID>` hangs after the claim under `vite dev` (a known dev-server
  SSR hang, not a fault in the tag or the claim), restart `apps/web`'s dev
  server: stop the running `bun run dev` (Ctrl-C in its shell, or kill the
  `vite` process and its `bun` parent), start it again the same way (an
  agent appends to the same log: `>> "$OUT/web-dev.log" 2>&1`), and load
  the page again.

## 2. Provision the real batch

Production needs the keys file from go-live §1 and the owner's explicit OK.

**Stop first.** Show the owner what this batch will write, and wait for a
clear yes before running anything below:

- the project ref, from the keys file without the key:
  `sed -n 's|^SUPABASE_URL=https://\([^.]*\)\.supabase\.co.*|\1|p' "$(git rev-parse --show-toplevel)/.env.demo-seed"`;
- the count (`<n>` below);
- the `--base-url`, and that its domain cannot change once the tags are
  locked (rule 6).

A yes to another ref, count, or domain is not a yes to this batch. Then:

```sh
REPO="$(git rev-parse --show-toplevel)"
OUT="$HOME/<wordmark>-tags/$(date +%Y%m%d)-batch-<k>"
(
  set -e
  umask 077
  mkdir -p "$(dirname "$OUT")"
  mkdir "$OUT"
  set -a
  source "$REPO/.env.demo-seed"
  set +a
  : "${SUPABASE_URL:?missing from .env.demo-seed}"
  : "${SUPABASE_SERVICE_ROLE_KEY:?missing from .env.demo-seed}"
  cd "$OUT"
  SEED_ALLOW_REMOTE=1 bun run "$REPO/supabase/seed/provision.ts" \
    --count <n> --base-url https://<your-domain> > provision.log
)
head -1 "$OUT/provision.log"
```

`<k>` numbers the batch; `<n>` is the count the owner agreed to. The
subshell stops at the first failed line. `mkdir "$OUT"` (no `-p`) fails if
the directory exists, so a reused batch name stops before the script can
overwrite an earlier list. The keys file matters most: if `source` fails
(wrong directory, file never written), or the file has no `SUPABASE_URL`
or `SUPABASE_SERVICE_ROLE_KEY`, the script would otherwise fall back to its
local defaults and quietly provision the batch on your laptop's stack. One
command per line is deliberate. Under `set -e`, zsh does not stop when a
command fails partway through an `&&` chain, so
`set -a && source … && set +a` would carry on with nothing loaded.

**Checkpoint** (without printing the UIDs):

- the first log line reads `Provisioned <n> unclaimed tags on https://<ref>.supabase.co`;
- `tail -n +2 "$OUT/provisioned-tags.csv" | wc -l` prints `<n>` (macOS
  pads it with spaces);
- `tail -n +2 "$OUT/provisioned-tags.csv" | cut -d, -f2 | grep -vc '^https://<your-domain>/t/04[0-9A-F]\{12\}$'`
  prints `0` (every URL is on your domain and well-formed). `grep -c` exits
  1 when the count is 0; the printed `0` is the pass.

Do not paste the CSV anywhere to check it.

## 3. Encode, lock, verify

For each row of `provisioned-tags.html` (print it or open it locally):

1. Write the URL to the tag as an NDEF URI record (NXP TagWriter or any
   NFC writer app).
2. Read the tag back in the writer app and compare the URL with the sheet
   row. Then lock the tag read-only — irreversible, so compare first.
3. Tap it with a phone: the OS opens `https://<your-domain>/t/<UID>` and the
   page shows "Claim this tag" with the UID (after a sign-in if that
   browser is signed out) — compare it with the sheet. **Do not press
   "Claim tag"** on a tag that is going to someone else: the first claim
   owns it.

## 4. Ship and retire the list

Ship the tags. The encode list has then done its job: keep the CSV only if
your fulfillment records need it — offline, access-limited — and otherwise
delete the batch directory (and its parent, if that leaves it empty).
After a §1 rehearsal, stop both dev servers first: their logs live in
`$OUT` and carry the UIDs, and a running server keeps writing them. If
you keep the CSV, delete `provisioned-tags.html` and `provision.log` from
the batch directory: both carry the same UIDs. A printed sheet is the
same bearer list on paper: shred it once the batch has shipped.

If a `provisioned-tags.*` file was ever committed, deleting it does not
remove it from history: every UID in it that is still unclaimed is
compromised. With the owner's OK (the stop in §2), run in the project's SQL
editor, with exactly the UIDs from that file:

```sql
delete from public.tags
where uid in ('04A1B2C3D4E5F6', '04A1B2C3D4E5F7') and status = 'unclaimed'
returning uid;
```

Or `update public.tags set status = 'disabled' where …` with the same
`where`, to keep the rows. Either way nobody can claim those tags any
more; replace them from a new batch.

Those statements skip the list's claimed UIDs, and someone holding the
list may have claimed one before its tag reached the customer. Have the
owner review them in the SQL editor, not a terminal or CI log, with the
same UIDs:

```sql
select t.uid, t.claimed_by, t.updated_at, p.display_name
from public.tags t join public.profiles p on p.id = t.claimed_by
where t.uid in ('04A1B2C3D4E5F6', '04A1B2C3D4E5F7');
```

The schema keeps no claim time: `updated_at` is the row's last change (the
claim, or a later destination or on/off change). The owner checks each
claimant against who was sent that tag. A claim by the customer who has
the tag is legitimate: leave it, since disabling it takes their tag away.
For a claim the owner judges illegitimate, and only with the owner's OK
for that UID:

```sql
update public.tags
set status = 'disabled', claimed_by = null, destination = null
where uid = '04A1B2C3D4E5F6' and claimed_by = '<claimed_by from the review>'
returning uid;
```

No row back means the tag changed hands since the review (its owner
deleted their account, and someone may have claimed it since): run the
review again.

Clearing `claimed_by` matters: a disabled row that keeps its owner stays
in that account's My tags, which can switch it back on. The tag then
resolves as disabled and nobody can claim it. Send the rightful holder a
new tag from a fresh batch.

A claimed tag's UID keeps resolving (that is the product) but can no
longer be claimed — until its owner deletes their account, which releases
the tag to `unclaimed`. By then everyone who tapped it has seen its UID, so
rule 1's entropy no longer protects it: whoever claims it next owns it. If
that matters for your fork, retire the physical tag, or disable its row
with the same `update`, scoped to that UID and `status = 'unclaimed'`.

## 5. The chip's own UID (in-app reading)

The mobile scanner's "Read NFC tag" (`readTagUid`) reads the chip's
hardware UID, not the URL written on it. For a tag carrying a
script-generated UID:

- a tap through the phone's OS — the normal path — opens the URL and works;
- the in-app reader resolves the chip's UID instead, which was never
  provisioned, and lands on the claim screen for an unknown tag. Typing the
  URL's UID into the scanner's manual field works.

If in-app reading must work for a batch, provision the chips' own UIDs
instead. Read each one with your writer app and write it as 14 uppercase
hex characters with no separators (writer apps often show `04:A1:B2:…`).
The `uid` CHECK rejects lowercase, separators, and any other length, so
only 7-byte UIDs (NTAG21x and the like) fit; 4-byte MIFARE Classic UIDs do
not. Then run:

```sql
insert into public.tags (uid) values ('04A1B2C3D4E5F6'), ('04A1B2C3D4E5F7')
on conflict (uid) do nothing
returning uid;
```

Each new row comes back under `returning`; a UID that already exists
returns nothing and is left as it was.

Locally, from the repo root (a fresh shell needs `$DB` again):

```sh
DB="supabase_db_$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)"
docker exec "$DB" psql -U postgres -c "<that sql>"
docker exec "$DB" psql -U postgres -tAc "select count(*) from public.tags where uid = '<that UID>' and status = 'unclaimed'"
```

The count prints `1`. `/t/<that UID>` is no check: an unknown UID
redirects to the claim page just the same, by design.

In production, stop first, as in §2: show the owner the project ref, each
UID you are inserting, and the domain you will encode (it cannot change
once the tags are locked), and wait for a clear yes. Then run it in that
project's SQL editor in the Supabase dashboard, and encode
`https://<your-domain>/t/<that UID>`.

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
  for whoever writes the tags. Printed, that table already puts the
  capability on paper, and so would a QR sheet if you add one: both inherit
  rule 2 and §4 (shred once the batch has shipped).
- Re-pointing and turning off a claimed tag belong to its owner (Profile →
  My tags, in the map); a tag goes back to `unclaimed` only when its owner
  deletes their account. The operator has no client path to someone else's
  tag, by design.
- The gate is unchanged: `bun run lint && bun run typecheck && bun run test`
  stays green, because this runbook changes no code. A batch is proven by
  §1's checkpoint locally and §2–§3's checkpoints in production.
