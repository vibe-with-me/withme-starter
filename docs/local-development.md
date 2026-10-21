# Local development

The whole stack on your machine, no cloud accounts. What the README's
quickstart leaves out: the mobile app, the test suites, the ports, and the
handful of things that go wrong on a fresh install.

## Prerequisites

- [Bun](https://bun.sh) 1.3 or newer (the repo pins `bun@1.3.10`).
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or
  another Docker runtime, running.
- [Supabase CLI](https://supabase.com/docs/guides/cli) **2.118 or newer**.
  Older versions ship a PostgREST that sporadically rejects a fresh
  sign-in's token (error `PGRST303`, "issued in the future"). It looks
  like clock skew and is not; upgrade the CLI.
- For mobile: Xcode with an iOS simulator, or Android Studio with an
  emulator, or the Expo Go app on a phone.

## First run

```sh
git clone https://github.com/vibe-with-me/withme-starter.git   # or your fork
cd withme-starter
bun install
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.example apps/web/.env
bun run db:start        # Supabase local: Postgres, Auth, Storage, PostgREST
bun run db:seed         # demo users + tags
bun run dev             # api on :8786, web on :3000
```

The first `db:start` pulls the Supabase images, which takes a few
minutes and a few GB of Docker disk. The `.example` files hold the local stack's shared defaults. They are not
secrets; copying them is all the configuration local work needs.

### Ports

| What | Where |
| --- | --- |
| Web app | `http://localhost:3000` |
| API Worker | `http://localhost:8786` (`/health` answers `{"ok":true}`) |
| Supabase API (PostgREST, Auth, Storage) | `http://127.0.0.1:55321` |
| Supabase Studio | `http://127.0.0.1:55323` |
| Postgres | `127.0.0.1:55322` |

### The demo

`bun run db:seed` creates:

| Who / what | Details |
| --- | --- |
| Ada | `ada@demo.withme.local` / `withme-demo-1`. Hosts "Rooftop listening session"; has a pending request from Lin. |
| Lin | `lin@demo.withme.local` / `withme-demo-1`. Joined Ada's gathering; hosts a second one, "Vinyl swap in the park", listed to the domain. |
| `04BBBBBBBBBBBB` | Ada's claimed tag, pointed at her profile. Tap it: `/t/04BBBBBBBBBBBB`. |
| `04AAAAAAAAAAAA` | Unclaimed. Tap it to walk the claim flow. |
| `04CCCCCCCCCCCC` | Disabled. Tap it to see the inactive card. |

Phone sign-in works locally with no Twilio account: use
`+1 555 555 0100` and the code `123456` (set in `[auth.sms.test_otp]` in
`supabase/config.toml`). Any other number fails to send, because the
Twilio credentials are unset. To text real phones, put
`SUPABASE_AUTH_SMS_TWILIO_VERIFY_ACCOUNT_SID`,
`SUPABASE_AUTH_SMS_TWILIO_VERIFY_SERVICE_SID` and
`SUPABASE_AUTH_SMS_TWILIO_VERIFY_AUTH_TOKEN` in `supabase/.env` and
restart the stack.

Re-running the seed is safe. `bun run db:reset` rebuilds the database
from the migrations; run `db:seed` again after it.

## The mobile app

Needs the stack and the API Worker running.

```sh
cp apps/mobile/.env.example apps/mobile/.env
bun run --filter @withme/mobile dev     # Metro; press i for iOS, a for Android
```

The iOS simulator reaches the host's API and Supabase at `localhost`.
The Android emulator reaches the host at `10.0.2.2`, so set
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_WEB_URL` (what your share code and QR scanner use) to that
there, and on a physical device to your machine's LAN IP. Expo Go from
the App Store or Play Store runs one Expo SDK, and the starter tracks
that SDK (58 today), not the newest release, so the app opens on a real
phone. If Expo Go on a phone says the project is incompatible, the
stores have moved to a newer SDK. On Android, install the Expo Go that
matches the project from [expo.dev/go](https://expo.dev/go); on an
iPhone, build your own with `bunx eas-cli go` (an EAS build sent to
TestFlight; needs an Apple Developer Program membership) or use a
development build. Or upgrade the SDK when you are ready (see the
upgrade note in the mobile README). On an iPhone, Expo Go also opens a
project from your machine only when it and Expo CLI are signed in to the
same Expo account: run `bunx expo login`, then sign in from the account
icon in Expo Go ([Expo's
note](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/)).
Simulators and emulators need no Expo Go install: Expo CLI installs the
matching one. NFC reading needs a development build (`npx expo
run:ios`); in Expo Go the scan screen falls back to typing a UID or
following a deep link.
[`apps/mobile/README.md`](../apps/mobile/README.md) has the rest.

### Push notifications

The database sends them (the `push_notifications` migration) to the URL
in `private.settings` under `push_url`, which ships pointing at Expo's
push service. Nothing goes out until a phone registers a token, so a
local stack and CI send nothing. The RLS suite points `push_url` at a
stand-in on your machine for its run and puts it back afterwards.

Receiving a real push on Android needs a development build: Expo Go on
Android has not received remote pushes since SDK 53. Expo Go on iOS
still does, under Expo Go's credentials rather than your app's, so a
development build (`npx expo run:ios` on a device, or an EAS development
build) is the real test of yours. Expo Go on the iOS simulator covers the
rest:
Connections offers "Turn on notifications", Allow registers a token, a
request to that account makes your local database post to Expo, and a
notification you send the simulator yourself shows what a tap opens. In
Expo Go that payload must name the project, `@<owner>/<slug>` from
`app.json`, or Expo Go drops the tap (a development build needs neither
key):

```json
{
  "Simulator Target Bundle": "host.exp.Exponent",
  "aps": { "alert": { "title": "New connect request", "body": "Ada wants to connect." } },
  "body": { "path": "/connections?segment=requests" },
  "experienceId": "@<owner>/<slug>",
  "scopeKey": "@<owner>/<slug>"
}
```

```sh
xcrun simctl push booted host.exp.Exponent push.json
```

Background the app first, then tap the banner.

## Tests

| Command | What it runs | Needs |
| --- | --- | --- |
| `bun run test` | Contract schema tests, the RLS suite (`packages/db/test`), SDK tests | The local stack |
| `bun run lint` | `oxlint --deny-warnings` | — |
| `bun run typecheck` | Every workspace, including the e2e folders | — |
| `bun run --cwd apps/api e2e` | The SDK through the API Worker into Supabase | The stack, the SDK built once (`bunx turbo run build --filter=@vibewithme/nfc`; the e2e imports its `dist/`), and `cd apps/api && bun run dev` in another shell |
| `bun run --cwd apps/web test:e2e` | Playwright e2e against the production build: every page and safety flow ([Testing](testing.md#the-map) has the map) | The stack and the service-role key (below). Playwright starts the API Worker and the built web Worker itself. |
| `bun run --cwd apps/mobile e2e` | Maestro flows for the Expo app: every core flow (handshake, where you met, gatherings, blocks, reports, terms, signed-out taps). Local and opt-in. | The stack, the API Worker, Metro, a booted simulator and the Maestro CLI ([Testing](testing.md#mobile-e2e-local-and-opt-in)) |

### The service-role key

The RLS suite, both e2e harnesses, and the seed set up fixtures with the
local stack's service-role key, which bypasses RLS. The test helpers have
no fallback copy of it in source: they read it from
`SUPABASE_SERVICE_ROLE_KEY` and stop with an error naming this section
when it is missing. `bun run db:start` prints it (the Secret key), and
the CLI hands it over on demand. Once per shell, from the repo root with
the stack up:

```sh
eval "export $(supabase status -o env --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY | grep ^SUPABASE_SERVICE_ROLE_KEY=)"
```

`bun run db:seed` and `bun run db:provision` do this themselves when the
variable is unset and the target is the local stack. CI exports it the
same way after `supabase start`.

`bun run lint && bun run typecheck && bun run test` is the verification
gate every skill ends with. CI runs the same plus the build and the SDK
publish checks in its `ci` job, and the Playwright suite in a separate
`e2e` job. [Testing](testing.md) covers what each suite proves, how to
read a red check, and how to add a spec.

The RLS tests act through real per-user clients against the live stack,
so they are slower than unit tests and cannot run without Docker. They
also leave their test users and those users' gatherings behind, so the
demo's Events feed is noisy after a run: `bun run db:reset && bun run
db:seed` before you look at the app. They
are also the spec: when a skill says a safety mechanism moved, it is one
of these that went red.

## Useful commands

```sh
bun run db:stop                 # stop the local stack
bun run db:reset                # rebuild from migrations (then db:seed)
bun run db:types                # regenerate packages/db/src/types/supabase.ts after a migration
bun run db:provision            # batch-create unclaimed tags (see the provision-tags skill)
bun run build                   # every workspace
cd apps/web && bun run preview  # the production build locally (needs the API Worker running)
```

## When something goes wrong

The fixes below are for the local stack. A skill checkpoint that fails
for another reason: [When a checkpoint fails](the-slice.md#when-a-checkpoint-fails).

**`db:start` fails with "no space left" or Docker errors.** Old Supabase
images from previous CLI versions accumulate in the Docker VM. Prune
them (`docker image prune -a` removes every unused image; check what else
you have first) and start again.

**`db:start` prints "Starting database from backup" on a fresh clone.**
The local stack is named after `project_id` in `supabase/config.toml`,
and every clone of the starter ships the same one, so this clone came up
on another checkout's database (`supabase migration list --local` shows
it behind). `bun run db:reset` rebuilds it from this clone's migrations;
then `db:seed`. A fork gives itself its own `project_id` in
`make-it-yours` (before step 1), which also lets two checkouts run side
by side: with the same `project_id` their container names collide even
on different ports.

**`db:start` fails with "port is already allocated".** Something else
holds one of the stack's ports (553xx). The usual culprit is another
project's Supabase stack: `docker ps --format '{{.Names}} {{.Ports}}' | grep 553`
names it (`supabase_db_<project_id>`), and
`supabase stop --project-id <project_id>` stops it. Any other container
in that list: `docker stop <name>`. If no container shows,
`lsof -nP -iTCP:<port> -sTCP:LISTEN` names the host process; quit it.
Then start again. To run
both side by side instead, give this one other ports: change every
`553xx` port in `supabase/config.toml` (e.g. to 556xx), the URLs in
`apps/web/.env`, `apps/mobile/.env` and `apps/api/.dev.vars`, and export
`SUPABASE_URL=http://127.0.0.1:<new API port>` and
`SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:<new DB port>/postgres`
before `db:seed` and the tests. They default to 55321 and 55322: without
`SUPABASE_DB_URL`, the db tests that talk to Postgres directly (grants,
push, reports, the SDK schema) run against whatever stack holds 55322.
Give it its own `project_id` too (make-it-yours, "give the local stack
its own name"): two stacks with one id share containers.

**Two checkouts' web apps reach the same API Worker.** The web Worker
calls the API through the service binding `withme-api`
(`apps/web/wrangler.jsonc`), and wrangler's local dev registry keeps one
Worker per name for the whole machine. With another checkout's API
Worker running under the same name, this checkout's server-rendered
pages (the resolver above all) talk to that one: its database, its
contract, "Something didn't load". `ls ~/Library/Preferences/.wrangler/registry`
(macOS) lists the names in use. Stop the other checkout's dev servers,
or give this checkout's Worker its own name in both `wrangler.jsonc`
files (`"name"` in `apps/api`, `"service"` in `apps/web`); a fork that
ran make-it-yours step 6 already has its own.

**Sign-in works, then the next request fails with `PGRST303`.** Your
Supabase CLI is older than 2.118. Upgrade it, then `bun run db:stop &&
bun run db:start`.

**The resolver page errors locally.** The web loaders call the API
Worker on port 8786. Make sure `bun run dev` started both, or run
`cd apps/api && bun run dev` yourself.

**`vite preview` cannot reach the API.** The production build uses a
service binding that only exists when the API Worker is running locally.
Start it first, or use `bun run dev`.

**Metro cannot find a native module, or two copies of `expo`.** The
mobile app depends on Bun's hoisting and a single copy of each `expo-*`
package. Check the root `package.json` overrides and reinstall. A
worktree needs its own `bun install`.

**The Merch tab is missing, or still shows the setup card.** In
development (`bun run dev`, Expo Go) the tab is always there: without
`VITE_STORE_URL` (web) or `EXPO_PUBLIC_STORE_URL` (mobile) it shows a
setup card, and with one it links to your store. A production build or
`vite preview` (the Playwright smoke uses one) shows it only when the URL
was set at build time. Both bundlers read env at start; restart them
after changing it (Metro with `--clear`).

**A migration changed and `db:types` shows a diff.** Commit the
regenerated `packages/db/src/types/supabase.ts`. A constraint-only
migration produces no diff; a column change does.
