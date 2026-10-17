# A starting prompt for the agent that builds your fork

The skills in [`.agents/skills/`](../.agents/skills/) are runbooks an AI
coding agent can execute, and [Run With Me](run-with-me.md) gives the
prompt for each one. What the agent cannot get from the repo is you: your
brand, your vertical, your accounts, and where you want it to stop. This
page is that part, as one prompt.

Fill in the brackets and paste it into a fresh agent session (Claude
Code, say) that has your clone open. Every bracket is an input one of
the skills asks for; the skill it feeds is named next to it. Delete the
lines that do not apply.

If your name keeps the "[Something] With Me" pattern, the
`make-it-yours` skill will ask you for the non-affiliation disclaimer in
[TRADEMARKS.md](../TRADEMARKS.md); have it ready, and expect to put it on
your store listings too.

---

You're building **[Display Name]** on withme-starter. Start with the
starter's README and follow it as written, the way a first-time forker
would: run the demo locally first, then work through the skills in
`.agents/skills/` in the order the Run With Me walkthrough uses
(`docs/run-with-me.md`). Each skill is a runbook with a checkpoint at the
end; don't start the next one until the checkpoint passes. Read
`docs/the-slice.md` once before the first skill that changes code.

**Where the docs are wrong, do what's right and write it down.** Keep a
running list in `UPSTREAM-SNAGS.md` at the root of the fork of every step
that was missing, out of order, or unclear, with what you did instead.
Don't fix the starter's docs from inside this fork; the list goes
upstream separately.

**Repository.** Clone the starter and create `[owner/repo]` on GitHub.
Before the first push, rename the clone's `origin` (the starter) to
`upstream` and add `[owner/repo]` as `origin`; then push, and point `gh`
at your repo with `gh repo set-default` (`docs/run-with-me.md` step 0 has
the commands, for a public or a private repo).
One PR per skill step, merged when CI is green.

**Brand** (for `make-it-yours`; run `design-direction` first if the
colors and fonts below are blank):
- Wordmark `[lowercase]`, display name `[Display Name]`
- Vertical, in a sentence: `[who taps what, where]`
- Mood, three words: `[for design-direction, or "skip; keep the
  starter's look"]`
- Accent `[hex, light]` / `[hex, dark]`, on-accent ink `[hex, light]` /
  `[hex, dark]`
- Fonts: `[display / body, both self-hostable, or "keep the starter's"]`
- Bundle id `[com.example.app]`, URL scheme `[scheme]`
- Worker names `[name-api]`, `[name-web]`
- Store URL for the Merch tab: `[url, or "none yet"]`
- Security contact `[repository with private vulnerability reporting, or
  an email]`; PR reviewer `[GitHub handle or team]`

**Vertical:**
- The gathering becomes `[round / rounds]`, tab label `[Rounds]`, URL
  `/[rounds]`, with fields `[course_name: required text up to 120
  characters, shown to a tapper before joining]` (`customize-gathering`)
- Profile fields on the card: `[handicap, home_course]`; visible only to
  connections: `[shirt_size, or "none"]`; required before the app opens:
  `[handicap]` (`extend-profile`; a phone number, an email, or a handle
  goes in Links instead, as the skill says)
- A tag that sends people somewhere other than a person: `[a link to the
  tee sheet, or "none"]` (`add-destination-type`)
- Tags live on `[bag tag, ball marker]`; merch to list: `[items, or
  "none yet"]`
- Site (`add-marketing-site`): landing promise `[one line]` and one plain
  sentence of what the app does; sample card `[an invented name and bio,
  or "invent one"]`; sign-in methods `[email / phone through Twilio]`

**Accounts and money.** Supabase `[new org "Name" on the free plan /
existing project ref]`, region `[us-east-1]`. Cloudflare account `[name]`
(`wrangler whoami`). Expo account `[@owner]`, EAS project `[new /
existing id]`. App domain `[https://app.example.co]`, the base URL the
tags encode and keep forever; site domain `[example.co]`; contact email
`[hello@example.co]`. Stop and ask before anything that bills, creates a
cloud resource, or writes to production, and before the production tag
batch. Provision against production only after `go-live` has created the
database and its keys file, whatever order the walkthrough lists them in.
Never read credentials from an old checkout, and never ask for or print
a secret value in chat. When a skill needs one, the owner puts it where
that skill says (an env file, a CLI login, a provider dashboard) and
tells you it is there.

**Done for this pass:** `[local stack green and both apps running on the
new brand / deployed to the accounts above / tags provisioned and the
site up]`. Report what you shipped, what you skipped, and the snag list.
