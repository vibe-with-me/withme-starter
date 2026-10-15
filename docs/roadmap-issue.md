# Roadmap issue (draft)

The body of the pinned "Roadmap" issue, to be opened by a maintainer at the
public flip. It is a draft until then; the repo is private and the issue
does not exist yet. The canonical record stays
[docs/skills-roadmap.md](skills-roadmap.md); this issue is the public
summary of what is open, kept short so it can be re-pinned when it changes.

Suggested title: **Roadmap**. Pin it, and give it the `help wanted` label
only for the items marked that way below.

---

## What this is

withme-starter is the open-source handshake: tap a tag, meet a person, stay
connected. The code stays pure handshake, and growth ships as **skills** in
[`.agents/skills/`](https://github.com/vibe-with-me/withme-starter/tree/main/.agents/skills)
that a fork runs to become its own app. The reasoning, the skills that
exist, and the ones deliberately skipped are in
[docs/skills-roadmap.md](https://github.com/vibe-with-me/withme-starter/blob/main/docs/skills-roadmap.md).
[CONTRIBUTING](https://github.com/vibe-with-me/withme-starter/blob/main/CONTRIBUTING.md)
says how a change ships.

Two rules bound every item here: nothing that ranks, recommends,
aggregates, or monetizes, and the stack stays as it is.

## Shipped

- The handshake, blocks, gatherings, profile with two visibility tiers,
  avatar uploads, account deletion, My tags.
- Skills: `design-direction`, `make-it-yours`, `customize-gathering`,
  `extend-profile`, `add-destination-type`, `provision-tags`, `go-live`,
  `add-marketing-site`.
- `@withme/nfc`, the standalone redirect SDK, published from `nfc-v*` tags.

## Open

Checkboxes are the state of the roadmap. A maintainer edits this issue when
one closes; discussion of any single item belongs in its own issue, linked
from here.

### Skills

- [ ] **Skill rot check.** Each skill re-run against a fresh clone on a
      schedule, so a skill that drifts from the substrate gets caught before
      a fork hits it. `help wanted` once the harness shape is written down.

### V1.1 gaps

- [ ] **Universal links / AASA.** A tap on a phone with the mobile app
      installed should open the app, not the web resolver. Needs an
      `apple-app-site-association` served from the web Worker, Android
      `assetlinks.json`, and `associatedDomains` in the mobile config.
      `help wanted`: the web side is a route and a file; the mobile side
      needs a development build to verify.
- [ ] **Request expiry.** Requests expire after seven days by timestamp
      today, and expired rows are swept lazily on the next send. Decide
      whether a scheduled sweep is needed at all (the stack deliberately
      has no background jobs) and, if so, where it runs.
- [ ] **Development build with real NFC hardware.** Expo Go cannot read
      tags; the scan screen falls back to manual entry. The development
      build path (`npx expo run:ios`, `react-native-nfc-manager`) needs to
      be walked on a device with a real tag and written down, including the
      `runtimeVersion` fingerprint switch.

### Deferred, on purpose

- **Notifications** (push on request received / accepted). A real handshake
  need, but infra-heavy. If it ever lands it is transactional only, never
  engagement, and as a skill. Not before the items above.
- **Analytics.** Skipped permanently. The no-telemetry stance is part of
  the starter's identity; PostHog and friends ship their own skills.
- **Commerce.** The Merch tab stays a pointer to a store URL. No cart, no
  products, no Shopify API.

## How to pick something up

Comment on the item's own issue (open one if it has none, linking here),
read [docs/the-slice.md](https://github.com/vibe-with-me/withme-starter/blob/main/docs/the-slice.md),
and ship it as one slice. Proposals that are not on this list go through
the feature template; the `invariant` label is for anything that needs the
boundary discussed first.
