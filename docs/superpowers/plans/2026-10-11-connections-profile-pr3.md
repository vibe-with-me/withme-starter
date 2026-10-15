# Connections and Profile made whole (PR 3 of the tabs buildout) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the last two tabs the spec calls for (Milestone 3).
- **Connections:** in-page segments (Connections, Requests with a count badge, Blocked). Every list goes loading → error with retry → typed empty → content. The mobile row no longer overflows.
- **Profile:**
  - An avatar upload replaces the URL field. Storage is on locally, there is an `avatars` bucket with per-user folders, and `profiles.avatar_url` becomes `avatar_path`, guarded by a regex CHECK. Clients resize to 512px. The API writes with the caller's JWT.
  - My tags on `app.tags.listMine` / `app.tags.update`, with `update` gaining `status`.
  - An Account section with sign out and `delete_my_account()` behind a confirmation.
- **Tests and docs:** RLS and storage tests (red first where a migration makes them green), contract tests, both e2e harnesses extended, a simulator pass, and the docs.
- **M2 carry-overs:** the four Milestone 2 follow-ups are folded in.

**Architecture:**
- **Spec:** `docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md`. Its Decisions, "Tab contents → Connections / Profile", "Data and contract changes", Testing, and Delivery → PR 3 all bind.
- **Slice order:** we follow `docs/the-slice.md`: contract → storage enablement → RLS tests (red) → migrations → queries → API → API e2e → mobile upload spike → web → web e2e → mobile → simulator → docs.
- **Web:** every shell-child loader wraps its API calls in `asSignedInAccount` (`apps/web/src/lib/account-scope.ts`), and every `_app.*` route spreads `shellStates`.
- **Mobile:** stays on `components/ui.tsx` primitives and `useTokens()`.
- **Data access:** neither client touches Supabase for data, Storage included. The photo travels as a `File` through oRPC, and the API writes it with `context.db`, the per-request client that carries the caller's JWT.

**Tech Stack:**
- Backend: Postgres/Supabase RLS, Supabase Storage (local storage-api), security-definer RPCs.
- Contract: zod 4 (`z.file()`) + oRPC 1.14 (RPC protocol multipart for blobs).
- API: Hono API Worker.
- Web: TanStack Start 1.168 / Router 1.170 (search-param segments, `activeOptions.exact`), canvas resize via `createImageBitmap` + `toBlob`.
- Mobile: Expo SDK 56 / Expo Router 56 (`useFocusEffect`), `expo-image-picker` + `expo-image-manipulator` (both in Expo Go, both listed in the spec), RN `XMLHttpRequest` blob reads.
- Tests: bun test, vitest (SDK parity), Playwright.

**Scope guard:**
- No new tables, no browse surface, nothing that ranks, recommends, aggregates or monetizes. The Requests badge counts your own inbox, for you alone.
- No listing of the avatars bucket by anyone but the folder's owner: a listable bucket is a directory of everyone with a photo.
- No image transformation service, no service-role key anywhere in `apps/*`.
- Nothing billed: no hosted Supabase, no deploys, no EAS builds, no npm release of `@withme/nfc`. The SDK mirror changes; the release is a separate, owner-approved step.
- Merch and Events are untouched except for the M2 carry-overs listed below.

**Tasks:**
- 0 Baseline.
- Backend: 1 Contract and SDK mirror · 2 Web follows the rename · 3 Mobile follows the rename · 4 Enable storage locally · 5 RLS and storage tests (red) · 6 Migration `avatars.sql` · 7 Migration `delete_my_account.sql` · 8 Queries · 9 API handlers · 10 API e2e.
- **10b Mobile upload spike:** the two Expo modules and `squareAvatar` (committed), then a temporary button proves RN Blob → oRPC multipart → API on the simulator before any UI is built (reverted).
- Web: 11 Connections segments and the list ladder · 12 The photo · 13 My tags · 14 Account · 15 M2 carry-overs on the resolver · 16 Web e2e.
- Mobile: 17a List primitives in `ui.tsx` · 17b The Connections screen · 18 The photo · 19a My tags · 19b Account and the Profile wiring · 20 M2 carry-overs.
- 21 Simulator pass · 22 Docs · 23 The gate, then the PR.

---

## Decisions made in this plan

1. **Avatars are written by the API, with the caller's JWT, from a `File` sent through oRPC.** The spec says this literally ("the API receives a `File` through oRPC, validates type and size (≤ 1 MB), and writes to storage with the caller's JWT, never service-role").
   - The contract adds `app.profile.uploadAvatar` (`POST /me/avatar`, input `{ file: z.file().min(1).max(AVATAR_MAX_BYTES) }`, output `{ profile }`).
   - The handler reads the bytes and sniffs the magic number: JPEG `FF D8 FF`, or WebP `RIFF….WEBP`. Anything else is `BAD_REQUEST`. The declared MIME type and file name are never trusted; the sniffed kind decides the stored extension and `Content-Type`.
   - It then uploads with `context.db.storage` (the supabase-js client built with the caller's `Authorization` header, so Storage RLS sees the user), sets `profiles.avatar_path`, and deletes the previous file.
   - **Rejected: a signed upload URL issued by the API.** The bytes would bypass the API's sniffing, and it contradicts "the API receives a File".
   - **Rejected: base64 JSON (vibe-with-me's `image_data`).** It contradicts the spec, and the File path works on both platforms (Decision 5).
   - The write spans two systems (Storage, then Postgres), so it cannot be one definer RPC. The API compensates instead: if the profile update fails, the new file is removed; if removing the old file fails, that is logged and tolerated, because a stray file is not a broken profile.
   - `AVATAR_MAX_BYTES = 1_048_576` (1 MiB). It is enforced four times: the clients, which refuse to send a larger encode; the API, which answers 413 through Hono's `bodyLimit` before oRPC buffers the body (Task 9: by `Content-Length` when declared, by counting the streamed bytes when not, because oRPC buffers the whole multipart body before zod runs); the contract (`z.file().max`); and the bucket (`file_size_limit`).
   - **Added beyond the spec's list: `app.profile.removeAvatar`** (`DELETE /me/avatar`). The URL field could be cleared. Without this, a photo, once set, could only ever be replaced. It mirrors how M2 added `gatherings.update/remove` for host edit/delete.

2. **The bucket and its policies.** Migration `20261011120000_avatars.sql`:
   - **The bucket:** `insert into storage.buckets` creates `avatars` with `public = true`, `file_size_limit = 1048576` and `allowed_mime_types = {image/jpeg,image/webp}`. It lives in a migration, not in `config.toml` `[storage.buckets]`, so `supabase db push` gives hosted projects the same bucket.
   - **One shape helper:** `private.is_avatar_path(path, owner)` (immutable) is the single definition of the shape `^<owner-uuid>/<uuid>\.(webp|jpg)$`. Both the profiles CHECK and the storage insert policy call it, which also makes it the one seam a multi-tenant fork would change (a tenant prefix).
   - **The policies on `storage.objects`, all `to authenticated`:**
     - `avatars_select_own`, `avatars_delete_own`: `bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text`, the spec's per-user folder rule.
     - `avatars_insert_own`: that same rule plus `private.is_avatar_path(name, auth.uid())`, plus `exists (select 1 from public.profiles where id = auth.uid())`. A deleted user's JWT stays valid until it expires, and without that clause it could still upload into the dead account's folder.
     - **No update policy:** objects are immutable, and replacing a photo makes a new path.
   - **"Public read" means a public bucket**, so the URL works for anyone holding the path. **It does not mean a select policy for `public`/`anon`.** vibe-with-me's `"Public profile images are viewable" … to public using (bucket_id = …)` is deliberately not ported, because it makes the bucket listable, which is an enumeration surface (who has an account and a photo).
   - **The MIME allow-list matters for safety:** the bucket can never host HTML or SVG on the project's origin, even if someone uploads straight to Storage with their own JWT.
   - **The tenant seam:** `storage.objects` is Supabase's table and has no `tenant_id`. The seam stays on `profiles` (which carries `avatar_path`), and the path helper is the one place a tenant prefix would go.

3. **The object name and the database column.**
   - Files are named `<user-uuid>/<random-uuid>.<jpg|webp>`, generated by the API and lowercase. Uploads use `upsert: false` and `cacheControl: '3600'`: an hour bounds how long a removed or replaced photo can still be served from a CDN.
   - In `profiles`, `avatar_path text` comes with `constraint profiles_avatar_path_shape check (avatar_path is null or private.is_avatar_path(avatar_path, id))`. The CHECK binds the folder to the row's own id, so even the table-level UPDATE a user already has cannot point their card at someone else's file or at an off-origin URL.
   - `avatar_url` is dropped. Existing values cannot become paths (they point anywhere), so they go with the column. The starter's seed never set one.
   - `resolve_tag` and `accept_connect_request` are replaced in place, with every attribute restated, to emit `avatar_path`. plpgsql bodies are not dependency-tracked, so the drop would otherwise break them at call time.

4. **The public contract changes from `avatar_url` to `avatar_path`, and the SDK mirror follows.**
   - The spec requires it, twice: "Data and contract changes: `profile.avatar_url` → `avatar_path`", and the Decisions' "every client builds the URL from its own configured Supabase URL". That rules out an API-computed `avatar_url`. The API's `SUPABASE_URL` is not necessarily what a device can reach, and a computed URL would again be a server-chosen URL travelling as data.
   - So `ProfileSchema`, `PublicProfileSchema` and the resolve payload carry `avatar_path: string | null`.
   - The contract exports `AVATARS_BUCKET`, `AVATAR_MAX_BYTES`, `AvatarPathSchema` and `avatarPublicUrl(supabaseUrl, path)`. Web (`VITE_SUPABASE_URL`) and mobile (`EXPO_PUBLIC_SUPABASE_URL`) each build URLs through it, in one-line `lib/avatar.ts` helpers that return null rather than throw when the URL is unset (the resolver must stay unbreakable).
   - `packages/nfc-sdk/src/client.ts` `PublicProfileCard` changes `avatar_url` to `avatar_path`, with a doc comment giving the URL recipe. The parity test enforces this.
   - This is a breaking change for SDK consumers. It is acceptable under "v0.x — breaking changes expected"; no version bump or tag in this PR (M2 changed the same payload the same way).
   - `UpdateProfileInputSchema` loses its avatar key entirely; unknown keys are stripped. A path is chosen only by the API.

5. **Client resize: 512px square on both platforms.**
   - **Web.** `createImageBitmap(file)` (EXIF orientation applied by default), a centre crop to a square, then `drawImage` onto a 512×512 canvas filled first with a fixed `#fffdf9` (`PHOTO_FILL`, the light `--color-surface` value from `tokens.css`, not read at upload time), so a transparent PNG never turns black as JPEG and the baked background never depends on the uploader's theme. Then `toBlob('image/webp', 0.85)`. Safari silently returns PNG for WebP, so if the blob's type is not `image/webp`, it re-encodes as `image/jpeg` at 0.85. The result is wrapped as a `File`, and the server sniffs it anyway.
   - **Mobile.** `expo-image-picker` (`launchImageLibraryAsync`, `allowsEditing: true`, `aspect: [1, 1]`; no permission request is needed for the system picker) plus `expo-image-manipulator`'s SDK 52+ API (`ImageManipulator.manipulate(uri).crop(…).resize({ width: 512, height: 512 }).renderAsync()` → `saveAsync({ format: SaveFormat.JPEG, compress: 0.85 })`). JPEG, because it is universal across iOS and Android. Both modules ship in Expo Go SDK 56, so no native build is needed. They are installed with `bunx expo install`; image-picker's config plugin goes in `app.json` with a brand-free photos string, and camera and microphone set to `false`, for future dev builds.
   - **Getting the bytes to the API on mobile.** Each link of this chain was checked in this repo's `node_modules`:
     - RN cannot build a `Blob` from bytes: `BlobManager.createFromParts` throws on `ArrayBuffer`, and Expo's global `fetch().blob()` builds one exactly that way. So the saved file URI is read with `XMLHttpRequest` and `responseType = 'blob'`, which gives a native-backed RN `Blob`.
     - oRPC's serializer treats only `instanceof Blob` values as multipart parts. An expo-file-system `File` would not qualify.
     - Expo's winter runtime patches RN `FormData` with `set` and gives the part a name. This is `expo/src/winter/FormData.ts`.
     - `expo/fetch`, installed as global `fetch`, converts that `FormData` to multipart via `FileReader.readAsArrayBuffer`, which RN implements. This is `expo/src/winter/fetch/convertFormData.ts`.
     - So the Worker receives a `File`.
   - **Task 10b proves this chain early,** right after the API e2e and before any web or mobile UI: it installs the two modules and `squareAvatar`, then a temporary button on the simulator uploads through the real chain and is reverted. The API e2e cannot prove it, because it sends a Bun `File`. **If it fails there (a BAD_REQUEST "Input validation failed" means the blob part arrived as a string), stop and report. Do not improvise a base64 contract:** that would be a spec deviation that needs Alex's call (the decisions log).

6. **Account deletion.**
   - **The database function.** `public.delete_my_account()` (security definer, `set search_path = ''`) raises `authentication required` (42501) for anon. It deletes the caller's rows from `private.connect_request_attempts` (that ledger has no FK, so they would otherwise linger forever), then deletes `auth.users where id = auth.uid()`. The existing cascades do the rest:
     - `profiles` cascades from `auth.users`;
     - `private.on_profile_deleted` resets claimed tags to unclaimed, with `destination` nulled, and erases their scans;
     - connections, requests, blocks, hosted gatherings and memberships go by FK.
     - Grants: `revoke … from public, anon` (Supabase's default privileges grant anon EXECUTE on new public functions, so `from public` alone is not enough), then `grant … to authenticated`.
   - **The API endpoint.** `app.profile.deleteAccount` (`DELETE /me`) works in three steps, all with the caller's own JWT:
     1. It clears the photo pointer (`setOwnAvatarPath(context.db, userId, null)`; skipped when the caller has no profile). If a later step fails, the card never points at a file that is gone.
     2. It sweeps every object in the caller's avatar folder through the Storage API. That is paged; it errors if the folder does not empty within 10 pages. A SQL `delete from storage.objects` would orphan the blobs, and current storage versions refuse direct deletes.
     3. It calls the RPC.
   - **A deleted user's token.** Their JWT stays valid until it expires, so `avatars_insert_own` also requires a profile row for the caller (Decision 2): no profile, no upload. `account.test.ts` asserts it.
   - **Signing out afterwards.** The client then calls `auth.signOut({ scope: 'local' })`: the server-side session is already gone, so only the local copy needs dropping. Web goes to `/`; mobile `router.replace('/login')`.
   - **Confirmation.** On web, an inline second step in the Account card. On mobile, `Alert.alert` with a destructive button, the same idiom as gathering delete.
   - **Copy:**
     - Title: "Delete your account?"
     - Body: "Your profile, connections, requests, blocks, and the gatherings you host are deleted, and your photo with them. Your tags are released so anyone can claim them. This can't be undone."
     - Buttons: "Delete my account" (default style, never the accent) and "Keep my account".
     - In flight / on failure: "Deleting…"; failure "That didn't go through. Try again." (web keeps its existing curly-apostrophe spelling of that string).
   - The existing admin-driven `cascade.test.ts` stays. It documents the FK and trigger cascade independently of the RPC.

7. **My tags.**
   - **Contract.** `app.tags.update`'s input becomes `UpdateMyTagInputSchema = { uid, destination?, status?: 'claimed' | 'disabled' }`, refined to need at least one field.
     - `'unclaimed'` is not the owner's to set: the contract rejects it, and so does the `tags_state_consistent` CHECK, which a new RLS test pins.
     - The M2 call site (`{ uid, destination }`) is unchanged.
   - **The query.** `updateOwnTagDestination` becomes `updateOwnTag(db, uid, { destination?, status? })`.
   - **The Profile section.** Each tag (claimed or disabled, from `listMine`) shows:
     - its UID;
     - one sentence saying what a tap does now:
       - "A tap shows your card."
       - "A tap invites people to {title}."
       - "A tap shows your card: the gathering it pointed at is gone, or you left it."
       - "A tap invites people to a gathering." (when the gatherings list failed to load)
       - "Off. A tap shows an inactive tag."
     - a destination picker: "My profile" plus every gathering from `app.gatherings.listMine`, labelled "Title · Thu, Oct 9 · 7:00 PM". Web uses a native `<select>` labelled "Where {UID} points", with a Save button, so a keyboard user browsing options never re-points the tag. Mobile uses an expandable radio list behind "Point it at…".
     - "Turn off" / "Turn on", labelled "Turn off {UID}" for assistive tech and tests.
   - **Relation to the M2 detail page.** The gathering detail's "Point my tags at this gathering" stays: a bulk shortcut over the same endpoint, for claimed tags only. My tags is the per-tag control. No new policy is needed. The new RLS tests pin the existing `tags_select_own` / `tags_update_own` + `(destination, status)` grant that these endpoints rest on, so they are green on arrival, honestly labelled as pins.

8. **Segments.**
   - **Web.** Links in a `<nav aria-label="Connections lists">`, URL-addressable as `/connections`, `?tab=requests` and `?tab=blocked` (`validateSearch`). They are links, not ARIA tabs: they change the URL, so they are navigation, and ARIA tab semantics would promise arrow-key behaviour links do not have. Switching uses `replace` (a segment switch is not a history step). The active segment follows the validated `tab` from `Route.useSearch()`, and the page sets `aria-current="page"` and the active class itself, so a stale `?tab=foo` still marks Connections. TanStack's own matching compares the raw search; it keeps `activeOptions={{ exact: true }}` only so that it never disagrees. Every segment has one font weight, so switching never shifts its siblings, and the row wraps at narrow widths.
   - **Mobile.** Local state through a `SegmentedTabs` primitive (`accessibilityRole="tablist"`/`"tab"`), since there is no URL to address.
   - **The badge.** Its source is the same `listPending` result the Requests list shows. It is an ink pill (never the accent), capped at "99+"; web reads it as "Requests, N pending". It is the caller's own inbox, so it is not an aggregate of anyone else. A silently-dropped request is never stored, so it can never be counted.
   - **Copy:**
     - empty states: "No connections yet. Tap someone's tag to start.", "No requests right now.", "No one is blocked.";
     - errors: "Couldn't load your connections." / "…your requests." / "…your block list." / "…your tags.";
     - retry: "Try again".

9. **The ladder.**
   - **Web.** Each list is `settled()` on its own inside the one route loader (still wrapped by `asSignedInAccount`, which still re-runs the whole load across an account change). A failed list renders its own error with retry, not the route `errorComponent`. The first load is the shell's `pendingComponent`; a retry shows "Loading…" in that list. An UNAUTHORIZED is not settled: it is the session, not the list, so it is rethrown and reaches the auth redirect. `components/ListStates.tsx` (`ListLadder`, `EmptyState`) is the spec's named component; the spec's separate `components/EmptyState.tsx` is folded in here, beside its only caller.
   - **Mobile.** `ListState<T>` per list, plus `ListLadder` / `EmptyState` / `SectionHeader` in `ui.tsx`, the spec's mobile list. Lists reload on focus.

10. **The mobile row overflow.**
    - **Cause:** `Button` is `width: '100%'`, and two of them sit in a `flexDirection: 'row'`.
    - **Fix:**
      - `Button` gains `inline` (sizes to its label, `minHeight: TAP_TARGET`).
      - A new `PersonRow` primitive puts actions on their own wrapping line under the name, the same rule `app.css` applies under 480px.
      - Connections and the gathering member list both use it.

11. **Turning storage on (`config.toml`).**
    - **The change:** `[storage] enabled = true`, plus `[storage.image_transformation] enabled = false` (clients resize; imgproxy is one less container).
    - **Docker:** the storage-api image is pulled once (roughly 0.2 GB of disk; `docker system df` shows it).
    - **CI:** `ci.yml`'s `supabase start -x studio,mailpit` starts storage-api automatically. No workflow change is needed. Expect a slower first `supabase start` in CI (the image pull), and watch the PR's CI time.
    - **Hosted:** projects have Storage on by default, and the bucket comes from the migration.

12. **Seed.** It needs no change. It inserts profiles with `display_name` and `bio` only, and never set `avatar_url`. Demo photos are uploaded through the app, and Task 21 does it for Ada.

13. **Where the M2 carry-overs land:**

    | Carry-over | Web | Mobile |
    | --- | --- | --- |
    | Resolver says "Join this gathering" to a member | Task 15 | Task 20 |
    | Owner sees a disabled "Connect" before "This is your tag." | Task 15 | Task 20 |
    | Member row "Host": web replaces the bio, mobile puts it beside the bio | web is the convention, no change | Task 20 |
    | Edit-failure copy differs | web is the convention, no change | Task 20 |
    | Mobile Accept overflows the card | — | Tasks 17a (`Button inline`, `PersonRow`), 17b |

    - **Membership on the resolver.** For a signed-in non-host, the resolver calls `app.gatherings.get` (a member's call succeeds; anyone else gets the same NOT_FOUND as a missing gathering) and shows "Open gathering" in the default style to members. While the session or membership is unknown, it renders nothing, extending the M2 web idiom to `ConnectAction` on both platforms.
    - **The member row.** Web is the convention: "Host" replaces the bio on the sub line. The right side of a row is the actions slot everywhere else, so a label there reads as a button.
    - **The edit-failure copy.** Web is the convention: form saves say "Could not save. Check the fields and try again."; one-tap actions say "That didn't go through. Try again."

14. **Expected totals at the end:**

    | Suite | Before | After |
    | --- | --- | --- |
    | db (RLS + storage) | 57 | 72 (tags +3 pins, avatars +8, account +4) |
    | contract | 24 | 31 |
    | Playwright | 10 | 14 (`connections.spec.ts` +1, `profile.spec.ts` +3) |
    | API e2e checks | 39 | 58 (§18–20) |

    The `nfc-sdk` count is unchanged.

---

## Ground rules for every task

- Work in the worktree `~/dev/withme-starter/.claude/worktrees/with-me-derivation-starter-1f2c69` on branch `claude/connections-profile` (from `main` at `4fa6c98`, Milestones 1 and 2 merged). Use absolute paths or `bun run --cwd`; never `cd` into the main checkout.
- **The gate** is `bun run lint`, `bun run typecheck`, `bun run test`. Lint stays green at every commit. These red windows are expected and stated per task:
  - `apps/api` typecheck: red from Task 1 until Task 9 (contract shape and new optional fields, before the queries and handlers catch up).
  - `apps/web` typecheck: red from Task 1 until Task 2.
  - `apps/mobile` typecheck: red from Task 1 until Task 3.
  - `packages/db` typecheck: red from Task 5 until Task 7 (tests use `avatar_path` and `delete_my_account` before the generated types have them).
  - `bun run test` (db suite): red from Task 5 until Task 7, by design. The RLS tests land red, and the migrations make them green.
- No route files are added in this PR, so `apps/web/src/routeTree.gen.ts` should not change. If `bunx vite build` rewrites it anyway, commit it in that task.
- **Styling:** only `var(--*)` tokens on web; only `useTokens()` and `lib/tokens.ts` constants on mobile. The accent appears on Connect, Accept and Join only. Badges, segments and destructive buttons are ink or default.
- Shell-quote file names that contain `$`, `(` or `[`.
- **Commit messages:** imperative subject, the why in the body, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Nothing that bills: no `supabase link/db push`, no `wrangler deploy`, no `eas`.

---

### Task 0: Baseline

**Files:** none.

```bash
bun install
bun run db:start
bun run db:reset && bun run db:seed
cp -n apps/api/.dev.vars.example apps/api/.dev.vars; cp -n apps/web/.env.example apps/web/.env; cp -n apps/mobile/.env.example apps/mobile/.env
bun run lint && bun run typecheck && bun run test
git log --oneline -1   # 4fa6c98 Merge pull request #8: the gathering in core, the Events tab
docker system df       # note the image total before storage-api arrives in Task 4
```

**Expected:**
- The gate is green.
- The db suite prints `57 pass`, contract `24 pass`.
- No commit.

Optionally run `cd apps/web && CI=1 bunx playwright test; cd ../..` once: `10 passed`.

---

### Task 1: Contract and SDK mirror

**Files:**
- Modify: `packages/contract/src/schemas/profile.ts`, `packages/contract/src/schemas/tag.ts`, `packages/contract/src/contract/app.ts`, `packages/contract/test/schemas.test.ts`, `packages/nfc-sdk/src/client.ts`

**Step 1:** Replace `packages/contract/src/schemas/profile.ts` entirely:

```ts
import { z } from 'zod';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** The Storage bucket every avatar lives in: public read by path, per-user folders, never listable. */
export const AVATARS_BUCKET = 'avatars';

/**
 * The upload cap (1 MiB), enforced here, by the API, and as the bucket's
 * file_size_limit. Clients send 512px squares, far below it.
 */
export const AVATAR_MAX_BYTES = 1_048_576;

/**
 * Where an avatar lives inside the bucket: `<user-uuid>/<uuid>.(webp|jpg)`,
 * lowercase, one folder deep. A path, never a URL: an off-origin avatar is
 * unrepresentable, and each client builds the URL from its own configured
 * Supabase URL with avatarPublicUrl(). The database CHECK also binds the
 * folder to the profile's own id.
 */
export const AvatarPathSchema = z
  .string()
  .regex(new RegExp(`^${UUID}/${UUID}\\.(webp|jpg)$`), 'Expected <user-uuid>/<uuid>.(webp|jpg)');

/** The public URL for an avatar path, built from the caller's own Supabase URL. */
export function avatarPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`;
}

export const ProfileSchema = z.object({
  id: z.uuid(),
  display_name: z.string().min(1).max(80),
  avatar_path: AvatarPathSchema.nullable(),
  bio: z.string().max(280).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

/**
 * The card. Everything a stranger may see after a tap — and nothing more.
 * Reachable only via a tag scan or an existing connection (no enumeration).
 */
export const PublicProfileSchema = ProfileSchema.pick({
  id: true,
  display_name: true,
  avatar_path: true,
  bio: true,
});

/**
 * Name and bio. The photo has its own endpoints (uploadAvatar /
 * removeAvatar): a path is chosen by the API, never by the client, so this
 * input has no avatar key at all (unknown keys are stripped).
 */
export const UpdateProfileInputSchema = z.object({
  display_name: z.string().min(1).max(80).optional(),
  bio: z.string().max(280).nullable().optional(),
});

/**
 * A photo the client has already squared and resized to 512px. The API
 * reads the bytes to decide JPEG or WebP (a declared type is the client's
 * claim, not a fact), so there is no mime rule here.
 */
export const AvatarUploadInputSchema = z.object({
  file: z.file().min(1).max(AVATAR_MAX_BYTES),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type PublicProfile = z.infer<typeof PublicProfileSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;
export type AvatarUploadInput = z.infer<typeof AvatarUploadInputSchema>;
```

(`AvatarUrlSchema` is gone; nothing else imports it.)

**Step 2:** `packages/contract/src/schemas/tag.ts`: append after `TagSchema` (before the type exports):

```ts
/**
 * What an owner may set: a tag off ('disabled') and back on ('claimed').
 * Releasing a tag is not theirs to do; the tags_state_consistent CHECK
 * agrees.
 */
export const OwnerTagStatusSchema = z.enum(['claimed', 'disabled']);

/** Re-point and/or switch one of your tags; the uid travels in the path. At least one field. */
export const UpdateMyTagInputSchema = z
  .object({
    uid: TagUidSchema,
    destination: DestinationSchema.optional(),
    status: OwnerTagStatusSchema.optional(),
  })
  .refine((patch) => patch.destination !== undefined || patch.status !== undefined, {
    message: 'Nothing to update',
  });
```

and add to the type exports:

```ts
export type OwnerTagStatus = z.infer<typeof OwnerTagStatusSchema>;
export type UpdateMyTagInput = z.infer<typeof UpdateMyTagInputSchema>;
```

**Step 3:** `packages/contract/src/contract/app.ts`:
- Remove the now-unused `import { DestinationSchema } from '../schemas/destination.ts';`.
- Change the profile and tag imports to:

```ts
import {
  AvatarUploadInputSchema,
  ProfileSchema,
  PublicProfileSchema,
  UpdateProfileInputSchema,
} from '../schemas/profile.ts';
import { TagSchema, UpdateMyTagInputSchema } from '../schemas/tag.ts';
```

After `updateProfile` add:

```ts
const uploadAvatar = oc
  .route({ method: 'POST', path: '/me/avatar', tags: ['Profile'] })
  .input(AvatarUploadInputSchema)
  // Stored as <your-id>/<uuid>.(jpg|webp) with your own JWT; the previous
  // file is deleted. Anything but JPEG or WebP bytes is BAD_REQUEST.
  .output(z.object({ profile: ProfileSchema }));

const removeAvatar = oc
  .route({ method: 'DELETE', path: '/me/avatar', tags: ['Profile'] })
  .output(z.object({ profile: ProfileSchema }));

const deleteAccount = oc
  .route({ method: 'DELETE', path: '/me', tags: ['Profile'] })
  // Irreversible. The photo pointer is cleared, the avatar files swept
  // (Storage API), then delete_my_account(): profile, connections, requests,
  // blocks, hosted gatherings and memberships go; claimed tags are released
  // (unclaimed, scans erased).
  .output(z.object({ ok: z.literal(true) }));
```

Replace the M2 comment and `updateMyTag` with:

```ts
// My tags: Profile → My tags, and the gathering detail's "point my tags here".
const listMyTags = oc
  .route({ method: 'GET', path: '/me/tags', tags: ['Tags'] })
  .output(z.object({ tags: z.array(TagSchema) }));

const updateMyTag = oc
  .route({ method: 'PATCH', path: '/me/tags/{uid}', tags: ['Tags'] })
  .input(UpdateMyTagInputSchema)
  // Not yours and nonexistent are the same NOT_FOUND.
  .output(z.object({ tag: TagSchema }));
```

In `appContract`, change `profile` to:

```ts
  profile: {
    get: getProfile,
    update: updateProfile,
    uploadAvatar,
    removeAvatar,
    deleteAccount,
  },
```

**Step 4:** `packages/contract/test/schemas.test.ts`:
- Add to the import list: `AVATAR_MAX_BYTES`, `AvatarPathSchema`, `AvatarUploadInputSchema`, `avatarPublicUrl`, `UpdateMyTagInputSchema`, `UpdateProfileInputSchema`.
- Replace every `avatar_url: null,` with `avatar_path: null,` (five fixtures: three in `ResolveOutputSchema`, two in `ConnectRequestSchema`).
- Change the `PublicProfileSchema` expectation to `['avatar_path', 'bio', 'display_name', 'id']`.
- Append:

```ts
describe('avatar schemas', () => {
  const owner = '9b2c8f43-1b1a-4f7e-9d3c-2a6c1e5b8d90';
  const file = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

  it('accepts a path in a user folder, webp or jpg', () => {
    expect(AvatarPathSchema.safeParse(`${owner}/${file}.webp`).success).toBe(true);
    expect(AvatarPathSchema.safeParse(`${owner}/${file}.jpg`).success).toBe(true);
  });

  it('rejects a URL, another extension, a nested, uppercase, or folderless path', () => {
    for (const path of [
      `https://evil.example/${owner}/${file}.jpg`,
      `${owner}/${file}.png`,
      `${owner}/nested/${file}.jpg`,
      `${owner.toUpperCase()}/${file}.jpg`,
      `${file}.jpg`,
    ]) {
      expect(AvatarPathSchema.safeParse(path).success).toBe(false);
    }
  });

  it("builds the public URL from the client's own Supabase URL", () => {
    expect(avatarPublicUrl('http://127.0.0.1:55321/', `${owner}/${file}.webp`)).toBe(
      `http://127.0.0.1:55321/storage/v1/object/public/avatars/${owner}/${file}.webp`,
    );
  });

  it('the profile update cannot set an avatar: the keys are dropped', () => {
    expect(
      UpdateProfileInputSchema.parse({
        display_name: 'Sam',
        avatar_path: `${owner}/${file}.jpg`,
        avatar_url: 'https://evil.example/a.jpg',
      }),
    ).toEqual({ display_name: 'Sam' });
  });

  it('the upload takes a file up to the cap and refuses an empty, oversized, or non-file one', () => {
    const sized = (bytes: number) =>
      new File([new Uint8Array(bytes)], 'avatar.jpg', { type: 'image/jpeg' });
    expect(AvatarUploadInputSchema.safeParse({ file: sized(1024) }).success).toBe(true);
    expect(AvatarUploadInputSchema.safeParse({ file: sized(AVATAR_MAX_BYTES) }).success).toBe(true);
    expect(AvatarUploadInputSchema.safeParse({ file: sized(0) }).success).toBe(false);
    expect(AvatarUploadInputSchema.safeParse({ file: sized(AVATAR_MAX_BYTES + 1) }).success).toBe(
      false,
    );
    expect(
      AvatarUploadInputSchema.safeParse({ file: 'data:image/jpeg;base64,AAAA' }).success,
    ).toBe(false);
  });
});

describe('UpdateMyTagInputSchema', () => {
  it('accepts a destination-only or a status-only patch', () => {
    expect(
      UpdateMyTagInputSchema.safeParse({ uid: '04A3B2C1D05E80', destination: { type: 'profile' } })
        .success,
    ).toBe(true);
    expect(
      UpdateMyTagInputSchema.safeParse({ uid: '04A3B2C1D05E80', status: 'disabled' }).success,
    ).toBe(true);
  });

  it('rejects an empty patch and an owner releasing the tag', () => {
    expect(UpdateMyTagInputSchema.safeParse({ uid: '04A3B2C1D05E80' }).success).toBe(false);
    expect(
      UpdateMyTagInputSchema.safeParse({ uid: '04A3B2C1D05E80', status: 'unclaimed' }).success,
    ).toBe(false);
  });
});
```

**Step 5:** `packages/nfc-sdk/src/client.ts`: replace `PublicProfileCard`:

```ts
/** The public card a resolved tag exposes. */
export interface PublicProfileCard {
  id: string;
  display_name: string;
  /**
   * `<user-id>/<uuid>.(webp|jpg)` in the public `avatars` bucket, or null.
   * A path, never a URL: build it from your Supabase URL as
   * `${supabaseUrl}/storage/v1/object/public/avatars/${avatar_path}`.
   */
  avatar_path: string | null;
  bio: string | null;
}
```

**Verify:**

```bash
cd packages/contract && bun test && bun run typecheck; cd ../..
bun run --cwd packages/nfc-sdk typecheck && bun run --cwd packages/nfc-sdk test
bun run lint
```

**Expected:**
- Contract: `31 pass`, typecheck clean.
- nfc-sdk: typecheck clean (the parity check) and its tests pass.
- Lint is clean.
- `apps/web`, `apps/mobile` and `apps/api` typechecks are now red on `avatar_url`; the expected windows are stated in the ground rules.

**Commit**

```bash
git add packages/contract packages/nfc-sdk/src/client.ts
git commit -m "Contract: avatar_path, the photo and account endpoints, my-tag status

The card carries a path in the avatars bucket, never a URL: every client
builds the URL from its own Supabase URL (avatarPublicUrl), so an off-origin
avatar is unrepresentable. app.profile gains uploadAvatar (a File; the API
sniffs the bytes), removeAvatar, and deleteAccount; the profile update can
no longer touch the avatar. app.tags.update takes an optional status
(claimed | disabled) alongside the destination. The SDK mirror follows the
public card; the parity test enforces it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Web follows the rename

**Files:**
- Create: `apps/web/src/lib/avatar.ts`
- Modify: `apps/web/src/components/ProfileCard.tsx`, `apps/web/src/routes/_app.profile.tsx`

**Step 1:** Create `apps/web/src/lib/avatar.ts`:

```ts
import { avatarPublicUrl } from '@withme/contract';

/**
 * An avatar's URL, built from THIS client's configured Supabase URL: the
 * database stores only the path, so no stored value can point off-origin.
 * Null (the initial) rather than a throw when the env is missing: the
 * resolver renders cards and must stay unbreakable.
 */
export function avatarSrc(path: string | null): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return path && base ? avatarPublicUrl(base, path) : null;
}
```

**Step 2:** `apps/web/src/components/ProfileCard.tsx`: change the React import to `import { useState, type ReactNode } from 'react';` and add `import { avatarSrc } from '../lib/avatar.ts';`. Then:
- change `CardProfile.avatar_url` to `avatar_path: string | null;`;
- in `Avatar`, replace everything from the signature through the end of the `if (profile.avatar_url) { … }` block with (the initial fallback below it is unchanged):

```tsx
export function Avatar({ profile, size }: { profile: CardProfile; size?: 'row' }) {
  const src = avatarSrc(profile.avatar_path);
  // A photo that fails to load (deleted, storage down) falls back to the
  // initial; keyed by URL, so a new photo gets its own attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && src !== failedSrc) {
    return (
      <img
        className="avatar"
        src={src}
        alt=""
        // the storage host must not learn which tag page the viewer is on
        referrerPolicy="no-referrer"
        width={size === 'row' ? 44 : 76}
        height={size === 'row' ? 44 : 76}
        onError={() => setFailedSrc(src)}
      />
    );
  }
```

**Step 3:** `apps/web/src/routes/_app.profile.tsx`:
- delete the `avatarUrl` state line;
- delete the `avatar_url: …` line in the `api.app.profile.update` call;
- delete the whole `<div className="field">` block for `avatar_url` (label "Avatar URL").

**Verify:** `bun run --cwd apps/web typecheck && bun run lint` are clean.

**Commit**

```bash
git add apps/web/src
git commit -m "Web: cards read avatar_path and build the URL from VITE_SUPABASE_URL

The free-form Avatar URL field goes; the upload arrives with the Profile
work.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Mobile follows the rename

**Files:**
- Create: `apps/mobile/lib/avatar.ts`
- Modify: `apps/mobile/components/ui.tsx`, `apps/mobile/app/(tabs)/connections.tsx`, `apps/mobile/app/gathering/[id].tsx`, `apps/mobile/app/t/[uid].tsx`, `apps/mobile/app/(tabs)/profile.tsx`

**Step 1:** Create `apps/mobile/lib/avatar.ts`:

```ts
import { avatarPublicUrl } from '@withme/contract';

// Static access, so Expo inlines it at bundle time.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

/**
 * An avatar's URL from THIS app's configured Supabase URL; the database
 * stores only the path. Null (the initial) when unset, never a throw.
 */
export function avatarSrc(path: string | null): string | null {
  return path && supabaseUrl ? avatarPublicUrl(supabaseUrl, path) : null;
}
```

**Step 2:** `apps/mobile/components/ui.tsx`: add `useState` to the React import and add `import { avatarSrc } from '../lib/avatar';`. Replace `Avatar`'s signature and the image branch with:

```tsx
export function Avatar({
  name,
  path,
  size = 76,
}: {
  name: string;
  path: string | null;
  size?: number;
}) {
  const t = useTokens();
  const url = avatarSrc(path);
  // A photo that fails to load (deleted, storage down) falls back to the
  // initial, as on web; keyed by URL, so a new photo gets its own attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && url !== failedUrl) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.avatar, { width: size, height: size, borderColor: t.border }]}
        onError={() => setFailedUrl(url)}
      />
    );
  }
```

(The fallback branch is unchanged.)

**Step 3:** Call sites:
- `(tabs)/connections.tsx`:
  - Replace the hand-written `BlockRow` interface with `type BlockRow = Awaited<ReturnType<Api['app']['blocks']['list']>>['blocks'][number];`.
  - Import `type Api` from `'../../lib/api'`.
  - `url={profile.avatar_url}` becomes `path={profile.avatar_path}`.
- `gathering/[id].tsx`: `url={member.profile.avatar_url}` becomes `path={member.profile.avatar_path}`.
- `t/[uid].tsx`: both `url={result.profile.avatar_url}` become `path={result.profile.avatar_path}`.
- `(tabs)/profile.tsx`:
  - delete the `avatarUrl` state, the `setAvatarUrl(profile.avatar_url ?? '')` line, the `avatar_url:` line in `update`, and the `Field label="Avatar URL"` block;
  - change the save error to `'Could not save. Check the fields and try again.'`.

**Verify:** `bun run --cwd apps/mobile typecheck && bun run lint` are clean.

**Commit**

```bash
git add apps/mobile
git commit -m "Mobile: Avatar takes a path and builds the URL from EXPO_PUBLIC_SUPABASE_URL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Enable storage locally

**Files:** Modify `supabase/config.toml`.

**Step 1:** Replace

```toml
[storage]
enabled = false
```

with

```toml
# Avatars live in Storage. The `avatars` bucket and its policies come from
# supabase/migrations/20261011120000_avatars.sql (so a hosted project gets
# them from `supabase db push`), not from a [storage.buckets] entry here.
# Image transformation stays off: clients resize to 512px themselves, and
# imgproxy would be one more container for nothing.
[storage]
enabled = true

[storage.image_transformation]
enabled = false
```

**Step 2:**

```bash
bun run db:stop && bun run db:start
bun run db:reset && bun run db:seed
docker ps --format '{{.Names}}' | grep -E 'storage|imgproxy'
cd packages/db && bun -e "import { admin } from './src/test-utils/index.ts'; console.log(JSON.stringify(await admin.storage.listBuckets()))"; cd ../..
bun run test
docker system df
```

**Expected:**
- `supabase_storage_withme-starter` is listed; no imgproxy container.
- `listBuckets` prints `{"data":[],"error":null}`.
- `bun run test`: db `57 pass`, contract `31 pass`.
- `docker system df` grew by the storage-api image (roughly 0.2 GB).

**Commit**

```bash
git add supabase/config.toml
git commit -m "Enable Supabase Storage locally for avatars; keep imgproxy off

CI needs no workflow change: ci.yml's supabase start -x studio,mailpit now
also starts storage-api (one image pull). The bucket comes from a migration
so hosted projects get it through db push.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: RLS and storage tests, red

**Files:**
- Modify: `packages/db/src/test-utils/index.ts`, `packages/db/test/tags.test.ts`
- Create: `packages/db/test/avatars.test.ts`, `packages/db/test/account.test.ts`

**Step 1:** In `packages/db/src/test-utils/index.ts`, change `const SUPABASE_URL` to `export const SUPABASE_URL` (the storage tests fetch public URLs).

**Step 2:** Append to `packages/db/test/tags.test.ts`. These are pins: the policies they assert already exist (`tags_select_own`, `tags_update_own`, the `(destination, status)` grant, `tags_state_consistent`), and `app.tags.listMine` / `update` rest on them. They are green on arrival.

```ts
describe('my tags (what app.tags.listMine and app.tags.update rest on)', () => {
  it('the owner lists every tag they claimed, disabled ones included; a stranger and anon list none', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const live = await provisionTag();
    const off = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: live });
    await alice.client.rpc('claim_tag', { p_uid: off });
    await alice.client.from('tags').update({ status: 'disabled' }).eq('uid', off);

    const { data: mine } = await alice.client.from('tags').select('uid, status').in('uid', [live, off]);
    expect(new Map(mine?.map((tag) => [tag.uid, tag.status]))).toEqual(
      new Map([
        [live, 'claimed'],
        [off, 'disabled'],
      ]),
    );
    expect((await bob.client.from('tags').select('uid').in('uid', [live, off])).data ?? []).toEqual([]);
    expect((await anonClient().from('tags').select('uid').in('uid', [live, off])).data ?? []).toEqual(
      [],
    );
  });

  it('the owner re-points and switches a tag off in one update; a stranger matches zero rows', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    const { data: hijack } = await bob.client
      .from('tags')
      .update({ status: 'disabled' })
      .eq('uid', uid)
      .select('uid');
    expect(hijack ?? []).toEqual([]);

    const { data, error } = await alice.client
      .from('tags')
      .update({ destination: { type: 'profile' }, status: 'disabled' })
      .eq('uid', uid)
      .select('uid, status, destination')
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ uid, status: 'disabled', destination: { type: 'profile' } });
  });

  it('an owner cannot release a tag by setting it unclaimed', async () => {
    const alice = await createTestUser('Alice');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });

    const { error } = await alice.client.from('tags').update({ status: 'unclaimed' }).eq('uid', uid);
    expect(error?.message).toContain('tags_state_consistent');
    const { data } = await admin.from('tags').select('status, claimed_by').eq('uid', uid).single();
    expect(data).toEqual({ status: 'claimed', claimed_by: alice.id });
  });
});
```

**Step 3:** Create `packages/db/test/avatars.test.ts`. Every negative case carries a positive control, so no test can pass red by accident:

```ts
// Avatars: a public bucket you can read by path but never list, writes only
// inside your own folder, objects immutable, and a profile column that holds
// a path — never a URL. Storage calls go through each user's own JWT client;
// nothing here uses the service role.
import { beforeAll, describe, expect, it } from 'bun:test';
import type { Db } from '../src/index.ts';
import {
  SUPABASE_URL,
  anonClient,
  assertStackRunning,
  createTestUser,
  pendingRequestId,
  provisionTag,
} from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

// Leading bytes only: Storage never decodes an image. These sniff as JPEG / WebP.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

const pathFor = (owner: string, ext: 'jpg' | 'webp' = 'jpg') =>
  `${owner}/${crypto.randomUUID()}.${ext}`;

const publicUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;

function upload(
  client: Db,
  path: string,
  body: Uint8Array = JPEG,
  contentType = 'image/jpeg',
  upsert = false,
) {
  return client.storage.from('avatars').upload(path, body, { contentType, upsert });
}

describe('the avatars bucket', () => {
  it('the owner uploads into their own folder, and anyone reads it by path', async () => {
    const alice = await createTestUser('Alice');
    const path = pathFor(alice.id);
    const { error } = await upload(alice.client, path);
    expect(error).toBeNull();

    const res = await fetch(publicUrl(path)); // no credentials at all
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
  });

  it("a user cannot write into another user's folder", async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    expect((await upload(alice.client, pathFor(alice.id))).error).toBeNull();

    const { error } = await upload(bob.client, pathFor(alice.id));
    expect(error).not.toBeNull();
  });

  it("a user cannot delete or replace another user's avatar, and nobody overwrites in place", async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const path = pathFor(alice.id);
    expect((await upload(alice.client, path)).error).toBeNull();

    await bob.client.storage.from('avatars').remove([path]); // RLS matches nothing
    expect((await upload(bob.client, path, WEBP, 'image/webp', true)).error).not.toBeNull();
    // not even the owner: replacing a photo is a new path (no update policy)
    expect((await upload(alice.client, path, WEBP, 'image/webp', true)).error).not.toBeNull();

    const res = await fetch(publicUrl(path));
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
  });

  it('anon can neither upload nor list, and nobody lists a folder but its owner', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const path = pathFor(alice.id);
    expect((await upload(alice.client, path)).error).toBeNull();

    // the owner sees her own folder (account deletion empties it through this)
    const { data: own } = await alice.client.storage.from('avatars').list(alice.id);
    expect(own?.map((entry) => `${alice.id}/${entry.name}`)).toEqual([path]);

    // a listable bucket would be a directory of everyone with a photo
    expect((await bob.client.storage.from('avatars').list(alice.id)).data ?? []).toEqual([]);
    expect((await bob.client.storage.from('avatars').list()).data ?? []).toEqual([]);
    const anon = anonClient();
    expect((await anon.storage.from('avatars').list(alice.id)).data ?? []).toEqual([]);
    expect((await upload(anon, pathFor(alice.id))).error).not.toBeNull();
  });

  it('names must be <own-uid>/<uuid>.(webp|jpg)', async () => {
    const alice = await createTestUser('Alice');
    expect(
      (await upload(alice.client, pathFor(alice.id, 'webp'), WEBP, 'image/webp')).error,
    ).toBeNull();

    for (const path of [
      `${alice.id}/avatar.jpg`, // not a uuid name
      `${alice.id}/${crypto.randomUUID()}.png`, // off-extension
      `${alice.id}/nested/${crypto.randomUUID()}.jpg`, // off-folder depth
      `${alice.id.toUpperCase()}/${crypto.randomUUID()}.jpg`, // not the canonical id
    ]) {
      expect((await upload(alice.client, path)).error).not.toBeNull();
    }
  });

  it('the bucket refuses anything but a JPEG or WebP up to 1 MiB', async () => {
    const alice = await createTestUser('Alice');
    expect((await upload(alice.client, pathFor(alice.id))).error).toBeNull();

    // never HTML or SVG on the project's origin
    expect((await upload(alice.client, pathFor(alice.id), JPEG, 'text/html')).error).not.toBeNull();
    expect(
      (await upload(alice.client, pathFor(alice.id), JPEG, 'image/svg+xml')).error,
    ).not.toBeNull();
    const oversized = new Uint8Array(1_048_577);
    oversized.set(JPEG);
    expect((await upload(alice.client, pathFor(alice.id), oversized)).error).not.toBeNull();
  });
});

describe('profiles.avatar_path', () => {
  it("holds a path in the profile's own folder, never a URL or another folder", async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const { error: ok } = await alice.client
      .from('profiles')
      .update({ avatar_path: pathFor(alice.id, 'webp') })
      .eq('id', alice.id);
    expect(ok).toBeNull();

    for (const avatar_path of [
      pathFor(bob.id),
      'https://evil.example/a.jpg',
      `${alice.id}/${crypto.randomUUID()}.png`,
      `${alice.id}/../${bob.id}/${crypto.randomUUID()}.jpg`,
    ]) {
      const { error } = await alice.client.from('profiles').update({ avatar_path }).eq('id', alice.id);
      expect(error?.message).toContain('profiles_avatar_path_shape');
    }
  });

  it('the card carries avatar_path, never a URL, wherever it crosses a boundary', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const path = pathFor(alice.id);
    const { error } = await alice.client
      .from('profiles')
      .update({ avatar_path: path })
      .eq('id', alice.id);
    expect(error).toBeNull();

    // the anonymous resolve
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });
    const { data } = await anonClient().rpc('resolve_tag', { p_uid: uid });
    const card = (data as { profile: Record<string, unknown> }).profile;
    expect(card.avatar_path).toBe(path);
    expect('avatar_url' in card).toBe(false);

    // the accepted connection's card
    await alice.client.rpc('send_connect_request', { p_recipient: bob.id });
    const requestId = await pendingRequestId(alice, bob);
    const { data: accepted } = await bob.client.rpc('accept_connect_request', {
      p_request_id: requestId,
    });
    expect((accepted as { profile: { avatar_path: string | null } }).profile.avatar_path).toBe(path);
  });
});
```

**Step 4:** Create `packages/db/test/account.test.ts`:

```ts
// delete_my_account(): the account holder deletes their own account, and the
// cascade the initial schema promised runs from that one call. (cascade.test.ts
// keeps pinning the same cascade driven by the auth admin API.)
import { beforeAll, describe, expect, it } from 'bun:test';
import {
  admin,
  anonClient,
  assertStackRunning,
  connectUsers,
  createTestUser,
  provisionTag,
} from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

describe('delete_my_account', () => {
  it('removes the caller and cascades: connections, requests, blocks gone; tags reset; scans erased', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    const dave = await createTestUser('Dave');
    const uid = await provisionTag();
    await alice.client.rpc('claim_tag', { p_uid: uid });
    await anonClient().rpc('log_scan', { p_uid: uid, p_user_agent: 'delete-test' });
    await connectUsers(alice, bob);
    await alice.client.rpc('send_connect_request', { p_recipient: carol.id });
    await alice.client.from('blocks').insert({ blocker_id: alice.id, blocked_id: dave.id });

    const { error } = await alice.client.rpc('delete_my_account');
    expect(error).toBeNull();

    // Her JWT stays valid until it expires; Storage must still refuse it.
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const uploadAs = (user: typeof alice) =>
      user.client.storage
        .from('avatars')
        .upload(`${user.id}/${crypto.randomUUID()}.jpg`, photo, { contentType: 'image/jpeg' });
    expect((await uploadAs(bob)).error).toBeNull(); // control: a live account can
    expect((await uploadAs(alice)).error).not.toBeNull();

    const { data: auth } = await admin.auth.admin.getUserById(alice.id);
    expect(auth.user).toBeNull();
    expect((await admin.from('profiles').select('id').eq('id', alice.id)).data ?? []).toEqual([]);
    expect((await bob.client.from('connections').select('*')).data ?? []).toEqual([]);
    expect((await carol.client.from('connect_requests').select('*')).data ?? []).toEqual([]);
    expect((await admin.from('blocks').select('*').eq('blocker_id', alice.id)).data ?? []).toEqual(
      [],
    );
    const { data: tag } = await admin
      .from('tags')
      .select('status, claimed_by, destination')
      .eq('uid', uid)
      .single();
    expect(tag).toEqual({ status: 'unclaimed', claimed_by: null, destination: null });
    expect((await admin.from('tag_scans').select('*').eq('tag_uid', uid)).data ?? []).toEqual([]);
    expect((await bob.client.rpc('claim_tag', { p_uid: uid })).error).toBeNull();
  });

  it('the gatherings you host go with you, and you leave the ones you joined', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    const hosted = (
      await alice.client.rpc('create_gathering', { p_title: 'Alice hosts', p_starts_at: tomorrow() })
    ).data as { id: string };
    await bob.client.rpc('join_gathering', { p_gathering_id: hosted.id });
    const joined = (
      await carol.client.rpc('create_gathering', { p_title: 'Carol hosts', p_starts_at: tomorrow() })
    ).data as { id: string };
    await alice.client.rpc('join_gathering', { p_gathering_id: joined.id });

    expect((await alice.client.rpc('delete_my_account')).error).toBeNull();

    expect((await admin.from('gatherings').select('id').eq('id', hosted.id)).data ?? []).toEqual([]);
    expect(
      (await admin.from('gathering_members').select('profile_id').eq('gathering_id', hosted.id))
        .data ?? [],
    ).toEqual([]);
    const { data: left } = await admin
      .from('gathering_members')
      .select('profile_id')
      .eq('gathering_id', joined.id);
    expect(left?.map((member) => member.profile_id)).toEqual([carol.id]);
  });

  it('deletes only the caller', async () => {
    const alice = await createTestUser('Alice');
    const bob = await createTestUser('Bob');
    const carol = await createTestUser('Carol');
    await connectUsers(alice, bob);
    await connectUsers(bob, carol);

    expect((await alice.client.rpc('delete_my_account')).error).toBeNull();

    expect((await admin.auth.admin.getUserById(bob.id)).data.user?.id).toBe(bob.id);
    expect((await admin.from('profiles').select('id').in('id', [bob.id, carol.id])).data).toHaveLength(
      2,
    );
    const { data: remaining } = await bob.client.from('connections').select('user_a, user_b');
    expect(remaining).toHaveLength(1); // bob and carol, untouched
  });

  it('anon cannot call it', async () => {
    const alice = await createTestUser('Alice');
    const { error } = await anonClient().rpc('delete_my_account');
    expect(error?.code).toBe('42501');
    expect((await admin.auth.admin.getUserById(alice.id)).data.user?.id).toBe(alice.id);
  });
});
```

**Verify red:**

```bash
cd packages/db && bun test test/tags.test.ts; bun test test/avatars.test.ts test/account.test.ts; cd ../..
bun run lint
```

**Expected:**
- `tags.test.ts`: `15 pass` (12 existing plus 3 pins).
- `avatars.test.ts` + `account.test.ts`: `12 fail`, with these exact failures:
  - the six bucket tests fail on `expect(error).toBeNull()` with a StorageApiError, message `Bucket not found`;
  - the two `profiles.avatar_path` tests fail on the first update with `Could not find the 'avatar_path' column of 'profiles' in the schema cache`;
  - the four account tests fail with PostgREST `PGRST202` `Could not find the function public.delete_my_account without parameters in the schema cache` (the anon test sees code `PGRST202`, not `42501`).
- Lint is clean.
- `bun run --cwd packages/db typecheck` is red on `avatar_path` and `delete_my_account`, as expected until Task 7.

**Commit**

```bash
git add packages/db/src/test-utils/index.ts packages/db/test
git commit -m "Add the avatars, account-deletion, and my-tags RLS tests (avatars and deletion red)

Avatars: public read by path, no listing for anyone but the owner, writes
only in your own folder, names shaped <uid>/<uuid>.(webp|jpg), no
overwrites, jpeg/webp up to 1 MiB, and avatar_path bound to the profile's
own folder — every negative case behind a positive control. Deletion:
delete_my_account cascades through connections, requests, blocks, tags,
scans, and gatherings, deletes only the caller, refuses anon, and leaves
the deleted user's still-valid token unable to upload. My tags: three
pins on the existing owner policies the new endpoints rest on (green).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Migration `avatars.sql`, card queries, regenerated types

**Files:**
- Create: `supabase/migrations/20261011120000_avatars.sql`
- Modify: `packages/db/src/queries/handshake.ts`, `packages/db/src/types/supabase.ts` (generated)

**Step 1:** Create the migration. `resolve_tag` is restated byte for byte from `20261008120000_add_gatherings.sql`, and `accept_connect_request` from the initial schema. In each, the only change is `'avatar_url', v_profile.avatar_url` becoming `'avatar_path', v_profile.avatar_path`.

```sql
-- Avatars: an uploaded photo replaces the free-form avatar URL.
--
-- Files live in the public `avatars` bucket, one folder per user:
-- `<user-uuid>/<uuid>.(webp|jpg)`. profiles.avatar_path stores that path,
-- never a URL, so an off-origin avatar is unrepresentable and every client
-- builds the URL from its own configured Supabase URL.
--
-- Safety semantics:
--   * Public read means a public bucket: a file is served to anyone holding
--     its path. It does NOT mean listing. There is no select policy for anon
--     or for other users, so the bucket cannot be walked to learn who has an
--     account (no enumeration).
--   * Writes are per-user: insert and delete only inside your own folder, and
--     only names of the exact shape. Inserting also needs a live profile. No
--     update policy: an object is immutable, and replacing a photo is a new
--     path (the API deletes the old).
--   * The bucket refuses anything but JPEG or WebP up to 1 MiB, so it can
--     never host HTML or SVG on the project's origin.
--   * storage.objects is Supabase's table and has no tenant_id. The tenant
--     seam stays on profiles; private.is_avatar_path is the one place a
--     tenant prefix would go.
-- Re-stated by packages/db/test/avatars.test.ts.

-- ================================================================== helper ==

-- The one definition of the shape, shared by the profiles CHECK and the
-- storage insert policy. Immutable, so the CHECK may call it.
create function private.is_avatar_path(p_path text, p_owner uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_path ~ (
      '^' || p_owner::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
    ),
    false
  )
$$;

grant execute on function private.is_avatar_path(text, uuid) to authenticated, service_role;

-- ================================================================ profiles ==

alter table public.profiles
  add column avatar_path text
  constraint profiles_avatar_path_shape
    check (avatar_path is null or private.is_avatar_path(avatar_path, id));

-- The free-form URL goes. Its values cannot become paths (they point
-- anywhere), so they are dropped with the column.
alter table public.profiles drop column avatar_url;

-- ================================================================== bucket ==

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/webp']);

-- ======================================================== storage policies ==

create policy avatars_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_avatar_path(name, (select auth.uid()))
    -- a deleted user's JWT stays valid until it expires: no profile, no upload
    and exists (select 1 from public.profiles where id = (select auth.uid()))
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ============================================================ card emitters ==

-- Both functions build the public card from the profile row; they are
-- replaced in place (every attribute restated) to emit avatar_path. Grants
-- survive create or replace.
create or replace function public.resolve_tag(p_uid text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid text := upper(trim(p_uid));
  v_tag public.tags%rowtype;
  v_profile public.profiles%rowtype;
  v_gathering public.gatherings%rowtype;
  v_destination jsonb;
  v_gathering_json jsonb := null;
begin
  select * into v_tag
    from public.tags
   where uid = v_uid and tenant_id = private.current_tenant_id();

  if not found or v_tag.status = 'unclaimed' then
    return jsonb_build_object('status', 'unclaimed', 'uid', v_uid);
  end if;

  if v_tag.status = 'disabled'
     or private.is_blocked((select auth.uid()), v_tag.claimed_by) then
    return jsonb_build_object('status', 'disabled', 'uid', v_uid);
  end if;

  select * into v_profile from public.profiles where id = v_tag.claimed_by;
  if not found then
    return jsonb_build_object('status', 'unclaimed', 'uid', v_uid);
  end if;

  v_destination := v_tag.destination;
  if v_destination->>'type' = 'gathering' then
    select * into v_gathering
      from public.gatherings
     where id = (v_destination->>'gathering_id')::uuid
       and tenant_id = private.current_tenant_id();
    if found
       and private.is_gathering_member(v_gathering.id, v_tag.claimed_by)
       and not private.is_blocked((select auth.uid()), v_gathering.host_id) then
      v_gathering_json := jsonb_build_object(
        'id', v_gathering.id,
        'title', v_gathering.title,
        'starts_at', v_gathering.starts_at,
        'location', v_gathering.location
      );
    else
      v_destination := '{"type": "profile"}'::jsonb;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'claimed',
    'uid', v_uid,
    'destination', v_destination,
    'gathering', v_gathering_json,
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'avatar_path', v_profile.avatar_path,
      'bio', v_profile.bio
    )
  );
end
$$;

create or replace function public.accept_connect_request(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_requester uuid;
  v_req public.connect_requests%rowtype;
  v_conn public.connections%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Take the pair lock BEFORE the row lock (same order as send/block) so a
  -- block landing concurrently cannot interleave with this accept.
  select requester_id into v_requester
    from public.connect_requests
   where id = p_request_id and recipient_id = v_user and status = 'pending';
  if not found then
    raise exception 'request not found' using errcode = 'P0003';
  end if;
  perform private.lock_pair(v_user, v_requester);

  select * into v_req
    from public.connect_requests
   where id = p_request_id and recipient_id = v_user and status = 'pending'
   for update;
  if not found
     or private.is_blocked(v_user, v_req.requester_id)
     or private.is_blocked(v_req.requester_id, v_user) then
    -- deleted or blocked while we waited: identical to never-existed
    raise exception 'request not found' using errcode = 'P0003';
  end if;

  if v_req.expires_at <= now() then
    update public.connect_requests set status = 'expired' where id = p_request_id;
    raise exception 'request expired' using errcode = 'P0005';
  end if;

  update public.connect_requests set status = 'accepted' where id = p_request_id;

  insert into public.connections (tenant_id, user_a, user_b)
  values (
    v_req.tenant_id,
    least(v_user, v_req.requester_id),
    greatest(v_user, v_req.requester_id)
  )
  on conflict (user_a, user_b) do update set user_a = excluded.user_a
  returning * into v_conn;

  select * into v_profile from public.profiles where id = v_req.requester_id;

  return jsonb_build_object(
    'id', v_conn.id,
    'created_at', v_conn.created_at,
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'avatar_path', v_profile.avatar_path,
      'bio', v_profile.bio
    )
  );
end
$$;
```

**Step 2:** `packages/db/src/queries/handshake.ts`:
- `CARD_COLUMNS` becomes `'id, display_name, avatar_path, bio'`.
- `ProfileCard.avatar_url` becomes `avatar_path: string | null;`.
- `upsertOwnProfile`'s `patch` type becomes `{ display_name?: string; bio?: string | null }`.
- In its insert, delete the `avatar_url: patch.avatar_url ?? null,` line.

**Step 3:**

```bash
bun run db:reset              # ends: Finished supabase db reset
bun run db:types
git diff --stat packages/db/src/types/supabase.ts   # profiles: avatar_path in, avatar_url out
bun run db:seed
cd packages/db && bun test test/avatars.test.ts test/tags.test.ts; bun test test/account.test.ts; cd ../..
bun run --cwd supabase/seed typecheck && bun run lint
```

**Expected:**
- avatars + tags: `23 pass` (8 + 15).
- account: still `4 fail` (`PGRST202`).
- The seed prints its usual summary; seed typecheck and lint are clean.
- `bun run --cwd packages/db typecheck` errors only in `test/account.test.ts` (unknown `delete_my_account`). The rest of `packages/db` and the seed compile against the new types.
- On the first green run, tighten the MIME and size refusal assertions in `avatars.test.ts` to the exact `statusCode`/message storage-api returns, and re-run.

**Commit**

```bash
git add supabase/migrations/20261011120000_avatars.sql packages/db/src/queries/handshake.ts packages/db/src/types/supabase.ts packages/db/test/avatars.test.ts
git commit -m "Add avatars: a public, unlistable bucket and a path-shaped avatar_path

private.is_avatar_path is the one shape (<owner>/<uuid>.(webp|jpg)), used by
the profiles CHECK — which binds the folder to the row's own id — and by the
storage insert policy, which also needs a live profile (a deleted user's
token outlives the account). Select and delete only in your own folder, no update
policy (objects are immutable), no select for anyone else (a listable
bucket is a directory). The bucket takes JPEG or WebP up to 1 MiB.
avatar_url is dropped; resolve_tag and accept_connect_request are replaced
in place to emit avatar_path. Regenerated types committed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Migration `delete_my_account.sql`

**Files:**
- Create: `supabase/migrations/20261011130000_delete_my_account.sql`
- Modify: `packages/db/src/types/supabase.ts` (generated)

**Step 1:**

```sql
-- Account deletion, by the account holder.
--
-- Deleting the auth.users row is the whole act. profiles cascades from it,
-- and from the profile everything else follows: connections, requests,
-- blocks, hosted gatherings and memberships by FK; claimed tags reset to
-- unclaimed and their scans erased by private.on_profile_deleted. The
-- rate-limit ledger has no FK, so its rows go here too.
-- No test pins that delete: test-utils has no SQL path into `private`.
--
-- Avatar files are NOT touched here: the API removes them through the
-- Storage API, with the caller's own JWT, before calling this (a SQL delete
-- on storage.objects would orphan the stored blobs).
-- Re-stated by packages/db/test/account.test.ts.
create function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from private.connect_request_attempts where requester_id = v_user;
  delete from auth.users where id = v_user;
end
$$;

-- Supabase's default privileges grant anon EXECUTE on new public functions,
-- so revoking from PUBLIC alone would leave anon able to call this.
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
```

**Step 2:**

```bash
bun run db:reset && bun run db:types && bun run db:seed
cd packages/db && bun test; cd ../..
bun run --cwd packages/db typecheck && bun run lint
```

**Expected:**
- The db suite prints `72 pass, 0 fail`.
- `packages/db` typecheck is clean (the red window closes).
- The types diff adds `delete_my_account: { Args: never; Returns: undefined }`.

**Stop condition:** if the account tests fail because `delete from auth.users` inside the definer function errors with `permission denied for table users`, stop and report. Do not fall back to the service role or the auth admin API: that breaks the scope guard (no service-role key in `apps/*`) and needs Alex's call.

**Commit**

```bash
git add supabase/migrations/20261011130000_delete_my_account.sql packages/db/src/types/supabase.ts
git commit -m "Add delete_my_account(): the account holder ends their account

A definer function that clears the caller's rate-limit ledger rows and
deletes their auth.users row; the existing cascades and the tag-reset
trigger do the rest. Executable by authenticated only (anon revoked
explicitly: Supabase's default privileges would otherwise grant it).
Avatar files are the API's job, through the Storage API, before this runs.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Queries: avatar storage and owner tag updates

**Files:**
- Create: `packages/db/src/queries/avatars.ts`
- Modify: `packages/db/src/queries/tags.ts`, `packages/db/src/queries/index.ts`

**Step 1:** `avatars.ts`:

```ts
import type { Db, Tables } from '../index.ts';

/** Same name as the contract's AVATARS_BUCKET (this package does not depend on the contract). */
const BUCKET = 'avatars';

/**
 * Every call here goes through `db`, the caller's own JWT client: Storage
 * RLS (per-user folders) is the boundary, never a service key.
 */
export async function uploadAvatarObject(
  db: Db,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
    // an hour bounds how long a removed photo can still be served from a CDN
    cacheControl: '3600',
  });
  if (error) throw error;
}

/** Deleting a path you do not own matches nothing (RLS), silently. */
export async function removeAvatarObjects(db: Db, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await db.storage.from(BUCKET).remove(paths);
  if (error) throw error;
}

/** Up to 100 paths in the caller's own folder (the only folder they can list). */
export async function listOwnAvatarObjects(db: Db, userId: string): Promise<string[]> {
  const { data, error } = await db.storage.from(BUCKET).list(userId, { limit: 100 });
  if (error) throw error;
  return (data ?? []).map((entry) => `${userId}/${entry.name}`);
}

/** The CHECK rejects any path outside the caller's own folder. */
export async function setOwnAvatarPath(
  db: Db,
  userId: string,
  path: string | null,
): Promise<Tables<'profiles'>> {
  const { data, error } = await db
    .from('profiles')
    .update({ avatar_path: path })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

**Step 2:** `tags.ts`: replace `updateOwnTagDestination` with:

```ts
/** What an owner may change on their tag: where it points, and off or on. */
export interface OwnTagPatch {
  destination?: Json;
  status?: 'claimed' | 'disabled';
}

/**
 * Re-point and/or switch one of the caller's tags. RLS + the (destination,
 * status) column grant make this owner-only; the shape and state CHECKs
 * validate what lands. A tag that is not yours matches zero rows and reads
 * as null.
 */
export async function updateOwnTag(
  db: Db,
  uid: string,
  patch: OwnTagPatch,
): Promise<OwnTagRow | null> {
  const update: OwnTagPatch = {};
  if (patch.destination !== undefined) update.destination = patch.destination;
  if (patch.status !== undefined) update.status = patch.status;
  const { data, error } = await db
    .from('tags')
    .update(update)
    .eq('uid', uid)
    .select(OWN_TAG_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data;
}
```

**Step 3:** `index.ts`: add `export * from './avatars.ts';`.

**Verify:** `bun run --cwd packages/db typecheck && bun run lint` are clean (`apps/api` is still red until Task 9).

**Commit**

```bash
git add packages/db/src/queries
git commit -m "Queries: avatar storage through the caller's client; owner tag updates take status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: API handlers

**Files:**
- Create: `apps/api/src/lib/avatar.ts`, `apps/api/src/middleware/upload-limit.ts`
- Modify: `apps/api/src/routers/app.ts`, `apps/api/src/index.ts`

**Step 1:** `apps/api/src/lib/avatar.ts`:

```ts
export interface AvatarKind {
  ext: 'jpg' | 'webp';
  contentType: 'image/jpeg' | 'image/webp';
}

/**
 * JPEG (FF D8 FF) or WebP (RIFF....WEBP), by magic number. The declared type
 * and the file name are the client's claim; these bytes are the fact, and
 * they decide the stored extension and Content-Type. Anything else — PNG,
 * SVG, HTML — is refused before it reaches Storage.
 */
export function sniffAvatar(bytes: Uint8Array): AvatarKind | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}
```

**Step 2:** `routers/app.ts`. Imports become:

```ts
import { ORPCError } from '@orpc/server';
import type { Connection, Gathering, Profile, Tag } from '@withme/contract';
import {
  blockUser,
  deleteGathering,
  getGathering,
  getOwnProfile,
  leaveGathering,
  listBlocks,
  listConnections,
  listGatheringMembers,
  listMyGatherings,
  listOwnAvatarObjects,
  listOwnTags,
  listPendingRequests,
  removeAvatarObjects,
  removeConnection,
  setOwnAvatarPath,
  unblockUser,
  updateGathering,
  updateOwnTag,
  uploadAvatarObject,
  upsertOwnProfile,
} from '@withme/db/queries';
import { sniffAvatar } from '../lib/avatar.ts';
import { throwFromDbError } from '../lib/errors.ts';
import { appProcedure, requireUser } from '../lib/orpc.ts';
import type { ApiContext } from '../lib/orpc.ts';
```

After `run()` add:

```ts
/**
 * Storage answers with HTTP statuses, not SQLSTATEs, so throwFromDbError
 * does not apply: log the status only, answer a fixed 500.
 */
async function storageCall<T>(context: ApiContext, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? String((error as { statusCode: unknown }).statusCode)
        : 'unknown';
    context.logger.error('storage call failed', { status });
    throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Internal error' });
  }
}

/** Best effort: a file the profile no longer points at is a stray, not a broken profile. */
async function removeQuietly(context: ApiContext, path: string): Promise<void> {
  try {
    await removeAvatarObjects(context.db, [path]);
  } catch {
    context.logger.warn('stale avatar not removed');
  }
}
```

After `updateProfile` add:

```ts
const profileUploadAvatar = appProcedure.profile.uploadAvatar.handler(async ({ input, context }) => {
  const userId = requireUser(context);
  const { file } = input;
  // z.file() already checked this at runtime. Under workers-types zod's File
  // type carries only size and type (File is a global class there, not a
  // globalThis property), so this guard is what types the bytes read.
  if (!(file instanceof Blob)) throw new ORPCError('BAD_REQUEST', { message: 'Unsupported image' });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffAvatar(bytes);
  if (!kind) throw new ORPCError('BAD_REQUEST', { message: 'Unsupported image' });

  const existing = await run(context, () => getOwnProfile(context.db, userId));
  if (!existing) throw new ORPCError('BAD_REQUEST', { message: 'Profile required' });

  // A fresh name every time: objects are immutable (no update policy).
  const path = `${userId}/${crypto.randomUUID()}.${kind.ext}`;
  await storageCall(context, () => uploadAvatarObject(context.db, path, bytes, kind.contentType));

  // Two systems, so no single RPC: compensate instead. A failed pointer
  // update removes the file it would have pointed at.
  let profile: Awaited<ReturnType<typeof setOwnAvatarPath>>;
  try {
    profile = await run(context, () => setOwnAvatarPath(context.db, userId, path));
  } catch (error) {
    await removeQuietly(context, path);
    throw error;
  }
  if (existing.avatar_path) await removeQuietly(context, existing.avatar_path);
  context.logger.info('avatar uploaded');
  return { profile: profile as Profile };
});

const profileRemoveAvatar = appProcedure.profile.removeAvatar.handler(async ({ context }) => {
  const userId = requireUser(context);
  const existing = await run(context, () => getOwnProfile(context.db, userId));
  if (!existing) throw new ORPCError('BAD_REQUEST', { message: 'Profile required' });
  const profile = await run(context, () => setOwnAvatarPath(context.db, userId, null));
  if (existing.avatar_path) await removeQuietly(context, existing.avatar_path);
  return { profile: profile as Profile };
});

const profileDeleteAccount = appProcedure.profile.deleteAccount.handler(async ({ context }) => {
  const userId = requireUser(context);
  // 1. Clear the pointer first, so a failure in a later step never leaves the
  //    card pointing at a file that is gone. No profile, nothing to clear.
  const existing = await run(context, () => getOwnProfile(context.db, userId));
  if (existing) await run(context, () => setOwnAvatarPath(context.db, userId, null));
  // 2. Sweep the files, through the Storage API and the caller's own JWT: a
  //    SQL delete on storage.objects would orphan the blobs. Paged and bounded.
  for (let page = 0; ; page++) {
    const paths = await storageCall(context, () => listOwnAvatarObjects(context.db, userId));
    if (paths.length === 0) break;
    if (page === 10) {
      context.logger.error('avatar folder did not empty');
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Internal error' });
    }
    await storageCall(context, () => removeAvatarObjects(context.db, paths));
  }
  // 3. Then the account itself; the cascades do the rest.
  const { error } = await context.db.rpc('delete_my_account');
  if (error) throwFromDbError(error, context.logger);
  context.logger.info('account deleted');
  return { ok: true as const };
});
```

Replace `tagsUpdate` with:

```ts
const tagsUpdate = appProcedure.tags.update.handler(async ({ input, context }) => {
  requireUser(context);
  const { uid, ...patch } = input;
  const tag = await run(context, () => updateOwnTag(context.db, uid, patch));
  if (!tag) {
    // not yours and nonexistent are the same answer
    throw new ORPCError('NOT_FOUND', { message: 'Not found' });
  }
  return { tag: tag as Tag };
});
```

In `appRouter`:

```ts
  profile: {
    get: getProfile,
    update: updateProfile,
    uploadAvatar: profileUploadAvatar,
    removeAvatar: profileRemoveAvatar,
    deleteAccount: profileDeleteAccount,
  },
```

**Step 3: refuse an oversized upload before it is read.**
- **Why:** oRPC's `RPCHandler` buffers the whole multipart body before zod sees the file, so `z.file().max(AVATAR_MAX_BYTES)` answers BAD_REQUEST only after the Worker already holds every byte. Hono's built-in `bodyLimit` (`hono/body-limit`) answers 413 before oRPC reads the body.
- **The route:** `apps/api/src/index.ts` mounts `rpcHandler.handle(c.req.raw, { prefix: '/rpc', context })` inside `app.use('/rpc/*', …)`, and the router is `{ public: publicRouter, app: appRouter }`, so `app.profile.uploadAvatar` is served at `/rpc/app/profile/uploadAvatar`.
- **Why `/rpc/*` and not that exact path:** oRPC strips a trailing slash before its exact (case-sensitive) lookup, so `/rpc/app/profile/uploadAvatar/` reaches the same procedure, but Hono's strict routing would not run a middleware mounted on the bare path for it. The middleware mounts on `/rpc/*` and compares the path with one trailing slash removed.
- **The slack:** 64 KiB above the cap covers the multipart framing, which is a few hundred bytes. A file just over the cap therefore still reaches the contract and gets BAD_REQUEST (§18 in Task 10 checks both).
- **How `bodyLimit` judges the size** (hono 4.12.25, `dist/middleware/body-limit/index.js`):
  - A request with no body passes.
  - With a `Content-Length` and no `Transfer-Encoding`, it compares the declared length with `maxSize` and answers `onError` without reading a byte; the runtime holds the body to that length.
  - Otherwise (no `Content-Length`, or chunked), it reads the stream, counting bytes, answers `onError` as soon as the count passes `maxSize`, and else hands the buffered chunks on as a fresh `c.req.raw`, which the `/rpc/*` handler reads.
- **A missing length is not refused.** A chunked multipart upload from React Native/Expo may omit `Content-Length`; refusing it would 413 every real mobile upload. Counting the streamed bytes bounds it just the same. Task 10b's spike exercises the no-length path on the simulator with `expo/fetch`.

Create `apps/api/src/middleware/upload-limit.ts`:

```ts
import { AVATAR_MAX_BYTES } from '@withme/contract';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { HonoEnv } from '../env.ts';

/** RPCHandler prefix '/rpc' + the router path app.profile.uploadAvatar. */
const UPLOAD_PATH = '/rpc/app/profile/uploadAvatar';

/** The cap plus 64 KiB of multipart framing: an honest upload never comes near it. */
export const AVATAR_BODY_LIMIT = AVATAR_MAX_BYTES + 65_536;

const limit = bodyLimit({
  maxSize: AVATAR_BODY_LIMIT,
  onError: (c) => c.json({ error: 'payload too large' }, 413),
});

/**
 * 413 before oRPC buffers the body: RPCHandler reads the whole multipart body
 * before the contract's z.file().max() can run, so the size is judged here.
 * Hono's bodyLimit refuses a declared Content-Length over the limit without
 * reading; with no length (a chunked upload, which React Native may send) it
 * counts the streamed bytes and stops at the limit. Mounted on /rpc/* because
 * oRPC also serves the path with a trailing slash.
 */
export function avatarUploadLimit(): MiddlewareHandler<HonoEnv> {
  return (c, next) => (c.req.path.replace(/\/$/, '') === UPLOAD_PATH ? limit(c, next) : next());
}
```

In `apps/api/src/index.ts`, import it and mount it after `cors` (so a browser can read the 413) and before `supabaseAuth()` (so an oversized request is refused before a JWT is verified, and a declared oversized length before a byte is read):

```ts
import { avatarUploadLimit } from './middleware/upload-limit.ts';
```

```ts
app.use('/rpc/*', avatarUploadLimit());

app.use('*', supabaseAuth());
```

**Verify:** `bun run typecheck && bun run lint && bun run test`.

**Expected:**
- Every workspace typechecks (the `apps/api` window closes).
- The db suite prints `72 pass`, contract `31 pass`.

**Commit**

```bash
git add apps/api/src
git commit -m "API: upload, remove, and delete through the caller's JWT; tag status

uploadAvatar sniffs the bytes (JPEG or WebP only), names the file
<uid>/<uuid>.<ext>, uploads with context.db.storage, points the profile at
it, and removes the old file — compensating if the pointer update fails.
deleteAccount clears the photo pointer, then empties the avatar folder
through the Storage API, then calls delete_my_account, so a failure midway
never leaves a card pointing at a deleted file. tags.update passes status
through; not-yours stays NOT_FOUND. An upload over the cap plus framing
slack is a 413 from Hono's bodyLimit before oRPC buffers the body: by
Content-Length when declared, by counting streamed bytes when not (a
chunked upload from React Native may carry no length).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: API e2e extension

**Files:** Modify `apps/api/e2e/handshake.e2e.ts`. Insert before the final `console.log`:

```ts
// === profile: the photo, my tags' status, account deletion ===
const { AVATAR_MAX_BYTES, avatarPublicUrl } = await import('@withme/contract');
const { AVATAR_BODY_LIMIT } = await import('../src/middleware/avatar-body-limit.ts');
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const codeOf = (e: { code?: string }) => e.code ?? 'error';
// Leading bytes only: the API sniffs magic numbers; Storage never decodes.
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// 18. upload: stored under the caller's folder, public by path, carried by the card
const uploaded = await aliceApp.profile.uploadAvatar({
  file: new File([jpegBytes], 'me.jpg', { type: 'image/jpeg' }),
});
const firstPath = uploaded.profile.avatar_path;
assert(
  firstPath !== null && new RegExp(`^${alice.id}/[0-9a-f-]{36}\\.jpg$`).test(firstPath),
  `the photo is stored under the caller's folder (got ${firstPath})`,
);
const served = await fetch(avatarPublicUrl(SUPABASE_URL, firstPath!));
assert(
  served.ok && new Uint8Array(await served.arrayBuffer()).length === jpegBytes.length,
  'the photo is publicly readable by its path',
);
const withAvatar = await anon.resolve(uid);
assert(
  withAvatar.status === 'claimed' && withAvatar.profile.avatar_path === firstPath,
  'the resolved card carries avatar_path',
);
const replaced = await aliceApp.profile.uploadAvatar({
  file: new File([webpBytes], 'me.webp', { type: 'image/webp' }),
});
assert(replaced.profile.avatar_path?.endsWith('.webp') === true, 'a WebP replaces the photo');
assert(!(await fetch(avatarPublicUrl(SUPABASE_URL, firstPath!))).ok, 'the replaced file is deleted');
const png = await aliceApp.profile
  .uploadAvatar({ file: new File([pngBytes], 'me.png', { type: 'image/png' }) })
  .then(() => 'stored', codeOf);
assert(png === 'BAD_REQUEST', `a PNG is refused (got ${png})`);
const huge = await aliceApp.profile
  .uploadAvatar({
    file: new File([new Uint8Array(AVATAR_MAX_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' }),
  })
  .then(() => 'stored', codeOf);
assert(huge === 'BAD_REQUEST', `an oversized file is refused (got ${huge})`);
// Past the cap plus the framing slack, bodyLimit refuses by the declared Content-Length, before reading.
const tooLarge = await fetch(`${API_URL}/rpc/app/profile/uploadAvatar`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${session.session?.access_token ?? ''}`,
    'content-type': 'multipart/form-data; boundary=e2e',
  },
  body: new Uint8Array(AVATAR_MAX_BYTES + 65_537),
});
assert(tooLarge.status === 413, `an oversized declared length is a 413 before the body is read (got ${tooLarge.status})`);
// A stream body goes out with Transfer-Encoding: chunked and no Content-Length (as React Native may
// send), so bodyLimit has nothing declared to judge and counts the streamed bytes instead. One byte
// past the limit, so the count trips on the last chunk: under wrangler dev, chunks left unread when
// the 413 goes out wreck the next request on the dev server.
const chunkedSize = AVATAR_BODY_LIMIT + 1;
let streamed = 0;
const tooLargeChunked = await fetch(`${API_URL}/rpc/app/profile/uploadAvatar`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${session.session?.access_token ?? ''}`,
    'content-type': 'multipart/form-data; boundary=e2e',
  },
  body: new ReadableStream<Uint8Array>({
    pull(controller) {
      if (streamed === chunkedSize) return controller.close();
      const size = Math.min(65_536, chunkedSize - streamed);
      streamed += size;
      controller.enqueue(new Uint8Array(size));
    },
  }),
  duplex: 'half',
}).then((r) => r.status, codeOf);
assert(
  tooLargeChunked === 413,
  `an oversized chunked body is a 413 once the count passes the limit (got ${tooLargeChunked})`,
);
const secondPath = replaced.profile.avatar_path!;
const cleared = await aliceApp.profile.removeAvatar();
assert(
  cleared.profile.avatar_path === null &&
    !(await fetch(avatarPublicUrl(SUPABASE_URL, secondPath))).ok,
  'removing the photo clears the path and deletes the file',
);

// 19. my tags: off and back on through the same update
await aliceApp.tags.update({ uid: gatheringUid, status: 'disabled' });
assert((await anon.resolve(gatheringUid)).status === 'disabled', 'tags.update turns a tag off');
const backOn = await aliceApp.tags.update({ uid: gatheringUid, status: 'claimed' });
assert(
  backOn.tag.status === 'claimed' && (await anon.resolve(gatheringUid)).status === 'claimed',
  'and back on',
);
const release = await aliceApp.tags
  .update({ uid: gatheringUid, status: 'unclaimed' as 'claimed' })
  .then(() => 'updated', codeOf);
assert(release === 'BAD_REQUEST', `an owner cannot release a tag (got ${release})`);

// 20. account deletion: pointer cleared, files swept (Storage API, own JWT), then the definer RPC
const carol = await createTestUser('E2E Carol');
const { data: carolSession } = await carol.client.auth.getSession();
const carolToken = carolSession.session?.access_token ?? '';
const carolApp = appClientFor(carolToken);
const carolUid = await provisionTag();
await new NfcClient({ baseUrl: API_URL, getAuthToken: () => carolToken }).claim(carolUid);
const carolPhoto = (
  await carolApp.profile.uploadAvatar({ file: new File([jpegBytes], 'c.jpg', { type: 'image/jpeg' }) })
).profile.avatar_path!;
await carolApp.requests.send({ recipient_id: bob.id });
assert(
  (await bobApp.requests.listPending()).requests.some((r) => r.requester.id === carol.id),
  "carol's request reaches bob",
);
const deleted = await carolApp.profile.deleteAccount();
assert(deleted.ok, 'deleteAccount acks');
const released = await anon.resolve(carolUid);
assert(released.status === 'unclaimed', `her tag is released (got ${released.status})`);
assert(!(await fetch(avatarPublicUrl(SUPABASE_URL, carolPhoto))).ok, 'her photo file is gone');
assert(
  !(await bobApp.requests.listPending()).requests.some((r) => r.requester.id === carol.id),
  'her pending request is gone',
);
assert((await carolApp.profile.get()).profile === null, 'her still-valid token reads no profile');
```

**Verify:**
- In one shell: `cd apps/api && bun run dev`. In another: `cd apps/api && bun run e2e`.
- `bun run --cwd apps/api typecheck` covers `e2e/`.

**Expected:**
- 58 `ok:` lines.
- The run ends `handshake e2e: all checks passed`.

**Commit**

```bash
git add apps/api/e2e/handshake.e2e.ts
git commit -m "API e2e: upload -> public read -> replace -> refuse -> remove; tag off/on; delete account

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10b: Mobile upload spike (prove the multipart chain before any UI)

**Why now:** Decision 5's chain (an RN `Blob` read with XHR → oRPC multipart → a `File` in the Worker) is the one link no automated test here covers: the API e2e sends a Bun `File`. If it breaks, Decision 1 changes, and every UI task after this one builds on it. So it is proven on the simulator now with a throwaway button. The deps and the helper are kept; the button is not.

**Files:**
- Modify (via `expo install`): `apps/mobile/package.json`, `bun.lock`, `apps/mobile/app.json`
- Modify: `apps/mobile/lib/avatar.ts`
- Temporarily modify (reverted in Step 6, never committed): `apps/mobile/app/(tabs)/profile.tsx`

**Step 1:** Install the two modules.

```bash
cd apps/mobile && bunx expo install expo-image-picker expo-image-manipulator && bunx expo install --check; cd ../..
ls node_modules/.bun | grep -E '^expo-image-(picker|manipulator)@56'
```

**Expected:** both modules are at `56.x`, and `--check` reports dependencies up to date. In `app.json` `expo.plugins`, make sure the image-picker entry reads exactly as below (replace a bare `"expo-image-picker"` if `expo install` appended one):

```json
      [
        "expo-image-picker",
        {
          "photosPermission": "Choose a photo for your profile.",
          "cameraPermission": false,
          "microphonePermission": false
        }
      ]
```

**Step 2:** Append to `lib/avatar.ts`. Add `AVATAR_MAX_BYTES` to the contract import, and `import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';`.

```ts
const SIZE = 512;

/**
 * Centre-crop a picked photo to a square and scale it to a 512px JPEG, then
 * read it back as a React Native Blob. Why XMLHttpRequest: RN cannot build a
 * Blob from bytes (`new Blob([ArrayBuffer])` throws, and Expo's fetch
 * `blob()` builds one exactly that way), while oRPC only sends values that
 * are `instanceof Blob` as multipart parts. An XHR with responseType 'blob'
 * yields a native-backed Blob; Expo's FormData patch names the part and
 * expo/fetch reads its bytes, so the API receives a File.
 */
export async function squareAvatar(asset: { uri: string; width: number; height: number }): Promise<File> {
  const side = Math.min(asset.width, asset.height);
  const image = await ImageManipulator.manipulate(asset.uri)
    .crop({
      originX: Math.floor((asset.width - side) / 2),
      originY: Math.floor((asset.height - side) / 2),
      width: side,
      height: side,
    })
    .resize({ width: SIZE, height: SIZE })
    .renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const blob = await readBlob(saved.uri);
  if (blob.size === 0 || blob.size > AVATAR_MAX_BYTES) throw new Error('Unusable photo');
  // The contract types the part as a File; on the wire it is a multipart part either way.
  return blob as File;
}

function readBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.addEventListener('load', () => resolve(request.response as Blob));
    request.addEventListener('error', () => reject(new Error('Could not read the resized photo')));
    request.responseType = 'blob';
    request.open('GET', uri);
    request.send();
  });
}
```

**Step 3:** `bun run --cwd apps/mobile typecheck && bun run lint` are clean. Commit the deps and the helper:

```bash
git add apps/mobile/package.json apps/mobile/app.json bun.lock apps/mobile/lib/avatar.ts
git commit -m "Mobile: expo-image-picker and expo-image-manipulator; squareAvatar makes a 512px JPEG Blob

Both modules ship in Expo Go SDK 56. squareAvatar reads the result back as
an RN Blob via XHR (RN cannot build a Blob from bytes), so oRPC sends it as
a multipart File. Added ahead of any UI so the chain is proven on the
simulator first.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Step 4:** The TEMPORARY button. In `app/(tabs)/profile.tsx` (as Task 3 left it):
- add `import * as ImagePicker from 'expo-image-picker';` and `import { squareAvatar } from '../../lib/avatar';`;
- next to the other `useState` lines (before any early return), add:

```tsx
  // TEMPORARY (Task 10b spike): reverted in Step 6, never committed.
  const [spike, setSpike] = useState<string | null>(null);
  async function spikeUpload() {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    setSpike('uploading');
    try {
      const { profile } = await api.app.profile.uploadAvatar({ file: await squareAvatar(asset) });
      setSpike(`ok ${profile.avatar_path}`);
    } catch (e) {
      const { code, message } = e as { code?: string; message?: string };
      setSpike(`failed ${code ?? '?'} ${message ?? String(e)}`);
    }
  }
```

- inside the main `<Card>`, after the "Sign out" button:

```tsx
          <Button label="Spike: upload a photo" kind="quiet" onPress={spikeUpload} />
          {spike ? <Text style={{ color: t.inkMuted }}>{spike}</Text> : null}
```

**Step 5:** Run it on the simulator with the repo's technique (agent-device + Expo Go + simctl; the native simulator tool does not attach on this Mac).

```bash
bun run db:reset && bun run db:seed
# background 1: the API (Storage is reached through it)
cd apps/api && bun run dev
# background 2: Metro, WITHOUT CI=1 (CI mode disables reloads)
cd apps/mobile && bunx expo start --port 8081
# boot by UDID (booting by name can fail with EINVAL, or boot without a display)
xcrun simctl list devices available | grep 'iPhone 17 Pro ('
xcrun simctl boot <UDID>
# a picture for the library, then the project in Expo Go (SDK 56)
xcrun simctl addmedia booted apps/mobile/assets/icon.png
xcrun simctl openurl booted exp://127.0.0.1:8081
```

Then drive with `bunx agent-device … --platform ios --device "iPhone 17 Pro"`:
- Dismiss Expo Go's dev-menu onboarding ("Continue") and the dev menu ("Close").
- Sign in as `ada@demo.withme.local` / `withme-demo-1`. Type in chunks, and never start a chunk with `-` (agent-device reads it as a flag): `type "withme-"`, then `type "demo-1"`. Close the keyboard with the on-screen `return` key. **Never `keyboard dismiss`:** it taps a QuickType suggestion.
- Re-snapshot before every click: refs renumber between snapshots. If a tab-bar ref click fails, tap by point from the snapshot.
- Profile tab → "Spike: upload a photo" → pick the added image → "Choose" on the square crop.

**Pass:** all three:
- the spike line reads `ok <ada-id>/<uuid>.jpg`;
- the API log shows `POST /rpc/app/profile/uploadAvatar 200` and `avatar uploaded`;
- Ada's profile row has the path:

```bash
cd packages/db && bun -e "
import { admin } from './src/test-utils/index.ts';
const { data: users } = await admin.auth.admin.listUsers();
const ada = users.users.find((u) => u.email === 'ada@demo.withme.local');
const { data } = await admin.from('profiles').select('avatar_path').eq('id', ada?.id ?? '').single();
console.log(JSON.stringify(data));
"; cd ../..
```

prints `{"avatar_path":"<ada-id>/<uuid>.jpg"}`.

**Fail:** a `BAD_REQUEST` with "Input validation failed" means the multipart transport is broken: the blob part arrived as a string. **Stop here and report** with the spike line, the API log, and a screenshot (`xcrun simctl io booted screenshot ~/Desktop/m3-spike.png`). Do not improvise a base64 contract: that is a spec deviation that needs Alex (Decision 5, the decisions log). A 413 means the Worker counted (or was told) more than `AVATAR_MAX_BYTES` + 64 KiB, so the client sent an encode far over the cap (Task 9's `bodyLimit` accepts a missing `Content-Length` and counts the streamed bytes instead): report it with the API log and the encoded size rather than loosening the limit, since that is the same spec-level call. Any other failure is worth a short debug first (sign-in, API not running, Metro stale: `bunx agent-device metro reload`), still without changing the transport.

**Step 6:** Revert the temporary button and leave the tree clean:

```bash
git checkout -- 'apps/mobile/app/(tabs)/profile.tsx'
git status --short   # nothing from this task; the deps + helper commit stays
```

Stop Metro and the API. Ada's spike photo stays until the next `db:reset` (Task 21 starts with one).

---

### Task 11: Web: Connections segments and the list ladder

**Files:**
- Create: `apps/web/src/lib/loaded.ts`, `apps/web/src/components/ListStates.tsx`
- Modify: `apps/web/src/routes/_app.connections.tsx`, `apps/web/src/styles/app.css`

**Step 1:** `lib/loaded.ts`:

```ts
/** One list's outcome inside a loader that loads several. */
export type Loaded<T> = { ok: true; data: T } | { ok: false };

/**
 * Settles a load into its own outcome, so one failed list renders its own
 * retry instead of failing the page (the route's errorComponent is for the
 * page itself). Used inside asSignedInAccount, which still re-runs the
 * whole load if the account changed while it was in flight.
 */
export function settled<T>(load: Promise<T>): Promise<Loaded<T>> {
  return load.then(
    (data) => ({ ok: true as const, data }),
    (error: unknown) => {
      // The session, not the list: rethrown so an expired session reaches the
      // auth redirect instead of reading as every list failing at once.
      if (isUnauthorized(error)) throw error;
      return { ok: false as const };
    },
  );
}

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'UNAUTHORIZED'
  );
}
```

**Step 2:** `components/ListStates.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { Loaded } from '../lib/loaded.ts';

/** The typed empty state: what this list will hold, said plainly. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/**
 * The ladder every list climbs: loading → error with retry → typed empty →
 * content. The first load is the route's pendingComponent (inside the
 * shell); `retrying` covers the reload a "Try again" starts.
 */
export function ListLadder<T>({
  state,
  what,
  empty,
  retrying,
  onRetry,
  children,
}: {
  state: Loaded<T[]>;
  /** Completes "Couldn't load …". */
  what: string;
  empty: ReactNode;
  retrying: boolean;
  onRetry: () => void;
  children: (items: T[]) => ReactNode;
}) {
  if (retrying) {
    return (
      <p className="empty" aria-busy="true">
        Loading…
      </p>
    );
  }
  if (!state.ok) {
    return (
      <div className="list-error" role="alert">
        <p>{`Couldn't load ${what}.`}</p>
        <button type="button" className="btn btn--quiet" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (state.data.length === 0) return <EmptyState>{empty}</EmptyState>;
  return <>{children(state.data)}</>;
}
```

**Step 3:** Replace `routes/_app.connections.tsx` entirely:

```tsx
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { shellStates } from '../components/CalmStates.tsx';
import { ListLadder } from '../components/ListStates.tsx';
import { Avatar, type CardProfile } from '../components/ProfileCard.tsx';
import { asSignedInAccount } from '../lib/account-scope.ts';
import { api } from '../lib/api.ts';
import { settled } from '../lib/loaded.ts';

type Tab = 'requests' | 'blocked';

/**
 * Connections: three lists behind in-page segments (Connections, Requests,
 * Blocked). The segment is a search param, so each list is a URL that a
 * reload or a link keeps; switching replaces the history entry rather than
 * stacking one per tap. Each list settles on its own and climbs its own
 * ladder.
 */
export const Route = createFileRoute('/_app/connections')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'Connections — withme' }] }),
  // Always returns the key: a route's search is the parent's spread under
  // this result, so leaving `tab` out would let a raw ?tab=foo through.
  validateSearch: (search): { tab?: Tab } => ({
    tab: search.tab === 'requests' || search.tab === 'blocked' ? search.tab : undefined,
  }),
  loader: async () => {
    const [pending, connections, blocks] = await asSignedInAccount(() =>
      Promise.all([
        settled(api.app.requests.listPending().then(({ requests }) => requests)),
        settled(api.app.connections.list().then(({ connections: list }) => list)),
        settled(api.app.blocks.list().then(({ blocks: list }) => list)),
      ]),
    );
    return { pending, connections, blocks };
  },
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { pending, connections, blocks } = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const busy = (id: string) => busyIds.has(id);
  // Your own inbox, counted for you alone: the one number on this page.
  const requestCount = pending.ok ? pending.data.length : 0;

  async function act(id: string, work: () => Promise<unknown>) {
    setBusyIds((prev) => new Set(prev).add(id));
    setActionError(null);
    try {
      await work();
      await router.invalidate();
    } catch {
      setActionError('That didn’t go through. Try again.');
      // Reload anyway: a failure may mean the row is stale (a request
      // withdrawn, a connection already gone). The message is page state,
      // so it stays through the reload.
      await router.invalidate({ sync: true });
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="stack">
      <h1 className="section-title">Connections</h1>
      <nav className="segments" aria-label="Connections lists">
        <SegmentLink current={tab} label="Connections" />
        <SegmentLink current={tab} tab="requests" label="Requests" count={requestCount} />
        <SegmentLink current={tab} tab="blocked" label="Blocked" />
      </nav>
      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {tab === 'requests' ? (
        <ListLadder
          state={pending}
          what="your requests"
          empty="No requests right now."
          retrying={retrying}
          onRetry={retry}
        >
          {(requests) =>
            requests.map((request) => (
              <PersonRow key={request.id} profile={request.requester} sub={request.requester.bio}>
                {/* Accepting completes the handshake — the accent's job. */}
                <button
                  type="button"
                  className="btn btn--connect"
                  disabled={busy(request.id)}
                  onClick={() => act(request.id, () => api.app.requests.accept({ id: request.id }))}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn--quiet"
                  disabled={busy(request.id)}
                  onClick={() => act(request.id, () => api.app.requests.decline({ id: request.id }))}
                >
                  Decline
                </button>
              </PersonRow>
            ))
          }
        </ListLadder>
      ) : tab === 'blocked' ? (
        <ListLadder
          state={blocks}
          what="your block list"
          empty="No one is blocked."
          retrying={retrying}
          onRetry={retry}
        >
          {(list) =>
            list.map((block) => (
              <PersonRow key={block.user.id} profile={block.user}>
                <button
                  type="button"
                  className="btn btn--quiet"
                  disabled={busy(block.user.id)}
                  onClick={() =>
                    act(block.user.id, () => api.app.blocks.unblock({ user_id: block.user.id }))
                  }
                >
                  Unblock
                </button>
              </PersonRow>
            ))
          }
        </ListLadder>
      ) : (
        <ListLadder
          state={connections}
          what="your connections"
          empty="No connections yet. Tap someone's tag to start."
          retrying={retrying}
          onRetry={retry}
        >
          {(list) =>
            list.map((connection) => (
              <PersonRow
                key={connection.id}
                profile={connection.profile}
                sub={connection.profile.bio}
              >
                <button
                  type="button"
                  className="btn btn--quiet"
                  disabled={busy(connection.id)}
                  onClick={() =>
                    act(connection.id, () => api.app.connections.remove({ id: connection.id }))
                  }
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="btn btn--quiet"
                  disabled={busy(connection.id)}
                  onClick={() =>
                    act(connection.id, () =>
                      api.app.blocks.block({ user_id: connection.profile.id }),
                    )
                  }
                >
                  Block
                </button>
              </PersonRow>
            ))
          }
        </ListLadder>
      )}
    </div>
  );
}

/**
 * One segment. Active = ink and a 2px ink underline, never the accent.
 * Active follows the validated tab, not the raw URL: a stale ?tab=foo (or
 * any extra param) still shows Connections, so Connections is current.
 */
function SegmentLink({
  current,
  tab,
  label,
  count = 0,
}: {
  current: Tab | undefined;
  tab?: Tab;
  label: string;
  count?: number;
}) {
  const active = tab === current;
  return (
    <Link
      to="/connections"
      search={tab ? { tab } : {}}
      replace
      className={active ? 'segments__item segments__item--active' : 'segments__item'}
      aria-current={active ? 'page' : undefined}
      // exact keeps the router's own active marking (it adds aria-current
      // when the raw search matches) from ever disagreeing: without it,
      // "Connections" would partially match ?tab=requests too.
      activeOptions={{ exact: true }}
      activeProps={{}}
      // Named outright: a hidden ", N pending" span inside this flex link is
      // blockified, and the computed name would read "Requests , N pending".
      aria-label={count > 0 ? `${label}, ${count} pending` : undefined}
    >
      {label}
      {count > 0 ? (
        <span className="badge" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

function PersonRow({
  profile,
  sub,
  children,
}: {
  profile: CardProfile;
  sub?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="row">
      <Avatar profile={profile} size="row" />
      <div className="row-body">
        <span className="name">{profile.display_name}</span>
        {sub ? <span className="sub">{sub}</span> : null}
      </div>
      <div className="row-actions">{children}</div>
    </div>
  );
}
```

**Step 4:** Append to `styles/app.css`, after the `.empty` rule:

```css
/* --- in-page segments (Connections) — active = ink, never the accent ------ */

/* Wraps rather than overflows: three segments and a "99+" badge do not fit
 * on one line at 320px. */
.segments {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-1);
  row-gap: var(--space-1);
  border-bottom: 1px solid var(--color-border);
}

.segments__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-target);
  padding: 0 var(--space-3);
  color: var(--color-ink-muted);
  text-decoration: none;
  font-size: var(--text-sm);
  font-weight: 500;
}

.segments__item:hover {
  color: var(--color-ink);
}

/* One weight for every segment: a bolder active label would widen it and
 * shift its siblings on each switch. Active is ink plus the underline. */
.segments__item--active {
  color: var(--color-ink);
}

.segments__item--active::after {
  content: '';
  position: absolute;
  left: var(--space-3);
  right: var(--space-3);
  bottom: -1px;
  height: 2px;
  background: var(--color-ink);
}

/* A count is ink on surface: the accent stays with Connect and Accept. */
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-ink);
  color: var(--color-surface);
  font-size: var(--text-xs);
  font-weight: 600;
}

.list-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  font-size: var(--text-sm);
}

.list-error p {
  margin: 0;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

**Verify:**
- `bun run --cwd apps/web typecheck && bun run lint` are clean.
- `cd apps/web && bunx vite build; cd ../..` succeeds. `git status` shows no `routeTree.gen.ts` change; if there is one, commit it with this task.
- The existing `handshake.spec.ts` looks for Bob's request on the default segment, which now shows Connections. Its "Ada accepts" block (Task 16 Step 2) lands here, in its own commit, so the Playwright suite stays at `10 passed`.

**Commit**

```bash
git add apps/web/src
git commit -m "Web: Connections as three segments, each list on its own ladder

?tab=requests|blocked addresses a list; segments are links with an ink
active state, and Requests carries an ink count badge of your own inbox.
The loader settles each list separately inside asSignedInAccount, so a
failed list says so with a retry while the others render. UNAUTHORIZED is
rethrown: an expired session is the page's problem, not a list's.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Web: the photo in Profile → identity

**Files:**
- Create: `apps/web/src/components/AvatarField.tsx`
- Modify: `apps/web/src/lib/avatar.ts`, `apps/web/src/routes/_app.profile.tsx`, `apps/web/src/styles/app.css`

**Step 1:** Append to `lib/avatar.ts`, and add `AVATAR_MAX_BYTES` to the contract import:

```ts
const SIZE = 512;

/**
 * The background baked under a transparent photo. The baked background must
 * not depend on the uploader's theme: every viewer sees the same file. It
 * mirrors the light --color-surface token in styles/tokens.css.
 */
const PHOTO_FILL = '#fffdf9';

function encode(canvas: HTMLCanvasElement, type: 'image/webp' | 'image/jpeg'): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

/**
 * Centre-crop a chosen image to a square and scale it to 512px. WebP where
 * the browser can encode it; Safari's toBlob quietly returns PNG for WebP,
 * so the result's type is checked and JPEG is the fallback. The API sniffs
 * the bytes either way.
 */
export async function squareAvatar(source: Blob): Promise<File> {
  const bitmap = await createImageBitmap(source);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    // Flatten transparency onto a fixed light fill, so a PNG never turns black as JPEG.
    context.fillStyle = PHOTO_FILL;
    context.fillRect(0, 0, SIZE, SIZE);
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE,
    );
    const webp = await encode(canvas, 'image/webp');
    const blob = webp?.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg');
    if (!blob || blob.size > AVATAR_MAX_BYTES) throw new Error('Could not encode the photo');
    return new File([blob], blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg', {
      type: blob.type,
    });
  } finally {
    bitmap.close();
  }
}
```

**Step 2:** `components/AvatarField.tsx`:

```tsx
import type { Profile } from '@withme/contract';
import { useRouter } from '@tanstack/react-router';
import { useRef, useState, type ChangeEvent } from 'react';
import { flushSync } from 'react-dom';
import { api } from '../lib/api.ts';
import { squareAvatar } from '../lib/avatar.ts';
import { Avatar } from './ProfileCard.tsx';

type PhotoState = 'idle' | 'working' | 'done' | 'removed' | 'failed' | 'unreadable';

const MESSAGES: Record<Exclude<PhotoState, 'idle'>, string> = {
  working: 'Uploading…',
  done: 'Photo updated.',
  removed: 'Photo removed.',
  failed: 'That didn’t go through. Try again.',
  unreadable: "That photo couldn't be read. Try a different one.",
};

/**
 * The profile photo. The browser squares and shrinks it (512px, WebP or
 * JPEG); the API stores it in your own folder with your own JWT. The web app
 * never talks to Storage itself.
 */
export function AvatarField({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [state, setState] = useState<PhotoState>('idle');
  const fileInput = useRef<HTMLInputElement>(null);
  const working = state === 'working';

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    // Cleared so choosing the same file again still fires a change.
    event.target.value = '';
    if (!picked) return;
    setState('working');
    let file: File;
    try {
      file = await squareAvatar(picked);
    } catch {
      setState('unreadable');
      return;
    }
    try {
      await api.app.profile.uploadAvatar({ file });
      // Every card reads the shell's profile: wait for its re-fetch.
      await router.invalidate({ sync: true });
      setState('done');
    } catch {
      setState('failed');
    }
  }

  async function remove() {
    setState('working');
    try {
      await api.app.profile.removeAvatar();
      await router.invalidate({ sync: true });
      // "Remove photo" unmounts with the photo; keep keyboard focus on the
      // control that adds one rather than letting it fall to <body>. Flushed
      // first: until this render the input is still disabled, and a disabled
      // input refuses focus.
      flushSync(() => setState('removed'));
      fileInput.current?.focus();
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="avatar-field">
      <Avatar profile={profile} />
      <div className="avatar-field__actions">
        <input
          ref={fileInput}
          id="avatar_file"
          className="visually-hidden"
          type="file"
          accept="image/*"
          disabled={working}
          onChange={choose}
        />
        <label htmlFor="avatar_file" className="btn btn--quiet">
          {profile.avatar_path ? 'Change photo' : 'Add a photo'}
        </label>
        {profile.avatar_path ? (
          <button type="button" className="btn btn--quiet" disabled={working} onClick={remove}>
            Remove photo
          </button>
        ) : null}
      </div>
      {/* Always mounted: a live region created with its message is not announced. */}
      <p className="hint" role="status">
        {state !== 'idle' ? MESSAGES[state] : null}
      </p>
    </div>
  );
}
```

**Step 3:** Replace `routes/_app.profile.tsx` entirely. The identity form moves into its own component; Tasks 13 and 14 add the other two sections.

```tsx
import type { Profile } from '@withme/contract';
import { createFileRoute, useLoaderData, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { AvatarField } from '../components/AvatarField.tsx';
import { shellStates } from '../components/CalmStates.tsx';
import { api } from '../lib/api.ts';
import { safeReturnTo } from '../lib/auth-guard.ts';
import { getSupabase } from '../lib/supabase.ts';

/** Profile: identity (photo, name, bio), My tags, Account. */
export const Route = createFileRoute('/_app/profile')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'Your profile — withme' }] }),
  validateSearch: (search): { returnTo?: string } => {
    const returnTo = safeReturnTo(search.returnTo);
    return returnTo ? { returnTo } : {};
  },
  component: ProfilePage,
});

function ProfilePage() {
  // Fetched once by the layout; invalidated after a save or a photo change.
  const { profile } = useLoaderData({ from: '/_app' });
  return (
    <div className="stack">
      <IdentityForm profile={profile} />
    </div>
  );
}

function IdentityForm({ profile }: { profile: Profile | null }) {
  const { returnTo } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await api.app.profile.update({
        display_name: displayName.trim(),
        bio: bio.trim() === '' ? null : bio.trim(),
      });
      // The layout caches the profile until invalidated; wait for the re-fetch
      // (sync) before leaving so the shell never keeps a stale "no profile".
      await router.invalidate({ sync: true });
      if (returnTo) {
        navigate({ href: returnTo });
        return;
      }
      setStatus('Saved.');
    } catch {
      setStatus('Could not save. Check the fields and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await getSupabase().auth.signOut();
    navigate({ to: '/' });
  }

  return (
    <form className="card" onSubmit={save}>
      <h1>{profile ? 'Your profile' : 'Create your profile'}</h1>
      {/* The photo lives on the profile row: it needs the row to exist first. */}
      {profile ? <AvatarField profile={profile} /> : null}
      <div className="field">
        <label htmlFor="display_name">Name</label>
        <input
          id="display_name"
          required
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="bio">Bio</label>
        <textarea
          id="bio"
          maxLength={280}
          placeholder="A line or two about you"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>
      {/* Always mounted: a live region created with its message is not announced. */}
      <p className="hint" role="status">
        {status}
      </p>
      <button className="btn" type="submit" disabled={busy || !displayName.trim()}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button className="btn btn--quiet" type="button" onClick={signOut}>
        Sign out
      </button>
    </form>
  );
}
```

**Step 4:** Append to `app.css`:

```css
/* --- the profile photo ---------------------------------------------------- */

.avatar-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.avatar-field__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-1);
}

/* The real control is the visually hidden input; show its focus on the label. */
.visually-hidden:focus-visible + label {
  outline: 2px solid var(--color-ink);
  outline-offset: 2px;
}

/* An empty, always-mounted status region takes no gap in a flex column. */
.hint[role='status']:empty {
  position: absolute;
}
```

**Verify:**
- `bun run --cwd apps/web typecheck && bun run lint` are clean.
- Manually (optional): `bun run dev`, sign in as Ada, then Profile → Add a photo → "Photo updated." and the image shows.

**Commit**

```bash
git add apps/web/src
git commit -m "Web: upload a photo from Profile; squared and shrunk to 512px in the browser

createImageBitmap + canvas, WebP with a JPEG fallback for Safari, sent as a
File through app.profile.uploadAvatar. Remove photo clears it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Web: Profile → My tags

**Files:**
- Create: `apps/web/src/lib/my-tags.ts`, `apps/web/src/components/MyTags.tsx`
- Modify: `apps/web/src/routes/_app.profile.tsx`, `apps/web/src/styles/app.css`

**Step 1:** `lib/my-tags.ts`:

```ts
import type { Destination, Gathering, Tag } from '@withme/contract';
import { formatStartsAt } from './format-time.ts';

/** A choice value for a destination: 'profile' or 'gathering:<id>'. */
export function destinationKey(destination: Destination | null): string {
  return destination?.type === 'gathering' ? `gathering:${destination.gathering_id}` : 'profile';
}

export function destinationFromKey(key: string): Destination {
  return key.startsWith('gathering:')
    ? { type: 'gathering', gathering_id: key.slice('gathering:'.length) }
    : { type: 'profile' };
}

/** "Rooftop listening session · Thu, Oct 9 · 7:00 PM" */
export function gatheringChoiceLabel(g: Pick<Gathering, 'title' | 'starts_at'>): string {
  return [g.title, formatStartsAt(g.starts_at)].filter(Boolean).join(' · ');
}

/**
 * What a tap on this tag does right now, in one sentence. `gatherings` is
 * null when that list did not load, so an unknown gathering is never
 * misread as one you left.
 */
export function describeTag(tag: Tag, gatherings: Gathering[] | null): string {
  if (tag.status === 'disabled') return 'Off. A tap shows an inactive tag.';
  const destination = tag.destination;
  if (destination?.type !== 'gathering') return 'A tap shows your card.';
  if (gatherings === null) return 'A tap invites people to a gathering.';
  const target = gatherings.find((g) => g.id === destination.gathering_id);
  return target
    ? `A tap invites people to ${target.title}.`
    : 'A tap shows your card: the gathering it pointed at is gone, or you left it.';
}
```

**Step 2:** `components/MyTags.tsx`:

```tsx
import type { Destination, Gathering, Tag } from '@withme/contract';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import type { Loaded } from '../lib/loaded.ts';
import {
  describeTag,
  destinationFromKey,
  destinationKey,
  gatheringChoiceLabel,
} from '../lib/my-tags.ts';
import { ListLadder } from './ListStates.tsx';

type TagPatch = { destination: Destination } | { status: 'claimed' | 'disabled' };

/**
 * Profile → My tags. Every tag you claimed: what a tap does now, where it
 * points (your card or one of your gatherings), and off/on. Through the
 * contract only (app.tags.listMine / app.tags.update); the database
 * enforces ownership with RLS and the (destination, status) column grant.
 */
export function MyTags({
  tags,
  gatherings,
}: {
  tags: Loaded<Tag[]>;
  gatherings: Loaded<Gathering[]>;
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  // Per tag: saving one row never re-enables another mid-save.
  const [busyUids, setBusyUids] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const mine = gatherings.ok ? gatherings.data : null;

  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } finally {
      setRetrying(false);
    }
  }

  /** True when the change saved. */
  async function update(uid: string, patch: TagPatch): Promise<boolean> {
    setBusyUids((prev) => new Set(prev).add(uid));
    setError(null);
    try {
      await api.app.tags.update({ uid, ...patch });
      await router.invalidate({ sync: true });
      return true;
    } catch {
      setError('That didn’t go through. Try again.');
      return false;
    } finally {
      setBusyUids((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    }
  }

  return (
    <>
      <h2 className="section-title">My tags</h2>
      {/* Always mounted: a live region created with its message is not announced. */}
      <div role="alert">{error ? <p className="form-error">{error}</p> : null}</div>
      <ListLadder
        state={tags}
        what="your tags"
        empty="No tags yet. Tap an unclaimed tag to claim it."
        retrying={retrying}
        onRetry={retry}
      >
        {(list) =>
          list.map((tag) => (
            <TagRow
              key={tag.uid}
              tag={tag}
              gatherings={mine}
              busy={busyUids.has(tag.uid)}
              onUpdate={(patch) => update(tag.uid, patch)}
            />
          ))
        }
      </ListLadder>
    </>
  );
}

function TagRow({
  tag,
  gatherings,
  busy,
  onUpdate,
}: {
  tag: Tag;
  gatherings: Gathering[] | null;
  busy: boolean;
  onUpdate: (patch: TagPatch) => Promise<boolean>;
}) {
  const current = destinationKey(tag.destination);
  // A choice is staged until Save: browsing a closed select with the arrow
  // keys fires change on every step, and each would re-point the real tag.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? current;
  const staged = draft !== null && draft !== current;
  const known = gatherings ?? [];
  // A destination outside the list (left, deleted, or the list failed) stays shown as itself.
  const orphan = current !== 'profile' && !known.some((g) => `gathering:${g.id}` === current);
  const off = tag.status === 'disabled';
  const selectId = `destination-${tag.uid}`;

  // The controls are disabled while a change is saved, and a disabled control
  // drops keyboard focus to <body>. Hand it back to the one that was used.
  const used = useRef<HTMLSelectElement | HTMLButtonElement | null>(null);
  const select = useRef<HTMLSelectElement>(null);
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) {
      const active = document.activeElement;
      if (active === null || active === document.body) used.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy]);

  return (
    <div className="row row--stacked">
      <div className="row-body">
        <span className="name">{tag.uid}</span>
        <span className="sub">{describeTag(tag, gatherings)}</span>
      </div>
      <div className="row-actions">
        <label className="visually-hidden" htmlFor={selectId}>
          {`Where ${tag.uid} points`}
        </label>
        <select
          ref={select}
          id={selectId}
          className="select"
          value={shown}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
        >
          <option value="profile">My profile</option>
          {known.map((g) => (
            <option key={g.id} value={`gathering:${g.id}`}>
              {gatheringChoiceLabel(g)}
            </option>
          ))}
          {orphan ? (
            <option value={current} disabled>
              {gatherings === null ? 'A gathering' : "A gathering you're not in"}
            </option>
          ) : null}
        </select>
        {staged ? (
          <button
            type="button"
            className="btn btn--quiet"
            disabled={busy}
            aria-label={`Save where ${tag.uid} points`}
            onClick={async () => {
              // Save goes away once the tag points where the draft does: focus
              // returns to the select. Kept on failure, so Save can be retried.
              used.current = select.current;
              if (await onUpdate({ destination: destinationFromKey(draft) })) setDraft(null);
            }}
          >
            Save
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn--quiet"
          disabled={busy}
          aria-label={`${off ? 'Turn on' : 'Turn off'} ${tag.uid}`}
          onClick={(e) => {
            used.current = e.currentTarget;
            void onUpdate({ status: off ? 'claimed' : 'disabled' });
          }}
        >
          {off ? 'Turn on' : 'Turn off'}
        </button>
      </div>
    </div>
  );
}
```

**Step 3:** `routes/_app.profile.tsx`:
- Add the imports:

```ts
import { MyTags } from '../components/MyTags.tsx';
import { asSignedInAccount } from '../lib/account-scope.ts';
import { settled } from '../lib/loaded.ts';
```

- Add to the route options (after `validateSearch`):

```ts
  loader: async () => {
    // Each settles alone: a failed gatherings list only loses the labels.
    const [tags, gatherings] = await asSignedInAccount(() =>
      Promise.all([
        settled(api.app.tags.listMine().then(({ tags: list }) => list)),
        settled(api.app.gatherings.listMine().then(({ gatherings: list }) => list)),
      ]),
    );
    return { tags, gatherings };
  },
```

- In `ProfilePage`, read `const { tags, gatherings } = Route.useLoaderData();` and render, after `<IdentityForm …/>`:

```tsx
      {profile ? <MyTags tags={tags} gatherings={gatherings} /> : null}
```

**Step 4:** Append to `app.css`:

```css
/* --- a compact select inside a row (My tags) --------------------------------- */

/* A row whose actions always take their own line: a select plus a button
 * does not fit beside the text in a card at any width. */
.row--stacked {
  flex-wrap: wrap;
}

.row--stacked .row-actions {
  flex-basis: 100%;
  min-width: 0;
}

/* A select is as wide as its longest option (a gathering title runs to 120
 * characters). The percentage width lets it shrink to the row instead of
 * widening the page; flex hands it the room the button leaves. */
.select {
  font: inherit;
  font-size: var(--text-sm);
  color: var(--color-ink);
  background: var(--color-bg);
  border: 1px solid var(--color-border-input);
  border-radius: var(--radius-control);
  min-height: var(--tap-target);
  padding: 0 var(--space-3);
  flex: 1 1 0;
  min-width: 0;
  width: 100%;
  max-width: 100%;
}
```

**Verify:** `bun run --cwd apps/web typecheck && bun run lint` are clean.

**Commit**

```bash
git add apps/web/src
git commit -m "Web: Profile -> My tags — what a tap does, where it points, off and on

Through app.tags.listMine / update only. The destination picker lists your
gatherings from app.gatherings.listMine; a gathering you left or that was
deleted is named as such instead of disappearing. The gathering detail's
\"point my tags here\" stays as the bulk shortcut over the same endpoint.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Web: Profile → Account (sign out, delete account)

**Files:**
- Create: `apps/web/src/components/AccountSection.tsx`
- Modify: `apps/web/src/routes/_app.profile.tsx`

**Step 1:** `components/AccountSection.tsx`:

```tsx
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import { getSupabase } from '../lib/supabase.ts';

const DELETE_COPY =
  "Your profile, connections, requests, blocks, and the gatherings you host are deleted, and your photo with them. Your tags are released so anyone can claim them. This can't be undone.";

/**
 * Profile → Account: sign out, and delete the account behind a second,
 * explicit step. Deletion goes through the API (photo cleared, its files
 * swept, then delete_my_account()); afterwards the session is dropped locally only,
 * because the server no longer has it.
 */
export function AccountSection() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'idle' | 'confirm' | 'deleting' | 'failed'>('idle');

  async function signOut() {
    await getSupabase().auth.signOut();
    navigate({ to: '/' });
  }

  async function deleteAccount() {
    setMode('deleting');
    try {
      await api.app.profile.deleteAccount();
    } catch {
      setMode('failed');
      return;
    }
    await getSupabase().auth.signOut({ scope: 'local' });
    navigate({ to: '/', replace: true });
  }

  return (
    <>
      <h2 className="section-title">Account</h2>
      <div className="card">
        <button
          className="btn btn--quiet"
          type="button"
          disabled={mode === 'deleting'}
          onClick={signOut}
        >
          Sign out
        </button>
        {mode === 'idle' ? (
          <button className="btn btn--quiet" type="button" onClick={() => setMode('confirm')}>
            Delete account
          </button>
        ) : (
          <>
            <p className="bio">
              <strong>Delete your account?</strong> {DELETE_COPY}
            </p>
            {mode === 'failed' ? (
              <p className="form-error" role="alert">
                That didn’t go through. Try again.
              </p>
            ) : null}
            <div className="row-actions">
              <button
                className="btn"
                type="button"
                disabled={mode === 'deleting'}
                onClick={deleteAccount}
              >
                {mode === 'deleting' ? 'Deleting…' : 'Delete my account'}
              </button>
              <button
                className="btn btn--quiet"
                type="button"
                disabled={mode === 'deleting'}
                onClick={() => setMode('idle')}
              >
                Keep my account
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
```

**Step 2:** `routes/_app.profile.tsx`:
- import `AccountSection`;
- in `ProfilePage`, render `<AccountSection />` last inside the `stack`, for every visitor (a session without a profile can still sign out or delete);
- in `IdentityForm`, delete `signOut()`, the "Sign out" button, and the now-unused `getSupabase` import.

**Verify:** `bun run --cwd apps/web typecheck && bun run lint` are clean.

**Commit**

```bash
git add apps/web/src
git commit -m "Web: Profile -> Account — sign out, and delete the account on a second step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Web: M2 carry-overs on the resolver

**Files:** Modify `apps/web/src/routes/t.$uid.tsx`.

**Step 1:** At the call site, `hostId={result.profile.id}` becomes `ownerId={result.profile.id}`: it is the tag owner, a member of the gathering (resolve_tag only shows a gathering its owner belongs to), not necessarily the host. Import `useHydrated` from `@tanstack/react-router`, render `<GatheringLine gathering={result.gathering} />` in place of `<p className="hint">{gatheringLine(result.gathering)}</p>` (the Worker renders in UTC/en-US, so a server-rendered time would flip on hydration and trip React #418; after a client-side navigation `useHydrated` is already true, so there is no flash), and replace `GatheringInvite` with:

```tsx
/** The server knows neither the viewer's timezone nor locale: the title alone until hydrated. */
function GatheringLine({ gathering }: { gathering: GatheringSummary }) {
  const hydrated = useHydrated();
  return <p className="hint">{hydrated ? gatheringLine(gathering) : gathering.title}</p>;
}

/**
 * The Join link lands on the detail route under the shell, carrying
 * display-only hints. A signed-out tapper is sent through login by the
 * shell's own guard (returnTo keeps the hints). The tag's owner and other
 * members have nothing to join and get a plain "Open gathering". Until we
 * know which, there is no link at all: guessing "Join" would flash the
 * accent at a member.
 */
function GatheringInvite({ gathering, ownerId }: { gathering: GatheringSummary; ownerId: string }) {
  const [viewer, setViewer] = useState<'loading' | 'member' | 'other'>('loading');
  useEffect(() => {
    let cancelled = false;
    // A new tag or gathering: the previous verdict does not carry over.
    setViewer('loading');
    (async (): Promise<'member' | 'other'> => {
      const userId = await getSessionUserId();
      if (userId === null) return 'other';
      // The tag's owner: a member by construction, not necessarily the host.
      if (userId === ownerId) return 'member';
      // Already in it? A member's get succeeds; anyone else's is NOT_FOUND,
      // the same answer as a gathering that does not exist.
      return api.app.gatherings.get({ id: gathering.id }).then(
        () => 'member' as const,
        () => 'other' as const,
      );
    })()
      // A failed session read falls back to the safe default, never a stuck card.
      .catch(() => 'other' as const)
      .then((next) => {
        if (!cancelled) setViewer(next);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId, gathering.id]);
  if (viewer === 'loading') return null;
  const isMember = viewer === 'member';
  return (
    <Link
      className={isMember ? 'btn' : 'btn btn--connect'}
      to="/gatherings/$id"
      params={{ id: gathering.id }}
      // Display-only hints; the returnTo guard refuses control characters and
      // backslashes, so they must not enter the URL in the first place.
      // oxlint-disable-next-line no-control-regex -- stripping control chars is the point
      search={{ title: gathering.title.replace(/[\\\u0000-\u001f]/g, ' '), starts_at: gathering.starts_at }}
    >
      {isMember ? 'Open gathering' : 'Join this gathering'}
    </Link>
  );
}
```

**Step 2:** In `ConnectAction`:
- insert `if (viewer === 'loading') return null;` directly after the `useEffect` (before `if (viewer === 'self')`), commented: "Nothing until the session read settles: the owner must never see Connect first.";
- change the button's `disabled={viewer === 'loading' || send === 'sending'}` to `disabled={send === 'sending'}`.

**Verify:** `bun run --cwd apps/web typecheck && bun run lint` are clean.

**Commit**

```bash
git add 'apps/web/src/routes/t.$uid.tsx'
git commit -m "Web: a member's tap opens the gathering; the owner never sees Connect first

The resolver asks gatherings.get whether a signed-in viewer is already in
(NOT_FOUND for everyone else, as for a missing gathering) and renders no
action until it knows, for Connect as for Join.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Web e2e

**Files:**
- Modify: `apps/web/e2e/helpers.ts`, `apps/web/e2e/handshake.spec.ts`, `apps/web/e2e/gatherings.spec.ts`
- Create: `apps/web/e2e/connections.spec.ts`, `apps/web/e2e/profile.spec.ts`

**Note (found while running this task): the shell's profile gate moved from the `_app` loader to its component.** `throw redirect('/profile')` from the `_app` loader targets a route under the same layout, so TanStack Router reuses the redirected `/_app` match for the target (one shared `_nonReactive`). When the pending shell was already committed (profile fetch near `defaultPendingMs`) and Profile's own loader was still fetching after `/_app`'s `loadPromise` cleared, React re-rendered the stale "redirected" match and TanStack threw `undefined`, which passes every `CatchBoundary`; on a lost last retry the root unmounted and `/profile` went blank. `_app.tsx` now returns `{ profile }` from the loader and its `ShellRoute` component renders `<Navigate to="/profile" search={{ returnTo }} replace />` (over `ShellPending`) when there is no profile and the path is not `/profile`. Measured with a 118–128 ms delay on `/rpc/**`: 14 of 40 runs threw before, 0 of 40 after. The gate now applies on every shell render without a profile, not only on entry or a stale reload. Separately: e2e runs on a Mac in clamshell maintenance sleep fail in bursts that match `pmset -g log` sleep entries; run the suite on power with the machine awake.

**Step 1:** Append to `helpers.ts`:

```ts
/** Signs up from /login and creates the profile; lands on Events, the default. */
export async function signUpWithProfile(page: Page, email: string, name: string): Promise<void> {
  await page.goto('/login');
  await signUp(page, email);
  await page.waitForURL(/\/profile\?/);
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL('**/gatherings');
}

/** Provisions a fresh tag, signs up from its tap, and claims it. Returns the uid. */
export async function claimFreshTag(page: Page, email: string, name: string): Promise<string> {
  const uid = freshUid();
  const { error } = await admin.from('tags').insert({ uid });
  if (error) throw error;
  await page.goto(`/t/${uid}`);
  await page.waitForURL('**/login**');
  await signUp(page, email);
  await page.waitForURL(`**/claim/${uid}`);
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Claim tag' }).click();
  await page.waitForURL(`**/t/${uid}`);
  return uid;
}
```

**Step 2:** `handshake.spec.ts` (already done in Task 11, which broke the old block; shown for reference): the "Ada accepts" block reads:

```ts
  // --- Ada accepts from the Requests segment; both see the connection --------
  await ada.goto('/connections');
  const adaSegments = ada.getByRole('navigation', { name: 'Connections lists' });
  await expect(ada.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
  await adaSegments.getByRole('link', { name: 'Requests, 1 pending' }).click();
  await expect(ada.getByText('Smoke Bob')).toBeVisible();
  await ada.getByRole('button', { name: 'Accept' }).click();
  await expect(ada.getByText('No requests right now.')).toBeVisible();
  await expect(adaSegments.getByRole('link', { name: 'Requests', exact: true })).toBeVisible();
  await adaSegments.getByRole('link', { name: 'Connections' }).click();
  await expect(ada.getByText('Smoke Bob')).toBeVisible();

  await bob.goto('/connections');
  await expect(bob.getByText('Smoke Ada')).toBeVisible();
```

**Step 3:** `gatherings.spec.ts`: before `// --- Ada sees Bob too`, add:

```ts
  // Tapping the tag again as a member opens the gathering instead of inviting twice.
  await bob.goto(`/t/${uid}`);
  await expect(bob.getByRole('link', { name: 'Open gathering' })).toBeVisible();
```

**Step 4:** `connections.spec.ts`:

```ts
// Connections: three lists behind segments, each on its own ladder.
import { expect, test } from '@playwright/test';
import { signUpWithProfile } from './helpers.ts';

test('a failed list says so with a retry; the other lists still render', async ({ page }) => {
  await signUpWithProfile(page, `smoke-lists-${Date.now()}@rls.test`, 'Smoke Lists');

  await page.goto('/connections');
  const segments = page.getByRole('navigation', { name: 'Connections lists' });
  await expect(segments.getByRole('link', { name: 'Connections' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText("No connections yet. Tap someone's tag to start.")).toBeVisible();
  await segments.getByRole('link', { name: 'Requests' }).click();
  await expect(page).toHaveURL(/\/connections\?tab=requests$/);
  await expect(page.getByText('No requests right now.')).toBeVisible();

  // Break one list, then enter the page fresh.
  let failing = true;
  await page.route('**/rpc/app/blocks/list', (route) =>
    failing ? route.fulfill({ status: 500, body: '{}' }) : route.continue(),
  );
  await page.goto('/connections?tab=blocked');
  await expect(page.getByText("Couldn't load your block list.")).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

  await segments.getByRole('link', { name: 'Connections' }).click();
  await expect(page.getByText("No connections yet. Tap someone's tag to start.")).toBeVisible();

  await segments.getByRole('link', { name: 'Blocked' }).click();
  await expect(page.getByText("Couldn't load your block list.")).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No one is blocked.')).toBeVisible();
});
```

**Step 5:** `profile.spec.ts`:

```ts
// Profile: the photo, My tags, and deleting the account.
import { expect, test } from '@playwright/test';
import { admin, claimFreshTag, signUpWithProfile } from './helpers.ts';

test('a photo replaces the initial: uploaded, shown, removable', async ({ page }) => {
  await signUpWithProfile(page, `smoke-photo-${Date.now()}@rls.test`, 'Smoke Photo');
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Profile' }).click();

  // A landscape PNG made in the page: the client must square and shrink it.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#336699';
    g.fillRect(0, 0, 800, 600);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Add a photo').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByText('Photo updated.')).toBeVisible();

  const img = page.locator('.avatar-field img');
  await expect(img).toHaveAttribute(
    'src',
    /\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/,
  );
  const served = await page.request.get((await img.getAttribute('src'))!);
  expect(served.ok()).toBe(true);
  expect(['image/webp', 'image/jpeg']).toContain(served.headers()['content-type']);

  await page.reload();
  await expect(img).toBeVisible();
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByText('Photo removed.')).toBeVisible();
  await expect(img).toHaveCount(0);
});

test('My tags: a claimed tag turns off and on, and re-points at a gathering', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const uid = await claimFreshTag(owner, `smoke-tags-${Date.now()}@rls.test`, 'Smoke Tags');

  await owner.goto('/profile');
  await expect(owner.getByText(uid, { exact: true })).toBeVisible();
  await expect(owner.getByText('A tap shows your card.')).toBeVisible();
  await owner.getByRole('button', { name: `Turn off ${uid}` }).click();
  await expect(owner.getByText('Off. A tap shows an inactive tag.')).toBeVisible();

  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/t/${uid}`);
  await expect(stranger.getByRole('heading', { name: 'This tag is inactive' })).toBeVisible();

  await owner.getByRole('button', { name: `Turn on ${uid}` }).click();
  await expect(owner.getByText('A tap shows your card.')).toBeVisible();
  await stranger.reload();
  await expect(stranger.getByRole('heading', { name: 'Smoke Tags' })).toBeVisible();

  await owner.goto('/gatherings');
  await owner.getByLabel('Title').fill('Smoke Tag Night');
  await owner.getByRole('button', { name: 'Create gathering' }).click();
  await expect(owner.getByText('Smoke Tag Night')).toBeVisible();
  await owner.goto('/profile');
  // exact: the Save button's name ("Save where … points") contains the label.
  await owner.getByLabel(`Where ${uid} points`, { exact: true }).selectOption({ index: 1 });
  await owner.getByRole('button', { name: `Save where ${uid} points` }).click();
  await expect(owner.getByText('A tap invites people to Smoke Tag Night.')).toBeVisible();
  await stranger.reload();
  await expect(stranger.getByText(/Smoke Tag Night/)).toBeVisible();

  await owner.getByLabel(`Where ${uid} points`, { exact: true }).selectOption('profile');
  await owner.getByRole('button', { name: `Save where ${uid} points` }).click();
  await expect(owner.getByText('A tap shows your card.')).toBeVisible();
});

test('deleting the account signs out and releases the tag', async ({ page }) => {
  const uid = await claimFreshTag(page, `smoke-leaving-${Date.now()}@rls.test`, 'Smoke Leaving');

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page.getByText(/This can't be undone/)).toBeVisible();
  await page.getByRole('button', { name: 'Delete my account' }).click();

  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  const { data } = await admin.from('tags').select('status').eq('uid', uid).single();
  expect(data?.status).toBe('unclaimed');
  await page.goto(`/t/${uid}`);
  await page.waitForURL('**/login**'); // unclaimed again: the claim flow, signed out
});
```

**Verify:** `cd apps/web && CI=1 bunx playwright test; cd ../..` prints `14 passed`.

**Commit**

```bash
git add apps/web/e2e
git commit -m "Web e2e: accept from the Requests segment; the list ladder; photo, My tags, deletion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17a: Mobile: list primitives in `ui.tsx` (the row overflow fix)

**Files:** Modify `apps/mobile/components/ui.tsx`.

**Step 1:** `ui.tsx`:

(a) `Button` gains `inline`. Extend its props with

```ts
  /** Size to the label instead of filling the card: for actions inside rows. */
  inline?: boolean;
```

destructure `inline = false`, and put `inline && styles.buttonInline,` right after `styles.button,` in the style array.

(b) Append these exports before `const styles`:

```tsx
export type ListState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: T[] };

/** A section heading inside a screen (the mirror of web's .section-title). */
export function SectionHeader({ children }: { children: ReactNode }) {
  const t = useTokens();
  return (
    <Text accessibilityRole="header" style={[styles.sectionHeader, { color: t.ink }]}>
      {children}
    </Text>
  );
}

/** The typed empty state at the bottom of the ladder. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <Muted>{children}</Muted>;
}

/**
 * Every list climbs the same ladder: loading → error with retry → typed
 * empty → content. `what` completes "Couldn't load …".
 */
export function ListLadder<T>({
  state,
  what,
  empty,
  onRetry,
  children,
}: {
  state: ListState<T>;
  what: string;
  empty: string;
  onRetry: () => void;
  children: (items: T[]) => ReactNode;
}) {
  if (state.status === 'loading') {
    return (
      <Muted accessibilityRole="progressbar" accessibilityLiveRegion="polite">
        Loading…
      </Muted>
    );
  }
  if (state.status === 'error') {
    return (
      <View style={styles.ladderError}>
        <ErrorText>{`Couldn't load ${what}.`}</ErrorText>
        <Button label="Try again" kind="quiet" onPress={onRetry} />
      </View>
    );
  }
  if (state.items.length === 0) return <EmptyState>{empty}</EmptyState>;
  return <>{children(state.items)}</>;
}

/**
 * A person in a list. Actions sit on their own line under the name and
 * wrap, so two buttons never push past the card (the Accept overflow): the
 * same rule app.css applies to rows under 480px.
 */
export function PersonRow({
  name,
  path,
  sub,
  children,
}: {
  name: string;
  path: string | null;
  sub?: string | null;
  children?: ReactNode;
}) {
  const t = useTokens();
  return (
    <View style={[styles.personRow, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.personMain}>
        <Avatar name={name} path={path} size={44} />
        <View style={styles.personBody}>
          <Text numberOfLines={2} style={[styles.personName, { color: t.ink }]}>
            {name}
          </Text>
          {sub ? (
            <Text numberOfLines={2} style={[styles.personSub, { color: t.inkMuted }]}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
      {children ? <View style={styles.personActions}>{children}</View> : null}
    </View>
  );
}

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
  /** Shown as an ink badge (never the accent); read as "<label>, <count> <countNoun>". */
  count?: number;
  countNoun?: string;
}

/** In-page segments. Selected = ink weight + a 2px ink underline, never the accent. */
export function SegmentedTabs<K extends string>({
  items,
  active,
  onChange,
}: {
  items: SegmentItem<K>[];
  active: K;
  onChange: (key: K) => void;
}) {
  const t = useTokens();
  return (
    <View accessibilityRole="tablist" style={[styles.segments, { borderBottomColor: t.border }]}>
      {items.map((item) => {
        const selected = item.key === active;
        const count = item.count ?? 0;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={
              count > 0 ? `${item.label}, ${count} ${item.countNoun ?? ''}`.trim() : item.label
            }
            onPress={() => onChange(item.key)}
            style={[styles.segment, { borderBottomColor: selected ? t.ink : 'transparent' }]}
          >
            <Text
              style={[
                styles.segmentLabel,
                { color: selected ? t.ink : t.inkMuted, fontFamily: selected ? fonts.bodySemiBold : fonts.body },
              ]}
            >
              {item.label}
            </Text>
            {count > 0 ? (
              <View style={[styles.badge, { backgroundColor: t.ink }]}>
                <Text style={[styles.badgeLabel, { color: t.surface }]}>
                  {count > 99 ? '99+' : String(count)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
```

(c) Add to `StyleSheet.create({...})`:

```ts
  buttonInline: {
    width: 'auto',
    maxWidth: '100%',
    flexShrink: 1,
    minHeight: TAP_TARGET,
    paddingHorizontal: space.s4,
  },
  sectionHeader: {
    fontFamily: fonts.display,
    fontSize: 20,
    letterSpacing: -0.2,
    marginTop: space.s4,
  },
  ladderError: {
    width: '100%',
    alignItems: 'center',
    gap: space.s2,
  },
  personRow: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    gap: space.s2,
  },
  personMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
  },
  personBody: { flex: 1, minWidth: 0 },
  personName: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  personSub: { fontFamily: fonts.body, fontSize: 14 },
  personActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.s2,
  },
  segments: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s2,
    minHeight: TAP_TARGET,
    paddingHorizontal: space.s2,
    borderBottomWidth: 2,
    marginBottom: -1,
  },
  segmentLabel: { fontSize: 15 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    paddingHorizontal: space.s2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
```

(d) `Muted` passes extra Text props through (the ladder's loading line is announced), with `type TextProps` added to the `react-native` import:

```tsx
/** Extra Text props (accessibility, mostly) pass through; the style is fixed. */
export function Muted({ children, ...textProps }: Omit<TextProps, 'style'> & { children: ReactNode }) {
  const t = useTokens();
  return (
    <Text {...textProps} style={[styles.muted, { color: t.inkMuted }]}>
      {children}
    </Text>
  );
}
```

**Verify:** `bun run --cwd apps/mobile typecheck && bun run lint` are clean. Nothing uses the new primitives yet; Task 17b does.

**Commit**

```bash
git add apps/mobile/components/ui.tsx
git commit -m "Mobile: list primitives in ui.tsx; Button inline, PersonRow keeps actions inside the row

Button gains inline (sizes to its label). PersonRow puts actions on their
own wrapping line under the name, the rule app.css applies under 480px, so
two buttons never push past the card. SegmentedTabs (ink, never the
accent) carries counts; ListLadder, EmptyState and SectionHeader are the
spec's mobile list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17b: Mobile: the Connections segments on the ladder

**Files:** Modify `apps/mobile/app/(tabs)/connections.tsx`.

**Step 1:** Replace `app/(tabs)/connections.tsx` entirely, using Task 17a's primitives:

```tsx
import type { ConnectRequest, Connection } from '@withme/contract';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import {
  Button,
  ErrorText,
  ListLadder,
  PersonRow,
  SegmentedTabs,
  type ListState,
} from '../../components/ui';
import { api, type Api } from '../../lib/api';
import { space, useTokens } from '../../lib/tokens';

type BlockRow = Awaited<ReturnType<Api['app']['blocks']['list']>>['blocks'][number];
type Segment = 'connections' | 'requests' | 'blocked';
type ListKey = 'pending' | 'connections' | 'blocks';

/**
 * Settle one list into its ladder state; a failure stays on that list.
 * `isLatest` drops a stale answer: a focus reload and an action reload can
 * overlap, and the slower one must not overwrite the newer.
 */
async function settleInto<T>(
  load: () => Promise<T[]>,
  set: (state: ListState<T>) => void,
  isLatest: () => boolean,
) {
  let next: ListState<T>;
  try {
    next = { status: 'ready', items: await load() };
  } catch {
    next = { status: 'error' };
  }
  if (isLatest()) set(next);
}

/**
 * Connections: three lists behind in-page segments, mirroring the web tab.
 * Each list loads and fails on its own and climbs the same ladder.
 * Reloaded on focus: a request may have arrived while you were elsewhere.
 */
export default function ConnectionsScreen() {
  const t = useTokens();
  const [segment, setSegment] = useState<Segment>('connections');
  const [pending, setPending] = useState<ListState<ConnectRequest>>({ status: 'loading' });
  const [connections, setConnections] = useState<ListState<Connection>>({ status: 'loading' });
  const [blocks, setBlocks] = useState<ListState<BlockRow>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // One counter per list: every load (a retry included) takes the next
  // number, and only the latest number's answer lands.
  const seq = useRef<Record<ListKey, number>>({ pending: 0, connections: 0, blocks: 0 });
  const ticket = useCallback((list: ListKey) => {
    const mine = ++seq.current[list];
    return () => seq.current[list] === mine;
  }, []);

  const loadPending = useCallback(
    () =>
      settleInto(
        async () => (await api.app.requests.listPending()).requests,
        setPending,
        ticket('pending'),
      ),
    [ticket],
  );
  const loadConnections = useCallback(
    () =>
      settleInto(
        async () => (await api.app.connections.list()).connections,
        setConnections,
        ticket('connections'),
      ),
    [ticket],
  );
  const loadBlocks = useCallback(
    () => settleInto(async () => (await api.app.blocks.list()).blocks, setBlocks, ticket('blocks')),
    [ticket],
  );
  const loadAll = useCallback(
    () => Promise.all([loadPending(), loadConnections(), loadBlocks()]),
    [loadPending, loadConnections, loadBlocks],
  );

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

  async function act(id: string, work: () => Promise<unknown>) {
    setBusyIds((prev) => new Set(prev).add(id));
    setActionError(null);
    try {
      await work();
    } catch {
      const message = "That didn't go through. Try again.";
      setActionError(message);
      // The message sits above the lists, so bring it into view; iOS does
      // not announce accessibilityRole="alert", so say it outright.
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      AccessibilityInfo.announceForAccessibility(message);
    }
    // Reload either way: a failure may mean the row is stale (a request
    // withdrawn, a connection already gone), and the reload clears it.
    // settleInto never throws, so the busy flag always clears.
    await loadAll();
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const quiet = (label: string, id: string, work: () => Promise<unknown>) => (
    <Button inline label={label} kind="quiet" disabled={busyIds.has(id)} onPress={() => act(id, work)} />
  );
  const requestCount = pending.status === 'ready' ? pending.items.length : 0;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await loadAll();
            setRefreshing(false);
          }}
        />
      }
    >
      <SegmentedTabs
        items={[
          { key: 'connections', label: 'Connections' },
          { key: 'requests', label: 'Requests', count: requestCount, countNoun: 'pending' },
          { key: 'blocked', label: 'Blocked' },
        ]}
        active={segment}
        onChange={setSegment}
      />
      {actionError ? <ErrorText>{actionError}</ErrorText> : null}

      {segment === 'requests' ? (
        <ListLadder
          state={pending}
          what="your requests"
          empty="No requests right now."
          onRetry={() => {
            setPending({ status: 'loading' });
            loadPending();
          }}
        >
          {(requests) =>
            requests.map((request) => (
              <PersonRow
                key={request.id}
                name={request.requester.display_name}
                path={request.requester.avatar_path}
                sub={request.requester.bio}
              >
                {/* Accepting completes the handshake — the accent's job. */}
                <Button
                  inline
                  label="Accept"
                  kind="connect"
                  disabled={busyIds.has(request.id)}
                  onPress={() => act(request.id, () => api.app.requests.accept({ id: request.id }))}
                />
                {quiet('Decline', request.id, () => api.app.requests.decline({ id: request.id }))}
              </PersonRow>
            ))
          }
        </ListLadder>
      ) : segment === 'blocked' ? (
        <ListLadder
          state={blocks}
          what="your block list"
          empty="No one is blocked."
          onRetry={() => {
            setBlocks({ status: 'loading' });
            loadBlocks();
          }}
        >
          {(list) =>
            list.map((block) => (
              <PersonRow key={block.user.id} name={block.user.display_name} path={block.user.avatar_path}>
                {quiet('Unblock', block.user.id, () => api.app.blocks.unblock({ user_id: block.user.id }))}
              </PersonRow>
            ))
          }
        </ListLadder>
      ) : (
        <ListLadder
          state={connections}
          what="your connections"
          empty="No connections yet. Tap someone's tag to start."
          onRetry={() => {
            setConnections({ status: 'loading' });
            loadConnections();
          }}
        >
          {(list) =>
            list.map((connection) => (
              <PersonRow
                key={connection.id}
                name={connection.profile.display_name}
                path={connection.profile.avatar_path}
                sub={connection.profile.bio}
              >
                {quiet('Remove', connection.id, () => api.app.connections.remove({ id: connection.id }))}
                {quiet('Block', connection.id, () =>
                  api.app.blocks.block({ user_id: connection.profile.id }),
                )}
              </PersonRow>
            ))
          }
        </ListLadder>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.s5,
    gap: space.s3,
  },
});
```

**Verify:** `bun run --cwd apps/mobile typecheck && bun run lint` are clean. (The simulator check of this screen is in Task 21.)

**Commit**

```bash
git add 'apps/mobile/app/(tabs)/connections.tsx'
git commit -m "Mobile: Connections as three segments on the list ladder; Accept stays inside the card

Each list loads and fails on its own and reloads on focus. Rows are
PersonRow, so Accept and Decline wrap under the name instead of
overflowing; the Requests segment carries an ink count of your own inbox.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Mobile: the photo (picker and upload)

**Files:**
- Create: `apps/mobile/components/AvatarPicker.tsx`
- Modify: `apps/mobile/app/(tabs)/profile.tsx`

The two Expo modules, the `app.json` plugin entry and `squareAvatar` in `lib/avatar.ts` already exist: Task 10b installed them and proved the upload chain on the simulator. This task builds the real control on them.

**Step 1:** `components/AvatarPicker.tsx`:

```tsx
import type { Profile } from '@withme/contract';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { squareAvatar } from '../lib/avatar';
import { fonts, space, useTokens } from '../lib/tokens';
import { Avatar, Button } from './ui';

type PhotoState = 'idle' | 'working' | 'done' | 'removed' | 'failed' | 'unreadable';

const MESSAGES: Record<Exclude<PhotoState, 'idle'>, string> = {
  working: 'Uploading…',
  done: 'Photo updated.',
  removed: 'Photo removed.',
  failed: "That didn't go through. Try again.",
  unreadable: "That photo couldn't be read. Try a different one.",
};

/**
 * The profile photo: the system picker (square crop), a 512px JPEG made on
 * the device, sent as a File through app.profile.uploadAvatar. The app
 * never talks to Storage itself.
 */
export function AvatarPicker({
  name,
  path,
  onChange,
}: {
  name: string;
  path: string | null;
  onChange: (profile: Profile) => void;
}) {
  const t = useTokens();
  const [state, setState] = useState<PhotoState>('idle');
  const working = state === 'working';

  async function choose() {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    setState('working');
    let file: File;
    try {
      file = await squareAvatar(asset);
    } catch {
      setState('unreadable');
      return;
    }
    try {
      const { profile } = await api.app.profile.uploadAvatar({ file });
      onChange(profile);
      setState('done');
    } catch {
      setState('failed');
    }
  }

  async function remove() {
    setState('working');
    try {
      const { profile } = await api.app.profile.removeAvatar();
      onChange(profile);
      setState('removed');
    } catch {
      setState('failed');
    }
  }

  return (
    <View style={styles.field}>
      <Avatar name={name} path={path} />
      <View style={styles.actions}>
        <Button
          inline
          kind="quiet"
          label={path ? 'Change photo' : 'Add a photo'}
          disabled={working}
          onPress={choose}
        />
        {path ? <Button inline kind="quiet" label="Remove photo" disabled={working} onPress={remove} /> : null}
      </View>
      {state !== 'idle' ? (
        <Text accessibilityRole="text" style={[styles.status, { color: t.inkMuted }]}>
          {MESSAGES[state]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { alignItems: 'center', gap: space.s2, width: '100%' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.s2 },
  status: { fontFamily: fonts.body, fontSize: 15, textAlign: 'center' },
});
```

**Step 2:** `(tabs)/profile.tsx`:
- import `AvatarPicker` from `'../../components/AvatarPicker'`;
- add `const [avatarPath, setAvatarPath] = useState<string | null>(null);`;
- in `load`'s `if (profile)`, add `setAvatarPath(profile.avatar_path);`;
- in the main card, directly under `<Title>`, add:

```tsx
          {/* The photo lives on the profile row: it needs the row to exist first. */}
          {exists ? (
            <AvatarPicker
              name={displayName}
              path={avatarPath}
              onChange={(profile) => setAvatarPath(profile.avatar_path)}
            />
          ) : null}
```

- change `styles.content` to `{ padding: space.s5, gap: space.s4 }` (top-aligned: the screen grows sections in Tasks 19a and 19b).

**Verify:** `bun run --cwd apps/mobile typecheck && bun run lint` are clean. (Task 10b proved the transport; Task 21 step 1 checks this control on the simulator.)

**Commit**

```bash
git add apps/mobile/components/AvatarPicker.tsx 'apps/mobile/app/(tabs)/profile.tsx'
git commit -m "Mobile: add a photo from Profile; cropped and shrunk to 512px on the device

AvatarPicker opens the system picker with a square crop, makes a 512px
JPEG with squareAvatar (Task 10b), and sends it as a File through
app.profile.uploadAvatar. Remove photo clears it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19a: Mobile: Profile → My tags

**Files:**
- Create: `apps/mobile/lib/my-tags.ts`, `apps/mobile/components/MyTags.tsx`

**Step 1:** `lib/my-tags.ts`: identical to the web file in Task 13, except the import line reads `import { formatStartsAt } from './format-time';` (the mobile convention, no extension).

**Step 2:** `components/MyTags.tsx`:

```tsx
import { Feather } from '@expo/vector-icons';
import type { Destination, Gathering, Tag } from '@withme/contract';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import {
  describeTag,
  destinationFromKey,
  destinationKey,
  gatheringChoiceLabel,
} from '../lib/my-tags';
import { fonts, radius, space, TAP_TARGET, useTokens } from '../lib/tokens';
import { Button, ErrorText, ListLadder, SectionHeader, type ListState } from './ui';

type TagPatch = { destination: Destination } | { status: 'claimed' | 'disabled' };

/**
 * Profile → My tags, the mirror of web's: what a tap does now, where it
 * points, off and on. Through app.tags.listMine / update only. Reloaded on
 * focus: a gathering detail may have pointed your tags somewhere new.
 */
export function MyTags() {
  const [tags, setTags] = useState<ListState<Tag>>({ status: 'loading' });
  // null when not loaded: describeTag never claims you left a gathering it could not see.
  const [gatherings, setGatherings] = useState<Gathering[] | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [mine, yours] = await Promise.allSettled([
      api.app.tags.listMine(),
      api.app.gatherings.listMine(),
    ]);
    setTags(mine.status === 'fulfilled' ? { status: 'ready', items: mine.value.tags } : { status: 'error' });
    setGatherings(yours.status === 'fulfilled' ? yours.value.gatherings : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function update(uid: string, patch: TagPatch) {
    setBusyUid(uid);
    setError(null);
    try {
      await api.app.tags.update({ uid, ...patch });
      await load();
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <>
      <SectionHeader>My tags</SectionHeader>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <ListLadder
        state={tags}
        what="your tags"
        empty="No tags yet. Tap an unclaimed tag to claim it."
        onRetry={() => {
          setTags({ status: 'loading' });
          load();
        }}
      >
        {(list) =>
          list.map((tag) => (
            <TagRow
              key={tag.uid}
              tag={tag}
              gatherings={gatherings}
              busy={busyUid === tag.uid}
              onUpdate={(patch) => update(tag.uid, patch)}
            />
          ))
        }
      </ListLadder>
    </>
  );
}

function TagRow({
  tag,
  gatherings,
  busy,
  onUpdate,
}: {
  tag: Tag;
  gatherings: Gathering[] | null;
  busy: boolean;
  onUpdate: (patch: TagPatch) => void;
}) {
  const t = useTokens();
  const [choosing, setChoosing] = useState(false);
  const current = destinationKey(tag.destination);
  const off = tag.status === 'disabled';
  const choices = [
    { key: 'profile', label: 'My profile' },
    ...(gatherings ?? []).map((g) => ({ key: `gathering:${g.id}`, label: gatheringChoiceLabel(g) })),
  ];
  return (
    <View style={[styles.tag, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.uid, { color: t.ink }]}>{tag.uid}</Text>
      <Text style={[styles.sub, { color: t.inkMuted }]}>{describeTag(tag, gatherings)}</Text>
      <View style={styles.actions}>
        <Button
          inline
          kind="quiet"
          label={choosing ? 'Close' : 'Point it at…'}
          accessibilityLabel={choosing ? `Close where ${tag.uid} points` : `Point it at…, ${tag.uid}`}
          expanded={choosing}
          disabled={busy}
          onPress={() => setChoosing((open) => !open)}
        />
        <Button
          inline
          kind="quiet"
          label={off ? 'Turn on' : 'Turn off'}
          accessibilityLabel={`${off ? 'Turn on' : 'Turn off'} ${tag.uid}`}
          disabled={busy}
          onPress={() => onUpdate({ status: off ? 'claimed' : 'disabled' })}
        />
      </View>
      {choosing ? (
        <View accessibilityRole="radiogroup" style={styles.choices}>
          {choices.map((choice) => {
            const selected = choice.key === current;
            return (
              <Pressable
                key={choice.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: busy }}
                disabled={busy || selected}
                onPress={() => {
                  setChoosing(false);
                  onUpdate({ destination: destinationFromKey(choice.key) });
                }}
                style={({ pressed }) => [
                  styles.choice,
                  { borderColor: t.border },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text
                  style={[
                    styles.choiceLabel,
                    { color: t.ink, fontFamily: selected ? fonts.bodySemiBold : fonts.body },
                  ]}
                >
                  {choice.label}
                </Text>
                {selected ? <Feather name="check" size={18} color={t.ink} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    gap: space.s1,
  },
  uid: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  sub: { fontFamily: fonts.body, fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.s2 },
  choices: { gap: space.s1 },
  choice: {
    minHeight: TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s2,
    borderTopWidth: 1,
    paddingHorizontal: space.s2,
  },
  choiceLabel: { fontSize: 15, flexShrink: 1 },
});
```

**Verify:** `bun run --cwd apps/mobile typecheck && bun run lint` are clean. The Profile screen renders `MyTags` in Task 19b.

**Commit**

```bash
git add apps/mobile/lib/my-tags.ts apps/mobile/components/MyTags.tsx
git commit -m "Mobile: My tags, mirroring web: what a tap does, where it points, off and on

Through app.tags.listMine / update only, reloaded on focus. The destination
is an expandable radio list behind \"Point it at…\"; a gatherings list that
failed to load is never read as a gathering you left.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19b: Mobile: Profile → Account, and the Profile wiring

**Files:**
- Create: `apps/mobile/components/AccountSection.tsx`
- Modify: `apps/mobile/app/(tabs)/profile.tsx`

**Step 1:** `components/AccountSection.tsx`:

```tsx
import { router } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, Alert, Platform, View } from 'react-native';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorText, SectionHeader } from './ui';

const DELETE_COPY =
  "Your profile, connections, requests, blocks, and the gatherings you host are deleted, and your photo with them. Your tags are released so anyone can claim them. This can't be undone.";

const FAILED = "That didn't go through. Try again.";

/** iOS has no live regions, so say it outright; Android reads the live region below. */
function announceFailure() {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(FAILED);
}

/**
 * Profile → Account: sign out, and delete the account behind the system's
 * destructive confirmation. Afterwards the session is dropped locally only;
 * the server no longer has it.
 */
export function AccountSection() {
  const [state, setState] = useState<'idle' | 'signingOut' | 'deleting'>('idle');
  const [failed, setFailed] = useState(false);
  const working = state !== 'idle';

  async function signOut() {
    setState('signingOut');
    setFailed(false);
    let ok: boolean;
    try {
      // auth-js reports a network failure as { error } and keeps the session.
      const { error } = await supabase.auth.signOut();
      ok = error === null;
    } catch {
      ok = false;
    }
    if (!ok) {
      // Still signed in: stay here rather than leave a live session behind the login screen.
      setState('idle');
      setFailed(true);
      announceFailure();
      return;
    }
    // Belt and braces: Stack.Protected already falls back to login when the session drops.
    router.replace('/login');
  }

  async function deleteAccount() {
    setState('deleting');
    setFailed(false);
    try {
      await api.app.profile.deleteAccount();
    } catch {
      setState('idle');
      setFailed(true);
      announceFailure();
      return;
    }
    // The account is gone server-side either way: leave even if dropping the
    // local copy fails, rather than stick on "Deleting…".
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Nothing to recover: the session it held no longer exists.
    } finally {
      // Explicit, so leaving never depends on the local sign-out having succeeded.
      router.replace('/login');
    }
  }

  function confirmDelete() {
    Alert.alert('Delete your account?', DELETE_COPY, [
      { text: 'Keep my account', style: 'cancel' },
      { text: 'Delete my account', style: 'destructive', onPress: deleteAccount },
    ]);
  }

  return (
    <>
      <SectionHeader>Account</SectionHeader>
      <Card>
        <Button label="Sign out" kind="quiet" disabled={working} onPress={signOut} />
        <Button
          label={state === 'deleting' ? 'Deleting…' : 'Delete account'}
          kind="quiet"
          disabled={working}
          onPress={confirmDelete}
        />
        {/* Always mounted: a live region created with its message is not announced. */}
        <View accessibilityLiveRegion="polite">{failed ? <ErrorText>{FAILED}</ErrorText> : null}</View>
      </Card>
    </>
  );
}
```

**Step 2:** `(tabs)/profile.tsx`:
- import `MyTags` (Task 19a) and `AccountSection`;
- delete the module-level `signOut()`, the "Sign out" `Button`, and the now-unused `supabase` import;
- after the main `</Card>`, render `{exists ? <MyTags /> : null}` and then `<AccountSection />`;
- in the `loadFailed` branch, render `<AccountSection />` after its `</Card>` too (signing out stays possible when the load fails).

**Verify:** `bun run --cwd apps/mobile typecheck && bun run lint` are clean.

**Commit**

```bash
git add apps/mobile/components/AccountSection.tsx 'apps/mobile/app/(tabs)/profile.tsx'
git commit -m "Mobile: Profile -> My tags and Account, mirroring web

Account holds sign out and deletion behind the system's destructive
confirmation; it renders even when the profile failed to load, so signing
out stays possible.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Mobile: M2 carry-overs (resolver, member row, edit copy)

**Files:** Modify `apps/mobile/app/t/[uid].tsx`, `apps/mobile/app/gathering/[id].tsx`.

**Step 1:** `t/[uid].tsx`: at the call site, `hostId={result.profile.id}` becomes `ownerId={result.profile.id}` (the tag owner, a member of the gathering, not necessarily the host). Then replace `GatheringInvite` with:

```tsx
/**
 * gathering/[id] sits behind Stack.Protected: a signed-out push would bounce
 * to the anchor and lose the id, so the signed-out path carries the id and
 * the display hints through login. The tag's owner and other members have
 * nothing to join and get "Open gathering" in the default style. Until we
 * know which, no button: guessing "Join" would flash the accent at a member.
 */
function GatheringInvite({ gathering, ownerId }: { gathering: GatheringSummary; ownerId: string }) {
  const [viewer, setViewer] = useState<'loading' | 'anon' | 'member' | 'other'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<'anon' | 'member' | 'other'> => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return 'anon';
      // The tag's owner: a member by construction, not necessarily the host.
      if (userId === ownerId) return 'member';
      // Already in it? A member's get succeeds; anyone else's is NOT_FOUND.
      return api.app.gatherings.get({ id: gathering.id }).then(
        () => 'member' as const,
        () => 'other' as const,
      );
    })().then((next) => {
      if (!cancelled) setViewer(next);
    });
    return () => {
      cancelled = true;
    };
  }, [ownerId, gathering.id]);

  if (viewer === 'loading') return null;
  const isMember = viewer === 'member';
  return (
    <Button
      kind={isMember ? 'default' : 'connect'}
      label={isMember ? 'Open gathering' : 'Join this gathering'}
      onPress={async () => {
        // Decided at tap time, not from the mount verdict: a session read that
        // failed then fell back to 'other', and a signed-out push to the
        // protected detail would bounce and lose the id.
        const { data } = await supabase.auth
          .getSession()
          .catch(() => ({ data: { session: null } }));
        if (!data.session) {
          router.push({
            pathname: '/login',
            params: { redirect: gatheringHref(gathering.id, gathering) },
          });
          return;
        }
        router.push({
          pathname: '/gathering/[id]',
          params: { id: gathering.id, title: gathering.title, starts_at: gathering.starts_at },
        });
      }}
    />
  );
}
```

In `ConnectAction`:
- insert `if (viewer === 'loading') return null;` right after its `useEffect`, with the comment "Nothing until the session read settles: the owner must never see Connect first.";
- change `disabled={viewer === 'loading' || send === 'sending'}` to `disabled={send === 'sending'}`.

**Step 2:** `gathering/[id].tsx`:

(a) The imports from `components/ui` become `Button, Card, ErrorText, Field, Muted, PersonRow, Title` (drop `Avatar`). Drop `radius` from the tokens import.

(b) In `GatheringDetail`, `run` gains a message parameter:

```ts
  async function run(
    work: () => Promise<unknown>,
    then: 'reload' | 'list',
    failure = "That didn't go through. Try again.",
  ) {
```

with its catch doing `setActionError(failure);`. The `EditFields` `onSave` becomes:

```tsx
              onSave={(patch) =>
                run(
                  () => api.app.gatherings.update({ id: gathering.id, ...patch }),
                  'reload',
                  // A form save says check the fields, as on web; one-tap actions keep the default.
                  'Could not save. Check the fields and try again.',
                )
              }
```

(c) Replace the `members.map(...)` block with:

```tsx
        {members.map((member) => (
          <PersonRow
            key={member.profile.id}
            name={member.profile.display_name}
            path={member.profile.avatar_path}
            // Web's convention: "Host" takes the sub line; the row's right side is for actions.
            sub={member.profile.id === gathering.host_id ? 'Host' : member.profile.bio}
          />
        ))}
```

(d) Delete `row`, `rowBody`, `rowName` and `rowSub` from `styles`.

**Verify:** `bun run --cwd apps/mobile typecheck && bun run lint` are clean.

**Commit**

```bash
git add 'apps/mobile/app/t/[uid].tsx' 'apps/mobile/app/gathering/[id].tsx'
git commit -m "Mobile: a member's tap opens the gathering; owner sees no Connect flash; detail matches web

The member row says Host on the sub line like web, through PersonRow; a
failed edit says \"Could not save. Check the fields and try again.\" like
web, while one-tap actions keep \"That didn't go through.\"

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Simulator pass

**Files:** none. Fix anything found in a small follow-up commit.

**Setup:** the repo's simulator technique, as in Task 10b: agent-device + Expo Go + simctl (the native simulator tool does not attach on this Mac, and `expo start --ios` cannot launch Simulator.app).
- `bun run db:reset && bun run db:seed`.
- In the background: `cd apps/api && bun run dev`, and `cd apps/mobile && bunx expo start --port 8081` (no `CI=1`: CI mode disables reloads).
- Boot the iPhone 17 Pro by UDID (`xcrun simctl list devices available | grep 'iPhone 17 Pro ('`, then `xcrun simctl boot <UDID>`); booting by name can fail with EINVAL or come up without a display. Open the project in Expo Go (SDK 56) with `xcrun simctl openurl booted exp://127.0.0.1:8081`.
- Put a photo in the library: `xcrun simctl addmedia booted apps/mobile/assets/icon.png`.
- Drive with `bunx agent-device … --platform ios --device "iPhone 17 Pro"`. Re-snapshot before every click (refs renumber); type in chunks, never starting a chunk with `-`; close the keyboard with its on-screen `return` key and **never `keyboard dismiss`**.
- Deep links: `withme://…` does not open inside Expo Go (error 115). Use `xcrun simctl openurl booted "exp://127.0.0.1:8081/--/t/<uid>"`.
- Screenshot each step: `xcrun simctl io booted screenshot ~/Desktop/m3-<n>.png`.

**Steps:**

1. **The photo.** Sign in as `ada@demo.withme.local` / `withme-demo-1`. Go to Profile → "Add a photo", pick the added photo, accept the square crop.
   - Expected: "Uploading…" then "Photo updated.", and the avatar shows the photo.
   - The API log shows `avatar uploaded`.
   - Read Ada's path with the `admin` client (the same script as Task 10b Step 5), then fetch it:

     ```bash
     cd packages/db && ADA_PATH=$(bun -e "
     import { admin } from './src/test-utils/index.ts';
     const { data: users } = await admin.auth.admin.listUsers();
     const ada = users.users.find((u) => u.email === 'ada@demo.withme.local');
     const { data } = await admin.from('profiles').select('avatar_path').eq('id', ada?.id ?? '').single();
     console.log(data?.avatar_path ?? '');
     "); cd ../..
     curl -sI "http://127.0.0.1:55321/storage/v1/object/public/avatars/$ADA_PATH"
     ```

     Expected: `200` with `content-type: image/jpeg` and `cache-control: max-age=3600`.
   - **If the upload fails** with BAD_REQUEST "Input validation failed", **stop** as in Task 10b: the transport regressed. Capture the API log and the RN error and report (Decision 5; do not switch transports unilaterally).
2. Deep link `xcrun simctl openurl booted "exp://127.0.0.1:8081/--/t/04BBBBBBBBBBBB"`.
   - Expected: Ada's card shows the photo, with "Open gathering" (default style).
   - There is never a flash of a disabled Connect: the button area is empty until it renders.
3. **Connections tab:**
   - Segments read Connections · Requests (ink badge "1") · Blocked.
   - Connections is empty: "No connections yet. Tap someone's tag to start."
   - Requests: Lin's row with Accept (accent) and Decline on their own line inside the card. Nothing overflows: take a screenshot at iPhone SE size too.
   - Accept → "No requests right now.", the badge disappears, and Connections lists Lin.
4. **The ladder.** Stop the API (Ctrl-C), then pull to refresh on Connections.
   - Expected: each segment shows "Couldn't load …" with "Try again".
   - Restart the API, tap Try again: the content is back.
5. **My tags:**
   - Profile shows two rows: `04BBBBBBBBBBBB` "A tap invites people to Rooftop listening session." and `04CCCCCCCCCCCC` "Off. A tap shows an inactive tag."
   - On `04BB…`: "Point it at…" → "My profile" → "A tap shows your card."
   - The deep link from step 2 now shows the plain card with "This is your tag."
   - On `04CC…`: "Turn on", then `exp://127.0.0.1:8081/--/t/04CCCCCCCCCCCC` shows Ada's card.
   - Point `04BB…` back at the gathering.
6. **Gathering detail** (Events → Rooftop):
   - Rows read "Ada / Host" and "Lin / Will trade book recs.".
   - Edit with the API stopped → "Could not save. Check the fields and try again." Restart the API.
7. **The member's resolver.** Sign out (Profile → Account → Sign out). Sign in as `lin@demo.withme.local`. Open `exp://127.0.0.1:8081/--/t/04BBBBBBBBBBBB`.
   - Expected: "Open gathering" (not Join), and it opens the detail.
8. **Delete account:**
   - As Lin: Profile → Account → "Delete account" → the Alert with the exact copy → "Delete my account".
   - Expected: you land on Login.
   - Sign in as Ada: Connections no longer lists Lin, and the Rooftop member list is Ada only.
   - Run `bun run db:seed` afterwards to restore the demo.

**Expected:** all eight as described. Attach the screenshots to the PR.

---

### Task 22: Docs

**Files:** Modify `README.md`, `docs/the-slice.md`, `docs/skills-roadmap.md`, `.agents/skills/go-live/SKILL.md`.

**Step 1: `README.md`:**
- How it works, `packages/contract` bullet: `(profile, connect, block, gatherings, my tags — session-scoped)` becomes `(profile and photo, connect, block, gatherings, my tags, account — session-scoped)`.
- Safety semantics: after "Privacy-default scans" add:
  `- **Avatars are paths, not URLs.** A photo is uploaded through the API into the uploader's own folder of a public bucket that nobody can list; profiles store only `<user>/<file>` and every client builds the URL from its own Supabase URL, so an avatar can never point off-origin. The real boundary is the bucket's limits (JPEG or WebP, 1 MiB) plus the `profiles_avatar_path_shape` CHECK. The API's byte sniffing is a first gate that a direct Storage call with the user's own token can bypass, which stays safe because the bucket only ever holds and serves images. A photo's public URL works for anyone holding it until the photo changes.`
- Replace the "Deletion cascades" bullet with:
  `- **Deletion cascades.** Deleting an account (Profile → Account; `delete_my_account()`) removes connections, requests, blocks, and the gatherings you host, resets claimed tags to unclaimed, erases their scan history, and deletes your photo files.`
- Replace `57 policy` with the number `bun run --cwd packages/db test` prints (72), and `(`packages/db/test`)` with `(`packages/db/test`, Storage policies included)`.
- Quickstart: the `bun run db:start` line already carries `# Supabase local on ports 553xx`; edit that comment to `# Supabase local on ports 553xx (includes Storage)` (keep the column alignment).
- Tests line: `(Playwright smoke: resolve → claim → connect, the signed-in shell, and tap → join a gathering)` becomes `(Playwright smoke: resolve → claim → connect, the signed-in shell, tap → join a gathering, the Connections lists, and the profile: photo, my tags, account deletion)`.

**Step 2: `docs/the-slice.md`:**
- **Step 2**, append a bullet:
  `- storage follows the same rules (`20261011120000_avatars.sql`): per-user folder policies on `storage.objects`, a CHECK-shaped path column instead of a URL, no select policy for anyone but the owner (a listable bucket is a directory), bucket-level MIME and size limits, and no update policy (objects are immutable).`
- **Step 3**, append: `` `avatars.test.ts` is the model for Storage: act through each user's own client, and give every negative case a positive control so it cannot pass red. ``
- **Step 4**, append: `A handler that writes to Storage does it through `context.db.storage` (the caller's JWT) and checks uploaded bytes itself (`uploadAvatar` sniffs the magic number); a write that spans Storage and Postgres compensates instead of pretending to be one transaction.`
- **Step 5**, append: `Lists climb the ladder in `src/components/ListStates.tsx` (loading → error with retry → typed empty → content); a loader with several lists `settled()`s each one so a failed list never fails the page. In-page segments are links with a search param (`_app.connections.tsx`). Uploads are no exception to owning no data access: the photo goes to `app.profile.uploadAvatar` as a `File`, never `supabase.storage` from the browser.`
- **Step 6**, the primitives list `(`Card`, `Title`, `Muted`, `Button`, `Avatar`)` becomes `(`Card`, `Title`, `Muted`, `Button` (`inline` inside rows), `Avatar`, `PersonRow`, `SegmentedTabs`, `ListLadder`, `EmptyState`, `SectionHeader`)`.
- **Step 7**, add `` `connections.spec.ts` (the list ladder) and `profile.spec.ts` (photo, my tags, account deletion) `` to the Playwright list.

**Step 3: `docs/skills-roadmap.md`:** append to the "Revised 2026-09-22" section:
`- **Profile made whole (2026-10-11).** Two V1.1 gaps above shipped with milestone 3: avatar uploads (Storage enabled, the `avatars` bucket) and the account-deletion UI (Profile → Account, `delete_my_account()`), alongside My tags and the Connections segments.`

**Step 4: `.agents/skills/go-live/SKILL.md`:**
- After the `db push` checkpoint paragraph (section 1) add:
  `The migrations also create the public `avatars` bucket and its policies (Storage is on by default in hosted projects). Confirm it under Storage → Buckets: public, 1 MiB, `image/jpeg, image/webp`.`
- At the end of the section 3 (Web worker) checkpoint paragraph add:
  `Then confirm `delete_my_account()` works on the hosted project: sign up a throwaway account on the live web app and delete it (Profile → Account → Delete my account). It deletes from `auth.users` inside a definer function; if it fails with `permission denied for table users`, stop and tell the owner — never work around it with the service role.`

**Verify:**
- `grep -rn "avatar_url" README.md docs/the-slice.md .agents` returns nothing.
- `grep -n "72 policy" README.md` matches.

**Commit**

```bash
git add README.md docs/the-slice.md docs/skills-roadmap.md .agents/skills/go-live/SKILL.md
git commit -m "Docs: avatars as paths, self-serve deletion, the list ladder in the slice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: The gate, then the PR

**Step 1:** Run the full gate from the repo root, with the stack up:

```bash
bun run db:reset && bun run db:seed
bun run db:types && git diff --exit-code packages/db/src/types/supabase.ts   # no drift since Task 7
bun run lint && bun run typecheck && bun run test
cd apps/web && CI=1 bunx playwright test; cd ../..
cd apps/api && bun run e2e; cd ../..   # needs `bun run dev` for the API in another shell
```

**Expected:** all green:
- db `72 pass`;
- contract `31 pass`;
- nfc-sdk unchanged and green;
- Playwright `14 passed`;
- API e2e: 58 `ok:` lines ending `handshake e2e: all checks passed`.

Paste the summary lines into the PR body.

**Step 2:** Push `claude/connections-profile` and open the PR against `main`.
- **Title:** `Connections and Profile made whole: segments, avatars through Storage, My tags, account deletion`.
- **The body must include:**
  - the spec link and Milestone 3;
  - the avatars design: path not URL, the public-but-unlistable bucket, per-user folder policies, no update policy, MIME and size limits, the API writing with the caller's JWT, the sniffed bytes;
  - the avatars boundary: the bucket's MIME and size limits plus `profiles_avatar_path_shape` are the real boundary (sniffing is a first gate), the insert policy needs a live profile, and uploads cache for an hour;
  - **the breaking public-contract change:** `avatar_url` → `avatar_path`, mirrored in `@withme/nfc`'s `PublicProfileCard`. No release in this PR: publishing `@withme/nfc` is a separate, owner-approved step;
  - `delete_my_account()`: what it deletes, and the order (photo pointer cleared, files swept through the Storage API, then the RPC); the anon revoke;
  - the Task 10b spike: the RN Blob → oRPC multipart chain proven on the simulator before any UI;
  - the spec's `components/EmptyState.tsx` is folded into `components/ListStates.tsx` (`EmptyState` beside `ListLadder`, its only caller);
  - `app.tags.update` gaining `status`; `removeAvatar` added beyond the spec's list, and why;
  - Storage enabled in `config.toml` and the CI impact (storage-api starts under `supabase start`; no workflow change);
  - the M2 carry-overs and where each landed;
  - the gate output;
  - the Task 21 screenshots;
  - and ending with
    `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

**Step 3:** Request review with `superpowers:requesting-code-review`, then address findings with `superpowers:receiving-code-review`. Watch CI's first `supabase start` time (the storage-api image pull).

---
