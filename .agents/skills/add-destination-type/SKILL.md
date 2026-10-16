---
name: add-destination-type
description: Use when a withme-starter fork needs tags to point at something new — growing the destination union with a member like link, menu, or vcard, end to end from contract to mobile.
---

# add-destination-type — grow the destination union

A tag's `destination` is the spine of this codebase: one typed union,
enforced in four places that must move together (zod contract, DB CHECK
constraint, SDK client types, resolver rendering). This skill walks the
full ripple. The worked example throughout is `{ type: 'link', url }` —
a tag that opens an https URL, after an interstitial card that shows its
host. The contract, CHECK, RPC, test and e2e steps were built and
verified against the real stack, then removed: they ship here, not in the
starter. The interstitial cards in §7 and §8 replaced an earlier silent
redirect after a security review and have not been run end to end yet,
so the §9 runtime check is the first proof of them in your fork.

**REQUIRED BACKGROUND:** read `docs/the-slice.md` first. This skill is
that slice applied to one concern; the safety discipline and the
verification gate live there and are not repeated.

Before you start, decide the shape: the discriminator value (`'link'`),
the payload fields (`url`), and the validation rules. Every rule must be
expressible BOTH in zod and in a SQL CHECK — owners can write
`tags.destination` directly through PostgREST, so zod alone is not a
boundary. Have the local stack running (`bun run db:start`).

## 1. Contract

`packages/contract/src/schemas/destination.ts` — add the schema and the
union member:

```ts
/** Tag -> URL redirect. https only; the DB CHECK constraint mirrors this. */
export const LinkDestinationSchema = z.object({
  type: z.literal('link'),
  url: z.url({ protocol: /^https$/ }).max(2048),
});

export const DestinationSchema = z.discriminatedUnion('type', [
  ProfileDestinationSchema,
  GatheringDestinationSchema,
  LinkDestinationSchema,
]);
```

Also update the file's header comment: it says the starter ships
`profile` and `gathering` and lists `link` among the future types. Name
your type as shipped and drop it from the future list.

Then `packages/contract/test/schemas.test.ts`. **Trap:** the existing
"rejects unknown destination types" test uses `{ type: 'link', url: … }`
as its unknown-type specimen — once you add your type, make sure that
test's specimen is still an unknown type (swap in an invented one like
`{ type: 'teleport' }`). Add: an accept case for your type, a reject
case per validation rule (for link: non-https url, `javascript:` url,
missing url).

**Checkpoint:** `cd packages/contract && bun test` — all pass.

## 2. Migration — the CHECK constraint

New file `supabase/migrations/<UTC-timestamp>_add_link_destination.sql`.
The constraint currently admits `{"type": "profile"}` by exact jsonb
equality and the core `gathering` branch (latest definition in
`20261008120000_add_gatherings.sql`); your type adds a branch. Dropping
and re-adding replaces the whole constraint, so copy every existing branch
forward or you silently reject them. The verified link constraint:

```sql
alter table public.tags drop constraint tags_destination_shape;
alter table public.tags add constraint tags_destination_shape check (
  destination is null
  or destination = '{"type": "profile"}'::jsonb
  or coalesce(
    jsonb_typeof(destination) = 'object'
    and destination->>'type' = 'gathering'
    and destination->>'gathering_id'
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and destination - 'type' - 'gathering_id' = '{}'::jsonb,
    false
  )
  or coalesce(
    jsonb_typeof(destination) = 'object'
    and destination->>'type' = 'link'
    and jsonb_typeof(destination->'url') = 'string'
    and destination->>'url' ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?([/?#][^[:space:]]*)?$'
    and char_length(destination->>'url') <= 2048
    and destination - 'type' - 'url' = '{}'::jsonb,
    false
  )
);
```

The URL pattern demands a host (letters, digits, dots and hyphens, an
optional port) before any path, query or fragment. `https://?x` or
`https://user@evil.example` never reaches a resolver that calls
`new URL()` on it. An internationalized domain is stored in its punycode
form (`xn--…`), which is also how §7 displays it.

Two idioms here are load-bearing:

- **The NULL trap.** Without the `coalesce(…, false)`, a payload with a
  *missing* key (e.g. `{"type": "link"}` with no url) makes `->` return
  SQL NULL, the whole AND chain go NULL — and a NULL CHECK result PASSES
  in Postgres. The naive constraint accepts exactly the malformed rows
  you most expect it to reject. This failed for real before the coalesce
  was added; do not skip it.
- **No extra keys:** `destination - '<key>' - '<key>' = '{}'::jsonb`
  subtracts the allowed keys and demands nothing is left — the jsonb
  equivalent of zod's strict object.

**Optional: a host allowlist.** The CHECK above admits any https host,
so any user who claims a tag can point it at any site. If the fork's links
should only ever reach known sites (a venue's own menu host, say), narrow
the link branch's URL test to those hosts, anchored so that
`https://menu.example.com.evil.example` and userinfo tricks fail:

```sql
    and destination->>'url'
        ~ '^https://(menu\.example\.com|tickets\.example\.org)(/[^[:space:]]*)?$'
```

Mirror it in zod, or the API accepts what the database refuses. Translate
the pattern rather than copying it: JavaScript has no POSIX classes, so
`[^[:space:]]` becomes `\S`:

```ts
url: z
  .url({ protocol: /^https$/ })
  .max(2048)
  .regex(/^https:\/\/(menu\.example\.com|tickets\.example\.org)(\/\S*)?$/),
```

Add the same accept and reject cases to the contract test and the §4 RLS
test (an allowed host with a path, `https://menu.example.com.evil.example`,
`https://evil.example/menu.example.com`), so the two validators are proven
to agree. An allowlist is a product choice,
not a requirement: the interstitial in §7 and §8 is the safety measure
either way.

**Checkpoint:** `bun run db:reset` ends with `Finished supabase db
reset` (some CLI versions add ` on branch …`), then `bun run db:seed`. Run `bun run db:types` and check
`git diff packages/db/src/types/supabase.ts` is empty — a
constraint-only migration produces no type drift (if you also added
columns, commit the regenerated types instead).

## 3. RPCs: usually no change

`resolve_tag` returns `v_tag.destination` verbatim (every type but
`gathering`) and `claim_tag` accepts any `p_destination` the CHECK
admits — for a pure payload type like link, **no SQL function changes**.
Touch `resolve_tag` only if your type changes *what resolve must return*
(the core `gathering` type is the worked example — see the `resolve_tag`
section of `supabase/migrations/20261008120000_add_gatherings.sql`). If
you do, remember its contract: blocked viewers get `'disabled'`, unknown
UIDs get `'unclaimed'`, and it never throws. Redefine it from its
**newest** definition,
`grep -lE 'create (or replace )?function public\.resolve_tag' supabase/migrations/*.sql | sort | tail -1`,
copied whole: the gatherings migration's body is for reading only. It and
the older bodies emit `avatar_url`, a column the avatars migration
dropped, and miss any card field a later migration added (extend-profile's
`affiliation`, say).

## 4. RLS tests

`packages/db/test/tags.test.ts` — two additions, modeled on the verified
ones:

```ts
it('a tag can be claimed as a link and resolves to the link destination', async () => {
  const alice = await createTestUser('Alice');
  const uid = await provisionTag();
  const { error } = await alice.client.rpc('claim_tag', {
    p_uid: uid,
    p_destination: { type: 'link', url: 'https://example.com/menu' },
  });
  expect(error).toBeNull();

  const { data } = await anonClient().rpc('resolve_tag', { p_uid: uid });
  const resolved = data as { status: string; destination: { type: string; url: string } };
  expect(resolved.status).toBe('claimed');
  expect(resolved.destination).toEqual({ type: 'link', url: 'https://example.com/menu' });
});

it('malformed link destinations are rejected at the DB boundary', async () => {
  const alice = await createTestUser('Alice');
  const uid = await provisionTag();
  await alice.client.rpc('claim_tag', { p_uid: uid });

  for (const destination of [
    { type: 'link' }, // missing url — the NULL-check trap; needs the coalesce
    { url: 'https://example.com' }, // missing type — same trap
    { type: 'link', url: 'http://example.com' }, // not https
    { type: 'link', url: 'https://example.com', extra: 'x' }, // extra key
    { type: 'link', url: 'https://bad url' }, // whitespace
    { type: 'link', url: 'https://?x' }, // no host: new URL() would throw in the resolver
  ]) {
    const { error } = await alice.client.from('tags').update({ destination }).eq('uid', uid);
    expect(error?.message).toContain('tags_destination_shape');
  }
});
```

Keep both null-trap cases — they are the regression test for the
coalesce.

**Checkpoint:** `cd packages/db && bun test` — all pass.

## 5. API passthrough

`apps/api/src/routers/public.ts`: the claim handler already casts to the
contract's `Destination` union — nothing to do unless you changed
`resolve_tag`'s shape. If you did, the change belongs in
`ResolveOutputSchema` (`packages/contract/src/contract/public.ts` — the
gathering summary is the example); the resolve handler casts to it and
stays as it is.

Nothing else in the API names destination types — resolve and claim
flow through the contract schemas.

## 6. SDK type parity

`packages/nfc-sdk/src/client.ts` declares `Destination` *structurally*
(the published .d.ts must be self-contained, so it cannot import the
contract). Add your member:

```ts
export type Destination =
  | { type: 'profile' }
  | { type: 'gathering'; gathering_id: string }
  | { type: 'link'; url: string };
```

The compile-time parity test
(`packages/nfc-sdk/test/client-types.test.ts`) compares this against
the contract with exact type equality — if you skip this step, the
package's typecheck fails, by design.

**Checkpoint:** `cd packages/nfc-sdk && bun run typecheck` — clean.
(It must be the typecheck: the parity assertions are type-level, so the
vitest run erases them and passes even when the types have drifted.)

## 7. Web resolver

`apps/web/src/routes/t.$uid.tsx` renders the profile card for every
claimed tag except a gathering tag, whose branch in the component is the
worked example of a card-like type. Branch on your type in the component.

**A link tag is never a silent redirect.** Anyone can claim a tag and
point it at any https URL, including a phishing page. A redirect straight
from `/t/<uid>` would land the tapper there from the fork's own domain,
so the fork's name vouches for a page it has never seen. The https-only
CHECK rules out `javascript:` and `data:`; it says nothing about where
the link goes. So the link branch renders an interstitial card: whose tag
it is, the destination's hostname in plain text, and a button the tapper
presses to leave. Show the hostname, not the full URL: it is where the
tap will actually land, while a path or query can be dressed up to look
like anything. It is information, not proof: a lookalike domain
(`paypa1.example`) or a deceptive subdomain (`paypal.example.evil.example`)
still reads as plausible at a glance, so the card says where the link goes
and leaves the judgement to the tapper:

```tsx
// in ResolvePage, next to the gathering branch, before the profile-card return:
if (result.destination.type === 'link') {
  const url = new URL(result.destination.url);
  return (
    <main className="page">
      <ProfileCard profile={result.profile} settle>
        {/* The host, as the browser will show it: where the tap really lands.
            The tapper decides with it in view. */}
        <p className="hint">This tag opens a link on</p>
        <p className="bio">
          <strong>{url.hostname}</strong>
        </p>
        <a className="btn btn--connect" href={url.href} rel="noopener noreferrer nofollow">
          Open link
        </a>
      </ProfileCard>
      <WordmarkFooter />
    </main>
  );
}
```

`new URL()` cannot throw here: the CHECK (§2) only admits an https URL
with a host, and the contract's `z.url()` parses each one the same way.
`url.hostname` is punycode for an internationalized domain (`xn--…`),
which is what you want: a homoglyph host shows as punycode instead of
passing for the real name. Do not add
`target="_blank"`; leaving the page is the point.

Scan logging already happened in the loader's `Promise.all`, so link taps
are logged like any tap. The loader itself needs no link branch.

## 8. Mobile resolver

`apps/mobile/app/t/[uid].tsx` gets the same interstitial, in the render,
next to the gathering branch. No `Linking.openURL` in the resolve effect:
the physical tap is a gesture toward the tag, not consent to open
whatever the tag's owner chose, and the app opening a phishing page by
itself is the same silent redirect as on the web. Import `Linking` from
react-native and compose the card from `components/ui` primitives:

```tsx
// in the component, next to the gathering branch, before the profile-card return:
if (result.destination.type === 'link') {
  const url = new URL(result.destination.url);
  return (
    <View style={[styles.page, { backgroundColor: t.bg }]}>
      <Card settle>
        <Title>{result.profile.display_name}</Title>
        <Muted>This tag opens a link on</Muted>
        {/* The host, not the whole URL: where the tap really lands. */}
        <Title>{url.hostname}</Title>
        <Button
          kind="connect"
          label="Open link"
          onPress={() => Linking.openURL(url.href).catch(() => undefined)}
        />
      </Card>
    </View>
  );
}
```

React Native's `URL` (Hermes) parses an https URL into `hostname` like
the browser does. Check the card in the fork's simulator pass: the tap
shows the hostname and opens nothing until "Open link" is pressed; only
the typecheck covers it here.

## 9. E2E + the gate

Extend `apps/api/e2e/handshake.e2e.ts` with a round-trip through the
real stack (after the double-claim check):

```ts
// 5b. a link destination round-trips: claim through the SDK, resolve anonymously
const linkUid = await provisionTag();
await authed.claim(linkUid, { type: 'link', url: 'https://example.com/menu' });
const linkResolved = await anon.resolve(linkUid);
assert(
  linkResolved.status === 'claimed' &&
    linkResolved.destination.type === 'link' &&
    linkResolved.destination.url === 'https://example.com/menu',
  'link destination round-trips through claim and resolve',
);
```

**Checkpoint:** with the stack up: `cd apps/api && bun run dev`
(separate shell; it listens on `localhost:8786`), then `bun run e2e` — ends `handshake e2e: all checks
passed`, including your new assertion. For a redirect-type, also prove
the web behavior at runtime: claim a tag with your destination, boot the
web app (`cd apps/web && bun run dev`), and curl it.

The claim UI only claims profiles, so claim through a script. Provision
two local tags per provision-tags §1 (its `REPO`/`OUT` subshell: output
outside the repo, `umask 077`, `--count 2`). `bun run db:provision` only
resolves from the repo root, so from the output directory call the script
file directly, as §1 does. Then sign in as a seeded user with the db
package's local client and claim the first tag as a link, the second as a
profile (the SDK's `authed.claim(uid, { type: 'link', url })`, as in the
e2e above, works too). Set `DEMO_EMAIL` and `DEMO_PASSWORD` to your seed
identity: a seeded user's email and the seed's `DEMO_PASSWORD`, both in
`supabase/seed/index.ts` (`db:seed` prints them; a rebranded fork's are
under its own name), in the shell before this block. The script reads
them from the environment, so no password is written into a file:

```sh
cat > "$OUT/claim.ts" <<'EOF'
const { anonClient } = await import(`${process.env.REPO}/packages/db/src/test-utils/index.ts`);
const csv = await Bun.file(`${import.meta.dir}/provisioned-tags.csv`).text();
const [link, profile] = csv.trim().split('\n').slice(1).map((l) => l.split(',')[0]);
const { DEMO_EMAIL: email, DEMO_PASSWORD: password } = process.env;
if (!email || !password) throw new Error('set DEMO_EMAIL and DEMO_PASSWORD to your seed identity');
const db = anonClient();
const { error: e } = await db.auth.signInWithPassword({ email, password });
if (e) throw e;
const a = await db.rpc('claim_tag', { p_uid: link, p_destination: { type: 'link', url: 'https://example.com/menu' } });
const b = await db.rpc('claim_tag', { p_uid: profile });
console.log('link claim:', a.error?.message ?? 'ok', '| profile claim:', b.error?.message ?? 'ok');
EOF
REPO="$REPO" DEMO_EMAIL="$DEMO_EMAIL" DEMO_PASSWORD="$DEMO_PASSWORD" bun run "$OUT/claim.ts"
LINK_UID=$(sed -n 2p "$OUT/provisioned-tags.csv" | cut -d, -f1)
PROFILE_UID=$(sed -n 3p "$OUT/provisioned-tags.csv" | cut -d, -f1)
for u in "$LINK_UID" "$PROFILE_UID"; do
  curl -s -m 60 -o /dev/null -w 'status=%{http_code} location=%{redirect_url}\n' \
    "http://localhost:3000/t/$u"
done
```

Expect `status=200` with an empty `location` for both tags: the link
tag renders the §7 interstitial, never a redirect. A 3xx for the link tag
means a redirect crept back in. `curl -s "http://localhost:3000/t/$LINK_UID" | grep -o example.com`
shows the hostname is on the card. A normal
profile tag still returns 200 (if it hangs under `vite dev`, restart the
web dev server as provision-tags §1 describes; it is a known `vite dev`
SSR hang, not your change). Link taps are
logged as scans like any tap. The variables keep UIDs out of shared
output; never print them. Afterwards `rm -rf "$OUT"`; the next
`db:reset` clears the tags.

Never paste provisioning commands into an unquoted heredoc or a log
append (`cat >> log <<EOF`, `echo "…"`): backticks and `$(…)` execute
there. A run provisioned 20 tags into the repo root that way. Quote the
delimiter (`<<'EOF'`).

Finish with the full verification gate from
`docs/the-slice.md`.

## Scope notes

- The starter's claim flows always claim `{ type: 'profile' }`; your new
  type is reachable through the SDK and API immediately, but offering it
  in the claim *UI* is a separate product decision — not part of this
  ripple.
- The destination payload crosses the anonymous resolve boundary: never
  put private data in it. Anything in `destination` is visible to anyone
  holding the tag.
- Any destination a tag owner controls and a stranger follows (a link, a
  phone number, a file) gets the §7 treatment: show where it goes, and let
  the tapper choose to go. Never hand off automatically.
