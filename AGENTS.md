# Agent instructions

This repository is withme-starter or an app built on it: people tap an NFC
tag to connect, over a TanStack Start web app, an Expo app, one typed API on
Cloudflare Workers, and Supabase.

**Turning it into a new app.** Run the skills in `.agents/skills/`, in this
order, and don't start the next until the checkpoint at the end of the last
one passes:

1. `design-direction` (only if there is no brand yet)
2. `make-it-yours`
3. `customize-gathering`
4. `extend-profile`
5. `add-destination-type` (only if a tag must open something new)
6. `provision-tags`
7. `go-live`
8. `add-marketing-site`

Run the demo first (README, "Try it locally"). `docs/run-with-me.md` gives the
prompt and inputs for each skill; `docs/agent-prompt.md` collects the inputs
in one place.

**Building a feature no skill covers.** Run `.agents/skills/feature-dev/`.

**Any change that touches the app.** Read `docs/the-slice.md` once first. The
gate is `bun run lint && bun run typecheck && bun run test`; never loosen a
test to pass it.
