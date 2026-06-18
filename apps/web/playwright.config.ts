import { defineConfig } from '@playwright/test';

// Smoke tests need the Supabase local stack running first: `bun run db:start`.
// API and web dev servers are started here on dedicated ports.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  // No retries: the smoke is deterministic. (It used to abort on the
  // router's defaultPendingComponent hydration mismatch; that's fixed.)
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
      command: 'bunx vite dev --port 3010 --strictPort',
      url: 'http://localhost:3010',
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: 'http://localhost:8796' },
      timeout: 60_000,
    },
  ],
});
