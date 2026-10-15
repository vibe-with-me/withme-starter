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

## For someone building a fork

- [Run With Me, skill by skill](run-with-me.md): the worked derivation.
  A run club app from fork to deploy, with the prompt to give your agent
  at each step, the files that change, and the checks.
- [Local development](local-development.md): the stack on your machine,
  the demo accounts, the test suites, and the fixes for what goes wrong on
  a fresh install.
- [NFC tags](nfc-tags.md): the chip, the URL, random versus chip UIDs,
  encoding and locking, and why the domain you encode is forever.
- [Merch](merch.md): the store pointer in the app, accessories per
  vertical, sourcing and encoding tags with GoToTags, and a Shopify store
  from zero to the first shipped batch.
- [The slice](the-slice.md): the fixed order every change moves through
  (contract → migration + RLS → tests → API → web → mobile → e2e), with the
  real file that plays each role today. The skills assume you have read it.
- [Staying current](staying-current.md): keep the starter as a git
  remote and merge its updates, with where the conflicts come from, how
  migrations from both sides interleave, and how to keep merges cheap.
- [The skills](../.agents/skills/): `design-direction`, `make-it-yours`,
  `customize-gathering`, `extend-profile`, `add-destination-type`,
  `provision-tags`, `go-live`. Each is a runbook with a checkpoint per step.

## For someone curious how the starter is built

- [Skills roadmap](skills-roadmap.md): which skills exist, which were
  deliberately skipped, and the decisions behind both.
- [`superpowers/`](superpowers/): the build-out program, its specs, and the
  per-milestone plans. This is the working record, not reference docs.
