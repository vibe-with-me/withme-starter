# design-direction — a look for the domain before the token swap

Decided 2026-10-12 (Alex + Claude). Status: shipped with the skill in the
same PR; the proof run (milestone 5) may fold it into a later run.

## The gap

`make-it-yours` turns a brand into the app in one sitting, but it starts
from values a forker has to bring: an accent pair per mode with the
contrast already checked, neutrals, two self-hostable fonts, a wordmark.
A forker who arrives with only a vertical ("a run club", "a climbing
gym") has nothing to type into its Inputs, and the proof run found two
more holes: make-it-yours never asks for the copy the shell exposes (the
landing hint, the Merch card, the permission strings) or for the icon
artwork step 8 expects to find in `apps/mobile/assets/`.

Claude now ships a `/design` skill: Claude Design's artboard workflow
inside Claude Code, which reads the project's own tokens first and hands
back editable artboards. `/design-sync` goes the other way, pushing a
codebase's tokens and components into a claude.ai design-system project.

## The decision

A new optional skill, `.agents/skills/design-direction/`, that runs
before `make-it-yours` and produces its inputs. It does not touch app
code, and nothing an artboard contains ever becomes code: the starter's
look is implemented in exactly two files (`apps/web/src/styles/tokens.css`,
`apps/mobile/lib/tokens.ts`), and make-it-yours is the only path into
them. The skill constrains `/design` to the starter's design system and
reduces the chosen direction to a sheet, `docs/brand-direction.md`, whose
Colors table a shipped script checks: it derives every required pair
from the values make-it-yours will copy, so there is no second table to
drift (a CodeRabbit finding on the first draft, which had one).

What it holds:

- A brief that names the starter's real surfaces (the resolver card at
  `/t/{UID}`, the signed-in shell, the landing wordmark), fixes what may
  not vary (layout, radii, spacing, one accent only on the primary action,
  accent never on navigation, no gradients, fonts on Google Fonts under
  the OFL so both clients can self-host them), and lists what may.
- A sheet template: the eight color tokens in both modes in the row
  shape the script parses, the fonts with the exact package names for
  web and mobile, the copy lines, the artwork list.
- `contrast.ts`: WCAG 2.x contrast for hex and `rgba()` (composited over
  the background, because the token files use rgba borders). It
  recomputed the proof run's pairs to the cent and showed the starter's
  own `tokens.css` comment is stale (it says 4.8:1; the pair is 5.18:1)
  and its light input border is 2.97:1 (the input-border issue).
- An optional last step: `/design-sync` the fork's tokens to a
  claude.ai design-system project, so later `/design` runs in that fork
  (customize-gathering screens, extend-profile fields, a marketing site)
  start from the fork's brand instead of the starter's.

Rejected: folding this into make-it-yours step 1. That skill is
configuration-only and the proof run is editing it right now; a design
exploration has a different cadence (rounds of artboards, a human
choice) and should be skippable by a fork that already has a brand.

## Evidence

Built once before being written down (roadmap hard constraint 2): a
climbing-gym direction ("Crux") was drawn on a Design canvas from this
session (the same workflow `/design` wraps), reduced to a sheet, and
checked by the script: twelve pairs, all passing, with the dark input
border at 4.48:1 and the light one at 3.22:1. Both fonts the direction chose
exist on both package registries (`@fontsource-variable/bricolage-grotesque`
5.3.0, `@expo-google-fonts/bricolage-grotesque` 0.4.1). The canvas was
not screenshotted: the in-app browser was not signed in, and signing in
is the user's.

## Coordination

The proof-run session owns `make-it-yours` steps 1–4, 6 and 8 until its
PR merges; this PR changes only the Inputs section there (one pointer),
and expects a rebase. Roadmap note and README bullet added here.
