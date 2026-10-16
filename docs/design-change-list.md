# Design change list: the Raised direction

The output of running `docs/design-brief.md` through Claude Design. The
canvas with the thumbnails, foundations, components, screens and artwork is
private to the owner: https://claude.ai/artifact/2FddZ5kzLTnLsPiJ4dgBRz
(boards A to E). This file is deliverable E, the table that gets
implemented. Anything that is only on the canvas and not here does not ship.

The direction in a sentence: a flat page, one object with weight on it, rank
by solidity. Cards and lists lose their border and gain one three-layer
shadow; the default button becomes solid ink; rows sit flat inside a list
card and are divided by hairlines; the page title moves outside the card; the
resolver card for a gathering gets a second tier filled with the page color.
The eight color tokens keep their names and **no color token is added**.

Markers:

- **[structural]**: a change to markup or component API, not only to a
  value. Each can be accepted or dropped on its own.
- **[new token]**: a new custom property or export. None of them is a color
  token, so `contrast.ts` and `make-it-yours` steps 1 and 2 are unaffected;
  the sheet template needs no new row.

Contrast was measured with `bun run .agents/skills/design-direction/contrast.ts`
on the new values (light, dark): accent-ink on accent 5.18, 6.46 · ink on
surface 17.35, 13.41 · ink on bg 15.27, 15.87 · ink-muted on surface 5.32,
5.81 · ink-muted on bg 4.68, 6.87 · border-input on surface 3.32, 4.43 ·
border-input composited over an input's bg fill, against the surface 3.24,
4.69 · surface on ink (the default button's label, the placeholder initial)
17.35, 13.41. Every text pair clears 4.5:1 and every control boundary clears
3:1 in both modes.

## 1. Token values: `apps/web/src/styles/tokens.css` and `apps/mobile/lib/tokens.ts`

The two files stay value-identical. Rows marked light or dark change one
mode; the other mode keeps its value.

| # | Token | Old | New | Why |
|---|---|---|---|---|
| 1 | `--color-bg` light / `light.bg` | `#f6f3ee` | `#f3efe8` | The card drops its border, so the page must sit a visible step below the surface (1.14:1) for the lift to read. |
| 2 | `--color-surface` light / `light.surface` | `#fffdf9` | `#fffefb` | The same step, taken from the other side. |
| 3 | `--color-border-input` light / `light.borderInput` | `rgba(28, 25, 22, 0.46)` | `rgba(28, 25, 22, 0.5)` | 2.96:1 on the old surface; 3.32:1 now. WCAG 1.4.11 needs 3. |
| 4 | The accent comment in tokens.css | `(4.8:1 with --color-accent-ink)` | `(5.18:1 with --color-accent-ink)` | The comment was wrong; the values are unchanged. |
| 5 | `--color-bg` dark / `dark.bg` | `#161412` | `#141210` | A flatter, deeper ground. Shadows barely read on dark, so the surface step carries the card. |
| 6 | `--color-surface` dark / `dark.surface` | `#211e1b` | `#26221e` | The step up (1.18:1). ink-muted stays 5.81:1 on it. |
| 7 | `--shadow-card` light | `0 1px 2px rgba(28,25,22,.04), 0 16px 40px -16px rgba(28,25,22,.16)` | `0 1px 2px rgba(28,25,22,.05), 0 8px 24px -12px rgba(28,25,22,.18), 0 28px 56px -32px rgba(28,25,22,.22)` | One object with weight. The only elevation in the system; lists and the form card share it. |
| 8 | `--shadow-card` dark | `0 1px 2px rgba(0,0,0,.4), 0 16px 40px -16px rgba(0,0,0,.6)` | `0 1px 2px rgba(0,0,0,.5), 0 8px 24px -12px rgba(0,0,0,.55), 0 28px 56px -32px rgba(0,0,0,.7)` | Same shape, denser, since dark grounds swallow it. |
| 9 | **[new token]** `--shadow-bar` | none | light `0 -8px 24px -12px rgba(28,25,22,.18)`; dark `none` | The bottom tab bar floats instead of ruling. In dark it keeps a 1px `--color-border` top instead (row 44). |
| 10 | **[new token]** `--motion-press-duration` | none | `120ms` | The one added transition the brief allows: button hover and press opacity. The settle is untouched. |
| 11 | **[new token]** `tokens.ts` `shadow` export | none | `{ card: { light: { shadowColor: '#1c1916', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 }, dark: { shadowColor: '#000000', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 } }, bar: { light: { shadowColor: '#1c1916', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -6 }, elevation: 8 }, dark: none } }` | Mobile has had no elevation at all. The mirror of rows 7 to 9 as React Native props; `useTokens()` or a sibling hook returns the mode's set. |
| 12 | `tokens.ts` `fonts` | four keys | add `bodyMedium: 'Inter_500Medium'`, `displayBold: 'SpaceGrotesk_700Bold'` | Quiet buttons and tab labels sit at 500; the wordmark at 700. Both cuts come from the packages already installed. |
| 13 | Unchanged | | `border` both modes, `ink`, `ink-muted`, `accent`, `accent-ink` both modes; `--text-*`; radii; spacing; `--tap-target`; `--card-max-width`; the shell constants and the 720px breakpoint; the settle duration and ease; the two font families. | The bones stay. |

## 2. Classes: `apps/web/src/styles/app.css`

| # | Class | Old | New | Why |
|---|---|---|---|---|
| 14 | `.wordmark` | `letter-spacing: -0.02em` | `letter-spacing: -0.03em` | Tighter, so the lowercase word reads as a mark. Face, weight 700 and case are the other three settings; a fork changes the word, not the rule. |
| 15 | **[structural]** `.page-title` (new) | none | `font-family: var(--font-display); font-size: var(--text-title); line-height: 1.2; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 0 var(--space-1); align-self: flex-start` | Events, Connections and Profile gain an `h1.page-title` at the top of their `.stack`, outside the card. Connections' current `h1.section-title` becomes it. |
| 16 | `.card` | `border: 1px solid var(--color-border); padding: var(--space-6)` | no border; `padding: var(--space-6) var(--space-5)`; `box-shadow: var(--shadow-card)` (new value) | The card is an object on the page, not an outline. 32 top and bottom, 24 sides. |
| 17 | `.shell .card h1` (new rule) | inherits `.card h1`: `--text-title` | `font-size: var(--text-lg); line-height: 1.3; letter-spacing: -0.01em` | Inside the shell a card title is a section ("Create a gathering", "Your profile"); the name on the resolver, login and claim stays 2rem. |
| 18 | **[structural]** `.card--hero`, `.card__tier`, `.card__tier--low` (new) | none | `.card--hero { padding: 0; overflow: hidden; gap: 0 }` · `.card__tier { width: 100%; padding: var(--space-6) 28px var(--space-5); display: flex; flex-direction: column; align-items: center; gap: 14px }` · `.card__tier--low { background: var(--color-bg); padding: 20px 28px var(--space-5); align-items: stretch; text-align: left }` | ProfileCard puts its children (the gathering line and the action) in a lower tier filled with the page color, only when it has children. The primary action sits on the tier. The plain profile tag is unchanged. |
| 19 | **[structural]** `.eyebrow` (new) | none | `font-size: var(--text-xs); line-height: 1.3; font-weight: 600; letter-spacing: 0.02em; color: var(--color-ink-muted)` | A role above a title: Hosting, Going, Host. Routes split the mark out of the joined " · " line into a span above the name. |
| 20 | `.card .hint`, `.row-body .sub`, `.empty`, `.form-error`, `.field-error` | line-height inherited, 1.5 | `line-height: 1.4` | Meta sits tighter than body. |
| 21 | `.avatar` | `background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-ink-muted); font-weight: 500` | `background: var(--color-ink); color: var(--color-surface); font-weight: 600`; no border on the placeholder; `img.avatar { border: 1px solid var(--color-border) }` | The placeholder is a solid object, the first thing a stranger sees. A photo keeps a hairline so a light photo has an edge. |
| 22 | `.row .avatar` | `font-size: var(--text-md)` | `font-size: 1.125rem` | 18px initial in the 44 disc (the mobile formula's 42%). |
| 23 | `.card[aria-busy] .avatar` (new rule) | none | `background: var(--color-bg); color: transparent` | The loading card's disc arrives hollow; the settle fills it. |
| 24 | `.btn` | `border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-ink)` | `border: 0; background: var(--color-ink); color: var(--color-surface); transition: opacity var(--motion-press-duration) ease`; `:hover { opacity: .92 }`; `:active { opacity: .85 }` | The default button has rank of its own and no longer looks like an input. Hover and press are the one added transition. |
| 25 | `.btn:disabled` | `opacity: 0.6` | `opacity: 0.45` | .6 of solid ink still looks pressable. |
| 26 | `.btn--connect` | `border-color: var(--color-accent)` | the `border-color` line goes; rest unchanged | No borders on buttons. |
| 27 | `.btn--quiet` | `padding: 0 var(--space-5)` (inherited) | `padding: 0 var(--space-3); border-radius: var(--radius-control)`; `:hover { color: var(--color-ink); background: var(--color-bg); opacity: 1 }`; `:active { opacity: .85 }` | A quiet button shows its hit area on hover with a bg fill instead of only changing color. |
| 28 | **[structural]** `.btn--inline` (new) | none | `width: auto; min-height: var(--tap-target); padding: 0 var(--space-4); font-size: 1rem` | Accept inside a request row at 44 tall, not 52 full width. Mobile already has the `inline` prop. |
| 29 | `.field` | `gap: var(--space-2)` | `gap: 6px` | Label and input read as one unit. |
| 30 | `.field input`, `.field textarea`, `.select` | `padding: var(--space-3) var(--space-4)` | `padding: 10px 14px`; `:focus-visible { border-color: var(--color-ink) }`; `[aria-invalid='true'] { border: 2px solid var(--color-ink); padding: 9px 13px }`; `:disabled { opacity: .45 }` | Focus keeps the global 2px ring and also inks the border; error is a 2px ink border, never red; disabled fades. |
| 31 | `.field-error` | `font-weight` inherited | `font-weight: 500` | A little weight in place of a color. |
| 32 | `.form-error` | `border: 1px solid var(--color-border)` | no border; `font-weight: 500` | A bg well inside the surface card, no outline. |
| 33 | `.section-title` | `margin: var(--space-4) 0 0` | `margin: var(--space-2) 0 0 var(--space-1); display: flex; align-items: baseline; gap: var(--space-2)` | The list card below carries its own space; the title indents to the card's inner edge. |
| 34 | **[structural]** `.section-title .count` (new) | none | `font-family: var(--font-body); font-size: var(--text-sm); font-weight: 400; color: var(--color-ink-muted); letter-spacing: 0` | Happening 3, Who's going 4. Routes add a `span.count` after the title text. |
| 35 | **[structural]** `.list` (new) | none | `width: 100%; background: var(--color-surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: var(--space-1) 20px; display: flex; flex-direction: column` | Routes wrap each list's rows (and its empty, loading and error states) in one `div.list`. The list is the object; rows are its contents. |
| 36 | `.row` | `background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-control); padding: var(--space-3) var(--space-4)` | none of those; `padding: var(--space-3) 0`; `.row + .row { border-top: 1px solid var(--color-border) }` | Rows are flat and divided, not boxed. The dividers are inset to the list's padding by construction. The 480px wrap rule stays. |
| 37 | `.row--stacked`, `.row-actions` | | unchanged | |
| 38 | `.empty` | `padding: var(--space-4)` | `padding: var(--space-5) var(--space-4)` | Inside the list card the empty line needs more air. |
| 39 | `.list-error` | `background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-control); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4)` | none of those; `padding: var(--space-3) 0` | Same reason as the row: it is a row of the list. |
| 40 | `.link` (chip) | `border: 1px solid var(--color-border); padding: 0 var(--space-3)` | `border: 1px solid transparent; padding: 0 14px`; `a.link:hover { border-color: var(--color-ink) }` unchanged | A chip is a bg fill; the hover border is the only outline it gets. |
| 41 | `.chooser .btn` | inherits `.btn` (now solid ink) | `background: var(--color-bg); color: var(--color-ink); min-height: var(--tap-target)` | The platform picker is a set of tonal chips, not ten solid buttons. |
| 42 | `.shell-main` | `padding: var(--space-5) 0 var(--space-7)` | `padding: var(--space-2) 0 var(--space-7)` | The page title now leads and brings its own space. |
| 43 | `.shell-nav` under 720px | `border-top: 1px solid var(--color-border)` | no border; `box-shadow: var(--shadow-bar)` | The bar floats. |
| 44 | `.shell-nav` under 720px, dark | | in the `prefers-color-scheme: dark` block: `border-top: 1px solid var(--color-border)` | Shadows vanish on a dark ground; the hairline returns there only. |
| 45 | `.shell-nav__item`, `.segments`, `.segments__item`, `.badge`, `.skip-link`, `:focus-visible`, `.avatar-field`, `.card--settle`, the reduced-motion rule | | unchanged | Active navigation is already ink; the badge is already ink on surface; the focus ring is already 2px ink at 2px offset. |

## 3. Components: `apps/mobile/components/ui.tsx`

| # | Component | Old | New | Why |
|---|---|---|---|---|
| 46 | `Card` | `borderWidth: 1`, `borderColor: t.border`, `padding: space.s6` | `borderWidth: 0`; `paddingVertical: space.s6, paddingHorizontal: space.s5`; `...shadow.card[mode]` | Row 16. |
| 47 | **[structural]** `Title` | one size, 30 | add `compact?: boolean` → `fontSize: 20, letterSpacing: -0.2, lineHeight: 26` | Row 17: screens inside the shell pass `compact`; the resolver and login keep 30. |
| 48 | **[structural]** `PageTitle` (new) | none | `Text` in `fonts.display`, 30, `letterSpacing: -0.6`, `marginLeft: space.s1`, `accessibilityRole="header"` | Row 15. |
| 49 | **[structural]** `Eyebrow` (new) | none | `Text` in `fonts.bodySemiBold`, 12, `letterSpacing: 0.3`, `lineHeight: 16`, color `inkMuted` | Row 19. |
| 50 | `Muted` | `fontSize: 16, lineHeight: 23` | `fontSize: 15, lineHeight: 21` | The meta role (row 20). Body text in screens stays 16. |
| 51 | `Button` default | `backgroundColor: t.surface, borderColor: t.borderInput`, label `t.ink` | `backgroundColor: t.ink, borderWidth: 0`, label `t.surface` | Row 24. |
| 52 | `Button` pressed and disabled | `opacity: 0.6` for both | pressed `0.85`, disabled `0.45` | Rows 24 and 25. |
| 53 | `Button` quiet | label `fonts.bodySemiBold` | label `fonts.bodyMedium`; pressed `backgroundColor: t.bg` | Row 27. |
| 54 | `Field` | `paddingVertical: space.s3, paddingHorizontal: space.s4` | `paddingVertical: 10, paddingHorizontal: 14` | Row 30. |
| 55 | **[structural]** `Field` focus, error, disabled | none | focused (internal `onFocus`/`onBlur` state) → `borderColor: t.ink`; new `error?: string` prop → `borderWidth: 2, borderColor: t.ink` plus the message in `fonts.bodyMedium` 15 under it; `editable={false}` → `opacity: 0.45` | Row 30. |
| 56 | `Avatar` fallback | `backgroundColor: t.bg, borderWidth: 1`, initial `t.inkMuted` in `fonts.displayMedium` | `backgroundColor: t.ink, borderWidth: 0`, initial `t.surface` in `fonts.display`; the photo keeps `borderWidth: 1, borderColor: t.border`; `fontSize: size * 0.42` unchanged | Row 21. |
| 57 | **[structural]** `List` (new) | none | `View` with `backgroundColor: t.surface, borderRadius: radius.card, paddingVertical: space.s1, paddingHorizontal: space.s5, ...shadow.card[mode]`; renders a 1px `t.border` divider between its children | Row 35. Screens wrap their rows and ladder states in it. |
| 58 | `PersonRow` | `borderWidth: 1, borderRadius: radius.control, backgroundColor: t.surface, paddingHorizontal: space.s4` | none of those; `paddingVertical: space.s3`; name `lineHeight: 22`; sub `fontSize: 15, lineHeight: 21` | Row 36. Gathering rows in the Events screen follow the same shape. |
| 59 | **[structural]** `SectionHeader` | `marginTop: space.s4` | `marginTop: space.s2, marginLeft: space.s1`; new `count?: number` rendered after the text in `fonts.body` 15 `inkMuted` | Rows 33 and 34. |
| 60 | `ErrorText` | `borderWidth: 1, borderColor: t.border` | `borderWidth: 0`; `fontFamily: fonts.bodyMedium` | Row 32. |
| 61 | `ListLadder` error, `EmptyState` | `ladderError` centered with `gap: space.s2`; empty is a `Muted` | `ladderError` as a row: `flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.s3`; `EmptyState` with `paddingVertical: space.s5` | Rows 38 and 39. |
| 62 | `SegmentedTabs` | | unchanged | Already ink, already a 2px rule, already an ink badge. |
| 63 | The tab bar (React Navigation options in the mobile layout, not ui.tsx) | `borderTopWidth` default | `borderTopWidth: 0, ...shadow.bar.light` in light; `borderTopWidth: 1, borderTopColor: t.border` in dark; active tint `t.ink`, inactive `t.inkMuted`, label `fonts.bodyMedium` 12 | Rows 43 and 44. |

## 4. Artwork files

| # | File | Old | New | Why |
|---|---|---|---|---|
| 64 | `apps/mobile/assets/icon.png` | Expo's blue chevron | render of `artwork/icon-on-bg.svg` at 1024, no alpha | The mark: a solid ink disc meeting an ink ring on bg. Generic enough for any community; a fork swaps the two fills and keeps the geometry. |
| 65 | `apps/mobile/assets/android-icon-foreground.png`, `-background.png`, `-monochrome.png` | Expo's set | foreground: render of `artwork/android-foreground.svg` (mark alone inside the central 66%, alpha kept); background: a flat `#f3efe8` square; monochrome: the foreground in one color | Android adaptive icon. |
| 66 | `apps/mobile/assets/favicon.png` and the web favicon set | Expo's set | `artwork/favicon.svg` plus 32, 180 and 512 PNG renders | The two shapes on a 32 grid with a thicker ring. |
| 67 | The wordmark | `.wordmark` set in the display face | unchanged as an asset: `artwork/wordmark.svg` is a reference render of the four settings (display, 700, -0.03em, lowercase) | Stays a setting a fork replaces (row 14). |

The SVG sources are the canvas's files under `artwork/` (icon-on-bg,
icon-on-accent, android-foreground, favicon, wordmark, avatar-placeholder).
The `design-direction` skill's step 3 has the render commands.

## Notes for the implementation PR

- Rows 9 to 12 add non-color tokens and exports. `contrast.ts` reads only
  the eight color tokens and `make-it-yours` swaps only those, so neither
  skill changes; the brand sheet template needs no new row. Say so in the PR
  so a reviewer does not go looking.
- The structural rows (15, 18, 19, 28, 34, 35, 47, 48, 49, 55, 57, 59)
  touch route and screen markup. Each stands alone; the value rows ship
  without them.
- Both token files move together (rows 1 to 13), and the mobile shadow
  export (row 11) is the only place the two files are not a line-for-line
  mirror.
