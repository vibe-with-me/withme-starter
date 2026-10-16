# Design brief: a more polished starter design system

A prompt for Claude Design. It asks for a better default look for the starter
(and so for the hosted demo and every fresh fork), delivered as values and
pictures the two token files, `app.css` and `ui.tsx` can absorb. It does not
ask for code.

## How to run it

**In Claude Design (claude.ai/design or the Design artifact type).** Start a
new design, attach these four files, then paste the prompt block below:

- `apps/web/src/styles/tokens.css`
- `apps/web/src/styles/app.css`
- `apps/mobile/lib/tokens.ts`
- `apps/mobile/components/ui.tsx`

**From Claude Code in this repo.** Run `/design` from the repo root and paste
the same block; it reads `tokens.css` itself, so the attachments are optional.

Either way, expect to spend one round picking a direction from the thumbnails
and one or two rounds tightening it. The change list (deliverable E) is what
turns into the implementation PR.

## The prompt

````text
You are revising the design system of withme-starter, an open-source starter
app. People fork it to build a product for one community (a golf league, a
run club, a climbing gym) and then rebrand it with a token swap. The starter
also runs as a hosted demo under the name "withme". Design the default look
that every fork and the demo start from.

## What the product is

A physical NFC tag carries a URL. Tapping it opens the resolver: a stranger
sees one person's card (avatar, name, bio) and a single primary action
("Connect", or "Join this gathering" when the tag points at an event). Signed
in, the app is four tabs: Events (create a gathering, lists of what's
happening, yours, past), Connections (requests with Accept/Decline, your
connections, blocked), Merch (a pointer to an external store, hidden until a
store URL is set), Profile (photo, name, bio, links to other platforms, your
tags, account actions). There is a login (email + password, Google, phone
code) and a claim flow for a fresh tag. Web is a responsive app: a top-right
nav on wide screens, a bottom tab bar under 720px. Mobile is a React Native
app with the same screens. Both are plain, calm, and one-handed: taps happen
at the front desk, on a course, at night.

## Where it stands

The current system is attached (tokens.css, app.css, tokens.ts, ui.tsx). Its
bones are sound and stay: warm near-monochrome neutrals, exactly one vivid
accent reserved for the primary action, 24px cards, 14px controls, a 44px tap
target, Space Grotesk for display and Inter for body, light and dark modes,
and one animation (the card's settle on resolve). The values today:

  light  bg #f6f3ee  surface #fffdf9  ink #1c1916  ink-muted #6f6a62
         border rgba(28,25,22,.09)  border-input rgba(28,25,22,.46)
         accent #c2410c on accent-ink #ffffff
  dark   bg #161412  surface #211e1b  ink #f0ece5  ink-muted #a39c91
         border rgba(240,236,229,.1)  border-input rgba(240,236,229,.5)
         accent #ff6a3d on accent-ink #211008
  type   xs .75rem  sm .9375rem  md 1.0625rem  lg 1.25rem  title 2rem
  space  4 8 12 16 24 32 48     radii 24 card / 14 control / pill
  shadow one card shadow (web only)   motion settle 360ms

What it looks like in practice is grey boxes. Specifically:

1. No surface hierarchy. Page, card, list row, input and the default button
   are all a hairline-bordered rounded rectangle in one of two near-identical
   off-whites. Rows inside cards read as boxes inside boxes.
2. The default (non-accent) button is indistinguishable from an input.
   Secondary actions ("Sign in", "Save", "Create", "Try again") have no
   weight of their own.
3. One heading style. Card titles, page titles and section titles are the same
   display face at two sizes; there is no eyebrow, meta or caption style, and
   nothing that marks a date, a place, a count, a host.
4. Lists are dense: a 44px avatar, two lines of text, actions on the right,
   each row boxed. Events lists and member lists look like settings screens.
5. The avatar placeholder is one initial on the page background: flat and
   anonymous, and it is the first thing a stranger sees after a tap.
6. Empty, loading and error states are a single muted line of text.
7. There is no artwork. The wordmark is the display face set in bold. The
   mobile app icon is Expo's default blue chevron; the favicon likewise.
8. Two contrast bugs: the light input border is 2.97:1 against the surface
   (needs 3:1), and the comment in tokens.css cites 4.8:1 for the light
   accent pair when it is 5.18:1.

## The goal

A starter that looks considered the first time someone runs it: clear
hierarchy, a card that feels like an object, lists that breathe, buttons with
rank, states with a little character. Think "well-made default", the level of
a good open-source kit, not a flagship consumer brand. Forks will put their
own effort in on top; leave them room. Every choice must survive a rebrand:
a fork will swap the accent hue, warm the neutrals cooler or the reverse, and
change the display face, so nothing may depend on this particular orange or on
Space Grotesk's letterforms.

## Rules that do not move

- Implementation is tokens only, on two platforms. Everything you specify must
  be expressible as a CSS custom property plus a React Native StyleSheet
  value: solid colors, borders, radii, shadows, type, spacing. No gradients,
  no blur or backdrop filters, no background images, no CSS-only effects, no
  Tailwind.
- One accent, on the primary action of a screen only (Connect, Accept, Join,
  Claim). Never on links, tabs, chrome, borders, headings, icons or badges.
  Active navigation is ink.
- Both modes, WCAG AA: text 4.5:1 on its ground, control borders and focus
  rings 3:1, in light and dark. Report the ratios.
- 44px minimum tap target; the 52px primary button stays.
- Layout and routes stay. The resolver is a centered card; the shell is a 56px
  header plus a 60px bottom bar on phones and a top-right nav on desktop;
  forms are label-above-field. You may restyle every class and component and
  propose small structural changes (a page title outside the card, a divided
  list instead of boxed rows, a two-tier card) but flag each one as a
  structural change so it can be accepted or dropped separately.
- Fonts: at most two families, both on Google Fonts under the OFL so both
  clients can self-host them. Keeping Space Grotesk and Inter is fine; a swap
  is fine if you name the exact families and why.
- The eight color tokens keep their names (bg, surface, border, border-input,
  ink, ink-muted, accent, accent-ink). You may add up to four more (a raised
  surface, a focus ring, a disabled ink, a danger pair for destructive
  confirmations, for example), each with a value in both modes and a one-line
  usage rule. Fewer is better.
- Motion budget: the settle stays; you may add one press or focus transition.
  Nothing decorative.
- No emoji, no illustration, no photography, no mascots. No AI-default looks:
  blue-purple gradients, glassmorphism, left-border cards, pill-everything.
- The wordmark stays the lowercase word "withme". It is a placeholder a fork
  replaces, so its treatment must be a setting (face, weight, tracking, case)
  not a drawing.

## Process

Start with three thumbnails of the resolver card and the Events tab, light
mode, each a different take on hierarchy (for example: tonal layering with
almost no borders; crisp hairlines with stronger type contrast; a single
raised card on a flat page). I will pick one. Then build that one out fully.

## Deliverables

A. Foundations. A table of color tokens per mode, with usage notes and the
   contrast ratio of every pair the app relies on (accent-ink on accent, ink
   on surface, ink on bg, ink-muted on surface, ink-muted on bg, border-input
   on surface, plus any pair a new token introduces). A type scale by role
   (page title, card title, section title, body, meta/caption, field label,
   button) with family, size, line height, weight and tracking, for web rem
   values and mobile points. Spacing, radii, elevation (shadow values that
   also make sense as React Native shadow props) and the border rules.

B. Components, both modes, every state. Card. Button: default, accent, quiet,
   each hover/pressed/focus/disabled. Field: label, input, textarea, select;
   default, focus, error, disabled. Avatar at 76 and 44, with photo and with
   the placeholder. List row (a person; a gathering) and the list that holds
   it. Section title. In-page segments with a count badge. Link chip. Shell
   header, bottom tab bar (active and inactive), desktop nav. Empty state,
   loading state, error-with-retry, form error. The one destructive
   confirmation (delete account).

C. Screens at 390×844 in light and dark: the resolver card (profile tag and
   gathering tag), login, Events (create form plus the three lists), gathering
   detail with "Who's going", Connections on the Requests segment with a
   pending row, Profile (photo, form, links editor, My tags, Account). Plus the
   Events tab at 1280 wide to show the desktop shell.

D. Artwork as SVG: the wordmark treatment; a mark for the 1024×1024 app icon
   (flat, generic enough for any community, drawn on bg or accent), its Android
   adaptive foreground (mark alone, inside the central 66%), a favicon, and
   the avatar placeholder treatment.

E. The change list: one table of every difference from the current system,
   grouped by where it lands (tokens.css / tokens.ts value, app.css class,
   ui.tsx component), with old value, new value and one line of why. Mark the
   structural proposals and the new tokens. This table is what gets
   implemented; if something is only in a picture and not in this table, it
   will not ship.

Do not export React, Tailwind or HTML for the app, and do not implement
anything. Values, pictures and the change list are the output.
````

## Notes for the implementation that follows

- The two token files must stay value-identical; the `design-direction`
  skill's `contrast.ts` reads exactly eight color tokens from a fork's sheet,
  and `make-it-yours` steps 1 and 2 swap them. Any token added here means
  updating both skills and their sheet template in the same PR.
- `tokens.css` documents the 720px breakpoint and the shell heights as
  constants mirrored in `app.css` and `tokens.ts`; a change to either moves
  all three.
- The app icon work replaces Expo's placeholder set in `apps/mobile/assets/`
  and `apps/web/public` (iOS rejects an icon with alpha; the Android
  foreground keeps its alpha). The `design-direction` skill's step 3 has the
  render commands.
