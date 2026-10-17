# Docs

Start with the [root README](../README.md). Come here when you want the
longer version of something it mentions.

## For someone deciding whether to fork

- [Building blocks](building-blocks.md): what each package and app does,
  what a tap actually goes through, and the one pattern (contract first)
  that everything else follows.
- [Glossary](glossary.md): tag, UID, destination, card, handshake,
  gathering, block, RLS, contract, Worker, skill, slice.
- [The stack, and why](stack.md): each technology choice, what it buys,
  what it costs, and the constraints it brings.
- [The safety model](safety-model.md): the promises the starter keeps for
  your users, how each one is enforced, and the test that proves it.
- [Reports and moderation](moderation.md): what the App Store and Google
  Play require of an app with user content, what the starter covers, and
  the operator's side: where reports land and the 24-hour promise.

## For someone building a fork

- [Run With Me, skill by skill](run-with-me.md): the worked derivation.
  A run club app from fork to deploy, with the prompt to give your agent
  at each step, the files that change, and the checks.
- [The agent's starting prompt](agent-prompt.md): fill in the brackets
  (brand, vertical, accounts, where to stop) and paste it into a fresh
  agent session to run the whole derivation.
- [Local development](local-development.md): the stack on your machine,
  the demo accounts, the test suites, and the fixes for what goes wrong on
  a fresh install.
- [NFC tags](nfc-tags.md): the chip, the URL, random versus chip UIDs,
  encoding and locking, and why the domain you encode is forever.
- [Merch](merch.md): the store pointer in the app, accessories per
  vertical, sourcing and encoding tags with GoToTags, and a Shopify store
  from zero to the first shipped batch.
- [Terms template](terms-template.md): placeholder terms of use and
  privacy policy to replace and publish before launch.
- [The slice](the-slice.md): the fixed order every change moves through
  (contract → migration + RLS → tests → API → web → mobile → e2e), with the
  real file that plays each role today. The skills assume you have read it.
- [Staying current](staying-current.md): keep the starter as a git
  remote and merge its updates, with where the conflicts come from, how
  migrations from both sides interleave, and how to keep merges cheap.
- [The skills](../.agents/skills/): `design-direction`, `make-it-yours`,
  `customize-gathering`, `extend-profile`, `add-destination-type`,
  `provision-tags`, `go-live`, `add-marketing-site`. Each is a runbook
  with a checkpoint per step.

## For someone curious how the starter is built

- [Skills roadmap](skills-roadmap.md): why growth ships as skills rather
  than features, which skills exist, which were deliberately skipped, and
  the product decisions a fork inherits with them.
