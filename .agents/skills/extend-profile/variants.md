# extend-profile — variants

The steps in `SKILL.md` are written for the worked example: one required
card-tier field (`affiliation`) and one optional connections-tier field
(`contact_handle`). Read each variant below that fits your fork before
§1; each one says which lines of which step change. More than one can
apply (a card-only fork with a typed field and nothing required).

## Card only

(golf-with-me: handicap and home club.) Keep both card builders and skip
every `details` line:

- §1: no `ProfileDetailsSchema`, no `details` on `UpdateProfileInputSchema`
  or `ConnectionSchema`, and `contract/app.ts` untouched (its
  `getProfile` / `updateProfile` outputs change only to carry `details`).
  "A connection always carries the details key" drops, and so do the
  `contact_handle` lines in the other tests. The checkpoint counts only
  the tests you appended.
- §2: only the `card tier` describe (one CHECK test per card field). The
  red checkpoint is that describe's tests, each on `PGRST204`. No change
  to `enumeration.test.ts`, `cascade.test.ts`, or `account.test.ts` (each
  addition there is connections tier). §3's green checkpoint: those same
  tests pass.
- §3: no `profile_details` table, trigger, grants, or policies, and no
  `v_details` block in `accept_connect_request`.
- §4: `CARD_COLUMNS`, `ProfileCard`, `upsertOwnProfile`, and `listBlocks`'
  stand-in card only. No `DETAILS_COLUMNS`, `getOwnDetails`,
  `upsertOwnDetails`, or `listConnections` change, and the API router is
  unchanged: `updateProfile` already passes its input whole to
  `upsertOwnProfile`.
- §6, §7: no Contact field and no `detail` line; `PersonRow` (web and
  mobile) and both Connections screens unchanged. The two `cardLine`
  files still change, so every list of people shows the card tier. The
  seed updates the card fields only, and the simulator's "connected
  accounts see each other's contact" check does not apply.
- §8: the API e2e asserts the card tier on every card surface (update and
  get, resolve, the pending request, accept, a connection) in place of the
  `details` asserts; the `handshake.spec.ts` block checks the card line on
  Bob's view of Ada's tag, and on her row under `/connections`, in place
  of Contact.

## Connections only

Still redefine `accept_connect_request` in §3 (for `details`); skip
`resolve_tag`, the card-tier column, and every `affiliation` line.

## No required vertical field

When every new field is optional, `REQUIRED_PROFILE_FIELDS =
['display_name']`, and:

- §1: "completion needs every required field" becomes a name alone
  completes and a blank one does not; "a typed required value counts …
  even 0" drops (keep it only when a typed field is required).
- §6, §7: the claim pages stay as they are (the name alone, "First, your
  name", the name error copy), and Save's `disabled` stays
  `busy || !displayName.trim()` on both Profile forms.
- §7: the seeded users are already complete. The seed edit is for the
  card only; the "would send Lin to 'Finish your profile'" check does
  not apply.
- §8: no Playwright fill changes; only the new `handshake.spec.ts` block.
- Install both gates anyway. With only the name required, the mobile gate
  is a has-a-profile gate, and that still changes mobile: a signed-in
  account with no profile is now sent to Profile when the tabs mount
  (before, only Connect and Join pushed `/profile`). That is intended: it
  matches web's `ShellRoute`.

## A field with a format rule

(A pace like `5:30/km`, a postcode.) Swap the example's length rule for a
pattern at every layer; nothing else moves.

- Contract (§1): its own schema in place of `CardLineSchema`, used
  wherever the example uses that one — for a pace, a
  `PaceSchema = z.string().regex(/^[0-9]{1,2}:[0-5][0-9]\/(km|mi)$/)`.
- SQL (§3): a format CHECK instead of the length CHECK, named for it
  (`profiles_pace_format check (pace is null or pace ~ '^…$')`), whose
  pattern matches the zod regex's character classes and anchors. A
  JavaScript-only escape drops out in SQL: the `\/` inside the regex
  literal is a plain `/` in the SQL string
  (`'^[0-9]{1,2}:[0-5][0-9]/(km|mi)$'`). Spell the classes out (`[0-9]`,
  not `\d`; no `\w` or `\b`): Postgres's regex dialect and JavaScript's
  differ on shorthand, and both rules must reject the same strings.
- The format CHECK replaces the length CHECK only for a pattern that
  bounds the length itself: anchored at both ends, every quantifier
  bounded (the pace's `[0-9]{1,2}` is; a `+` or `*` is not). With an
  unbounded quantifier, keep the length CHECK and its oversized test
  beside the format CHECK.
- It drops the plain-text CHECK too: a pattern spelled out in explicit
  classes already refuses control, bidi and invisible characters, and
  with two CHECKs failing on one value the error names either.
  `private.is_plain_text` is for free text; a typed field (a number, an
  enum) needs neither.
- Tests: each length test becomes a format test. §1's "rejects empty and
  oversized" checks `''` and malformed values (`'5:60/km'`, `'123:30/km'`,
  `'5:30/mile'`) plus valid values that must parse (`'5:30/km'`,
  `'12:05/mi'`). §2's card-tier length loop becomes a format loop over
  `''`, a malformed value and one longer than the pattern allows,
  expecting the format CHECK's name, and its plain-text loop drops.
  Wherever the example writes a value (`'Riverside GC'`, `'E2E Club'`),
  use a valid one.
- Forms (§6, §7): `maxLength` of the longest valid value, and a
  `placeholder` that shows the format (`5:30/km or 8:45/mi`). On mobile,
  a format that needs an exact case (like `km`) also wants
  `autoCapitalize="none"` on its `Field` in both the profile and claim
  screens, or the keyboard capitalizes the first letter (the starter's
  `Field` already turns `autoCorrect` off). A malformed value reaches the
  API and comes back as the form's generic save error ("Could not save.
  Check the fields and try again."); field-level messages are the fork's
  to add.

## A typed field

(A numeric handicap, an enum.) The forms post text, so turning text into
the value is code. The regex mirroring above does not apply; this does.

- Contract (§1): next to the field's schema (for a handicap,
  `HandicapSchema = z.number().min(-10).max(54).multipleOf(0.1)`), two
  pure functions both clients import: a parser from text
  (`parseHandicap(text: string): number | null | undefined`: blank is
  `null` and clears the field, a valid entry is the value, `undefined` is
  refused; it range-checks with the schema itself) and a formatter back to
  text (`formatHandicap(value: number): string`). Their contract tests
  include a round-trip over the whole stored range (every step: format,
  parse, schema), which is also the evidence that `multipleOf(0.1)` is
  float-safe.
- SQL (§3): `numeric(p,s)` rounds on insert before the CHECK runs (8.45 is
  stored as 8.5), so the CHECK enforces the range
  (`profiles_handicap_range check (handicap is null or handicap between
  -10.0 and 54.0)`) and precision is zod's alone. §2's test is "is
  range-checked": one past each end refused, both ends accepted. The card
  builders' `jsonb_build_object` carries it as a JSON number, so card
  types are `number | null`.
- Forms (§6, §7): keep the field as text, seeded with the formatter. Save
  parses first; on `undefined` it shows a field message and sends
  nothing. Never put an `undefined` key into the patch: the input schema's
  `.optional()` drops it silently, the API saves everything else, and the
  form says "Saved." over a value it threw away. After a save, re-print
  the field with the formatter.
- A signed value on mobile: `keyboardType="decimal-pad"` has no `+` or
  `-` key, so use `keyboardType="numbers-and-punctuation"` (on web, skip
  `inputMode="decimal"` for the same reason).
- `isProfileComplete` already counts a set non-string value, so a
  required handicap of 0 completes.

How golf-with-me stores and prints a plus handicap is in
`docs/run-with-me.md` → Variations.
