# @withme/nfc

NFC-to-destination redirect infrastructure as a reusable TypeScript library: register tag UIDs, resolve them to destination URLs, and log scans with privacy-preserving IP hashing. Storage is bring-your-own via a small `StorageAdapter` interface (a Supabase adapter and an in-memory adapter ship in the box), the core is framework-agnostic, and a Hono router adapter is included for the common `GET /t/:uid` redirect endpoint. This SDK is **single-tenant by design**: one instance serves one logical owner, and multi-tenancy is intentionally out of scope.

## Install

```sh
bun add @withme/nfc
```

The two storage/framework integrations rely on optional peer dependencies — install only what you use:

```sh
bun add @supabase/supabase-js   # for the Supabase storage adapter
bun add hono                    # for the Hono router adapter
```

## Quickstart

```ts
import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { NfcSdk } from '@withme/nfc';
import { SupabaseStorageAdapter } from '@withme/nfc/storage/supabase';
import { nfcRouter } from '@withme/nfc/adapters/hono';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

const sdk = new NfcSdk({
  storage: new SupabaseStorageAdapter(supabase),
  ipHashSalt: process.env.IP_HASH_SALT!,
});

const app = new Hono();
app.route('/', nfcRouter(sdk)); // serves GET /t/:uid

export default app;
```

Tapping a tag hits `/t/:uid`; the router resolves the UID and 302-redirects to the tag's `destination_url`, logging the scan in the background. Unclaimed UIDs get a 404 page, deactivated tags a 410 page (both overridable via `nfcRouter` options).

## Bring your own storage

Implement the `StorageAdapter` interface to back the SDK with any datastore:

```ts
interface StorageAdapter {
  getTagByUid(uid: string): Promise<Tag | null>;
  createTag(input: CreateTagInput): Promise<Tag>;
  updateTag(uid: string, patch: UpdateTagInput): Promise<Tag>;
  deactivateTag(uid: string): Promise<Tag>;
  listTags(filter?: ListTagsFilter): Promise<Tag[]>;
  insertScan(scan: ScanInsert): Promise<void>;
  listScans(filter: ListScansFilter): Promise<Scan[]>;
}
```

UIDs are normalized to uppercase by the SDK before they reach the adapter, so adapters can assume uppercase. An `InMemoryStorageAdapter` ships at `@withme/nfc/storage/memory` for tests and examples.

## Schema

The Supabase adapter expects the schema in [`sql/`](sql/): apply [`0001_initial.sql`](sql/0001_initial.sql) (`tags` and `scans` tables) and then [`0002_lock_down.sql`](sql/0002_lock_down.sql) with your migration tool of choice. If you applied `0001` from an earlier release, apply `0002` now.

`0002` turns on row-level security with no policies and revokes the `anon` and `authenticated` roles, so the tables are server-only. Without it, anyone holding your publishable key can change any tag's destination or read the scan log through the Supabase Data API. Construct the adapter's `SupabaseClient` on the server with the secret (service-role) key, and never ship that client to a browser or app. The SDK never manages keys or auth.

If your project already has a `tags` table (the withme starter does), keep the SDK's tables apart from it in one of two ways. Either way, both files must target the same tables: `0001` fails on an existing `tags`, and an unchanged `0002` would lock down your own `tags` while leaving the SDK's tables exposed.

- **Other names.** Rename `tags` and `scans` the same way in both `0001_initial.sql` and `0002_lock_down.sql`, then pass those names as `tagsTable` / `scansTable`.
- **Another schema.** Run both files with that schema first on the `search_path` (for example, `create schema nfc; set search_path = nfc;` before each file). Add the schema to the project's exposed schemas (Data API settings), which is safe because `0002` leaves the client roles no access. Then select the schema on the client and keep the default table names:

  ```ts
  const supabase = createClient(url, secretKey, { db: { schema: 'nfc' } });
  const storage = new SupabaseStorageAdapter(supabase);
  ```

`tagsTable` and `scansTable` are relation names; they do not select a schema.

## Status

v0.x — breaking changes expected between releases.

## License

MIT
