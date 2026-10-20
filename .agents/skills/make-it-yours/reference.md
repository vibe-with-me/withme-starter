# make-it-yours — reference

## What render.sh writes

(From step 8.) `docs/brand/render.sh` renders `docs/brand/icon.svg` and
`icon-dark.svg` into:

- `apps/mobile/assets/icon.png`: `expo.icon`, full bleed, no alpha.
- `android-icon-foreground.png` + `android-icon-monochrome.png`:
  `adaptiveIcon.foregroundImage` / `monochromeImage`. The mark is scaled
  into the launcher's 66% safe zone. `android-icon-background.png` is
  rendered too but unwired: `adaptiveIcon.backgroundColor` (step 1) is
  what the launcher shows.
- `splash-icon.png` + `splash-icon-dark.png`: the `expo-splash-screen`
  entry's `image` and `dark.image`.
- `favicon.png`: `expo.web.favicon`.
- `apps/web/public/favicon.ico` + `apple-touch-icon.png`, linked from
  `apps/web/src/routes/__root.tsx`.

## The final sweep

Step 8's sweep greps for the old brand (`withme`), the upstream org
(`vibe-with-me`, hyphenated, so `withme` alone misses it) and the
upstream maintainer (`alex-eisele`). Its filters drop:

- `supabase/migrations/` — the first migration's header comment names
  `withme-starter`. Migrations are history: never edit an applied one.
- `release.yml`'s `if:` line — the guard that keeps a fork from
  publishing `@vibewithme/nfc` (step 8, Contact points). It names the
  upstream on purpose.
- `demo-migrate.yml`'s `if:` line — the same guard, keeping a fork from
  trying to migrate the starter's demo (step 8, Contact points).
- `deploy.yml` needs no filter: its `if:` lines name `your-org/your-repo`
  until you turn it on, and then your own repository (a same-org fork
  filters those below).
- `packages/nfc-sdk/` — the SDK (`@vibewithme/nfc`) names the upstream in
  its `package.json` `repository.url` and in doc comments. A fork that
  does not publish the SDK leaves them. If you publish it under your
  own name, drop that filter and fix what it then prints.

The only other acceptable matches, each one a choice you made
deliberately: the seed identity if you kept it (step 3, and then the
README demo line and the `.env` example lines with it), and an upstream
attribution link in the README.

### A fork in the same GitHub org

A fork in the same GitHub org as the starter (`vibe-with-me/<your-repo>`)
has more correct matches: every link to the fork's own repository (the
README CI and coverage badges from step 3, and step 8's contact points, which now say
`github.com/vibe-with-me/<your-repo>/…` in the issue and PR templates and
`CONTRIBUTING.md`), and `"owner": "vibe-with-me"` once step 5 has given
`app.json` the fork's own `projectId`. Append this to the sweep, with
`<your-repo>` filled in; it drops the fork's own links in every file, and
`deploy.yml`'s own `if:` lines once you have turned it on, and the owner
line only after step 5:

```sh
  | grep -vE 'github\.com/vibe-with-me/<your-repo>([^A-Za-z0-9_-]|$)' \
  | grep -v "^\.github/workflows/deploy\.yml:[0-9]*:.*github\.repository == 'vibe-with-me/<your-repo>'" \
  | if grep -q cf56d2f1-eaec-406b-be9c-972519a6be84 apps/mobile/app.json; \
    then cat; else grep -v '^apps/mobile/app.json:[0-9]*: *"owner": "vibe-with-me",$'; fi
```

If the starter's maintainer really does review the fork's pull requests,
`.github/CODEOWNERS` keeps `@alex-eisele` and prints too: a deliberate
match, like the seed identity.
