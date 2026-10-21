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
    // A trailing dot (`localhost.`) names the same host.
    return u.protocol === 'https:' && !local.test(u.hostname.replace(/\.$/, '')) ? u.origin : null;
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

## Staging build

(From section 4.) Where each build listens, from `apps/mobile/eas.json`:

| Profile | Distribution | Channel | EAS environment |
| --- | --- | --- | --- |
| `development` | internal (a development client) | `development` | `development` (EAS's default for it) |
| `staging` | internal (APK link, registered iPhones) | `staging` | `preview` |
| `production` | store | `production` | `production` (EAS's default for it) |

A build only takes updates published to its own channel, which is why
section 4 and `deploy.yml` publish with `--channel production` and
testers' updates go out with `--channel staging`. `--branch` would
publish to a branch that no channel points at until someone links one
(`eas channel:edit`), and no build would see it.

**Why `runtimeVersion` stays on `sdkVersion`.** EAS Update gives an
update to a build only when their runtime versions match. Under the
`sdkVersion` policy the runtime is the Expo SDK (`exposdk:57.0.0`), the
same value Expo Go reports, so Expo Go loads the starter's published
updates: the quickstart depends on that. Under `fingerprint` the runtime
is a hash of the project's native code, which Expo Go never matches, so
switching the starter would break the quickstart.

The price is paid by installed builds. A staging build made before a
native change (a new native module, an Expo plugin added or reconfigured
in `app.json`) has the same SDK runtime as the update made after it, so
it downloads that update and crashes on the missing native code. The
rule until the fix lands: a native change gets a new build; only
JavaScript changes go out as `eas update`. The same holds for the
`deploy.yml` run form (untick `mobile`).

The planned fix is a runtime policy per build profile (`sdkVersion`
where Expo Go loads updates, `fingerprint` for staging and store
builds), so each build only accepts updates made for its own native
code. It arrives with a store-release skill, which also covers store
builds and submission.
