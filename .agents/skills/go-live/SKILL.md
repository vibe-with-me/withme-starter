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

Reusing an existing project with an older schema: `db push` refuses when
the remote migration history differs from the local one. Only for a
project with no data worth keeping (a demo or throwaway being reset on
purpose), the owner resets it (owner-run, never Claude):
`supabase link --project-ref <ref> && supabase db reset --linked`. That
drops everything in the project's database, data included, then applies
every local migration itself, so skip `db push`; verify with
`supabase migration list --linked` (every local migration shows a remote
match). A project whose data matters is never reset: reconcile its history
with `supabase migration repair` and move its schema with a reviewed
migration instead.

The migrations also create the public `avatars` bucket and its policies
(Storage is on by default in hosted projects). Confirm it under Storage →
Buckets: public, 1 MiB, `image/jpeg, image/webp`.

Fetch keys into a keys file next to the database password, outside the
repo: a service-role key in the working tree is one `git add -A` away from
a commit. Never put the service key on a command line either (it lands in
shell history and transcripts):

```sh
( umask 077
supabase projects api-keys --project-ref <ref> --reveal -o json | python3 -c "
import json, os, secrets, sys
keys = {k['name']: k['api_key'] for k in json.load(sys.stdin)}
anon = next((v for v in keys.values() if str(v).startswith('sb_publishable_')), keys.get('anon', ''))
# A secret key (sb_secret_, needs --reveal) when the project has one, so the
# command still works after section 5 retires the legacy service_role key.
service = next((v for v in keys.values() if str(v).startswith('sb_secret_')), keys.get('service_role', ''))
if not service:
    sys.exit('no secret or service_role key found')
path = os.path.expanduser('~/.config/<name>/demo-seed.env')
tmp = path + '.tmp'
if os.path.exists(tmp):
    os.remove(tmp)
# A new file, 0600 from its first byte, then swapped in: writing over an
# existing file would keep whatever mode it had while the key lands in it.
with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
    f.write('SUPABASE_URL=https://<ref>.supabase.co\n')
    f.write(f'SUPABASE_SERVICE_ROLE_KEY={service}\n')
    f.write(f'SUPABASE_ANON_KEY={anon}\n')
    f.write(f'SEED_DEMO_PASSWORD={secrets.token_urlsafe(18)}\n')
os.replace(tmp, path)
" )
```

The file holds the service-role key until section 5 retires it. Every
block below reads it from there; nothing copies it into the repo. Run
again, the command replaces the whole file, `SEED_DEMO_PASSWORD`
included: a later seed then resets the demo logins to the new password.

Older projects expose legacy keys only (`anon`, `service_role`, and one
named `default`), no `sb_publishable_…`; the fallback to `anon` is correct
there. The API verifies JWTs against the project's JWKS and accepts only
`ES256` and `RS256` (`apps/api/src/middleware/jwt.ts`), so the project must
*sign* with an asymmetric key. Pre-check:
`curl -s https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` shows a
key with `"alg":"ES256"`; an empty `keys` list means the project still signs
with the legacy shared secret. A listed key is not proof, since a standby
key shows there too: the real check is the authed check in section 3, a
freshly issued token verifying through the API. If the project still issues
HS256 tokens (empty list, or that check 401s), rotate to an asymmetric
signing key in the dashboard (look under Project Settings → JWT Keys)
before go-live.

Decide with the owner which deploy this is, because the seed creates two
demo logins (`ada@` and `lin@demo.withme.local`):

- **A public demo** (nobody signs up for real): the seed stays, and the
  landing page may show a demo login (`VITE_DEMO_CREDENTIALS`, section 3).
- **An app for real users**: the seed is only for the checks in sections
  2 and 3, and section 5 removes it before anyone is told about the app.
  Never publish a demo login next to real users. Whoever holds it can sign
  in as Ada, see the cards of everyone who sends Ada a request, accept
  them, and read their links (phone, email).

On a hosted project the seed refuses to run without its own
`SEED_DEMO_PASSWORD` (the keys file above has one), so no fork ships the
local default password that every copy of this repo prints.

Seed (a production write — owner's OK first):

```sh
(
  set -e
  set -a
  source "$HOME/.config/<name>/demo-seed.env"
  set +a
  : "${SUPABASE_URL:?missing from the keys file}"
  : "${SUPABASE_SERVICE_ROLE_KEY:?missing from the keys file}"
  SEED_ALLOW_REMOTE=1 bun run db:seed
)
```

Every block that sources the keys file does it in a subshell like this one,
so the keys never stay exported in your shell: the db package's test utils
read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and a later
`cd packages/db && bun test` would otherwise run the RLS suite against
production with the service role. `@withme/db/test-utils` now refuses a
non-local `SUPABASE_URL` unless `SEED_ALLOW_REMOTE=1` is set, which is why
that variable only ever appears inline on a single command. One command per
line: under `set -e`, zsh does not stop partway through an `&&` chain.

Auth note: hosted signups hit email confirmation, and the default
Supabase SMTP only delivers to org members. For real users, the owner sets
up custom SMTP (Authentication → Emails → SMTP Settings) before launch.
Keep email confirmation on: without it anyone can sign up as someone
else's address. A public demo can lean on the seeded login instead.

Phone sign-in is off on a new hosted project until you turn it on. Ask
the owner for their Twilio Account SID, Verify Service SID (`VA…`) and
Auth Token, then have them enter these under Authentication → Sign In /
Providers → Phone → Twilio Verify. Secrets go into the dashboard, never
the repo. Do not add the local test number there. A Twilio trial account
texts verified numbers only.

## 2. API worker (first — the web worker's service binding needs it)

If `wrangler whoami` lists more than one account, pin the intended one
BEFORE the first deploy: add `"account_id": "<account id>"` to both
`apps/api/wrangler.jsonc` and `apps/web/wrangler.jsonc`. An unpinned
deploy can land on another account, where same-named legacy workers may
live. While in those configs, set `"workers_dev": true` and
`"preview_urls": false` explicitly (recommended): wrangler enables both
when absent and warns, and Preview URLs publish every uploaded version
publicly.

```sh
cd apps/api && bunx wrangler deploy
```

Cloudflare's API intermittently returns 502/504/524; retry up to 4 times
with ~30s backoff — the failure is theirs, not your config. Success
prints the workers.dev URL; check its subdomain is the intended account's
(`<name>.<subdomain>.workers.dev`), not another account's.

If the deploy fails with "register a workers.dev subdomain", its link
(`/workers/onboarding`) is retired and 404s, and it can fire even when the
account shows an auto-generated subdomain. The owner sets one in the
dashboard: Workers & Pages → account details (right column) → Subdomain →
Change / Set up (`dash.cloudflare.com/<account_id>/workers/subdomain`).
The code upload survives, so the redeploy after registering takes seconds.
A new or renamed subdomain takes ~2 minutes to answer (`curl` prints
`000` until then): wait before calling the checkpoint a failure.

Then config goes in as SECRETS via stdin
(vars in wrangler.jsonc would be clobbered on every deploy):

```sh
(
  set -e
  set -a
  source "$HOME/.config/<name>/demo-seed.env"
  set +a
  : "${SUPABASE_URL:?missing from the keys file}"
  : "${SUPABASE_ANON_KEY:?missing from the keys file}"
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
# Public demo only (section 1); leave unset for an app with real users:
# VITE_DEMO_CREDENTIALS=<demo email> / <demo password>
# VITE_STORE_URL=https://<your-store>   # optional: the Merch tab
# Required for an app with real users (sign-up links to them; make-it-yours 7b):
# VITE_TERMS_URL=https://<your-site>/terms
# VITE_PRIVACY_URL=https://<your-site>/privacy
```

```sh
cd apps/web && bun run build && bunx wrangler deploy   # same retry rule
```

**Checkpoint** (verify bodies with python, not grep chained after curl;
send a browser `User-Agent`, since Cloudflare 403s urllib's default:
`urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})`,
ASCII only: Python encodes header values as Latin-1):
the landing page 200s with the wordmark; `/t/<seeded-uid>` 200s with the
seeded card — this one proves the worker-to-worker service binding,
which only exists if `services[0].service` in `apps/web/wrangler.jsonc`
matches the api worker name exactly. An unknown UID (`/t/banana`) returns
404 with the calm card, not a 500; the 404 is correct.

Auth URLs (the owner, in the Supabase dashboard: Authentication → URL
Configuration): Site URL `https://<web-worker>.workers.dev`, and one
Redirect URL, exactly `https://<web-worker>.workers.dev/auth/callback`
(the README and `supabase/config.toml` use the same exact path). Not
`/**`: the allowlist should name the one callback the app has. It is not
the whole defence, though: Supabase also accepts redirects to the Site
URL's own origin, so where the app goes after sign-in is decided by the
callback itself. `/auth/callback` passes `returnTo` through
`safeReturnTo` (`apps/web/src/lib/auth-guard.ts`), which only allows a
path on the app's own origin; keep that check if you change the flow. Without these,
confirmation and reset links point at `localhost:3000`. Do this before the
sign-up below.

Verify the authed path once — it exercises the JWKS leg, the classic
silent failure. The owner runs it (production credentials); it prints
field names only. Save as `apps/web/authed-check.ts` (so the deps
resolve; never commit it):

```ts
import { createClient } from '@supabase/supabase-js';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

const env = process.env;
const email = 'ada@demo.withme.local';
const password = env.SEED_DEMO_PASSWORD ?? '';
const apiUrl = env.VITE_API_URL ?? '';
if (!password || /localhost|127\.0\.0\.1/.test(apiUrl + env.VITE_SUPABASE_URL)) {
  throw new Error('needs apps/web/.env.production (production URLs) and the keys file');
}
const supabase = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);
const token = data.session.access_token;
const api: any = createORPCClient(
  new RPCLink({ url: `${apiUrl}/rpc`, headers: () => ({ authorization: `Bearer ${token}` }) }),
);
const { profile } = await api.app.profile.get();
console.log(`profile.get via ${new URL(apiUrl).host}: ok; fields: ${Object.keys(profile ?? {}).join(', ')}`);
```

```sh
cd apps/web && ( trap 'rm -f authed-check.ts' EXIT; bun --env-file=.env.production --env-file="$HOME/.config/<name>/demo-seed.env" authed-check.ts )
```

The trap deletes the file however the check ends, and the subshell exits
with the check's status, so a failed check still fails the command.

A sign-in that works followed by a 401 from `profile.get` is the JWKS leg
(see the JWKS check in section 1). Then confirm
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
   A fork reusing an existing EAS project links it instead of creating
   one: remove `extra.eas.projectId` and `updates.url` from `app.json`,
   then `eas-cli init --id <projectId> --non-interactive` and
   `eas-cli update:configure --non-interactive` (init also sets the
   project icon on expo.dev). If `bunx eas-cli` fails with `Cannot find
   module 'yallist'`, the bunx cache is broken: use `npx -y eas-cli@24.13.0 …`
   (the version this runbook was last verified with; pin, never `@latest`).
2. Write `apps/mobile/.env.production` with the `EXPO_PUBLIC_*` mirrors
   of step 3's values (`EXPO_PUBLIC_TERMS_URL` and
   `EXPO_PUBLIC_PRIVACY_URL` included).
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

### Push credentials

The database sends pushes through Expo's push service (the
`push_notifications` migration); it needs no key of yours. The phone
needs credentials to receive them, and both kinds are tied to the
owner's accounts, so **every step here is the owner's, or done with
their explicit OK**. They are free.

1. **iOS (APNs key).** `bunx eas-cli credentials --platform ios`, pick
   the production profile, then Push Notifications: Manage your Apple
   Push Notifications Key → set up a new key. EAS signs in to the
   owner's Apple Developer account to create it (one key serves every
   app on the team; reuse an existing one if EAS lists it).
2. **Android (FCM V1).** Create a Firebase project for the app, add an
   Android app with the package from `app.json`, download its
   `google-services.json` to `apps/mobile/` and set
   `expo.android.googleServicesFile` to `./google-services.json` (it
   holds no secret, but it is per-fork: commit it in the fork, not
   upstream). Then make a service-account key (Project settings →
   Service accounts → Generate new private key) and upload it with
   `bunx eas-cli credentials --platform android` → Google Service
   Account → Push Notifications (FCM V1). Delete the downloaded key file
   afterwards; EAS holds it.
3. **Expo push security.** On expo.dev, turn on "Enhanced Security for
   Push Notifications" in the project's push settings and create an
   access token for the account (Access tokens; Expo's
   sending-notifications docs show where both live today). Then, in the
   SQL editor:
   `update private.settings set value = '<token>' where key =
   'push_access_token';`. The database sends it as the bearer on every
   push; without it, anyone who learns a device token can push to that
   phone. Treat the token as a secret: never commit it.
4. **A build.** Pushes reach a store or development build, not an EAS
   Update alone, and never Expo Go on Android. `bunx eas-cli build
   --profile production` (or `development` for a device build) after the
   credentials exist. Builds beyond the free allotment bill, so ask.

**Checkpoint:** on a real phone running the build, Connections offers
"Turn on notifications"; after Allow, `select platform, last_seen_at
from public.push_tokens` (SQL editor) shows the device. Send yourself a
request from a second account: the push arrives and tapping it opens
Requests. A pair rings once per 24 hours, so repeat the check with a
different second account (or decline, wait out the day, and re-send). `select value from private.settings where key = 'push_url'` reads
Expo's URL; setting it to `null` is the kill switch for every push.

## 5. Before real users

Skip this for a public demo. For an app with real users, after every check
above passes and before the app is announced. Each step is the owner's:
most are dashboard settings or production writes.

First remove the demo logins (a production write, the owner's OK first):

```sh
(
  set -e
  set -a
  source "$HOME/.config/<name>/demo-seed.env"
  set +a
  SEED_ALLOW_REMOTE=1 bun run db:unseed
)
```

**Checkpoint:** it prints `Removed 2 demo user(s) and the demo tags.`;
signing in as `ada@demo.withme.local` fails; `apps/web/.env.production`
has no `VITE_DEMO_CREDENTIALS` and the live landing page shows no login.

Then work through the hardening checklist. Every item is a setting the
starter cannot ship for you, because it lives in a dashboard or an
account:

- [ ] **Custom SMTP** (Authentication → Emails → SMTP Settings), with
  email confirmation on. Checkpoint: a sign-up from an outside address
  receives its confirmation mail (section 1's Auth note).
- [ ] **Password rules** (Authentication → Sign In / Providers → Email):
  minimum length 10 and letters plus digits, the values
  `supabase/config.toml` sets locally and the sign-up forms ask for.
  `config.toml` never reaches a hosted project by itself, and never
  `supabase config push` it: its `site_url` and `enable_confirmations` are
  local-only.
- [ ] **Leaked-password protection** (the same page; it checks new
  passwords against HaveIBeenPwned). It needs a paid plan; on a free
  project, note it as a known gap.
- [ ] **CAPTCHA on sign-up and sign-in** (Authentication → Attack
  Protection; Cloudflare Turnstile). This is a code change as well as a
  setting: once it is on, Supabase rejects any auth call without a
  `captchaToken`, and the starter's web and mobile clients send none. Add
  the Turnstile widget to both login screens and pass its token in
  `options.captchaToken` first, then turn the setting on, then sign in
  once on each client.
- [ ] **Security Advisor** (Advisors → Security Advisor), after every
  `db push`. Fix or knowingly accept each finding. The starter's own
  migrations pass it; a fork's new tables and functions are what it
  catches.
- [ ] **Retire the service-role key used for seeding.** Nothing deployed
  uses it: the Workers hold only the publishable key. Under Project
  Settings → API Keys, create a new secret key and delete the one in the
  keys file. A project on legacy JWT keys creates a secret key there,
  then disables the legacy `service_role` key once nothing needs it.
  Then delete the keys file: `rm "$HOME/.config/<name>/demo-seed.env"`.
  A later seed or tag batch fetches fresh keys with section 1's command
  (it picks the `sb_secret_` key, so it works after the legacy key is
  gone) and deletes the file again afterwards.
- [ ] **MFA on every account that can change production:** the Supabase
  org, the Cloudflare account, the Expo account, and GitHub. Each
  member, not only the owner.
- [ ] **Backups.** Paid Supabase plans take daily backups; turn on
  point-in-time recovery (Project Settings → Add-ons) if losing a day of
  data is not acceptable. A free-plan project has no backups you can
  restore: do not launch real users on one (it also pauses when idle).
- [ ] **SSL enforcement** (Project Settings → Database → SSL
  Configuration): direct database connections must use TLS. The Workers
  go through the HTTPS API and are unaffected.
- [ ] **EAS environment variables.** Anything named `EXPO_PUBLIC_*` is
  compiled into the app bundle that every user downloads, so only the
  publishable key and public URLs belong there, never a secret. Store
  them as EAS environment variables
  (`bunx eas-cli env:create --environment production`) so a build does not
  depend on one machine's `apps/mobile/.env.production`.
- [ ] **GitHub secret scanning and push protection** (repository
  Settings → Advanced Security). Push protection refuses a push that
  contains a recognised key before it lands. Both are free on public
  repositories.

Then the store requirements for an app with user content (App Store
Review Guideline 1.2, Google Play's user-generated content policy;
`docs/moderation.md` maps each one). None of these is optional for a
store app:

- [ ] **Terms and privacy published.** `docs/terms-template.md` rewritten
  for your app (every `[bracket]` filled, the placeholder banner gone),
  published at two https URLs, and those URLs set as `VITE_TERMS_URL` /
  `VITE_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL` /
  `EXPO_PUBLIC_PRIVACY_URL` (sections 3 and 4). Checkpoint: the live
  sign-up's "I agree" line links to both, and both load.
- [ ] **`TERMS_VERSION` matches the published version.** It is the
  version line of your terms (`packages/contract/src/schemas/terms.ts`).
  Change it, and deploy all three apps together, whenever you change the
  terms in a way people must agree to again.
- [ ] **Report notifications.** Create a Slack or Discord incoming
  webhook for a channel the report owner watches, and set it in the
  hosted database (SQL Editor, the owner's OK first: a production write):
  `update private.settings set value = '<webhook URL>' where key = 'report_webhook_url';`.
  Checkpoint: file a report from a test account; the channel shows "A
  report was filed: <id>", and nothing else. Never commit the URL.
- [ ] **A named report owner.** Someone runs the "Open reports" query
  (`docs/moderation.md`) at least once a day, every day, with a named
  stand-in, and acts within 24 hours. Write both names here.
- [ ] **Published contact information.** The contact email in your terms,
  and a support URL on the App Store and Play listings that reaches a
  person.
- [ ] **A filter, or a reason there is none.** The starter ships no
  content filter (`docs/moderation.md`, Adding a filter). Decide with
  the owner whether you add one before launch; App Review can ask.

**Checkpoint:** every box is ticked or written down as an accepted gap,
with the owner's name next to it.

## Redeploys

DB: new migrations via `supabase db push`; reseed only with the owner's
OK, and never on an app with real users (section 1). Web: `bun run build && bunx wrangler deploy`. Mobile: a fresh
`eas update`. API: `bunx wrangler deploy` (secrets persist).

The starter's own demo DB is migrated by
`.github/workflows/demo-migrate.yml`: after migrations merge to `main`,
it runs `supabase db push` against the `demo` GitHub Environment with no
approval step (the demo holds only seed data, and CI already applied each
migration to a fresh local stack). Re-run it from the Actions tab, on
`main`, to retry; it skips any other branch. It only runs in
`vibe-with-me/withme-starter`. A fork deletes it, or points its `if:` at
its own repository and gives its own `demo` environment the `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and
`SUPABASE_PROJECT_REF` secrets. Against a database with real users,
never let it push unreviewed: add a required reviewer to the environment
(public repositories; a private one needs GitHub Enterprise), or remove
the `push` trigger and start each run by hand.

The marketing site, the privacy and support URLs the store listings ask
for, and the hostname split between site and app are
`.agents/skills/add-marketing-site/SKILL.md`, run after this one.

## Gotcha index

| Symptom | Cause |
|---|---|
| MCP Supabase tools can't see the new org | MCP tokens are org-scoped; use the CLI |
| `wrangler deploy` 502/504/524 | Cloudflare API blip — retry with backoff |
| Printed workers.dev URL is on another account's subdomain | Several accounts and no `account_id` pinned — pin it in both wrangler configs |
| Deploy says "register a workers.dev subdomain", link 404s | Retired onboarding URL — Workers & Pages → account details → Subdomain; redeploy |
| New workers.dev URL: `curl` prints `000` | The subdomain is still propagating — wait ~2 minutes |
| Python body check gets 403 | Cloudflare blocks urllib's default User-Agent — send a browser one |
| `db push` refuses: migration history differs | Reused project with an older schema — owner runs `supabase db reset --linked` |
| Authed calls 401 after a good sign-in | Project JWKS has no asymmetric key — enable JWT signing keys |
| `bunx eas-cli`: `Cannot find module 'yallist'` | Broken bunx cache — `npx -y eas-cli@24.13.0 …` (the version last verified) |
| Web resolver errors only in production SSR | Service binding name ≠ api worker name |
| Signups never confirm | Default SMTP delivers to org members only — set up custom SMTP; never turn confirmation off for real users |
| Seed: "Refusing to seed a hosted project without SEED_DEMO_PASSWORD" | Keys file predates this runbook — append `SEED_DEMO_PASSWORD=` plus a random 24+ character value |
| Phone sign-in: "Unsupported phone provider" | The Phone provider is off in the dashboard |
| Phone sign-in texts some numbers only | Twilio trial account: verify the number or upgrade |
| `eas update` fails non-interactively | Missing `--environment` |
| Published app seems to point at localhost | You byte-grepped Hermes bytecode — use `--no-bytecode` to verify |
| Demo DB unreachable weeks later | Free-tier project paused — wake it in the dashboard |
| A `.env.demo-seed` file sits in the repo root | An older copy of this runbook wrote the keys file there (`.env.*` keeps it out of git): move it to `$HOME/.config/<name>/demo-seed.env`, `chmod 600` it, and retire its service-role key as section 5 says |
| git status shows .supabase-demo-db-password, or the repo has one | an older copy of this runbook wrote it into the repo root (the starter's .gitignore now ignores the name; older forks do not): move it to `$HOME/.config/<name>/supabase-db-password` (the name the commands read), `chmod 600` it, and never commit it. If it was ever committed, moving it does not remove it from history: reset the database password (Dashboard → Project Settings → Database) and write the new one to `$HOME/.config/<name>/supabase-db-password` |
