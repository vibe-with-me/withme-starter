# NFC tags

What the sticker actually holds, how it finds its way to a card, and the
decisions you make once and live with.

## The chip

The starter targets **NXP NTAG213**, the cheapest widely available NFC
chip (144 bytes of user memory, enough for one short URL). NTAG215 and
216 work identically with more memory. Any phone made in the last several
years reads them without an app: tapping opens the URL in the browser.

Form factors are up to you: stickers, PVC cards, keychain pucks, wristbands,
bag tags, collar tags. The chip is the same; the housing is marketing.

## What the tag stores

One URL, written as an NDEF URI record:

```
https://<your-domain>/t/{UID}
```

`{UID}` is 14 uppercase hex characters naming a row in `public.tags`.
That is the whole payload. The tag does not know whose it is, what it
points at, or whether it has been claimed. All of that is a row in the
database, which is why **the destination is mutable forever** without
touching the sticker: claim it, point it at your card, point it at a
gathering, turn it off, give it back to unclaimed by deleting your
account.

The web app's resolver (`/t/$uid`) does the lookup server-side on every
tap. The tag is a pointer that never changes.

## Random UIDs versus the chip's UID

Every NFC chip has a factory-burned 7-byte UID. The starter does **not**
use it by default. `bun run db:provision` generates a random UID (`04`
followed by 48 random bits) for each row and prints the URL to encode.

The reason is ownership. An unclaimed tag belongs to whoever presents
its UID first. If UIDs were the chip's own, anyone who could read a tag
in a shipping box, or guess a batch's sequential range, could claim tags
they do not hold. Random UIDs make the encode list the only thing that
knows which UIDs exist, so the list is treated as a set of bearer
capabilities until each tag is claimed: written outside the repo,
readable only by you, never in git, chat, or a shared drive.

Using the chip's own UID is supported for tags claimed on the spot (the
mobile scan screen falls back to it on a chip with no NDEF); `provision-tags`
§5 covers when that makes sense and what it costs.

## Share codes (QR)

Not everyone holds a tag, and not every phone reads NFC. The round QR
button raised out of the middle of the tab bar (bottom-right on wide web
screens) shows Your code: a QR code that opens your card, one tap from
every tab, on web and mobile. It is not a tab; it opens `/share`
(web `_app.share.tsx`, mobile `app/share.tsx`, the bar in
`components/TabBar.tsx` and `AppShell.tsx`). The mobile app scans someone
else's code (the scan button in the header, or the Scan a code button
under your own code). Web has no scanner: a phone's own
camera opens the code's URL in the browser, which is the web resolver.

A share code is a tag. It is a row in `public.tags` of kind `qr`, minted
and claimed to you by the database the first time you open Your code
(`my_share_code()`, in `supabase/migrations/20261017120100_share_codes.sql`),
and its URL is the same `/t/{UID}` a sticker carries. That choice is the
whole safety story: a scan goes through the unchanged `resolve_tag`, so it
shows exactly what a tap shows, a viewer you blocked gets the same
"inactive" answer, and the resolver's rate limits apply. There is no
second public endpoint to keep in step with the first.

What makes it different from a sticker:

- **Nobody provisions it.** The database draws 56 random bits per code;
  `db:provision` never makes one, and a share code is never `unclaimed`,
  so `claim_tag` can never take one.
- **It always opens your card.** A CHECK pins its destination to
  `{"type": "profile"}`, and owners cannot turn it off or re-point it
  (`tags_update_own` admits physical tags only). It is not in My tags.
- **It can be replaced.** A screenshot travels further than a sticker.
  Replace code (`replace_my_share_code()`, ten an hour) retires the old row
  and mints a new one. The retired row keeps its UID and nothing else: no
  owner, no destination, no scans. Every copy of the old code, printed or
  screenshotted, then opens "This tag is inactive", and nobody can claim
  it or turn it back on.
- **Deleting your account retires it too,** instead of returning it to
  unclaimed. A deleted person's code must never become claimable, or the
  claimant's card would appear behind every screenshot of it.
- **Its scans log as `qr`.** `tag_scans.scan_method` takes the values of
  the SDK's `ScanMethod` (`nfc`, `qr`, `direct`, `unknown`). The database
  records `qr` for every scan of a share code, whatever the client sends;
  for a sticker it keeps the client's hint (the mobile app sends `nfc`
  after an NFC read, `direct` for a typed UID), and `unknown` otherwise.

**The scanner opens only codes for your app's address.** Mobile's `app/scan-qr.tsx` runs
every code it sees through `tagUidFromUrl` (`@withme/contract`): the scheme
and host must equal `EXPO_PUBLIC_WEB_URL` exactly, the path must be `/t/`
plus 14 hex characters, and anything else is refused on screen and never
opened, not even in a browser. Set `EXPO_PUBLIC_WEB_URL` to the same
domain your tags encode; without it the share and scan screens say sharing
is not set up. The code itself is drawn by `lean-qr` on both clients (SVG,
so it renders in Workers SSR and in Hermes), dark on a light panel in both
color schemes, because camera apps read a light-on-dark code poorly.

**If a fork needs codes that expire.** A share code is a bearer URL, like
a sticker: whoever holds a copy opens the card until it is replaced. A
fork that needs screenshots to die on their own (ticketing, access) can
show a short-lived signed code instead, an HMAC over the user and a time
window, verified before resolving. That is the QR counterpart of NTAG 424
DNA below, and the same place in the resolver is where it would go. It
costs a server secret and breaks printed codes, which is why the starter
does not do it.

## Writing a tag in the app

Anyone signed in can turn a blank sticker into their own tag: Profile → My
tags → Add a tag, on mobile. **Write to a tag** on a row writes that row to
another sticker, which also retries a failed attempt. It needs a development
build, NFC turned on and `EXPO_PUBLIC_WEB_URL` set; otherwise the buttons don't
appear. Web has none: iPhones have no Web NFC.

One hold of the sticker does all of it (`writeSticker` in
`apps/mobile/lib/tag-writer.ts`): check what's on it, mint the row, write,
read back, lock.

| The sticker holds | The app |
| --- | --- |
| Nothing, and it is writable | Mints if needed, writes, verifies, locks |
| The URL for this row, unlocked | Locks it, which recovers an interrupted attempt |
| The URL for this row, locked | Reports it as already done |
| Anything else, locked or not | Refuses and changes nothing |
| A chip that cannot hold NDEF or fit the URL | Refuses |

**Minting opens no door.** `mint_my_tag()` inserts a row already claimed to the
caller, with 56 random bits, so `claim_tag` can't take it and only its owner's
My tags lists it. After that it is an ordinary tag, with one difference:
deleting the account retires it, as with a share code, instead of returning it
to unclaimed. Otherwise signing up, minting and deleting would make claimable
rows with no operator involved. The sticker then opens "This tag is inactive"
for good. Minting stops at 25 physical tags per person (`MAX_OWNED_TAGS`), counting claimed
stickers and not share codes. Owners cannot release a tag, so the cap is what
bounds the rows one account can make; `claim_tag` does not check it.

**Locking follows the address.** The app locks only when `EXPO_PUBLIC_WEB_URL`
is `https`. Over `http` it writes a test tag and leaves it unlocked, so local
rehearsals don't use up stickers. A `workers.dev` address gets a warning first,
because [the domain is forever](#the-domain-is-forever).

**What it costs.** One row can live on several stickers, and they can't be
turned off separately. And anyone with a blank sticker can skip your store, so
[merch](merch.md) sells the printed accessory, not the only way to get a tag.

**The native session** (`apps/mobile/lib/nfc.ts`). The app asks for `Ndef`, then
`NfcA`. On iOS that opens a tag session, which the `TAG` entitlement covers. On
Android, the lock call needs the `Ndef` session, and `NfcA` is there so a chip
with no NDEF connects and gets refused.

## Encoding in a batch

For tags you sell or hand out unclaimed:

1. Provision rows: `provision-tags` walks `bun run db:provision` locally
   first, then against production with the owner's explicit OK. The
   script writes `provisioned-tags.csv` and a printable `.html` sheet.
2. Write each URL to a tag with any NFC writer app. NXP TagWriter (iOS
   and Android) is the usual choice; write the URL as a URI record.
3. **Lock the tag to read-only.** Once locked, a tag can never be
   rewritten. This is the point: the sticker on someone's water bottle
   cannot be hijacked.
4. Tap it. It resolves as unclaimed and offers the claim flow. The first
   signed-in person to press "Claim tag" owns it.

Provision what you are about to encode. Unclaimed inventory is claimable
inventory, so batches of tens, not thousands held in reserve.

## The domain is forever

A locked tag carries its URL for the life of the sticker. Encode the web
origin you will own for as long as the tags exist: a custom domain you
control, never a `*.workers.dev` URL tied to a worker name. If you later
move hosting, keep the domain and point it at the new place; the tags do
not care.

If the fork will have a marketing site, decide its hostname now too. The
site and the app are separate Workers, so the tags should encode the
app's hostname (`app.example.com`) and leave the apex for the site.
`add-marketing-site` step 1 covers a fork whose tags already encode the
apex.

## What a tap records

`tag_scans` stores a user-agent string and a timestamp per tap. No GPS,
no IP address, no device fingerprint; the columns do not exist. The API
uses the caller's IP only as a rate-limit key and never stores it.

## Where to get tags

Any NFC supplier sells NTAG213 stickers by the hundred for a few cents
each. [Merch](merch.md) walks one complete path: accessories made for
your vertical, encoded and locked by GoToTags from the starter's own
encode list, sold through a Shopify store the app's Merch tab points at
(`VITE_STORE_URL` / `EXPO_PUBLIC_STORE_URL`). Printed, encoded, and
locked tags are also what Vibe With Me sells, at [vibewithme.co/shop](https://vibewithme.co/shop). The starter never touches
commerce itself.

## If you need tamper-proof taps

NTAG213 authenticates on nothing: the URL is the whole secret, and the
random UID is the whole defense. That is the right trade for a club: a
copied URL opens the same card a tap would, and a card is already public
to anyone holding the tag. If your vertical needs proof that a physical
tag was present (ticketing, access), look at NXP NTAG 424 DNA, whose
Secure Unique NFC Message mode signs each tap with a per-tag key and a
read counter so a copied URL stops working. The starter does not
implement this; the resolver's one-UID-per-request shape is where a fork
would verify the signature before resolving.
