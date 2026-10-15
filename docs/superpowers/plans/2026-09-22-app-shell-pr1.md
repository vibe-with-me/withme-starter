# App Shell (PR 1 of the tabs buildout) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the starter its signed-in chrome on web and mobile — a pathless `_app` layout with a tokens-styled tab shell (Connections, Merch, Profile) on web, an Expo Router `(tabs)` group on mobile — and move the existing screens under it, with the Merch tab dormant until a store URL is configured.

**Architecture:** Web: `routes/_app.tsx` owns the session guard and one profile fetch; `components/AppShell.tsx` renders ONE `<nav>` from a `navItems` array, and `app.css` places it top-right on wide screens and as a fixed bottom bar below 720px. Mobile: `app/(tabs)/_layout.tsx` is an Expo Router `Tabs` navigator inside the existing `Stack.Protected` gate, with a shared header carrying the scan action. Spec: `docs/superpowers/specs/2026-09-22-app-shell-and-tabs-design.md` (read it first; Decisions section is binding).

**Tech Stack:** TanStack Start 1.168 / Router 1.170 (file routes, pathless layouts, selective SSR), Expo Router 56 (`Tabs`, `Stack.Protected`), `lucide-react` (web icons), Feather via `@expo/vector-icons` (mobile icons), `expo-web-browser`, Playwright, vanilla CSS tokens.

**Scope guard:** No Events tab in this PR — the gathering arrives in PR 2 and registers its tab then (that IS the slice-doc step this PR documents). Login lands on `/connections` for now.

---

## Ground rules for every task

- Work in this worktree on branch `claude/with-me-derivation-starter-1f2c69`.
- The verification gate (`docs/the-slice.md`): `bun run lint`, `bun run typecheck`, `bun run test` must stay green after each task that touches code. Run the relevant one(s) before each commit.
- Web has no unit tests; Playwright is the test layer. Mobile has no automated UI tests; typecheck + a simulator pass is the bar.
- `apps/web/src/routeTree.gen.ts` is generated. After adding/renaming/removing a route file, run `cd apps/web && bunx vite build` (regenerates it) and commit the regenerated file. Never hand-edit it.
- Styling: only `var(--*)` tokens on web, only `useTokens()` / `lib/tokens.ts` constants on mobile. The accent (`--color-accent` / `t.accent`) appears on Connect and Accept only — never on navigation.
- Commit messages: imperative subject, why in the body, end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 0: Install and baseline

**Files:** none changed.

**Step 1: Install and start the stack**

```bash
bun install
bun run db:start
bun run db:reset && bun run db:seed
cp -n apps/api/.dev.vars.example apps/api/.dev.vars
cp -n apps/web/.env.example apps/web/.env
cp -n apps/mobile/.env.example apps/mobile/.env
```

Expected: `db:seed` prints the demo users (`ada@demo.withme.local` / `withme-demo-1`).

**Step 2: Confirm the gate is green before touching anything**

```bash
bun run lint && bun run typecheck && bun run test
```

Expected: zero lint findings, all typechecks pass, contract + db + nfc-sdk suites green.

**Step 3: Observe the baseline web smoke once (cold servers)**

```bash
cd apps/web && CI=1 bunx playwright test; cd ../..
```

Expected today: it may hang on Ada's first `/t/<uid>` render after claiming (the dev-SSR stall named in `.github/workflows/ci.yml`). Note whether it hung and where. Ctrl-C if it exceeds 3 minutes. No commit.

---

### Task 1: Bounded fix — run the web smoke against the production build (≤ 60 min, then stop)

The CI note says the stall is specific to `vite dev` + the Cloudflare plugin, and recommends the production build. The README already states that `vite preview` of the built web worker works locally when the API worker is running (the service binding connects across dev commands). This task makes Playwright use that path. **Time box: 60 minutes of focused work.** If the smoke does not pass twice in a row from cold within the box, revert this task's edits (`git checkout -- apps/web/playwright.config.ts .github/workflows/ci.yml`), keep the smoke out of CI, and write what you observed into the PR body. Use `superpowers:systematic-debugging` if you hit a failure you don't understand; do not guess-edit.

**Files:**
- Modify: `apps/web/playwright.config.ts`
- Modify: `.github/workflows/ci.yml` (only if the smoke passes)

**Step 1: Point the web server at the built worker**

Replace the second `webServer` entry in `apps/web/playwright.config.ts` with:

```ts
    {
      // The built worker in workerd via `vite preview`, not `vite dev`: the
      // cold dev-server SSR stall (see git history of ci.yml) does not exist
      // on this path. SSR reaches the API worker above through the service
      // binding (Workers under separate dev commands find each other); the
      // browser reaches it over plain HTTP at VITE_API_URL.
      command: 'bunx vite build && bunx vite preview --port 3010 --strictPort',
      url: 'http://localhost:3010',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_URL: 'http://localhost:8796',
        VITE_SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321',
        VITE_SUPABASE_PUBLISHABLE_KEY:
          process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
      },
      timeout: 180_000,
    },
```

Also update the `retries` comment at the top of the file: it currently explains the dev-server stall; replace it with `// No in-run retries: a failure should be visible, not papered over.`

**Step 2: Run the smoke from cold, twice**

```bash
cd apps/web && CI=1 bunx playwright test && CI=1 bunx playwright test; cd ../..
```

Expected: `1 passed` both times, no hang. If the SSR loader throws `API service binding missing`, the preview worker did not discover `withme-api`: confirm the API server is up on 8796 first (Playwright starts it first because it is listed first), then check the Cloudflare Vite plugin docs for cross-command service bindings. If it fails for another reason, debug within the time box.

**Step 3 (only on success): Put the smoke back into CI**

In `.github/workflows/ci.yml`, delete the six-line `# NOTE: the Playwright web smoke…` comment after the `Test` step and append:

```yaml
      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium

      - name: Web smoke (production build in workerd)
        run: |
          cp apps/api/.dev.vars.example apps/api/.dev.vars
          bun run --cwd apps/web test:e2e
```

**Step 4: Commit**

```bash
git add apps/web/playwright.config.ts .github/workflows/ci.yml
git commit -m "Run the web smoke against the production build and restore it to CI

vite preview serves the built worker in workerd, where the cold dev-server
SSR stall never reproduced. The API worker is still wrangler dev; SSR
reaches it over the service binding, the browser over HTTP.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(If the time box expired: no commit; move on and note it in the PR body.)

---

### Task 2: Write the failing shell e2e spec (web)

**Files:**
- Create: `apps/web/e2e/helpers.ts`
- Create: `apps/web/e2e/shell.spec.ts`
- Modify: `apps/web/e2e/handshake.spec.ts` (import the helpers; `/me` → `/profile`)

**Step 1: Extract the shared helpers**

Create `apps/web/e2e/helpers.ts`:

```ts
import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '<local service-role key, redacted>';

/** Service-role client: test setup only (provisioning tags), never the path under test. */
export const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export function freshUid(): string {
  let uid = '';
  for (let i = 0; i < 14; i++) {
    uid += '0123456789ABCDEF'[Math.floor(Math.random() * 16)];
  }
  return uid;
}

/** Drives the login page's sign-up form. Local Supabase has confirmations off. */
export async function signUp(page: Page, email: string): Promise<void> {
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('smoke-pass-1!');
  await page.getByRole('button', { name: 'Sign up' }).click();
}

/** The `returnTo` search param of the current URL, decoded. */
export function returnToOf(page: Page): string | null {
  return new URL(page.url()).searchParams.get('returnTo');
}
```

In `apps/web/e2e/handshake.spec.ts`, delete the local `SUPABASE_URL`, `SERVICE_KEY`, `admin`, `freshUid`, `signUp` definitions and the `createClient` import, and import them:

```ts
import { expect, test } from '@playwright/test';
import { admin, freshUid, signUp } from './helpers.ts';
```

Also change Bob's profile-gate line from `await bob.waitForURL('**/me**');` to `await bob.waitForURL('**/profile**');`.

**Step 2: Write the shell spec**

Create `apps/web/e2e/shell.spec.ts`:

```ts
// The shell: the signed-in chrome every tab lives in.
import { expect, test } from '@playwright/test';
import { returnToOf, signUp } from './helpers.ts';

test('a signed-out visitor is sent to sign in, then lands in the shell', async ({ page }) => {
  await page.goto('/connections');
  await page.waitForURL(/\/login\?/);
  expect(returnToOf(page)).toBe('/connections');

  await signUp(page, `smoke-shell-${Date.now()}@rls.test`);

  // No profile yet: the shell routes to Profile first and remembers the destination.
  await page.waitForURL(/\/profile\?/);
  expect(returnToOf(page)).toBe('/connections');

  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Connections' })).toBeVisible();
  // VITE_STORE_URL is unset for the smoke: the Merch tab must not exist.
  await expect(nav.getByRole('link', { name: 'Merch' })).toHaveCount(0);

  await page.getByLabel('Name').fill('Smoke Shell');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.waitForURL('**/connections');
  await expect(nav.getByRole('link', { name: 'Connections' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
});

test('the nav becomes a bottom bar at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/connections');
  await page.waitForURL(/\/login\?/);
  await signUp(page, `smoke-shell-narrow-${Date.now()}@rls.test`);
  await page.waitForURL(/\/profile\?/);

  const nav = page.getByRole('navigation', { name: 'Primary' });
  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  // Fixed to the bottom edge of the viewport.
  expect(Math.round(box!.y + box!.height)).toBe(844);
});

test('/me still lands on the profile', async ({ page }) => {
  await page.goto('/me');
  await page.waitForURL(/\/login\?/);
  expect(returnToOf(page)).toBe('/profile');
});
```

**Step 3: Run it to verify it fails**

```bash
cd apps/web && bunx playwright test e2e/shell.spec.ts; cd ../..
```

Expected: 3 failures — no `navigation "Primary"` exists yet, `/me` does not redirect, and `/profile` does not exist (it 404s to the calm card).

**Step 4: Commit the spec (red)**

```bash
git add apps/web/e2e
git commit -m "Add the shell e2e spec and share the smoke helpers

Red on purpose: the signed-in shell it describes does not exist yet.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Tokens, icons, and the AppShell component (web)

**Files:**
- Modify: `apps/web/package.json` (via `bun add`)
- Modify: `apps/web/src/styles/tokens.css`
- Modify: `apps/web/src/styles/app.css`
- Create: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/env.d.ts`

**Step 1: Add the icon library**

```bash
cd apps/web && bun add lucide-react && cd ../..
```

**Step 2: Shell tokens**

In `apps/web/src/styles/tokens.css`, inside `:root` after the `--card-max-width: 26rem;` line, add:

```css

  /* the shell: one nav, top-right on wide screens, a bottom bar under 720px.
     CSS variables can't drive @media queries, so the breakpoint is a documented
     constant: keep app.css's `@media (max-width: 719.98px)` and this comment
     in lockstep. Mobile mirrors --shell-nav-height as SHELL.headerHeight. */
  --shell-nav-height: 56px;
  --shell-tab-height: 60px;
  --shell-max-width: 60rem;
```

**Step 3: Shell styles**

Append to `apps/web/src/styles/app.css`:

```css

/* --- the shell (signed-in chrome) ----------------------------------------- */

.shell {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: var(--shell-nav-height) 1fr;
  grid-template-areas:
    'header nav'
    'main main';
  width: 100%;
  max-width: var(--shell-max-width);
  margin: 0 auto;
  padding: 0 var(--space-5);
}

.shell-header {
  grid-area: header;
  display: flex;
  align-items: center;
}

.shell-header .wordmark {
  font-size: var(--text-lg);
  text-decoration: none;
}

.shell-main {
  grid-area: main;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-5) 0 var(--space-7);
}

.shell-nav {
  grid-area: nav;
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
}

.shell-nav__item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-target);
  min-width: var(--tap-target);
  padding: 0 var(--space-3);
  color: var(--color-ink-muted);
  text-decoration: none;
  font-size: var(--text-sm);
  font-weight: 500;
}

.shell-nav__item:hover {
  color: var(--color-ink);
}

/* Active = ink, never the accent. The accent stays with Connect and Accept. */
.shell-nav__item[aria-current='page'] {
  color: var(--color-ink);
  font-weight: 600;
}

.shell-nav__item[aria-current='page']::after {
  content: '';
  position: absolute;
  left: var(--space-3);
  right: var(--space-3);
  bottom: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--color-ink);
}

.shell-nav__item svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.skip-link {
  position: absolute;
  top: -100px;
  left: var(--space-4);
  z-index: 20;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border-input);
  border-radius: var(--radius-control);
  color: var(--color-ink);
}

.skip-link:focus {
  top: var(--space-2);
}

/* Under 720px the nav is a bottom tab bar (breakpoint documented in tokens.css). */
@media (max-width: 719.98px) {
  .shell {
    grid-template-columns: 1fr;
    grid-template-areas:
      'header'
      'main';
    padding: 0 var(--space-4);
  }

  .shell-main {
    padding-bottom: calc(var(--shell-tab-height) + env(safe-area-inset-bottom) + var(--space-5));
  }

  .shell-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    height: calc(var(--shell-tab-height) + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    gap: 0;
    justify-content: space-around;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
  }

  .shell-nav__item {
    flex: 1 1 0;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-1);
    padding: 0;
    font-size: 0.75rem;
  }

  .shell-nav__item svg {
    width: 24px;
    height: 24px;
  }

  .shell-nav__item[aria-current='page']::after {
    top: 0;
    bottom: auto;
    left: 25%;
    right: 25%;
  }
}
```

**Step 4: The env type for the store URL**

In `apps/web/src/env.d.ts`, replace `readonly VITE_GET_TAGS_URL?: string;` with `readonly VITE_STORE_URL?: string;`.

**Step 5: The component**

Create `apps/web/src/components/AppShell.tsx`:

```tsx
import { Link, Outlet } from '@tanstack/react-router';
import { ShoppingBag, User, Users, type LucideIcon } from 'lucide-react';

interface NavItem {
  to: '/connections' | '/merch' | '/profile';
  label: string;
  icon: LucideIcon;
}

/**
 * The tabs. One array drives one <nav>; app.css puts it top-right on wide
 * screens and makes it a bottom bar under 720px — the DOM never changes.
 * Adding a top-level section = adding one entry here (see docs/the-slice.md
 * step 5). Merch exists only when a store is configured: the fulfillment
 * pointer is dormant by default.
 */
export const navItems: readonly NavItem[] = [
  { to: '/connections', label: 'Connections', icon: Users },
  ...(import.meta.env.VITE_STORE_URL
    ? ([{ to: '/merch', label: 'Merch', icon: ShoppingBag }] as const)
    : []),
  { to: '/profile', label: 'Profile', icon: User },
];

/** The signed-in chrome. Rendered by the pathless `_app` layout route. */
export function AppShell() {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        <Link to={navItems[0].to} className="wordmark">
          withme
        </Link>
      </header>
      <main id="main" className="shell-main">
        <Outlet />
      </main>
      <nav className="shell-nav" aria-label="Primary">
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="shell-nav__item"
            activeProps={{ 'aria-current': 'page' }}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
```

If TypeScript rejects the union `to`, wrap each entry's `to` with `linkOptions({ to: '…' })` from `@tanstack/react-router` instead of loosening the type.

**Step 6: Typecheck (routes for `/merch` and `/profile` don't exist yet, so expect errors on `to`; that's fine until Task 4–6 land). Lint must pass now:**

```bash
bun run lint
```

Expected: zero findings.

**Step 7: Commit**

```bash
git add apps/web/package.json bun.lock apps/web/src/styles apps/web/src/components/AppShell.tsx apps/web/src/env.d.ts
git commit -m "Add the web AppShell: one nav array, top bar or bottom tabs by width

Tokens-only styling; the active tab is ink, never the accent. The Merch
entry exists only when VITE_STORE_URL is set (renamed from VITE_GET_TAGS_URL).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The `_app` layout route and the Connections tab (web)

**Files:**
- Create: `apps/web/src/routes/_app.tsx`
- Create: `apps/web/src/routes/_app.connections.tsx` (moved from `connections.tsx`)
- Delete: `apps/web/src/routes/connections.tsx`

**Step 1: The layout**

Create `apps/web/src/routes/_app.tsx`:

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { AppShell } from '../components/AppShell.tsx';
import { api } from '../lib/api.ts';
import { requireSession } from '../lib/auth-guard.ts';

/**
 * The signed-in shell. Pathless: it owns no URL segment, only the guard and
 * the chrome. `ssr: false` cascades to every child (selective SSR can only
 * get more restrictive), so tab pages render on the client, where the
 * Supabase session lives.
 */
export const Route = createFileRoute('/_app')({
  ssr: false,
  beforeLoad: ({ location }) => requireSession(location.href),
  // One profile fetch for the whole shell; children read it with
  // `useLoaderData({ from: '/_app' })`. A session without a profile is sent
  // to create one, carrying the intended destination.
  loader: async ({ location }) => {
    const { profile } = await api.app.profile.get();
    if (!profile && location.pathname !== '/profile') {
      throw redirect({ to: '/profile', search: { returnTo: location.href } });
    }
    return { profile };
  },
  staleTime: 60_000,
  component: AppShell,
});
```

**Step 2: Move Connections under it**

```bash
git mv apps/web/src/routes/connections.tsx apps/web/src/routes/_app.connections.tsx
```

Then edit `apps/web/src/routes/_app.connections.tsx`:

- Imports: drop `Link` and `requireSession`; keep `createFileRoute, useRouter`.
- Route: `createFileRoute('/_app/connections')`; remove the `ssr: false` and `beforeLoad` lines (the layout owns both). Keep `head` and `loader`.
- JSX: replace the outer `<main className="page page--top">` … `</main>` and its inner `<nav className="nav">…</nav>` so the component returns the `<div className="stack">` directly. The full return becomes:

```tsx
  return (
    <div className="stack">
      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}
      {/* … the three sections exactly as they were … */}
    </div>
  );
```

Nothing inside the sections changes.

**Step 3: Regenerate the route tree and typecheck**

```bash
cd apps/web && bunx vite build && cd ../.. && bun run --cwd apps/web typecheck
```

Expected: build succeeds and regenerates `routeTree.gen.ts`. Typecheck still fails on `AppShell`'s `/merch` and `/profile` (Tasks 5–6). Lint passes.

**Step 4: Commit**

```bash
git add apps/web/src/routes/_app.tsx apps/web/src/routes/_app.connections.tsx apps/web/src/routeTree.gen.ts
git rm -q --cached apps/web/src/routes/connections.tsx 2>/dev/null || true
git commit -m "Add the pathless _app layout and move Connections under it

The layout checks the session once, fetches the profile once, and sends a
profile-less session to /profile with returnTo.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The Profile tab, the `/me` redirect, and the callers (web)

**Files:**
- Create: `apps/web/src/routes/_app.profile.tsx` (from `me.tsx`)
- Rewrite: `apps/web/src/routes/me.tsx` (redirect only)
- Modify: `apps/web/src/routes/t.$uid.tsx`, `login.tsx`, `auth.callback.tsx`

**Step 1: Move the profile form**

```bash
git mv apps/web/src/routes/me.tsx apps/web/src/routes/_app.profile.tsx
```

Rewrite the top of `apps/web/src/routes/_app.profile.tsx` (the imports, the Route, and the first lines of the component); the form JSX below `<form className="card" onSubmit={save}>` … `</form>` is unchanged except that it is now the component's root (delete the wrapping `<main className="page page--top">` and the `<nav className="nav">` block):

```tsx
import { createFileRoute, useLoaderData, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../lib/api.ts';
import { safeReturnTo } from '../lib/auth-guard.ts';
import { getSupabase } from '../lib/supabase.ts';

export const Route = createFileRoute('/_app/profile')({
  head: () => ({ meta: [{ title: 'Your profile — withme' }] }),
  validateSearch: (search): { returnTo?: string } => {
    const returnTo = safeReturnTo(search.returnTo);
    return returnTo ? { returnTo } : {};
  },
  component: ProfilePage,
});

function ProfilePage() {
  // Fetched once by the layout; invalidated after save.
  const { profile } = useLoaderData({ from: '/_app' });
  const { returnTo } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  // … state and save()/signOut() exactly as before …
```

`save()` keeps `await router.invalidate()` — that re-runs the layout loader.

**Step 2: The redirect route**

Create `apps/web/src/routes/me.tsx`:

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { safeReturnTo } from '../lib/auth-guard.ts';

/** `/me` moved to `/profile`. Old links and in-flight auth emails still land. */
export const Route = createFileRoute('/me')({
  validateSearch: (search): { returnTo?: string } => {
    const returnTo = safeReturnTo(search.returnTo);
    return returnTo ? { returnTo } : {};
  },
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/profile', search, replace: true });
  },
});
```

**Step 3: Update the callers**

- `apps/web/src/routes/login.tsx`: `const destination = returnTo ?? '/connections';`
- `apps/web/src/routes/auth.callback.tsx`: `navigate({ to: returnTo ?? '/connections', replace: true });`
- `apps/web/src/routes/t.$uid.tsx`: both `/me` occurrences become `/profile` — the `Edit profile` link (`to="/profile"`) and the profile-gate `navigate({ to: '/profile', search: { returnTo: \`/t/${uid}\` } })`.

**Amendments from the Task 4 code review (apply in this task):**

- `returnTo` values now carry query strings (the layout writes
  `location.href`, e.g. `/profile?returnTo=%2Fconnections`). TanStack's
  `navigate({ to })` does not parse a `?` inside `to` and lands on the
  not-found card. Every place that navigates to a `returnTo` string must use
  `href` instead: `login.tsx` (`navigate({ href: destination })`),
  `auth.callback.tsx` (`navigate({ href: returnTo ?? '/connections', replace: true })`),
  and the returnTo branch of `_app.profile.tsx`'s `save()`
  (`navigate({ href: returnTo })`).
- The layout loader re-runs only on shell entry or `router.invalidate()`, so
  `save()` in `_app.profile.tsx` must `await router.invalidate()` BEFORE
  navigating in the returnTo branch too (otherwise a new user who saves and
  returns to `/connections` keeps a cached `profile: null` and the Profile
  tab later shows the empty create form).
- `_app.tsx`: the profile-gate redirect gets `replace: true`, and its comment
  gains one sentence: "The gate fires on shell entry, not on every tab
  switch; the Profile page invalidates after saving."

**Step 4: Regenerate, typecheck, lint**

```bash
cd apps/web && bunx vite build && cd ../.. && bun run --cwd apps/web typecheck && bun run lint
```

Expected: typecheck now fails only on `/merch` (Task 6). Lint clean.

**Step 5: Commit**

```bash
git add apps/web/src/routes apps/web/src/routeTree.gen.ts
git commit -m "Move /me to the Profile tab; /me redirects

Login and the auth callback default to /connections; the resolver's
profile gate points at /profile.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The Merch tab, the store URL, and the landing page (web)

**Files:**
- Create: `apps/web/src/routes/_app.merch.tsx`
- Modify: `apps/web/src/routes/index.tsx`
- Modify: `apps/web/.env.example`

**Step 1: The Merch route**

Create `apps/web/src/routes/_app.merch.tsx`:

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

const STORE_URL = import.meta.env.VITE_STORE_URL;

/**
 * The fulfillment pointer as a tab: one card, one link out to the configured
 * store. No commerce lives here. Dormant when VITE_STORE_URL is unset — the
 * nav hides the tab and this route bounces to the first one.
 */
export const Route = createFileRoute('/_app/merch')({
  head: () => ({ meta: [{ title: 'Merch — withme' }] }),
  beforeLoad: () => {
    if (!STORE_URL) throw redirect({ to: '/connections', replace: true });
  },
  component: MerchPage,
});

function MerchPage() {
  return (
    <div className="card">
      <h1>Merch</h1>
      <p className="bio">Tags and gear from the store.</p>
      <a className="btn" href={STORE_URL} target="_blank" rel="noopener noreferrer">
        Open store
      </a>
    </div>
  );
}
```

**Step 2: The landing page**

Rewrite `apps/web/src/routes/index.tsx`:

```tsx
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getSessionUserId } from '../lib/supabase.ts';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  // The landing is SSR'd; the session is client-only, so the call to action
  // settles after hydration (both renders start as signed-out).
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getSessionUserId().then((userId) => {
      if (!cancelled) setSignedIn(userId !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <div className="card">
        <h1 className="wordmark">withme</h1>
        <p className="bio">Tap a tag. Meet a person. Stay connected.</p>
        <p className="hint">
          This is the starter app — tags resolve at <code>/t/&lt;uid&gt;</code>.
        </p>
        {/* The tag link matches the seed script's claimed demo tag. */}
        {import.meta.env.VITE_DEMO_CREDENTIALS ? (
          <p className="hint">
            Try it: tap <a href="/t/04BBBBBBBBBBBB">a live demo tag</a>, or sign in as{' '}
            <code>{import.meta.env.VITE_DEMO_CREDENTIALS}</code>.
          </p>
        ) : null}
        {signedIn ? (
          <Link className="btn" to="/connections">
            Open the app
          </Link>
        ) : (
          <Link className="btn" to="/login">
            Sign in
          </Link>
        )}
        {/* Fulfillment pointer — dormant until the store URL is configured. */}
        {import.meta.env.VITE_STORE_URL ? (
          <a
            className="btn btn--quiet"
            href={import.meta.env.VITE_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get tags
          </a>
        ) : null}
      </div>
    </main>
  );
}
```

**Step 3: The env example**

In `apps/web/.env.example`, replace the last two lines with:

```
# Optional: your store. Adds the Merch tab and the landing page's "Get tags" link.
# VITE_STORE_URL=https://shop.example.com
```

**Step 4: Regenerate, then the whole web gate**

```bash
cd apps/web && bunx vite build && cd ../.. && bun run lint && bun run typecheck
```

Expected: both clean — every `to` in `AppShell` now resolves.

**Step 5: Run the shell spec, then the full smoke**

```bash
cd apps/web && bunx playwright test; cd ../..
```

Expected: `4 passed` (3 shell + 1 handshake). If Task 1 was reverted, start `bun run dev` in another shell first so the dev servers are warm, then run.

**Step 6: Verify Merch appears when configured (manual, one minute)**

With `bun run dev` running, add `VITE_STORE_URL=https://example.com` to `apps/web/.env`, reload `/connections`: a Merch tab appears; clicking it shows the card; "Open store" opens a new tab. Remove the line afterwards.

**Step 7: Commit**

```bash
git add apps/web/src/routes/_app.merch.tsx apps/web/src/routes/index.tsx apps/web/.env.example apps/web/src/routeTree.gen.ts
git commit -m "Add the Merch pointer tab and rename the store URL variable

One card, one link out, no commerce. Dormant until VITE_STORE_URL is set.
The landing page offers Sign in, or Open the app once a session exists.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Mobile dependencies, the header, and a shell constant

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`)
- Modify: `apps/mobile/lib/tokens.ts`
- Create: `apps/mobile/components/Header.tsx`

**Step 1: Install**

```bash
cd apps/mobile && bunx expo install expo-web-browser @expo/vector-icons && cd ../..
```

`expo install` picks the SDK 56 versions. Confirm `bun.lock` changed and that `expo` itself is still one version: `ls node_modules/.bun | grep -E '^expo@'` from the repo root (Bun's isolated store; expect one version, though two peer-resolution variants of the same version already exist and predate this PR — watch the simulator pass for duplicate-module warnings). `expo install` also appends `"expo-web-browser"` to `expo.plugins` in `app.json`; commit that alongside.

**Step 2: The shell constant**

Append to `apps/mobile/lib/tokens.ts`:

```ts

/** Mirror of --shell-nav-height in tokens.css. The tab bar keeps React Navigation's default height. */
export const SHELL = { headerHeight: 56 } as const;
```

**Step 3: The header**

Create `apps/mobile/components/Header.tsx`:

```tsx
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, SHELL, space, TAP_TARGET, useTokens } from '../lib/tokens';

/**
 * The shared tab header: wordmark left, scan right. There is no home tab, so
 * the physical action stays one tap away from every tab.
 */
export function Header() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          height: insets.top + SHELL.headerHeight,
          paddingTop: insets.top,
          backgroundColor: t.bg,
          borderBottomColor: t.border,
        },
      ]}
    >
      <Text style={[styles.wordmark, { color: t.ink }]}>withme</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a tag"
        hitSlop={8}
        onPress={() => router.push('/scan')}
        style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
      >
        <Feather name="maximize" size={22} color={t.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.s5,
    borderBottomWidth: 1,
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  action: {
    minWidth: TAP_TARGET,
    minHeight: TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

**Step 4: Typecheck + lint**

```bash
bun run --cwd apps/mobile typecheck && bun run lint
```

Expected: clean.

**Step 5: Commit**

```bash
git add apps/mobile/package.json bun.lock apps/mobile/lib/tokens.ts apps/mobile/components/Header.tsx
git commit -m "Add the mobile tab header with the scan action

Feather icons ship with Expo; expo-web-browser is for the Merch tab.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The `(tabs)` group and the moved screens (mobile)

**Files:**
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/connections.tsx` (moved from `app/connections.tsx`)
- Create: `apps/mobile/app/(tabs)/profile.tsx` (moved from `app/me.tsx`)
- Create: `apps/mobile/app/(tabs)/merch.tsx`
- Delete: `apps/mobile/app/home.tsx`
- Modify: `apps/mobile/app/_layout.tsx`, `app/index.tsx`, `app/login.tsx`, `app/t/[uid].tsx`, `apps/mobile/.env.example`

**Step 1: Move the screens**

```bash
mkdir -p "apps/mobile/app/(tabs)"
git mv apps/mobile/app/connections.tsx "apps/mobile/app/(tabs)/connections.tsx"
git mv apps/mobile/app/me.tsx "apps/mobile/app/(tabs)/profile.tsx"
git rm -q apps/mobile/app/home.tsx
```

Fix the relative imports in both moved files (`'../components/ui'` → `'../../components/ui'`, `'../lib/…'` → `'../../lib/…'`).

In `(tabs)/connections.tsx`: delete the `Back` button line (`<Button label="Back" kind="quiet" onPress={() => router.back()} />`), drop the now-unused `router` import, and change `paddingTop: space.s7 + space.s4` to `paddingTop: space.s5` (the header provides the top offset now).

In `(tabs)/profile.tsx`: rename the component to `ProfileScreen`, delete both `Back` buttons (the load-failed card's and the form's). Keep `Sign out`.

**Step 2: The tabs layout**

Create `apps/mobile/app/(tabs)/_layout.tsx`:

```tsx
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';
import { Header } from '../../components/Header';
import { fonts, useTokens } from '../../lib/tokens';

type FeatherName = ComponentProps<typeof Feather>['name'];

// Dormant without a store URL: hidden from the bar and unreachable.
const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL;

function icon(name: FeatherName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Feather name={name} color={color} size={size} />
  );
}

// Active = ink weight, never the accent (mirrors the web nav rule in app.css).
function label({ focused, color, children }: { focused: boolean; color: string; children: string }) {
  return (
    <Text style={{ color, fontSize: 12, fontFamily: focused ? fonts.bodySemiBold : fonts.body }}>
      {children}
    </Text>
  );
}

/**
 * The signed-in tabs. Adding a top-level section = one Tabs.Screen here plus
 * a file in this folder (docs/the-slice.md step 6). Detail screens stay in
 * app/ as stack screens so they push over the bar.
 */
export default function TabsLayout() {
  const t = useTokens();
  return (
    <Tabs
      screenOptions={{
        header: () => <Header />,
        sceneStyle: { backgroundColor: t.bg },
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
        tabBarActiveTintColor: t.ink,
        tabBarInactiveTintColor: t.inkMuted,
        tabBarLabel: label,
      }}
    >
      <Tabs.Screen name="connections" options={{ title: 'Connections', tabBarIcon: icon('users') }} />
      <Tabs.Screen
        name="merch"
        options={{ title: 'Merch', href: STORE_URL ? undefined : null, tabBarIcon: icon('shopping-bag') }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
```

**Step 3: The Merch screen**

Create `apps/mobile/app/(tabs)/merch.tsx`:

```tsx
import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Muted, Title } from '../../components/ui';
import { space, useTokens } from '../../lib/tokens';

const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL;

/** The fulfillment pointer as a tab: one card, one link out. No commerce here. */
export default function MerchScreen() {
  const t = useTokens();
  if (!STORE_URL) return <Redirect href="/connections" />;
  return (
    <View style={[styles.page, { backgroundColor: t.bg }]}>
      <Card>
        <Title>Merch</Title>
        <Muted>Tags and gear from the store.</Muted>
        <Button
          label="Open store"
          onPress={() => {
            WebBrowser.openBrowserAsync(STORE_URL).catch(() => undefined);
          }}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    padding: space.s5,
  },
});
```

**Step 4: Wire the root stack and the redirects**

In `apps/mobile/app/_layout.tsx`, inside `<Stack.Protected guard={!!session}>`, replace the three lines `home`, `connections`, `me` with:

```tsx
          <Stack.Screen name="(tabs)" />
```

(keep `claim/[uid]`).

- `apps/mobile/app/index.tsx`: `<Redirect href={session ? '/connections' : '/login'} />` and fix the doc comment ("to the tabs").
- `apps/mobile/app/login.tsx`: `router.replace((safeRedirect(params.redirect) ?? '/connections') as never);`
- `apps/mobile/app/t/[uid].tsx`: both `'/me'` occurrences become `'/profile'`.
- `apps/mobile/.env.example`: replace the last two lines with
  ```
  # Optional: your store. Adds the Merch tab.
  # EXPO_PUBLIC_STORE_URL=https://shop.example.com
  ```

**Step 5: Typecheck + lint**

```bash
bun run --cwd apps/mobile typecheck && bun run lint
```

Expected: clean. Typed routes: if `router.push('/profile')` is rejected, expo-router's typed routes need a Metro run to regenerate (`bunx expo customize tsconfig.json` is NOT needed; run `bunx expo start` once, which writes `.expo/types`), then re-run typecheck.

**Step 6: Commit**

```bash
git add -A apps/mobile/app apps/mobile/.env.example
git commit -m "Move mobile into a (tabs) group: Connections, Merch, Profile

The root Stack.Protected gates the group; detail screens stay stack
screens. home.tsx dissolves into the tabs; Merch is hidden and unreachable
without EXPO_PUBLIC_STORE_URL.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Simulator pass (mobile)

**Files:** none (verification only; fix anything found, then amend into a small follow-up commit).

**Step 1: Run it**

In one shell: `bun run --filter @withme/api dev`. In another:

```bash
cd apps/mobile && bunx expo start --ios
```

**Step 2: Check, and screenshot each state** (`xcrun simctl io booted screenshot ~/Desktop/shell-<n>.png`, or the iOS Simulator tool if you are Claude):

1. Cold start signed out → login. Sign in as `ada@demo.withme.local` / `withme-demo-1` → lands on Connections with the tab bar (Connections, Profile; no Merch) and the header (wordmark, scan icon). Ada's pending request from Bob is listed.
2. Tap Profile → the form loads with Ada's name. Label weight changes with focus; icon color is ink, not the accent.
3. Tap the scan icon → the Scan screen pushes over the tabs; Back returns to the tab.
4. Deep link: `xcrun simctl openurl booted "withme://t/04BBBBBBBBBBBB"` → Ada's own card with "This is your tag." → "Edit profile" lands on the Profile tab.
5. Sign out from Profile → login.
6. Stop Metro, add `EXPO_PUBLIC_STORE_URL=https://example.com` to `apps/mobile/.env`, `bunx expo start --ios --clear` → the Merch tab appears; "Open store" opens the in-app browser. Remove the line afterwards.

Expected: all six as described. Anything off is fixed before Task 10.

---

### Task 10: The slice doc and the make-it-yours skill

**Files:**
- Modify: `docs/the-slice.md`
- Modify: `.agents/skills/make-it-yours/SKILL.md`

**Step 1: The slice — register-the-tab and the accent rule**

In `docs/the-slice.md`, replace the **5. Web route** paragraph with:

```markdown
**5. Web route.** File routes in `apps/web/src/routes/`. Signed-in pages
live under the pathless `_app` layout (`_app.<name>.tsx`): the layout owns
the session guard, the one profile fetch, and the chrome — a child route
has neither `beforeLoad` auth nor `ssr: false` of its own. A new top-level
section registers exactly one entry in `navItems`
(`src/components/AppShell.tsx`); that is the whole tab. Detail pages
un-nest with the underscore (`_app.gatherings_.$id.tsx`) so a list page
never becomes a layout. Public and focused flows stay outside the shell:
the resolver (`t.$uid.tsx`) is the idiom — loader does the data work, the
page renders a single card on a calm background, and it is unbreakable.
All styling references `var(--*)` tokens from `src/styles/tokens.css`; no
hardcoded colors, fonts, radii, or spacing. The accent never marks
navigation state: active tabs are ink.
```

Replace the **6. Mobile screen** paragraph with:

```markdown
**6. Mobile screen.** Expo Router screens mirror the web routes wherever
the surface is shared. Signed-in top-level screens live in
`apps/mobile/app/(tabs)/` and register one `Tabs.Screen` in
`(tabs)/_layout.tsx` (Feather icon, title); detail and focused screens
stay in `app/` as stack screens so they push over the bar (`t/[uid].tsx`
↔ `t.$uid.tsx`; `scan.tsx` is platform-specific). Screens compose the
card primitives from `components/ui.tsx` (`Card`, `Title`, `Muted`,
`Button`, `Avatar`) and read colors through `useTokens()` from
`lib/tokens.ts` — the mobile mirror of `tokens.css`. Auth gating happens
once, via `Stack.Protected` in `app/_layout.tsx`, not per-screen.
```

**Step 2: make-it-yours file references**

In `.agents/skills/make-it-yours/SKILL.md` §3, replace the bullets that name `connections.tsx`/`me.tsx` and `home.tsx`:

```markdown
- `apps/web/src/components/AppShell.tsx` — the header wordmark link.
- Page titles: `apps/web/src/routes/__root.tsx`, `login.tsx`,
  `claim.$uid.tsx`, `_app.connections.tsx`, `_app.profile.tsx`,
  `_app.merch.tsx` (each route's `head()`).
- `apps/mobile/components/Header.tsx` — the wordmark `<Text>`.
```

Also add one bullet to the skill's "Inputs to collect" list:

```markdown
- Optional: a store URL (`VITE_STORE_URL` / `EXPO_PUBLIC_STORE_URL`) —
  turns on the Merch tab and the landing page's "Get tags" link.
```

**Step 3: Commit**

```bash
git add docs/the-slice.md .agents/skills/make-it-yours/SKILL.md
git commit -m "Document the shell in the slice and make-it-yours

Step 5/6 gain the register-the-tab move; the accent never marks navigation.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: The gate, then the PR

**Step 1: Full verification gate from the repo root** (stack up)

```bash
bun run db:reset && bun run db:seed
bun run lint && bun run typecheck && bun run test
cd apps/web && bunx playwright test; cd ../..
cd apps/api && bun run e2e; cd ../..   # needs `bun run dev` for the API in another shell
```

Expected: all green. Paste the summary lines into the PR body.

**Step 2: Push and open the PR against `main`**

Title: `Add the app shell: tabs on web and mobile`.

Body must include: the spec link; the tab set and that Events arrives in PR 2; the Merch dormancy and the `*_STORE_URL` rename (a breaking env rename for existing forks); the `/me` → `/profile` redirect; the web smoke status (in CI via production build, or still local — with what Task 1 found); the simulator screenshots from Task 9. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

**Step 3: Request review** with `superpowers:requesting-code-review`, then address findings with `superpowers:receiving-code-review`.
