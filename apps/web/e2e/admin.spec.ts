// The admin area (#134): /admin is for operators, and only for them.
// Everyone else, signed in or signed out, gets the app's normal not-found
// page, so the URL never confirms an admin area exists, and nothing in the
// app links to it. Operators are made by SQL only; here, by the script the
// seed uses (helpers.makeOperator).
import { expect, test } from '@playwright/test';
import { isStaging, makeOperator, signUp, signUpWithProfile, uniqueStamp } from './helpers.ts';

const SECTIONS = ['Reports', 'Tags', 'Gatherings'];

test.describe('Admin area', () => {
  test('an operator sees the admin home: three sections, each coming soon', async ({ page }) => {
    test.skip(isStaging, 'a hosted project makes its operators in the SQL Editor');
    const stamp = uniqueStamp();
    const email = `admin-ops-${stamp}@rls.test`;
    await signUpWithProfile(page, email, `Ops ${stamp}`);
    makeOperator(email);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
    await expect(page).toHaveTitle('Admin — withme');
    const sections = page.getByRole('list', { name: 'Sections' }).getByRole('listitem');
    await expect(sections).toHaveCount(SECTIONS.length);
    for (const [i, name] of SECTIONS.entries()) {
      await expect(sections.nth(i)).toContainText(name);
      await expect(sections.nth(i)).toContainText('Coming soon');
    }
    // Outside the user app: no tab bar.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
  });

  test('nothing in the signed-in app links to /admin, even for an operator', async ({ page }) => {
    test.skip(isStaging, 'a hosted project makes its operators in the SQL Editor');
    const stamp = uniqueStamp();
    const email = `admin-nolink-${stamp}@rls.test`;
    await signUpWithProfile(page, email, `Ops ${stamp}`);
    makeOperator(email);

    for (const path of ['/gatherings', '/connections', '/profile', '/share']) {
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
      await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    }
  });

  // lib/account-scope.ts: the admin area is account-scoped like the shell.
  test('an account change in another tab takes the admin area away', async ({ browser }) => {
    test.skip(isStaging, 'a hosted project makes its operators in the SQL Editor');
    const stamp = uniqueStamp();
    const context = await browser.newContext();
    try {
      const first = await context.newPage();
      const email = `admin-tab-a-${stamp}@rls.test`;
      await signUpWithProfile(first, email, `Ops ${stamp}`);
      makeOperator(email);
      await first.goto('/admin');
      await expect(first.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();

      // Another tab in the same browser becomes a different account, not an operator.
      const second = await context.newPage();
      await second.goto('/login');
      await signUp(second, `admin-tab-b-${stamp}@rls.test`);
      await second.waitForURL(/\/profile\?/);

      await expect(first.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
      await expect(first.getByRole('heading', { name: 'Admin' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('a signed-in person who is not an operator gets the not-found page', async ({ page }) => {
    const stamp = uniqueStamp();
    await signUpWithProfile(page, `admin-user-${stamp}@rls.test`, `User ${stamp}`);

    // The same page a path that does not exist gets.
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin' })).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/admin');
  });

  test('signed out, /admin is the not-found page, not a sign-in prompt', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Admin' })).toHaveCount(0);
    // No redirect to /login with returnTo=/admin: that would confirm the area exists.
    expect(new URL(page.url()).pathname).toBe('/admin');
  });
});
