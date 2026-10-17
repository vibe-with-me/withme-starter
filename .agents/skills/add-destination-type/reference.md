# add-destination-type — reference

## Host allowlist

(Optional, from §2.) The CHECK in §2 admits any https host,
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
  // (the §1 port refine stays on the url as well)
```

Add the same accept and reject cases to the contract test and the §4 RLS
test (an allowed host with a path, `https://menu.example.com.evil.example`,
`https://evil.example/menu.example.com`), so the two validators are proven
to agree. An allowlist is a product choice,
not a requirement: the interstitial in §7 and §8 is the safety measure
either way.

## Runtime check

(From §9.) The claim UI only claims profiles, so claim through a script. Provision
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
if (a.error) throw a.error;
if (b.error) throw b.error;
// claim_tag answers null, not an error, for a tag it did not claim.
if (!a.data || !b.data) throw new Error('a claim did not land: re-provision and run again');
console.log('link claim: ok | profile claim: ok');
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
there. Quote the delimiter (`<<'EOF'`).
