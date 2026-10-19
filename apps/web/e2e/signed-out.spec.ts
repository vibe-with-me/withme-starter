// Signed out: every page behind the shell, and the claim flow, sends a
// visitor to sign in and remembers where they were going. Nothing signed-in
// renders first. The landing page and the OAuth return are the other doors.
import { expect, test } from '@playwright/test';
import { agreeToTerms, returnToOf, signUp, signUpWithProfile, uniqueStamp } from './helpers.ts';

const guarded = [
  '/gatherings',
  '/gatherings?view=yours',
  '/gatherings/new',
  '/gatherings/00000000-0000-4000-8000-000000000000',
  '/connections?tab=requests',
  '/profile',
  '/share',
  '/terms',
  '/merch',
  // Any well-formed UID: the guard runs before the claim reads it.
  '/claim/04E2E000000000',
];

test.describe('Signed-out redirects', () => {
  for (const path of guarded) {
    test(`signed out, ${path} asks for sign-in and keeps the destination`, async ({ page }) => {
      await page.goto(path);
      await page.waitForURL(/\/login\?/);
      expect(returnToOf(page)).toBe(path);
      await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    });
  }

  // validateSearch alone cannot drop the bad value (the router merges the
  // raw search back in), so every use re-checks it with safeReturnTo. An
  // off-site returnTo is ignored outright: sign-up goes where it would with
  // none, through the new profile, to Events.
  test('a returnTo that points off-site is ignored and sign-up lands on Events', async ({ page }) => {
    const stamp = uniqueStamp();
    await page.goto('/login?returnTo=//evil.example/steal');
    await signUp(page, `offsite-${stamp}@rls.test`);
    await page.waitForURL(/\/profile\?/);
    expect(returnToOf(page)).toBe('/gatherings');
    await page.getByLabel('Name').fill(`Offsite ${stamp}`);
    await agreeToTerms(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL((url) => url.pathname === '/gatherings');
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Events' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('Landing and OAuth return', () => {
  test('the landing page offers Sign in signed out and Open the app signed in', async ({ page }) => {
    const stamp = uniqueStamp();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'withme' })).toBeVisible();
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(/\/login/);

    await signUpWithProfile(page, `landing-${stamp}@rls.test`, `Landing ${stamp}`);
    await page.goto('/');
    await page.getByRole('link', { name: 'Open the app' }).click();
    await page.waitForURL('**/gatherings');
  });

  test('a failed OAuth return says so and offers sign-in again', async ({ page }) => {
    await page.goto('/auth/callback?error_description=Access%20denied');
    await expect(page.getByRole('heading', { name: 'Sign-in failed' })).toBeVisible();
    await expect(page.getByText('Access denied')).toBeVisible();
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await page.waitForURL('**/login');
  });
});
