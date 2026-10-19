// Terms are agreed to, and recorded (docs/safety-model.md): no profile
// without agreeing, a new TERMS_VERSION asks again before any tab opens,
// and the gate never traps anyone who would rather leave.
import { expect, test, type Page } from '@playwright/test';
import { TERMS_VERSION } from '@withme/contract';
import { admin, signUp, signUpWithProfile, uniqueStamp } from './helpers.ts';

test('sign-up needs the terms agreement; a new version asks again before the app opens', async ({
  page,
}) => {
  const stamp = uniqueStamp();
  const name = `Smoke Terms ${stamp}`;
  await page.goto('/login');
  await signUp(page, `smoke-terms-${stamp}@rls.test`);
  await page.waitForURL(/\/profile\?/);
  await page.getByLabel('Name').fill(name);
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', 'https://example.com/terms');
  await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
    'href',
    'https://example.com/privacy',
  );
  await page.getByRole('checkbox', { name: /I agree to/ }).check();
  await save.click();
  await page.waitForURL('**/gatherings');

  // The fork bumps TERMS_VERSION: this profile now holds an older one.
  const { data: profile } = await admin
    .from('profiles')
    .update({ terms_version: 'smoke-old' })
    .eq('display_name', name)
    .select('id')
    .single();

  await page.goto('/connections');
  await page.waitForURL(/\/terms\?/);
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/connections');
  await expect(page.getByRole('heading', { name: 'Updated terms' })).toBeVisible();
  // Not agreeing means leaving: the account controls are on the page.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  // Every other tab sends them back here.
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Events' }).click();
  await expect(page.getByRole('heading', { name: 'Updated terms' })).toBeVisible();

  await page.getByRole('button', { name: 'I agree' }).click();
  await page.waitForURL(/\/(connections|gatherings)$/);
  const { data: after } = await admin.from('profiles').select('terms_version').eq('id', profile!.id).single();
  expect(after?.terms_version).toBe(TERMS_VERSION);
});

/** Signs up with a profile, then moves it to an older terms version: the gate holds it on /terms. */
async function stuckOnOldTerms(page: Page, label: string): Promise<{ email: string; id: string }> {
  const stamp = uniqueStamp();
  const email = `smoke-terms-${label}-${stamp}@rls.test`;
  const name = `Smoke Terms ${label} ${stamp}`;
  await signUpWithProfile(page, email, name);
  const { data, error } = await admin
    .from('profiles')
    .update({ terms_version: 'smoke-old' })
    .eq('display_name', name)
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('profile not found');
  await page.goto('/profile');
  await page.waitForURL(/\/terms\?/);
  await expect(page.getByRole('heading', { name: 'Updated terms' })).toBeVisible();
  return { email, id: data.id as string };
}

// The gate must never trap anyone: leaving without agreeing has to work
// (Apple requires account deletion to be reachable, and the profile gate
// once had a redirect loop on the way out).
test('someone held on the terms screen can sign out without agreeing', async ({ page }) => {
  await stuckOnOldTerms(page, 'signout');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await page.goto('/profile');
  await page.waitForURL(/\/login\?/);
});

test('someone held on the terms screen can delete their account without agreeing', async ({ page }) => {
  const { id } = await stuckOnOldTerms(page, 'delete');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  const { data } = await admin.auth.admin.getUserById(id);
  expect(data.user).toBeNull();
});
