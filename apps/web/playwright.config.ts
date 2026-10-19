import { defineConfig } from '@playwright/test';

// Ports are overridable so two checkouts (or a fork's stack beside the
// starter's) can run the suite at once; the defaults are what CI uses.
const API_PORT = Number(process.env.E2E_API_PORT ?? 8796);
const API_INSPECTOR_PORT = Number(process.env.E2E_API_INSPECTOR_PORT ?? 9456);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3010);
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
// A deployed stack instead of local servers: the staging run sets this to
// the staging web Worker's URL (.github/workflows/staging-e2e.yml), and
// nothing is started here. docs/testing.md#staging-the-hosted-demo.
const TARGET_URL = process.env.E2E_TARGET_URL;

// Smoke tests need the Supabase local stack running first: `bun run db:start`.
// The API worker (wrangler dev) and the built web worker (vite preview) are started here on dedicated ports.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  // No in-run retries: a failure should be visible, not papered over.
  retries: 0,
  // list for the terminal; html (never auto-opened) for reading a failure,
  // `bunx playwright show-report`; github annotates the failing line in CI.
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: TARGET_URL ?? WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: TARGET_URL ? [] : [
    {
      command: `bunx wrangler dev --port ${API_PORT} --inspector-port ${API_INSPECTOR_PORT} --var CORS_ORIGIN:${WEB_URL}`,
      cwd: '../api',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // The built worker in workerd via `vite preview`, not `vite dev`: the
      // cold dev-server SSR stall (see git history of ci.yml) does not exist
      // on this path. SSR reaches the API worker above through the service
      // binding (Workers under separate dev commands find each other); the
      // browser reaches it over plain HTTP at VITE_API_URL.
      command: `bunx vite build && bunx vite preview --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      // Never reuse: the command builds first, and a leftover preview would serve a stale build.
      reuseExistingServer: false,
      env: {
        VITE_API_URL: API_URL,
        VITE_SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321',
        VITE_SUPABASE_PUBLISHABLE_KEY:
          process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
        // Pinned empty so a developer's .env can't add the Merch tab under test.
        VITE_STORE_URL: '',
        // The agreement links to the fork's documents; any https URL will do here.
        VITE_TERMS_URL: 'https://example.com/terms',
        VITE_PRIVACY_URL: 'https://example.com/privacy',
      },
      timeout: 180_000,
    },
  ],
});
