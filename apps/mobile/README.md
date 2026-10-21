# @withme/mobile

The Expo / React Native client — a thin client over `apps/api`, consuming the
same typed ORPC contract from `packages/contract` as the web app. No business
logic and no direct data access live here; every loader and mutation goes
through the API.

## Run it

Needs the local stack running (`bun run db:start`, `bun run db:seed`) and the
API worker (`bun run --filter @withme/api dev`).

```sh
cp apps/mobile/.env.example apps/mobile/.env   # local-stack defaults
bun run --filter @withme/mobile dev            # Metro; press i for iOS
```

The iOS simulator reaches the host's API and Supabase via `localhost`
directly. On a physical device, set `EXPO_PUBLIC_API_URL` /
`EXPO_PUBLIC_SUPABASE_URL` to your machine's LAN IP.

## NFC

NFC tag reading uses `react-native-nfc-manager`, a native module that needs a
development build (`npx expo run:ios` / EAS) — it is feature-gated, so in Expo
Go the scan screen falls back to manual UID entry and deep links. Tags encode
`https://<domain>/t/{UID}`; universal-link / app-link association is a
deployment step left to the consumer.

## Publishing with EAS Update

The committed `app.json` carries this repo's Expo project (`owner`,
`extra.eas.projectId`, `updates.url`). **Forks: run `npx eas-cli init` once**
to replace those with your own project, then publish a shareable Expo Go
build with your deployed endpoints baked in:

```sh
EXPO_PUBLIC_API_URL=https://<your-api> \
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
npx eas-cli update --channel production --environment production
```

`eas.json` gives each build profile its own channel (`development`,
`staging`, `production`), and a build only takes updates published to its
channel. The `staging` profile is an installable test build with NFC and
real pushes, before the stores: go-live's Staging build section has the
steps.

`runtimeVersion` uses the `sdkVersion` policy so Expo Go can load published
updates by QR, which the quickstart relies on. The trade-off: every build on
one SDK accepts every update for that SDK, so an update that needs native
code a build lacks (a new native module, a changed plugin) installs on that
build and crashes it. A new build doesn't retire the old installs: they
keep taking every later update on their channel. Switching to
`"policy": "fingerprint"` would protect builds but stop Expo Go loading
updates, so the starter doesn't. Until a per-profile runtime policy lands
(planned, with a store-release skill), **ship a native change as a new
build, and publish no update to that channel until every tester has
installed it.**

## Notes

- Auth: Supabase. Sessions exceed expo-secure-store's 2 KB value limit, so
  the AES key lives in the keychain and the encrypted session blob in
  AsyncStorage (`lib/session-storage.ts` — the pattern from Supabase's Expo
  guide). Device-bound, excluded from backups.
- Styling: plain `StyleSheet` against `lib/tokens.ts`, mirroring the web app's
  `tokens.css` (same palette, fonts, one-accent rule) — convertible to
  NativeWind by a forker who prefers it.
- This is a Bun-workspaces monorepo: Metro relies on Bun's hoisting (no custom
  `metro.config.js`). A single copy of each `expo-*` package is required —
  duplicate copies break native-module autolinking. The root overrides in the
  repo's `package.json` keep `expo` deduped and pin `react`/`react-dom` to
  the exact version React Native requires; **bump the overrides and this
  package's pins together** (a web-only React upgrade now goes through the
  root override too).
- The starter tracks the Expo SDK that store Expo Go supports, not the
  newest release: that is what lets a forker open the app on a real phone.
  Check the App Store or Play Store listing for Expo Go's version (57.x
  runs SDK 57) before moving to a new SDK.
- Upgrading the Expo SDK: one major at a time, following Expo's changelog
  for each. Set the root `expo` override to the new version, then in this
  directory run `bunx expo install expo@<version>` and
  `bunx expo install --fix`, which moves every Expo-pinned package together
  (Dependabot ignores them on purpose). Bring `react` here and the root
  `react`/`react-dom` overrides to the version the SDK pins, then run
  `bunx expo-doctor@latest`. Check `bun.lock` for a root
  `@expo/metro-runtime` entry left on the old major: `expo` only peers on
  it, so Bun keeps the stale resolution. Delete that entry and its nested
  `@expo/log-box` lines, then `bun install` again. expo-doctor's "duplicate
  dependencies" check flags `expo` installed twice at the same version.
  That is Bun's isolated linker making one copy per peer set, not two
  versions, and it predates SDK 57.
