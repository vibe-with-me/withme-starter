---
name: add-destination-type
description: Use when a withme-starter fork needs tags to point at something new — growing the destination union with a member like link, menu, or vcard, end to end from contract to mobile.
---

# add-destination-type — grow the destination union

A tag's `destination` is the spine of this codebase: one typed union,
enforced in four places that must move together (zod contract, DB CHECK
constraint, SDK client types, resolver rendering). This skill walks the
full ripple. The worked example throughout is `{ type: 'link', url }` —
a tag that redirects to an https URL. The example was built and verified
against the real stack, then removed: it ships here, not in the starter.

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
    and destination->>'url' ~ '^https://[^[:space:]]+$'
    and char_length(destination->>'url') <= 2048
    and destination - 'type' - 'url' = '{}'::jsonb,
    false
  )
);
```

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
worked example of a card-like type. Branch on your type in the loader
(redirect-like types) or the component (card-like types). The link branch goes in the loader,
after the unclaimed redirect:

```ts
if (result.status === 'claimed' && result.destination.type === 'link') {
  // The tag IS the link. Safe to follow blind: the DB CHECK constrains
  // destinations to https URLs, so this can never be javascript:/data:.
  throw redirect({ href: result.destination.url });
}
```

Scan logging already happened in the `Promise.all` above — keep the
branch below it so link taps are logged like any tap.

## 8. Mobile resolver

`apps/mobile/app/t/[uid].tsx`, same branch twice: in the resolve effect
(the physical tap is the user gesture — hand off immediately) and in the
render (a fallback card, composed from `components/ui` primitives, for
when the open fails or the user returns). Import `Linking` from
react-native:

```ts
// in the .then(), after the unclaimed redirect:
if (resolved.status === 'claimed' && resolved.destination.type === 'link') {
  Linking.openURL(resolved.destination.url).catch(() => undefined);
}
setResult(resolved);
```

```tsx
// in the component, next to the gathering branch, before the profile-card return:
if (result.destination.type === 'link') {
  const url = result.destination.url;
  return (
    <View style={[styles.page, { backgroundColor: t.bg }]}>
      <Card settle>
        <Title>{result.profile.display_name}</Title>
        <Muted>{url}</Muted>
        <Button kind="connect" label="Open link"
          onPress={() => Linking.openURL(url).catch(() => undefined)} />
      </Card>
    </View>
  );
}
```

The fallback card is deliberately minimal (no avatar or card line, unlike
the other branches) and only the typecheck covers it here. Check the
hand-off (the tap opens the URL in the browser) and the fallback card
(coming back shows "Open link") in the fork's simulator pass.

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

Expect `status=307 location=<your url>` for the link tag (the loader
branch from §7 throws that redirect), and a normal
profile tag still returns 200 (if it hangs under `vite dev`, restart the
web dev server as provision-tags §1 describes, ENG-751). Link taps are
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
