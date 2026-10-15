# Merch: tags, accessories, and a store

The starter never touches commerce. What it has is a **pointer**: set a
store URL and the app grows a Merch tab with one card and one "Open
store" button, plus a "Get tags" link on the landing page. Where that URL
goes, what it sells, and how the tags get into people's hands is yours to
decide. This page is one complete, tested path: a Shopify store selling
NFC accessories made for your vertical, with the tags provisioned by the
starter's script and encoded by GoToTags.

Two things never change along the way: the tag's URL is
`https://<your-domain>/t/{UID}`, and the UID comes from
`bun run db:provision`, never from the vendor. [NFC tags](nfc-tags.md)
explains why; the `provision-tags` skill is the runbook this page builds
on.

## The pointer in the app

| Where | Setting | Effect |
| --- | --- | --- |
| Web, local | `VITE_STORE_URL` in `apps/web/.env` | The Merch tab and the landing page's "Get tags" link appear |
| Web, production | the same line in `apps/web/.env.production` | Baked in at build time; changing it is a rebuild and redeploy |
| Mobile, local | `EXPO_PUBLIC_STORE_URL` in `apps/mobile/.env` | The Merch tab appears (`href: null` hides it otherwise) |
| Mobile, production | `EXPO_PUBLIC_STORE_URL` in the EAS `production` environment (`eas env:create`), and the same line in `apps/mobile/.env.production` for go-live's local verification export | `eas update --environment production` ships it. With `--environment`, EAS reads its own environment and ignores local `.env` files, so a value only in `.env.production` never reaches the published update. |

Use the plain storefront URL, https only, with no tokens or tracking
parameters you would not print on a flyer: the value is public in both
bundles. The copy ("Tags and gear from the store.") lives in
`apps/web/src/routes/_app.merch.tsx` and `apps/mobile/app/(tabs)/merch.tsx`;
rewrite it in your voice and keep one card, one action. Leave
`VITE_STORE_URL: ''` in `apps/web/playwright.config.ts` alone: the smoke
test pins the tab absent on purpose. `make-it-yours` step 7 walks the
same settings.

A fork with a marketing site (`add-marketing-site`) sets the same URL as
`PUBLIC_STORE_URL` in `apps/site/.env.production`; the site's "Get tags"
button appears only when it is set.

If you do not want to run a store, leave the URL unset. The tab is
absent, the landing page has no "Get tags" link, and the app is complete
without it.

## What to sell

A tag is a sticker until it is something your people already carry. The
accessory is the product; the chip inside it is the feature.

| Vertical | Accessories that want a chip |
| --- | --- |
| Golf With Me | ball marker, bag tag, divot tool, a card for the pro shop counter |
| Run With Me | bib clip, shoe lace tag, water bottle sticker, a sign for the start line |
| Tailgate With Me | koozie, cooler magnet, a flag for the lot |
| Climb With Me | chalk bag patch, membership card, a plate by the mats |
| Walk With Me | collar tag, leash clip |
| Read With Me | bookmark, a card tucked in the club's copy |
| Trivia With Me | table tent, a coaster per team |

Start with one hero item (the thing every member carries) and one
venue item (the thing a gathering host points at a run, a round, a table).
Both carry the same kind of tag; only the housing differs.

## Sourcing tags: GoToTags

[GoToTags](https://gototags.com) is a US NFC supplier that sells blank
and custom-printed tags, encodes them to order, and ships a desktop app
for encoding your own. The pieces you need:

**Form factors.** Their store carries NTAG213 stickers in several sizes,
[PVC cards](https://store.gototags.com/nfc-pvc-card-ntag213/), [custom
magnets](https://store.gototags.com/custom-nfc-magnet/), wristbands,
keychains, and more. NTAG213 is the chip the starter targets; NTAG215
and NTAG216 work too (more memory, same behavior). Avoid NTAG210: its
48 bytes of user memory cannot hold the tag URL once a real domain is
in it. For a form factor they do not stock as a catalog item (a
ball marker, a collar tag), the custom-quote form is the path, or buy a
plain round sticker and apply it to an accessory you source elsewhere.
Custom items carry minimums and lead times (one magnet listing shows 500
units and three weeks), so plan the first batch around stock items.

**Printing.** Artwork goes on the tag through their template: download
the template for the product, add your art, upload it on the product
page. Printing is limited to designs without a full-bleed background on
some stock items; read the product page. Put your wordmark and a short
instruction ("Tap to connect") on the tag. Do **not** print the URL or
the UID: the tag is the link, and a printed UID is a UID someone can type.

**Encoding.** The [encoding service](https://gototags.com/store/encoding/service)
writes data to each tag before it ships. It has four modes; the one you
want is **Variable**, which writes different data to each tag, because
every tag's URL carries its own UID. You supply the list, they write it,
and you choose **locked**, which makes the data permanent. Minimum
encoding quantity is 50 units. The starter's `provision-tags` skill
produces exactly the list this needs (`provisioned-tags.csv`, one URL
per row).

**Encoding it yourself.** For small batches, or if you would rather the
encode list never leave your hands, the [GoToTags Desktop App](https://gototags.com/desktop-app/operations/types/variable-encode-nfc-tags)
with a USB NFC reader does the same thing on your desk: the Variable
Encode operation imports a CSV or JSON encoding file, you place tags on
the reader one at a time, and it writes and locks each one. Tags must be
unlocked to start, which stock tags are. Their
[encoding file](https://gototags.com/desktop-app/operations/encoding-file)
page and public examples give the column layout; map the starter's CSV
onto it.

### The trade-off in outsourced encoding

Until a tag is claimed, its UID is a bearer capability: whoever presents
it first owns the tag. The `provision-tags` skill keeps the encode list
outside the repo and out of chat for that reason. Sending it to an
encoding vendor is handing that list to a third party, which is normal
for custom merch and fine for a club, but know what you are trusting:

- Provision one batch per order, sized to the order. Never a standing
  pool of unclaimed UIDs.
- Send the list through the vendor's upload, not email.
- Provision against production only after `go-live` §1 exists, and only
  with the owner's explicit OK (the script refuses a non-local database
  without `SEED_ALLOW_REMOTE=1`).
- When the batch arrives, tap a handful: each should resolve as
  unclaimed and offer the claim flow. If a UID from the list ever turns
  up claimed by someone who never received a tag, the skill's §4 covers
  retiring a leaked list.

For the first fifty tags, encoding on your desk with a reader is cheaper
and simpler, and nothing leaves the room.

## The store: Shopify

Shopify is the fastest way to a storefront you do not have to build.
For a new store, **Basic** is the plan: a real storefront with
collections and your domain, enough for a hero item and a venue item and
room to grow. Confirm the current price on
[shopify.com/pricing](https://www.shopify.com/pricing). Shopify's
cheaper **Starter** plan (product links and a Buy Button, no full
storefront) is [not available to new stores](https://help.shopify.com/en/manual/intro-to-shopify/pricing-plans/plans-features/shopify-starter-plan);
if you already have one, it also works, since the app only needs a URL.

Either way, the app's Merch tab points at one URL: the store's home, a
"Tags" collection, or a single product page.

### Setting it up

1. **Create the store** at shopify.com, on a subdomain of your tag
   domain if you can (`shop.runwithme.example`). The store URL is
   public and goes in the app; the tag domain is forever, so keep them
   in the same family.
2. **Add the products.** One listing per accessory. In the description,
   say what a tap does ("Tap it with any phone to open your card") and
   that the first tap claims it. Photograph the accessory, not the chip.
3. **Set fulfillment to manual.** You, or GoToTags on your behalf, ship
   encoded tags; Shopify just takes the order. Set a realistic
   processing time that covers provisioning and encoding (a week for a
   self-encoded batch; the vendor's lead time otherwise).
4. **Point the app at it.** `VITE_STORE_URL` and `EXPO_PUBLIC_STORE_URL`,
   as above. Rebuild and redeploy web, `eas update` mobile.
5. **Run the first batch.** Provision the exact count of the first
   orders (`provision-tags` §2), encode (vendor or desk), tap-test a
   few, ship with a one-line card: "Tap with your phone. The first tap
   makes it yours."

### The order-to-tag loop

```
Shopify order (N items)
   │
   ▼
provision-tags: N rows, N URLs, one output dir per batch (outside the repo)
   │
   ▼
encode + lock: GoToTags Variable encoding, or the Desktop App on your desk
   │
   ▼
tap-test a sample → ship → first tap claims → the list is retired
```

Nothing in this loop touches the app's code or database beyond the
provisioning script, and nothing in the app knows a store exists beyond
the URL. That is deliberate: the starter's no-enumeration promise
depends on there being no "list unclaimed tags" surface anywhere, which
is why provisioning stays an operator script on the service-role key and
never becomes a store integration.

## What stays out

- **No cart, no products, no Shopify API in the app.** The roadmap
  records the decision: a merch tab that *is* commerce was rejected; the
  pointer was approved. Keep it a pointer.
- **No tag inventory in the app.** Unclaimed inventory is claimable
  inventory. Provision what you are about to encode.
- **No printed UIDs or URLs on the merch.** The tap is the only path to
  the card, and the random UID is the whole defense.

## Upstream

Vibe With Me sells printed, encoded, and locked tags and will take
fulfillment for forks that would rather not run this loop. The starter
does not depend on that in any way; the pointer goes wherever you say.

## Sources

- GoToTags encoding service (modes, minimums, locking): <https://gototags.com/store/encoding/service>
- GoToTags Desktop App, Variable Encode operation: <https://gototags.com/desktop-app/operations/types/variable-encode-nfc-tags>
- GoToTags encoding file format: <https://gototags.com/desktop-app/operations/encoding-file>
- GoToTags stock items: <https://store.gototags.com/nfc-pvc-card-ntag213/>, <https://store.gototags.com/custom-nfc-magnet/>
- Shopify pricing: <https://www.shopify.com/pricing>
