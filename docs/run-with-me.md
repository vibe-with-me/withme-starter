# Run With Me, skill by skill

A worked derivation: the starter becomes a run club app. Members tap a
tag on someone's bib or water bottle to connect, and tap the sign at the
start line to join today's run. Every step is one of the skills in
[`.agents/skills/`](../.agents/skills/), run in the order the skills were
designed for.

This is a walkthrough, not a transcript. Golf With Me is the real
derivation the skills were distilled from; Run With Me is the same path
with a run club's nouns, chosen because it maps one-to-one onto each
skill's worked example. Where a skill's example says `course_name`,
you will say `distance`; where it says `affiliation`, you will say
`pace`.

## How to read this

Each step has four parts:

- **What you want**, in the words you would use.
- **The prompt**: what to tell an AI coding agent (Claude Code, say) that
  has the repo open. The skills are written to be executed by one; the
  prompt points it at the skill and gives it the inputs the skill asks
  for.
- **What changes**: the files, so you know what to look at in the diff.
- **Done when**: the skill's own checkpoint.

The skills reference [the-slice.md](the-slice.md) for the order every
change moves through and the discipline each layer keeps. Read it once
first; the skills do not repeat it.

Every step ends with the verification gate green:

```sh
bun run lint && bun run typecheck && bun run test
```

## Before you start

Decide the handful of things the skills will ask for. If an agent will
run the skills for you, [the starting prompt](agent-prompt.md) collects
these same inputs, with the rules the agent should hold to along the way.
For Run With Me:

| Input | Value |
| --- | --- |
| Wordmark (lowercase mark) | `runwithme` |
| Display name (in prose) | Run With Me |
| Vertical, in a sentence | A neighborhood run club; members who tap a tag on a bib at the start line and on a water bottle at the coffee stop afterwards. |
| Mood, three words | dawn, asphalt, Saturday |
| The gathering's nouns | run / runs; tab "Runs"; URL `/runs` |
| A field on the run | `distance` ("5K", "10 mi"), required, shown to a tapper before joining |
| Card-tier profile field | `pace` ("easy, 10:00/mi"), required to open the app |
| Connections-tier profile field | `strava_handle`, optional |
| Bundle id / scheme | `com.example.runwithme` / `runwithme` |
| Worker names | `runwithme-api`, `runwithme-web`, `runwithme-site` |
| Domain for tags | `https://app.runwithme.example`, the app's hostname (one you own, forever); the site takes `runwithme.example` in step 8 |
| Contact email | `hello@runwithme.example`, for the support and privacy pages |
| Store URL | none yet; the Merch tab stays absent |

## Step 0: fork and run the demo

Get your own copy of the repo (below), clone it, and follow the README's
[Try it locally](../README.md#try-it-locally). Tap Ada's tag at
`http://localhost:3000/t/04BBBBBBBBBBBB`, sign in as Ada, see her
gathering. You now have `withme` running.

Then run the verification gate once, before you change anything. The
RLS suite sets up its fixtures with the local stack's service-role key,
so export it in this shell first
([why](local-development.md#the-service-role-key)):

```sh
eval "export $(supabase status -o env --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY | grep ^SUPABASE_SERVICE_ROLE_KEY=)"
bun run lint && bun run typecheck && bun run test
```

All green. Every later step's gate runs in a shell with that key
exported.

**Your own copy.** A public app can use GitHub's Fork button, then add
the starter as a second remote, so its later fixes reach your fork with
a plain `git merge`:

```sh
git remote add upstream https://github.com/vibe-with-me/withme-starter.git
gh repo set-default <org>/<app>
```

A private app cannot be a fork: a fork of a public repository stays
public, and GitHub will not fork a repository into the organization
that owns it. Clone the starter and push it to a new private repository
instead; the clone keeps the starter's history, so merging updates works
the same way:

```sh
git clone https://github.com/vibe-with-me/withme-starter.git <app>
cd <app>
gh repo create <org>/<app> --private
git remote rename origin upstream
git remote add origin https://github.com/<org>/<app>.git
git push -u origin main
gh repo set-default <org>/<app>
```

Either way, `gh repo set-default` matters: with more than one remote and
no default set, `gh pr create` either stops to ask which repository you
mean or picks the starter (an `upstream` remote ranks first) and opens
the PR there. Setting the default names your repo once.
[Staying current](staying-current.md) is the routine for taking an update.

## Step 1: `design-direction` (optional)

**What you want.** A look for a run club. You have a vertical and a mood
but no colors, fonts, or logo yet.

**The prompt.**

> Run `.agents/skills/design-direction/SKILL.md`. The vertical: a
> neighborhood run club; members who tap a tag on a bib at the start line
> and on a water bottle at the coffee stop afterwards. Mood: dawn,
> asphalt, Saturday. Brand names: wordmark `runwithme`, display name
> "Run With Me". No references, no store.

**What changes.** One new file, `docs/brand-direction.md`: a sheet with
the eight color tokens in light and dark, two fonts both clients can
self-host, the wordmark, the copy lines (the landing promise, the tab
labels, the permission strings), and the icon artwork notes. No app code.
The skill holds Claude's `/design` to the starter's design system (one
accent, on the primary button only; the card idiom; the fixed layout) so
what comes out can be typed straight into the next skill.

**Done when.** `bun run .agents/skills/design-direction/contrast.ts
--sheet docs/brand-direction.md` passes: all eight tokens present in both
modes, and the twelve contrast pairs `make-it-yours` relies on hold.

Skip this step if you already have a brand; fill `make-it-yours`' inputs
directly.

## Step 2: `make-it-yours`

**What you want.** The app says Run With Me everywhere, in your colors
and fonts, with your app identity.

**The prompt.**

> Run `.agents/skills/make-it-yours/SKILL.md` with the inputs from
> `docs/brand-direction.md`. Wordmark `runwithme`, display name "Run With
> Me". Bundle id `com.example.runwithme`, scheme `runwithme`. Worker names
> `runwithme-api` and `runwithme-web`. No store URL. Keep the demo seed
> identity for now.

**What changes.**

| Step in the skill | Files |
| --- | --- |
| 1. Tokens | `apps/web/src/styles/tokens.css` and `apps/mobile/lib/tokens.ts`, value-identical; the splash colors in `apps/mobile/app.json` |
| 2. Fonts | `apps/web/src/fonts/`, the `@font-face` blocks in `apps/web/src/styles/app.css`; `apps/mobile/app/_layout.tsx` and the `fonts` map in `lib/tokens.ts` |
| 3. Wordmark and copy | The landing page, the shell header, the resolver footer, the login hint, every route's page title, the mobile header, the NFC permission string |
| 4. App identity | `apps/mobile/app.json`: name, slug, scheme, bundle id, package |
| 5. EAS ownership | `apps/mobile/app.json` after `eas init` under your Expo account |
| 6. Deploy names | `apps/api/wrangler.jsonc`, `apps/web/wrangler.jsonc` (the web worker's service binding must name the new API worker) |
| 7. Store pointer | Skipped: no store yet |
| 8. Icons + gate | `apps/mobile/assets/`, then the gate and the brand sweep |

This is configuration only. No feature code moves, no policy moves, and
the `@withme/*` and `@vibewithme/nfc` package names stay (they are internal; renaming them
breaks every import for zero brand value).

**Done when.** The final sweep returns nothing:

```sh
grep -rni --exclude-dir={node_modules,dist,.expo,.wrangler,.turbo} withme apps/ supabase/seed README.md | grep -vE '@(vibe)?withme/'
```

(your own `runwithme` strings need an extra `| grep -vi runwithme`
filter; the sweep is about old-brand residue), and with both dev servers
up the landing page shows `runwithme` in your accent.

## Step 3: `customize-gathering`

**What you want.** A gathering is a run. The tab says Runs, the URL is
`/runs`, and a run has a distance that people see before they join.

**The prompt.**

> Run `.agents/skills/customize-gathering/SKILL.md`. Nouns: "run" /
> "runs", tab label "Runs", URL segment `/runs`. One field: `distance`,
> required text up to 40 characters ("5K", "10 mi"), filled in by the host,
> shown on the run's row, the detail header, and in the resolver summary
> so a tapper sees it before joining.

**What changes.**

*Nouns (§1).* String literals and JSX text only, never identifiers: the
tab label in `apps/web/src/components/AppShell.tsx` and
`apps/mobile/app/(tabs)/_layout.tsx`, each route's page title, the copy
in the list and detail screens, the Playwright specs that select by that
copy. The URL rename moves `_app.gatherings.tsx` to `_app.runs.tsx` and
`_app.gatherings_.$id.tsx` to `_app.runs_.$id.tsx` on web, and
`(tabs)/gatherings.tsx` to `(tabs)/runs.tsx` on mobile, with every link
and redirect that names the path. The API's REST paths and the
`gathering` destination type stay; tags already in the field keep
working.

*The field (§2), in slice order.*

1. Contract: `packages/contract/src/schemas/gathering.ts` gains
   `distance` on `GatheringSchema`, the create and update inputs, and
   `GatheringSummarySchema` (it crosses the anonymous resolve boundary, so
   only because a tapper should see it). A negative case in
   `packages/contract/test/schemas.test.ts`.
2. Migration: a new file in `supabase/migrations/` adds the column with a
   CHECK, rebuilds `public.create_gathering` with the new parameter
   (drop then create; Postgres cannot change a signature in place),
   re-issues its grants, redefines `resolve_tag` from its **newest**
   definition so the summary carries `distance`, and re-grants the host's
   column update list. Then `bun run db:reset && bun run db:seed && bun
   run db:types` and commit the regenerated types.
3. Tests: `packages/db/test/gatherings.test.ts` passes the new argument
   and gets a rejected-at-the-boundary case for the CHECK. The twenty-one
   existing tests pass untouched.
4. Queries and API: `packages/db/src/queries/gatherings.ts`,
   `apps/api/src/routers/app.ts`.
5. SDK: `GatheringSummary` in `packages/nfc-sdk/src/client.ts` mirrors
   the summary; its typecheck fails until it does.
6. Screens: the create form, the edit form, the row line, the detail
   header on web and mobile; the resolver line from `lib/format-time.ts`.
7. E2E and seed: `apps/api/e2e/handshake.e2e.ts` §12,
   `apps/web/e2e/gatherings.spec.ts`, `supabase/seed/index.ts` (Ada's
   gathering becomes "Saturday long run, 10K").

*What must not move (§3).* The mechanisms the gatherings migrations
depend on, each re-stated by a test: the listing admits the whole tenant
minus a block either way with the host; the member list admits only the
viewer's own row and their connections' rows; the headcount is a definer
read that restates the listing's visibility; and `'gathering not found'`
is byte-identical for a missing id and a blocked joiner in either
direction. The skill lists them; the tests enforce them.

**Done when.** The verification gate, then `cd apps/web && bunx
playwright test`. Tap Ada's tag: the card reads "Saturday long run · 10K
· Sat 7:00 AM · Memorial Park" with one accent button, "Join this run".

## Step 4: `extend-profile`

**What you want.** Everyone's card shows their pace, so a tapper knows
whether to run with them. People you have connected with can see your
Strava handle; strangers cannot. Nobody gets into the app without a pace.

**The prompt.**

> Run `.agents/skills/extend-profile/SKILL.md`. Card tier: `pace`, a
> free-text line 1–80 characters ("easy, 10:00/mi"), required for
> completion. Connections tier: `strava_handle`, 1–120 characters,
> optional. Use the skill's `affiliation` → `pace` and `contact_handle` →
> `strava_handle` substitutions throughout, keeping the shapes.

Today a Strava handle would fit Links instead: one entry in the platform
registry (`strava`, the athlete id from a profile URL,
`https://strava.com/athletes/<id>`) and one
line in `private.is_link_value`, with no new table. This walkthrough keeps
`strava_handle` because it is the run that exercised the skill's
connections tier; reach for Links first in a real fork.

**What changes.** The skill's map, with your names:

| Layer | Card tier (`pace`) | Connections tier (`strava_handle`) |
| --- | --- | --- |
| Contract | `schemas/profile.ts`: `ProfileSchema`, `PublicProfileSchema`, `UpdateProfileInputSchema`, `REQUIRED_PROFILE_FIELDS`, `isProfileComplete` | `ProfileDetailsSchema`; `ConnectionSchema.details`; the `profile.get` / `profile.update` outputs in `contract/app.ts` |
| RLS tests, red first | `packages/db/test/profile-fields.test.ts`: rides the anonymous resolve, length-checked at the boundary, rides the accept return | same file: owner reads and writes; an accepted connection reads both ways; the pending-request recipient, a gathering co-member (not a connection), a blocker, and anon read nothing and get no oracle |
| Migration | a column on `profiles` with a CHECK; `resolve_tag` and `accept_connect_request` redefined from their newest bodies to carry it | the `profile_details` table, its tenant seam, its narrow policy; `accept_connect_request` returns `details` |
| Queries / API | `CARD_COLUMNS`, `upsertOwnProfile` in `queries/handshake.ts`; `getProfile`, `updateProfile` in `routers/app.ts` | `DETAILS_COLUMNS`, `getOwnDetails`, `upsertOwnDetails`, `listConnections`; `acceptRequest` and `connectionsList` pass it through |
| SDK | `PublicProfileCard` gains `pace` | never |
| Web | `ProfileCard.tsx`, `_app.profile.tsx`, `claim.$uid.tsx` | `_app.profile.tsx`, `_app.connections.tsx` |
| Mobile | `t/[uid].tsx`, `(tabs)/profile.tsx`, `claim/[uid].tsx` | `(tabs)/profile.tsx`, `(tabs)/connections.tsx`, `PersonRow` in `components/ui.tsx` |
| Gate | `isProfileComplete` → web `_app.tsx`, mobile `(tabs)/_layout.tsx` | — |
| Seed / e2e | the seed, the API e2e, every profile-creating step in `apps/web/e2e/` | the same |

The order has one deliberate swap from the slice: the RLS tests come
before the migration, so the boundary is written down before the policy
that enforces it. The skill explains why the connections tier is its own
table and not a column: RLS admits rows, and every viewer the card policy
admits (the pending-request recipient, someone who blocked you) would read
every column. That mistake was made for real in
the build the skill came from; the test file is its regression test.

The completion gate is a UX gate, never a policy: the columns stay
nullable, and an incomplete profile is still a valid card. The claim
pages ask for `pace` themselves so a new member's first tap still ends
in a connection.

**Done when.** The verification gate, with the new RLS file green. Sign
in as Lin: the shell asks for a pace before it opens. Tap Ada's tag as a
stranger: her pace is on the card, her Strava handle is not. Connect, and
it is.

## Step 5: `add-destination-type` (optional)

**What you want.** The tag on the start-line sign should send people to
today's route map, not to a person.

**The prompt.**

> Run `.agents/skills/add-destination-type/SKILL.md` with its worked
> example as-is: `{ type: 'link', url }`, https only, up to 2048
> characters. Render it as a redirect on web and mobile.

**What changes.** The skill's example is exactly this type, so the diff
follows its sections: the union member in
`packages/contract/src/schemas/destination.ts` with a negative test; the
`tags_destination_shape` CHECK rebuilt with every existing branch carried
forward and the `coalesce(…, false)` that stops a missing key from
passing (Postgres treats a NULL CHECK result as pass; the skill explains
the trap because it bit once); two RLS tests in
`packages/db/test/tags.test.ts`; no API change (resolve and claim flow
through the contract); the structural `Destination` type in
`packages/nfc-sdk/src/client.ts`, whose parity test fails until it
matches; and a branch in each resolver (`t.$uid.tsx`, `t/[uid].tsx`) that
redirects. The new type is reachable through the SDK and the API at once;
offering it in the claim screen or "My tags" is a separate product
decision the skill leaves to you.

**Done when.** `cd packages/db && bun test`, `cd packages/nfc-sdk && bun
run typecheck`, the API e2e round-trip passes, and a `curl` of
`/t/<a tag claimed as a link>` answers a 307 to the route map while a
normal profile tag still answers 200.

## Step 6: `provision-tags`

**What you want.** Twenty-five tags for the first Saturday: bibs for
regulars, a few spares, one for the start-line sign.

**The prompt.**

> Run `.agents/skills/provision-tags/SKILL.md`. Rehearse locally with
> three tags, then provision 25 against production with base URL
> `https://app.runwithme.example`. Output directory
> `~/runwithme-tags/<date>`, outside the repo. Stop before the production
> write and ask me.

**What changes.** Nothing in the repo. The script
(`supabase/seed/provision.ts`) creates 25 unclaimed rows and writes
`provisioned-tags.csv` and a printable `.html` sheet into the output
directory. The skill's rules: UIDs come from the script (48 random bits
each), the encode list is a set of bearer capabilities until the tags
are claimed (outside the repo, readable only by you, never in chat),
provision what you are about to encode, production writes need the
owner's explicit OK, and the domain you encode is forever.

**Done when.** The local rehearsal resolves a provisioned UID as
unclaimed in the web app; the production batch's CSV has 25 rows; you
have encoded and locked the tags with an NFC writer app and the first tap
on one offers the claim flow.

Order matters with the next step: provision against production after
`go-live` §1 has created the database.

## Step 7: `go-live`

**What you want.** Run With Me on the internet, at your domain.

**The prompt.**

> Run `.agents/skills/go-live/SKILL.md`. New Supabase org "Run With Me"
> on the free plan for now, region us-east-1. Cloudflare account already
> logged in (`wrangler whoami`). Mobile: an EAS update on the `demo`
> branch. Stop and ask me before anything that bills or writes to
> production.

**What changes.** Production, in order: the database (`supabase projects
create`, `link`, `db push`, keys into a gitignored env file, the seed with
the owner's OK), the API worker (`wrangler deploy`, then config as
secrets, never vars), the web worker (`apps/web/.env.production`, build,
deploy), the mobile update (`eas update` with the production endpoints).
Every pothole in the runbook was hit on a real deploy: the Cloudflare
502s that mean retry, the SMTP rule that means seeded credentials, the
free-plan pause that means a paid org before real users.

**Done when.** `curl https://runwithme-api.<you>.workers.dev/health`
returns `{"ok":true}`; your domain's `/t/<a provisioned UID>` renders the
claim page; a phone with the EAS update installed signs in and sees the
Runs tab.

## Step 8: `add-marketing-site`

**What you want.** A page at `runwithme.example` that says what the bib
tag does and where to get one, plus the privacy and support URLs the
App Store and Google Play ask for.

**The prompt.**

> Run `.agents/skills/add-marketing-site/SKILL.md`. Site at
> `runwithme.example`, app at `app.runwithme.example` (the tags already
> encode it). Contact `hello@runwithme.example`. Sample card: an invented
> runner with a pace line. No store yet. Stop and ask me before the
> deploy.

**What changes.** `apps/site/`, copied from the skill's template: an
Astro site with static output, no adapter, and no client JavaScript. Its
layout imports the web app's `tokens.css` and `app.css`, so it shows the
Run With Me accent and the real card idiom with no styles of its own.
`src/brand.ts` gets the wordmark, promise, and contact email. The home
page gets runner nouns ("Tap the sign at the start line to join the
run"). The privacy page gets a line for `pace` under "Your card", one for
`strava_handle` under connections-only, and Twilio only if phone sign-in
is on. Outside `apps/site`: a `@withme/site#build` task in `turbo.json`
(so a token change rebuilds the site), and `.astro` in `.gitignore` and
`.oxlintrc.json`.

**Done when.** `curl` on `/`, `/privacy`, `/support` returns 200 at
`runwithme.example` and `/nope` returns 404 with the site's page; the
built pages contain no `<script>`; App Store Connect has the privacy and
support URLs, and Google Play has `/support#delete-account` as the
account-deletion URL.

## What you have

A run club app with your brand, your nouns, your fields, and the same
promises as the starter: nobody can list runners, blocks are invisible,
connections are mutual, runs are listed to signed-in members while who
is going stays connections-only, taps record nothing but a user agent,
and deleting an account releases its tags. None of the eight steps moved
a boundary, and the seventy-plus RLS tests plus your new ones say so.

## Variations

The same eight steps, different inputs:

| Vertical | `customize-gathering` | `extend-profile` card | `extend-profile` connections | `add-destination-type` |
| --- | --- | --- | --- | --- |
| Golf | round / rounds; `course_name` | handicap, home course | — (phone is a Link) | — |
| Tailgate | tailgate / tailgates; `lot` | team, signature dish | — (phone is a Link) | link to the parking map |
| Climbing gym | session / sessions; `wall` | grade, usual night | — (a handle is a Link) | — |
| Dog walking | walk / walks; `park` | dog's name and breed | — (phone is a Link) | — |
| Book club | meeting / meetings; `book` | currently reading | — (email is a Link) | link to the reading list |

The connections column is empty in each because a phone number, an
email and a handle already ship as Links (Profile → Links, connections
only): `extend-profile`'s connections tier is for a field that is not a
way to reach someone. Golf With Me is card-only for that reason.

What stays off the table in every one of them: a list of members you have
not met, a feed, a ranking, a recommendation. The skills will not build
those, and [the safety model](safety-model.md) explains why the promises
above depend on it.
