// Guideline 1.2: report a person from their card (and block them in the same
// step), and agree to the terms at sign-up and again when they change.
import { expect, test, type Page } from '@playwright/test';
import { TERMS_VERSION } from '@withme/contract';
import { admin, claimFreshTag, signUp, signUpWithProfile } from './helpers.ts';

async function ownerOf(uid: string): Promise<string> {
  const { data, error } = await admin.from('tags').select('claimed_by').eq('uid', uid).single();
  if (error || !data?.claimed_by) throw error ?? new Error('tag has no owner');
  return data.claimed_by as string;
}

test('a tapper reports the card and blocks in the same step; only the operator sees it', async ({
  browser,
}) => {
  const owner = await (await browser.newContext()).newPage();
  const uid = await claimFreshTag(owner, `smoke-reported-${Date.now()}@rls.test`, 'Smoke Reported');
  const ownerId = await ownerOf(uid);
  // The owner never sees Report on their own card.
  await expect(owner.getByRole('heading', { name: 'Smoke Reported' })).toBeVisible();
  await expect(owner.getByRole('button', { name: 'Report' })).toHaveCount(0);

  const tapper = await (await browser.newContext()).newPage();
  await signUpWithProfile(tapper, `smoke-reporter-${Date.now()}@rls.test`, 'Smoke Reporter');
  await tapper.goto(`/t/${uid}`);
  await tapper.getByRole('button', { name: 'Report' }).click();

  const dialog = tapper.getByRole('dialog', { name: 'Report Smoke Reported' });
  await expect(dialog).toBeVisible();
  const send = dialog.getByRole('button', { name: 'Send report' });
  // A reason is required.
  await expect(send).toBeDisabled();
  await dialog.getByRole('radio', { name: 'Spam or a scam' }).check();
  await dialog.getByLabel('Anything else? (optional)').fill('Selling followers.');
  await expect(dialog.getByRole('checkbox', { name: 'Also block Smoke Reported' })).toBeChecked();
  await send.click();

  await expect(tapper.getByRole('status').filter({ hasText: 'Your report is in' })).toContainText(
    'Smoke Reported is blocked',
  );

  const { data: reports } = await admin.from('reports').select('*').eq('reported_id', ownerId);
  expect(reports).toHaveLength(1);
  expect(reports?.[0]).toMatchObject({ reason: 'spam', details: 'Selling followers.', status: 'open' });
  const { data: blocks } = await admin.from('blocks').select('blocked_id').eq('blocker_id', reports![0]!.reporter_id);
  expect(blocks).toEqual([{ blocked_id: ownerId }]);
});

test('a signed-out tapper is sent through login to report', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const uid = await claimFreshTag(owner, `smoke-anon-report-${Date.now()}@rls.test`, 'Smoke Card');
  const tapper = await (await browser.newContext()).newPage();
  await tapper.goto(`/t/${uid}`);
  await tapper.getByRole('link', { name: 'Report' }).click();
  await tapper.waitForURL('**/login**');
  expect(new URL(tapper.url()).searchParams.get('returnTo')).toBe(`/t/${uid}`);
});

test('sign-up needs the terms agreement; a new version asks again before the app opens', async ({
  page,
}) => {
  const name = `Smoke Terms ${Date.now()}`;
  await page.goto('/login');
  await signUp(page, `smoke-terms-${Date.now()}@rls.test`);
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
  const email = `smoke-terms-${label}-${Date.now()}@rls.test`;
  const name = `Smoke Terms ${label} ${Date.now()}`;
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
