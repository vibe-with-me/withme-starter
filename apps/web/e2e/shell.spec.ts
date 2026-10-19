// The shell: the signed-in chrome every tab lives in.
import { expect, test } from '@playwright/test';
import { agreeToTerms, returnToOf, signUp } from './helpers.ts';

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
  await expect(nav.getByRole('link', { name: 'Events' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Connections' })).toBeVisible();
  // VITE_STORE_URL is unset for the smoke: the Merch tab must not exist.
  await expect(nav.getByRole('link', { name: 'Merch' })).toHaveCount(0);

  await page.getByLabel('Name').fill('Smoke Shell');

  await agreeToTerms(page);
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

test("a second account never sees the first account's data", async ({ page }) => {
  const stamp = Date.now();
  await page.goto('/connections');
  await page.waitForURL(/\/login\?/);
  await signUp(page, `smoke-first-${stamp}@rls.test`);
  await page.waitForURL(/\/profile\?/);
  await page.getByLabel('Name').fill('Smoke First');
  await agreeToTerms(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL('**/connections');

  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByLabel('Name')).toHaveValue('Smoke First');
  await page.getByRole('button', { name: 'Sign out' }).click();

  // Same tab, no reload: the router's loader cache is still warm.
  await page.getByRole('link', { name: 'Sign in' }).click();
  await signUp(page, `smoke-second-${stamp}@rls.test`);

  // The second account has no profile yet. It must be sent to create one and
  // must never be shown the first account's.
  await page.waitForURL(/\/profile\?/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveValue('');
});

test('a failed profile load keeps the shell around the error', async ({ page }) => {
  await page.goto('/connections');
  await page.waitForURL(/\/login\?/);
  await signUp(page, `smoke-shell-error-${Date.now()}@rls.test`);
  await page.waitForURL(/\/profile\?/);
  await page.getByLabel('Name').fill('Smoke Error');
  await agreeToTerms(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL('**/connections');

  // Break the layout's one fetch, then enter the shell from scratch.
  await page.route('**/rpc/app/profile/get', (route) =>
    route.fulfill({ status: 500, body: '{}' }),
  );
  await page.reload();

  await expect(page.getByRole('heading', { name: "Something didn't load" })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
});

test('an account change in another tab hides the previous account at once', async ({ browser }) => {
  const stamp = Date.now();
  const context = await browser.newContext();
  try {
    const first = await context.newPage();
    await first.goto('/connections');
    await first.waitForURL(/\/login\?/);
    await signUp(first, `smoke-tab-a-${stamp}@rls.test`);
    await first.waitForURL(/\/profile\?/);
    await first.getByLabel('Name').fill('Smoke Tab A');
    await agreeToTerms(first);
    await first.getByRole('button', { name: 'Save' }).click();
    await first.waitForURL('**/connections');
    await first
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Profile' })
      .click();
    await expect(first.getByLabel('Name')).toHaveValue('Smoke Tab A');

    // Slow the first tab's re-load, so whatever it keeps on screen meanwhile
    // is observable.
    await first.route('**/rpc/app/profile/get', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    // Another tab in the same browser becomes a different account.
    const second = await context.newPage();
    await second.goto('/login');
    await signUp(second, `smoke-tab-b-${stamp}@rls.test`);
    await second.waitForURL(/\/profile\?/);

    // The first tab drops the previous account's data immediately, not when
    // its re-load finishes.
    await expect
      .poll(
        () =>
          first.evaluate(
            () => document.querySelector<HTMLInputElement>('#display_name')?.value ?? null,
          ),
        { timeout: 2000 },
      )
      .not.toBe('Smoke Tab A');

    // And it settles on the new account, which has no profile yet.
    await expect(first.getByRole('heading', { name: 'Create your profile' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(first.getByLabel('Name')).toHaveValue('');
  } finally {
    await context.close();
  }
});

test('an account change while a navigation into the shell is loading never lands the previous account', async ({
  browser,
}) => {
  const stamp = Date.now();
  const context = await browser.newContext();
  // The first tab's held profile fetch is let go once the account has changed
  // (or on the way out, so a failure cannot leave it hanging).
  let releaseHeld!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });
  try {
    const first = await context.newPage();
    await first.goto('/connections');
    await first.waitForURL(/\/login\?/);
    await signUp(first, `smoke-midload-a-${stamp}@rls.test`);
    await first.waitForURL(/\/profile\?/);
    await first.getByLabel('Name').fill('Smoke Midload A');
    await agreeToTerms(first);
    await first.getByRole('button', { name: 'Save' }).click();
    await first.waitForURL('**/connections');

    // Back out to the landing page, so the next step is a navigation INTO the shell.
    await first.goto('/');
    const openTheApp = first.getByRole('link', { name: 'Open the app' });
    await expect(openTheApp).toBeVisible();

    // Hold the shell's first profile fetch (made with account A's token) until
    // the account has changed underneath it: the loader is in flight when the
    // change arrives, however fast or slow the machine.
    let holding = false;
    await first.route('**/rpc/app/profile/get', async (route) => {
      if (!holding) {
        holding = true;
        await held;
      }
      // On the way out the context may already be closed; nothing to continue then.
      await route.continue().catch(() => undefined);
    });
    const profileRequested = first.waitForRequest('**/rpc/app/profile/get');
    await openTheApp.click();
    await profileRequested;

    // Another tab in the same browser becomes a different account, mid-load.
    // Its own shell entry (a round trip to the API) completes well after the
    // change has reached the first tab.
    const second = await context.newPage();
    await second.goto('/login');
    await signUp(second, `smoke-midload-b-${stamp}@rls.test`);
    await second.waitForURL(/\/profile\?/);
    releaseHeld();

    // The first tab ends up as the new account, which has no profile yet: sent
    // to create one, carrying its destination, never shown account A's profile.
    await expect(first.getByRole('heading', { name: 'Create your profile' })).toBeVisible({
      timeout: 15_000,
    });
    expect(returnToOf(first)).toBe('/gatherings');
    await expect(first.getByLabel('Name')).toHaveValue('');
  } finally {
    releaseHeld();
    await context.close();
  }
});

test('signing in without a destination lands on Events, the first tab', async ({ page }) => {
  await page.goto('/login');
  await signUp(page, `smoke-default-${Date.now()}@rls.test`);
  await page.waitForURL(/\/profile\?/);
  expect(returnToOf(page)).toBe('/gatherings');
  await page.getByLabel('Name').fill('Smoke Default');
  await agreeToTerms(page);
  await page.getByRole('button', { name: 'Save' }).click();

  await page.waitForURL('**/gatherings');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link').first()).toHaveText('Events');
  await expect(nav.getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'New gathering' })).toBeVisible();
  // A new account has nothing of its own; Discover may already list the domain's gatherings.
  const segments = page.getByRole('navigation', { name: 'Events lists' });
  await expect(segments.getByRole('link', { name: 'Discover' })).toHaveAttribute('aria-current', 'page');
  await segments.getByRole('link', { name: 'Yours' }).click();
  await expect(
    page.getByRole('region', { name: 'Yours' }).getByText('Join one from Discover, or create your own.'),
  ).toBeVisible();
});
