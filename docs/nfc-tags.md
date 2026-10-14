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
mobile scan screen reads it); `provision-tags` §5 covers when that makes
sense and what it costs.

## Encoding

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
locked tags are also what Vibe With Me sells. The starter never touches
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
