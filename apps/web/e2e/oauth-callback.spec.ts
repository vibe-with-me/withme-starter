// The OAuth landing page: Google sends the browser back to /auth/callback with
// a PKCE code, which the page trades for a session. Google is off locally, so
// the provider hop is stubbed; the code exchange still goes to the real auth
// server, which rejects the made-up code. What this checks is the request the
// page sends: the code alone, with the verifier the login page stored.
import { expect, test } from '@playwright/test';

const CODE = '6c0d6a3e-0b8a-4a8e-9a1f-2f3c4d5e6f70';

test('the callback sends the code from its URL, not the URL itself', async ({ page }) => {
  // Stand in for Google: authorize goes straight back with a code.
  await page.route('**/auth/v1/authorize?**', (route) =>
    route.fulfill({
      status: 302,
      headers: {
        location: new URL(`/auth/callback?code=${CODE}&returnTo=%2Fgatherings`, page.url()).href,
      },
    }),
  );
  const exchange = page.waitForRequest('**/auth/v1/token?grant_type=pkce');

  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Google' }).click();

  const body = (await exchange).postDataJSON() as {
    auth_code: string;
    code_verifier: string;
  };
  expect(body.auth_code).toBe(CODE);
  expect(body.code_verifier).toBeTruthy();
});

test('a callback without a code says so instead of trying an exchange', async ({ page }) => {
  // Through the login page, so a verifier is stored and only the guard can stop the exchange.
  await page.route('**/auth/v1/authorize?**', (route) =>
    route.fulfill({
      status: 302,
      headers: { location: new URL('/auth/callback?returnTo=%2Fgatherings', page.url()).href },
    }),
  );
  let exchanged = false;
  page.on('request', (request) => {
    if (request.url().includes('grant_type=pkce')) exchanged = true;
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Google' }).click();

  await expect(page.getByRole('heading', { name: 'Sign-in failed' })).toBeVisible();
  await expect(page.getByText('missing its code')).toBeVisible();
  expect(exchanged).toBe(false);
});
