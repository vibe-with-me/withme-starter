# go-live — reference

## Authed check

(From section 3.) The owner runs it (production credentials); it prints
field names only. Save as `apps/web/authed-check.ts` (so the deps
resolve; never commit it):

```ts
import { createClient } from '@supabase/supabase-js';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

const env = process.env;
const email = 'ada@demo.withme.local';
const password = env.SEED_DEMO_PASSWORD ?? '';
const apiUrl = env.VITE_API_URL ?? '';
// Parse both origins: the demo password goes to the Supabase URL and the
// session token to the API, so neither may be local or plain http.
const remote = (url: string | undefined) => {
  try {
    const u = new URL(url ?? '');
    // Loopback, private (10/8, 172.16/12, 192.168/16), link-local, any IPv6
    // literal, and *.local / *.localhost names.
    const local = /^(localhost|0\.|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[)|\.(local|localhost)$/;
    return u.protocol === 'https:' && !local.test(u.hostname) ? u.origin : null;
  } catch {
    return null;
  }
};
const apiOrigin = remote(apiUrl);
const supabaseOrigin = remote(env.VITE_SUPABASE_URL);
if (!password || !apiOrigin || !supabaseOrigin) {
  throw new Error('needs apps/web/.env.production (production https URLs) and the keys file');
}
console.log(`signing in at ${supabaseOrigin}, calling ${apiOrigin}`);
const supabase = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error || !data.session) throw new Error(`sign-in failed: ${error?.message}`);
const token = data.session.access_token;
const api: any = createORPCClient(
  new RPCLink({ url: `${apiUrl}/rpc`, headers: () => ({ authorization: `Bearer ${token}` }) }),
);
const { profile } = await api.app.profile.get();
console.log(`profile.get via ${new URL(apiUrl).host}: ok; fields: ${Object.keys(profile ?? {}).join(', ')}`);
```

```sh
cd apps/web && ( trap 'rm -f authed-check.ts' EXIT; bun --env-file=.env.production --env-file="$HOME/.config/<name>/demo-seed.env" authed-check.ts )
```

The trap deletes the file however the check ends, and the subshell exits
with the check's status, so a failed check still fails the command.
