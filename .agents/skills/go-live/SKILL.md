---
name: go-live
description: Use when deploying a withme-starter app (or fork) to production — hosted Supabase, Cloudflare Workers for api and web, and an EAS Update for mobile. Covers first deploys and redeploys.
---

# go-live — deploy the stack, with the potholes pre-marked

Distilled from two real production deploys (the starter demo and a
vertical fork). Every step below was executed against live infrastructure;
every warning marks a pothole that was actually hit. Order matters: DB →
API worker → web worker → mobile.

Prerequisites: a Supabase account (`supabase login` — the CLI token, NOT
an MCP token: MCP Supabase tokens are scoped to one org and cannot see or
create others), a Cloudflare account (`wrangler whoami` to confirm), and
for mobile an Expo account (`eas-cli` logged in). Costs: a Supabase
project is $0 on a free-plan org (two projects, **pauses after ~1 week
idle** — fine for demos, wrong for production) or ~$10/mo on a paid org
(always-on). Prefer a separate org per product: billing isolation and
access blast-radius. Get the owner's explicit OK before anything that
bills or writes to a production database.

## 1. Hosted database

```sh
supabase orgs create "<Org Name>"            # new org = free plan
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)
mkdir -p "$HOME/.config/<name>"             # outside the repo
(umask 077 && printf '%s\n' "$DB_PASS" > "$HOME/.config/<name>/supabase-db-password")
chmod 600 "$HOME/.config/<name>/supabase-db-password"   # umask only covers a new file
supabase projects create <name> --org-id <org-id> --region us-east-1 --db-password "$DB_PASS"
```

Project provisioning takes 1–2 minutes; `supabase projects list` shows
it. Then from the repo root:

```sh
SUPABASE_DB_PASSWORD="$(cat "$HOME/.config/<name>/supabase-db-password")" supabase link --project-ref <ref>
SUPABASE_DB_PASSWORD="$(cat "$HOME/.config/<name>/supabase-db-password")" supabase db push
```

Both commands read the password from `SUPABASE_DB_PASSWORD` (the CLI
reference documents it for `link`; Supabase's troubleshooting guide for
failed SASL auth uses it with `db push`), which keeps it off the command
line, where `-p` would show it to `ps`.

**Checkpoint:** `db push` lists every migration and ends `Finished
supabase db push`.

The migrations also create the public `avatars` bucket and its policies
(Storage is on by default in hosted projects). Confirm it under Storage →
Buckets: public, 1 MiB, `image/jpeg, image/webp`.

Fetch keys into a gitignored env file — never put the service key on a
command line (it lands in shell history and transcripts):

```sh
supabase projects api-keys --project-ref <ref> -o json | python3 -c "
import json, sys
keys = {k['name']: k['api_key'] for k in json.load(sys.stdin)}
anon = next((v for v in keys.values() if str(v).startswith('sb_publishable_')), keys.get('anon', ''))
with open('.env.demo-seed', 'w') as f:
    f.write('SUPABASE_URL=https://<ref>.supabase.co\n')
    f.write(f\"SUPABASE_SERVICE_ROLE_KEY={keys['service_role']}\n\")
    f.write(f'SUPABASE_ANON_KEY={anon}\n')
" && chmod 600 .env.demo-seed
```

Seed (a production write — owner's OK first):

```sh
(
  set -e
  set -a
  source .env.demo-seed
  set +a
  : "${SUPABASE_URL:?missing from .env.demo-seed}"
  : "${SUPABASE_SERVICE_ROLE_KEY:?missing from .env.demo-seed}"
  SEED_ALLOW_REMOTE=1 bun run db:seed
)
```

Every block that sources the keys file does it in a subshell like this one,
so the keys never stay exported in your shell: the db package's test utils
read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and a later
`cd packages/db && bun test` would run the RLS suite against production
with the service role (a code guard is tracked as ENG-752). One command per
line: under `set -e`, zsh does not stop partway through an `&&` chain.

Auth note: hosted signups hit email confirmation, and the default
Supabase SMTP only delivers to org members — seeded demo credentials are
the path for anyone else unless you configure SMTP or flip confirmations
off in the dashboard.

Phone sign-in is off on a new hosted project until you turn it on. Ask
the owner for their Twilio Account SID, Verify Service SID (`VA…`) and
Auth Token, then have them enter these under Authentication → Sign In /
Providers → Phone → Twilio Verify. Secrets go into the dashboard, never
the repo. Do not add the local test number there. A Twilio trial account
texts verified numbers only.

## 2. API worker (first — the web worker's service binding needs it)

```sh
cd apps/api && bunx wrangler deploy
```

Cloudflare's API intermittently returns 502/504/524; retry up to 4 times
with ~30s backoff — the failure is theirs, not your config. Success
prints the workers.dev URL. Then config goes in as SECRETS via stdin
(vars in wrangler.jsonc would be clobbered on every deploy):

```sh
(
  set -e
  set -a
  source ../../.env.demo-seed
  set +a
  : "${SUPABASE_URL:?missing from .env.demo-seed}"
  : "${SUPABASE_ANON_KEY:?missing from .env.demo-seed}"
  printf '%s' "$SUPABASE_URL"      | bunx wrangler secret put SUPABASE_URL
  printf '%s' "$SUPABASE_ANON_KEY" | bunx wrangler secret put SUPABASE_PUBLISHABLE_KEY
  printf '%s' 'https://<web-worker>.workers.dev' | bunx wrangler secret put CORS_ORIGIN
)
```

**Checkpoint:** `curl https://<api-worker>.workers.dev/health` returns
`{"ok":true}`, and a resolve through the SDK (a throwaway script using
`NfcClient`) returns the seeded tag — don't hand-roll the oRPC wire
format with curl; it will 400 and mislead you.

## 3. Web worker

Write `apps/web/.env.production` (gitignored; nothing here is secret):

```env
VITE_API_URL=https://<api-worker>.workers.dev
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
VITE_DEMO_CREDENTIALS=<demo email> / <demo password>
# VITE_STORE_URL=https://<your-store>   # optional: the Merch tab
```

```sh
cd apps/web && bun run build && bunx wrangler deploy   # same retry rule
```

**Checkpoint** (verify bodies with python, not grep chained after curl):
the landing page 200s with the wordmark; `/t/<seeded-uid>` 200s with the
seeded card — this one proves the worker-to-worker service binding,
which only exists if `services[0].service` in `apps/web/wrangler.jsonc`
matches the api worker name exactly. Also verify the authed path once
(sign in as the demo user via supabase-js, call the app router) — it
exercises the JWKS leg, the classic silent failure. Then confirm
`delete_my_account()` works on the hosted project: sign up a throwaway
account on the live web app (an address that can confirm — see the Auth
note in section 1) and delete it (Profile → Account → Delete
account, then Delete my account). It deletes from `auth.users` inside a
definer function; if it fails with `permission denied for table users`,
stop and tell the owner — never work around it with the service role.

## 4. Mobile (EAS Update)

1. Ensure `expo.owner` in `app.json` is the right account/org BEFORE
   init, or the project lands under the wrong owner:
   `bunx eas-cli init --non-interactive --force`, then
   `bunx eas-cli update:configure --non-interactive`.
2. Write `apps/mobile/.env.production` with the `EXPO_PUBLIC_*` mirrors
   of step 3's values.
3. Publish — `--environment` is REQUIRED in non-interactive mode:

```sh
bunx eas-cli update --branch demo --environment production \
  --message "<what changed>" --non-interactive
```

**Checkpoint — do not trust a byte-grep of the published bundle.**
Hermes bytecode chunks long strings, so searching the `.hbc` for your
URLs false-negatives. Verify inlining with a plain-JS export:

```sh
NODE_ENV=production bunx expo export --platform ios --no-bytecode \
  --output-dir /tmp/verify-export
# then assert the prod URLs are present and localhost is absent in the .js
```

`.env.production` beats `.env` in production exports (verified), so a
local `.env` sitting next to it is harmless.

## Redeploys

DB: new migrations via `supabase db push`; reseed only with the owner's
OK. Web: `bun run build && bunx wrangler deploy`. Mobile: a fresh
`eas update`. API: `bunx wrangler deploy` (secrets persist).

## Gotcha index

| Symptom | Cause |
|---|---|
| MCP Supabase tools can't see the new org | MCP tokens are org-scoped; use the CLI |
| `wrangler deploy` 502/504/524 | Cloudflare API blip — retry with backoff |
| Web resolver errors only in production SSR | Service binding name ≠ api worker name |
| Signups never confirm | Default SMTP delivers to org members only |
| Phone sign-in: "Unsupported phone provider" | The Phone provider is off in the dashboard |
| Phone sign-in texts some numbers only | Twilio trial account: verify the number or upgrade |
| `eas update` fails non-interactively | Missing `--environment` |
| Published app seems to point at localhost | You byte-grepped Hermes bytecode — use `--no-bytecode` to verify |
| Demo DB unreachable weeks later | Free-tier project paused — wake it in the dashboard |
| git status shows .supabase-demo-db-password, or the repo has one | an older copy of this runbook wrote it into the repo root (the starter's .gitignore now ignores the name; older forks do not): move it to `$HOME/.config/<name>/supabase-db-password` (the name the commands read), `chmod 600` it, and never commit it. If it was ever committed, moving it does not remove it from history: reset the database password (Dashboard → Project Settings → Database) and write the new one to `$HOME/.config/<name>/supabase-db-password` |
