# Writing NFC tags in the app: design

## The problem

The mobile app can read a tag but not write one, so a blank sticker is useless
without a separate writer app and an operator's encode list. Anyone signed in
should be able to turn a blank sticker into their own tag from the app.

No recipe in `.agents/skills/` covers this. It adds a mint RPC, a screen and a
change to the in-app reader.

## The approach

Profile → My tags on mobile gains **Add a tag**, and each row gains **Write to
a tag**. Both open one new screen, which says the sticker is locked for good,
then asks the person to hold it to the phone. One hold does everything:

1. Read the sticker and decide what to do (the table below).
2. For **Add a tag** only, mint the row. This comes after the check, so walking
   away or holding up a bad sticker leaves no row behind.
3. Write `tagUrl(EXPO_PUBLIC_WEB_URL, uid)` as one NDEF URI record.
4. Read it back and compare.
5. Lock it.

| The sticker holds | The app |
| --- | --- |
| Nothing, and it is writable | Runs steps 2–5 |
| The URL for this row, unlocked | Locks it, which recovers an interrupted attempt |
| The URL for this row, locked | Reports it as already done |
| Anything else, locked or not | Refuses and changes nothing |
| A chip that cannot hold NDEF or fit the URL | Refuses, and names NTAG213/215/216 |

**Add a tag** cannot match a row in the second or third line because it has no
row yet, so an interrupted Add is retried from that tag's row in My tags.

### Minting

`public.mint_my_tag()` follows `my_share_code()`: `security definer`, signed-in
callers only, a profile required, 56 random bits, retried on a UID collision.
It inserts one row with `kind = 'nfc'`, `status = 'claimed'`, the caller as
owner, and `destination = {"type": "profile"}`.

- **Nothing new to steal.** The row is claimed from the moment it exists and
  retired when the account goes, so `claim_tag` can never take it, and nothing
  lists it except its owner's My tags.
  This becomes the second exception to `provision-tags`' rule that nothing
  creates tags. Like the first, it opens no door that rule guards.
- **A cap, not a rate limit.** The RPC refuses (`P0004`) once the caller owns
  25 `kind = 'nfc'` tags, counting claimed stickers too, under a per-user
  advisory lock. Owners cannot release tags, so the cap alone bounds how many
  rows an account can make, and an hourly ledger would add nothing. `claim_tag`
  is unchanged, so someone at the cap can still claim a tag they were given.

### Reading in the app

`readTag` starts from the URL on the tag:

- A URL that passes `tagUidFromUrl` gives the UID.
- A URL that fails it is refused on screen, as the QR scanner does. It never
  falls back to the chip UID, so a stranger's sticker cannot open a claim screen
  for its chip.
- No NDEF at all falls back to the chip's UID, which keeps `provision-tags` §5
  working.

### The domain

The app locks only when `EXPO_PUBLIC_WEB_URL` is `https`. Over `http` (a laptop
on the LAN) it writes without locking and says this is a test tag, so local
rehearsals do not waste stickers. A `workers.dev` address gets a warning before
the hold, because that address is then on the sticker for good. With no address
set, the buttons are hidden, as the share screen hides sharing.

### Accepted costs

- One row can live on several stickers, because **Write to a tag** can be run
  again. They all point to the same place, and one cannot be turned off alone.
- A sticker can be made without the store, so merch sells the printed accessory
  rather than the only way to get a tag.
- Deleting an account retires its minted tags, as share codes are, so the
  sticker opens an inactive tag for good. **Changed after approval:** this first
  returned them to `unclaimed`, but code review showed that signing up, minting
  and deleting would then make claimable rows with no operator involved. A
  `tags.minted` column marks them. Tombstones still accumulate, limited by
  sign-up friction, but nothing can claim one.

## Layers

| Layer | Change |
| --- | --- |
| Contract | `app.tags.mint`, output `{ uid }`, in `packages/contract/src/contract/app.ts` |
| Migration + RLS | New migration with `public.mint_my_tag()`. Execute revoked from `anon` and `public`. No new table or policy |
| API | `tagsMint` handler in `apps/api/src/routers/app.ts`. The API maps `P0004` as for other limits |
| Web | Not touched. iPhones have no Web NFC, and web's My tags lists the new rows already |
| Mobile | `lib/tag-writer.ts` (the decisions above, over a small NFC interface), `lib/nfc.ts` (write, lock, URL-first read), a new `app/write-tag.tsx`, buttons in `components/MyTags.tsx`, the refusal in `app/scan.tsx`, and the permission text in `app.json` |
| Docs | `docs/nfc-tags.md`, `provision-tags` (the map, §5 and "What must not move"), `apps/mobile/README.md` |

## Who sees what

- **The owner:** the tag in My tags. It re-points and turns off like any tag.
- **A stranger who taps it:** what any sticker shows, through the unchanged
  `resolve_tag`.
- **A blocked person:** the same inactive answer as any tag.
- **Anon:** cannot call the RPC.
- **Web, Expo Go, a phone without NFC, or NFC switched off:** no buttons. The
  empty state's existing wording about tapping an unclaimed tag stays.

## Errors

Each one leaves the screen with a way to try again.

- **Cancelled, or the sticker moved away:** nothing is reported as an error.
- **Network failure while minting:** nothing is written and no row exists.
- **Write or read-back failure:** the sticker stays unlocked. The row, if just
  minted, is in My tags to retry.
- **Lock failure:** says the sticker is written but not locked, and holding it
  again finishes the job.
- **At the cap:** says so plainly, and the screen does not ask for a hold.

## Tests

| Test | Proves |
| --- | --- |
| `packages/db/test/mint-tag.test.ts` | A row of the right shape, with a positive control. Anon and a caller with no profile are refused. The 25th tag succeeds and the 26th fails. A claimed sticker counts. `claim_tag` cannot take a minted row. Another user cannot update it. A blocked viewer gets the inactive answer |
| `packages/db/test/grants.test.ts` | The new RPC is in the execute-grant check |
| `packages/contract/test/schemas.test.ts` | The output shape |
| `apps/api/test/app.test.ts` | The handler returns the UID and maps the cap error |
| `apps/mobile/lib/tag-writer.test.ts` | Every row of the sticker table, the order of steps (no mint before the check, no lock before the read-back passes), `http` never locks, and each failure in Errors |
| `apps/mobile/lib/nfc` tests | The URL-first read: a matching URL, a foreign URL refused, no NDEF falling back to the chip UID |

## What cannot be tested here

NFC does not run in the simulator or under Maestro, and Expo Go has no NFC
module. The screen and the real radio calls can only be seen on a development
build on a physical phone.

**Feature-dev step 6 therefore needs the owner:** a development build, blank
NTAG213s, an iPhone and ideally an Android phone.

Reading the library's native code settled which NFC session to use, and the
device runs must confirm it. The app asks for `Ndef`, then `NfcA`, on both
platforms:

- **iOS** opens a tag session either way, which the `TAG`-only entitlement
  (`includeNdefEntitlement: false`) should cover, and accepts any chip for
  `Ndef`, so a chip it can't use is refused. If `TAG` turns out not to be enough,
  the entitlement changes, and that must be checked against App Store submission.
- **Android** gets the `Ndef` session its lock call needs. `NfcA` connects a chip
  with no NDEF, so it is refused instead of the hold doing nothing.
- **Reading goes through `getNdefMessage`, never `getTag`,** for both the writer
  and the scanner. `getTag` reports a failed iOS read as an empty tag, which would
  overwrite and lock a sticker with content. Blank is recognized only from iOS's
  zero-length error or Android's empty reply. If the zero-length error isn't what
  an iOS blank chip returns, blank stickers are refused as "didn't catch it", and
  nothing is harmed.

The simulator can only confirm that the buttons stay hidden without NFC.
