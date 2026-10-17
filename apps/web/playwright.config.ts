import { defineConfig } from '@playwright/test';

// Smoke tests need the Supabase local stack running first: `bun run db:start`.
// The API worker (wrangler dev) and the built web worker (vite preview) are started here on dedicated ports.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  // No in-run retries: a failure should be visible, not papered over.
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3010',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command:
        'bunx wrangler dev --port 8796 --inspector-port 9456 --var CORS_ORIGIN:http://localhost:3010',
      cwd: '../api',
      url: 'http://localhost:8796/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // The built worker in workerd via `vite preview`, not `vite dev`: the
      // cold dev-server SSR stall (see git history of ci.yml) does not exist
      // on this path. SSR reaches the API worker above through the service
      // binding (Workers under separate dev commands find each other); the
      // browser reaches it over plain HTTP at VITE_API_URL.
      command: 'bunx vite build && bunx vite preview --port 3010 --strictPort',
      url: 'http://localhost:3010',
      // Never reuse: the command builds first, and a leftover preview would serve a stale build.
      reuseExistingServer: false,
      env: {
        VITE_API_URL: 'http://localhost:8796',
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
