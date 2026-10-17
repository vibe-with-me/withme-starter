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
if (!password || /localhost|127\.0\.0\.1/.test(apiUrl + env.VITE_SUPABASE_URL)) {
  throw new Error('needs apps/web/.env.production (production URLs) and the keys file');
}
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
