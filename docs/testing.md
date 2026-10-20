# Testing

What the tests cover, how to run them, what CI runs, how to read a
failure, and how a fork adds its own. Setup (the stack, the ports, the
service-role key) is in [Local development](local-development.md#tests).

## The layers

| Layer | Where | What it proves | Runs in CI |
| --- | --- | --- | --- |
| Unit | `packages/contract`, `packages/nfc-sdk`, `apps/mobile/lib`, `apps/api` | Schemas, parsing, formatting, the Worker's routing and limits | Yes, `ci` |
| Database (RLS) | `packages/db/test` | Every safety promise, against real per-user clients. [The safety model](safety-model.md) names the file for each. | Yes, `ci` |
| API e2e | `apps/api/e2e` | The published SDK through the API Worker into Supabase | Yes, `ci` |
| Web e2e | `apps/web/e2e` | The user flows in a real browser, against the production build in workerd | Yes, `e2e` |
| Mobile e2e | `apps/mobile/e2e` | The core flows in the Expo app: handshake, where you met, gatherings, blocks, reports, terms, signed-out taps | No: local and opt-in ([below](#mobile-e2e-local-and-opt-in)) |

The database suite is the spec: a promise holds because the database
refuses the alternative. The browser suite proves the screens still walk a
person through the flow those rules allow. A safety rule needs both: the
RLS test that it holds, and the e2e test that the app still works with it.

## Web e2e

From the repo root, with the stack up and the service-role key exported:

```sh
bun run --cwd apps/web test:e2e
```

Playwright builds the web app, starts the API Worker (`wrangler dev`) and
the built web Worker (`vite preview`), and runs every spec. One file, or
one test by name:

```sh
bun run --cwd apps/web test:e2e blocks
bun run --cwd apps/web test:e2e -g "declined request"
```

Before you call a new spec done, run it three times over in parallel. A
spec that passes once and fails on a repeat depends on order or timing:

```sh
bun run --cwd apps/web test:e2e --repeat-each=3
```

**Another checkout or fork already running?** The suite takes ports 8796
(API), 9456 (its inspector) and 3010 (web). Move them with
`E2E_API_PORT`, `E2E_API_INSPECTOR_PORT` and `E2E_WEB_PORT`. A second
Supabase stack goes on other ports too: set `SUPABASE_URL` to it.
One more shared resource: the web Worker finds the API Worker by its
name (`withme-api`) through wrangler's dev registry, so two checkouts
running the suite at once can reach each other's API. Run one at a
time, or rename the worker in `apps/api/wrangler.jsonc` and the service
in `apps/web/wrangler.jsonc` for the run (and don't commit the rename).

### The map

Every page and every safety promise, and the spec that walks it. A row
with no spec is a gap. Close it before you build on it.

| Route | Spec |
| --- | --- |
| `/` (landing) | `signed-out.spec.ts` (Sign in / Open the app) |
| `/login` | `shell`, `phone`, `signed-out` (a `returnTo` never leaves the app) |
| `/auth/callback` | `signed-out` (a failed OAuth return). The success path needs a real provider and is not covered. |
| `/me` | `shell` |
| `/t/$uid` | `handshake`, `gatherings`, `reports`, `resolver`, `share`, `enumeration` (unknown and malformed UIDs) |
| `/claim/$uid` | `handshake`, `enumeration` (someone else's tag refuses like a missing one), `signed-out` |
| `/connections` | `handshake` (accept), `connections` (lists, decline, remove), `blocks` |
| `/gatherings` (Discover, Yours) | `gatherings`, `gathering-controls`, `blocks` (a blocked host's gathering is gone from the whole Discover feed) |
| `/gatherings/new` | `gatherings`, `gathering-controls`, and every spec that hosts one (`createGathering`) |
| `/gatherings/$id` | `gatherings`, `gathering-controls`, `reports`, `blocks` |
| `/merch` | `shell` (no store configured: absent, and the URL goes to Events) |
| `/profile` | `profile`, `shell` |
| `/share` | `share` |
| `/terms` | `terms` |
| Signed out, every page above that needs a session | `signed-out` (one test per page) |

| Promise ([safety-model.md](safety-model.md)) | Spec |
| --- | --- |
| Nobody can list your users | `enumeration` |
| Blocks are absolute and invisible | `blocks`, `reports` (report and block) |
| Connections are mutual | `handshake`, `connections` |
| Who's going is connections-only | `gatherings` |
| Gathering visibility and capacity | `gathering-controls`, `blocks` |
| Reports are private | `reports` |
| Terms are agreed to, and recorded | `terms` |
| Two tiers of profile data | `profile` (links shown to a connection, never on the card) |
| A shared code can be taken back | `share` |
| Deleting an account deletes everything | `profile`, `terms` |

There are two ways a tag resolves, and blocks treat them differently. A
tag URL opened in a browser is rendered on the server before the page knows
who is signed in, so that `resolve_tag` call is anonymous: a blocked person
who opens your tag's URL still sees the card, the same as anyone with the
URL. A signed-in call to `resolve_tag` (the mobile app, the SDK) answers
`disabled` to a blocked viewer, as [safety-model.md](safety-model.md#blocks-are-absolute-and-invisible)
says; `packages/db/test/blocks.test.ts` and `apps/api/e2e` cover that path.
On the web, what the block takes away is connecting, your gatherings, and
any sign of the block, and `blocks.spec.ts` asserts exactly that.

### Writing a spec

Each spec file is one flow, named for it (`blocks.spec.ts`), and each test
title says what a person did and what they saw:
`blocking a connection ends it for both, and the blocked side gets no signal`.
That title is what a contributor reads in CI when it goes red, so it
should say which promise broke without anyone opening the file.

The rules that keep the suite deterministic:

- **One person per browser context.** `newPerson(browser)` gives a fresh
  context: a separate person with no shared session.
- **Everything stamped.** Emails, names and titles carry `uniqueStamp()`.
  The database is shared by every test and every run, so nothing may
  depend on being alone in it.
- **Seed setup through the service role, act through the UI.** `admin`
  (helpers.ts) may create what a test needs (a tag, a connection, an old
  terms version) but never performs the step under test.
- **No sleeps.** Wait on what a person would see: `expect(...).toBeVisible()`,
  `page.waitForURL(...)`. Playwright retries both until the timeout.
- **No order.** A test never relies on another test having run.
- **Absence needs the whole list.** "Not in the feed" means every page
  loaded (`expectNotInFeed`), not just the first.

`helpers.ts` has the steps most specs share: `signUpWithProfile`,
`claimFreshTag`, `createGathering`, `connectByAdmin`, `revealInFeed`.

### A fork adding a feature

A feature a person can see gets a spec in the same PR:

1. Add `apps/web/e2e/<feature>.spec.ts`, with a comment at the top saying
   which flow it walks, and the promise it protects if it is a safety rule.
2. Walk the happy path end to end, as two people if the feature involves
   two. Then add the refusal: the stranger, the blocked person, the
   signed-out visitor.
3. If your fork changes a step a helper drives (a new required field at
   sign-up, a renamed button), change the helper once rather than every spec.
4. Add a row to the map above.
5. `--repeat-each=3` green before you open the PR.

A fork that changes copy will see specs fail on the old text. That is the
suite working: update the spec in the same PR as the copy.

## What CI runs

Two jobs on every PR and on main ([ci.yml](../.github/workflows/ci.yml)):

- **`ci`**: lint, typecheck, build, the SDK publish checks, and
  `bun run test` (unit, database and API e2e) against Supabase local.
- **`e2e`**: the web e2e suite against the production build, on its own
  Supabase local.

They run side by side. The split exists so the check's name says what
broke: a red `e2e` with a green `ci` means the code builds and the rules
hold, but a user flow no longer works in the browser.

### Reading a failure

1. **The check.** A red `e2e` names the spec file and the test title in
   the job log, for example
   `blocks.spec.ts › Blocks › blocking a connection ends it for both…`.
2. **The line.** On the PR's Files tab, Playwright's GitHub annotation
   marks the failing `expect` with the error.
3. **The report.** The run's `playwright-report` artifact has the HTML
   report and the traces. Download it, unzip it into a folder, then:

   ```sh
   bunx playwright show-report <folder>/playwright-report
   ```

   Each failed test shows the step that failed, a screenshot of the
   page at that moment, and its trace: every action, network call and
   DOM snapshot, step by step.
4. **Locally.** Run the one test (`-g "<title>"`). A failure leaves the
   same report in `apps/web/playwright-report`:
   `bunx playwright show-report apps/web/playwright-report`.

There are no retries. A test that fails once is reported as failed,
because a flake in a safety flow is a bug to find, not noise to hide.

## Mobile e2e: local and opt-in

`apps/mobile/e2e` holds [Maestro](https://maestro.dev) flows for the
Expo app, one per core flow, mirroring the web specs. **No CI job runs
them.** On GitHub-hosted runners, iOS needs a macOS runner, and those have
no Docker for the Supabase stack. Android needs an emulator plus Expo Go
or a native build, and nobody has shown that to be reliable here yet. A
check that doesn't reliably test the app is worse than no check, so for
now they are a step you run before merging a mobile change.

To run them on the iOS simulator with Expo Go:

1. The stack up, the service-role key exported, the API Worker running
   (`bun run --cwd apps/api dev`), and `apps/mobile/.env` pointed at both
   ([apps/mobile/README.md](../apps/mobile/README.md)).
2. Metro: `bun run --cwd apps/mobile dev`, then press `i` once so Expo Go
   is installed on the booted simulator.
3. The [Maestro CLI](https://docs.maestro.dev/getting-started/installing-maestro)
   (needs Java 17).
4. From the repo root, every flow, or one:

   ```sh
   bun run --cwd apps/mobile e2e
   bun run --cwd apps/mobile e2e flows/handshake.yaml
   ```

The whole suite takes about a quarter of an hour: most of it is signing
people in and out, since one simulator plays every person in turn.
Before you call a new flow done, run it three times in a row; a flow that
passes once and fails on a repeat depends on order or timing.

The runner (`apps/mobile/e2e/run.ts`) seeds, through the service role,
the people, connections, tags and gatherings the flows being run need,
stamped for this run, then runs them. Screenshots and the
view hierarchy of every step are in `apps/mobile/e2e/.maestro`. Settings,
all optional: `MAESTRO_OPEN_URL` (default `exp://127.0.0.1:8081`, Metro's
address), `MAESTRO_DEVICE` (a simulator UDID when more than one is booted),
`MAESTRO_BIN` (the Maestro CLI, if not on your PATH), and, for a
development build instead of Expo Go, `MAESTRO_APP_ID` (your bundle id)
with `MAESTRO_OPEN_URL=<your scheme>://`.

**Another checkout or session already using the simulator?** Maestro
drives whatever is on the screen, so give the run its own: create and
boot a simulator, install Expo Go on it (`xcrun simctl install <udid>`
with the `Expo Go.app` from `xcrun simctl get_app_container <other-udid>
host.exp.Exponent app`), start Metro on another port (`bunx expo start
--port 8098`), and pass `MAESTRO_DEVICE=<udid>` and
`MAESTRO_OPEN_URL=exp://127.0.0.1:8098`. A second Supabase stack and API
Worker go on other ports, as for the web suite: point `SUPABASE_URL`,
`apps/api/.dev.vars` and `apps/mobile/.env` at them.

### The mobile map

| Screen | Flow |
| --- | --- |
| `login` | every flow; `sign-up`, `signed-out` (a tapped tag's action comes back after sign-in), `handshake` (an unclaimed tag goes on to the claim) |
| `t/[uid]` | `handshake`, `signed-out`, `gathering-controls`, `blocks`, `reports` |
| `claim/[uid]` | `handshake` |
| `(tabs)/gatherings` (Discover, Yours) | `gatherings`, `gathering-controls` |
| `gathering/new` | `gatherings`, `gathering-controls` |
| `gathering/[id]` | `gatherings`, `gathering-controls`, `signed-out`, `met-at` (opened from a connection's Met at line) |
| `(tabs)/connections` (Connections, Requests, Blocked) | `handshake`, `met-at` (where you met), `blocks`, `reports`, `sign-in` |
| `(tabs)/profile` | `sign-up`, `sign-in` |
| `report/[id]` | `reports` |
| `terms-update` | `terms` |
| `scan`, `scan-qr` | not covered: NFC and the camera need a device |
| `share`, `(tabs)/merch` | not covered yet: a gap |

| Promise ([safety-model.md](safety-model.md)) | Flow |
| --- | --- |
| Blocks are absolute and invisible | `blocks` (the blocked side's tag tap reads as inactive), `reports` |
| Connections are mutual | `handshake`, `met-at` (where you met shows on both sides) |
| Who's going is connections-only | `gatherings` (a row names only connections) |
| Gathering visibility and capacity | `gathering-controls` (hidden from a stranger's tap and whole feed; Full) |
| Reports are private | `reports` (the reporter is told the person isn't; the stored row is checked by the web spec and the database suite) |
| Terms are agreed to, and recorded | `terms` |

### Writing a flow

A flow file is one flow, named for it (`blocks.yaml`), and its `name:`
says what a person did and saw, as a web test title does:
`Blocking a connection ends it for both, and the blocked side gets no
signal`. Maestro prints that name when the flow goes red.

The same rules as the web suite keep it deterministic:

- **Seed setup through the service role, act through the UI.** Each flow
  has an entry in `run.ts`'s `seeds`, named for its file, that creates its
  people, connections and tags and returns them as `-e` variables
  (`HS_UID`, `GC_HOST_EMAIL`...). Each flow has its own people, so flows
  run alone, together, or in any order.
- **Everything stamped.** Emails, names and titles carry the run's stamp.
- **No sleeps.** Wait on what a person would see: `extendedWaitUntil`.
- **Absence needs the whole list.** Maestro only sees what is on screen,
  so "not in the feed" scrolls every page (`steps/not-in-feed.yaml`), and
  finding a row scrolls to it (`steps/reveal-in-feed.yaml`).

The steps in `flows/steps` are the ones most flows share:
`open-signed-out` (a fresh start on the sign-in screen), `open-link` (a
deep link: `${OPEN_URL}/--/t/<uid>` in Expo Go), `sign-in` (sign in and
wait for where it should lead), `sign-out`.

Selectors are the visible text and accessibility labels, the same names a
screen reader uses, so a renamed button breaks a flow the way it would
break a spec. Maestro's text is a regular expression matched against the
whole label: escape `?`, `(` and `)`. The iOS behaviors the flows work
around, each commented where it happens:

- A field's label and its input share the name: tap `below:` the label.
  A multiline input reads as its label plus its placeholder.
- A pressable row is one element to a screen reader, so a gathering row
  matches as `<title>, <when>, <going>, <names>`.
- The system's Save Password sheet hides the app until it is declined,
  and iOS asks "Open in Expo Go?" before a link from outside the app.
- In a new-password field, iOS's strong-password suggestion takes over
  typed text: fill the form in sign-in mode, then switch.
- The keyboard covers buttons, and Maestro's `hideKeyboard` cannot close
  it on every screen: tap a heading, or press Return in a one-line field.
- Maestro counts an element behind the header or the tab bar (and its
  raised share button) as visible, and a tap on it lands on what covers
  it. A row or Load more found by scrolling is pushed up clear of the tab
  bar before it is tapped, and scrolling back up ends with a short pull
  so the segments clear the header (`steps/show-yours.yaml`).
- Discover rows carry the same Hosting and Going marks as Yours, so a row
  never proves which segment is showing: check the segment is selected.
