// Your code: a QR code that opens your card through the same resolver a tap
// does, and replacing it turns every copy of the old one into an inactive tag.
import { expect, test } from '@playwright/test';
import { admin, agreeToTerms, returnToOf, signUp, signUpWithProfile } from './helpers.ts';

test('a share code opens the card, logs as qr, and a replaced one goes inactive', async ({
  browser,
}) => {
  const owner = await (await browser.newContext()).newPage();
  await signUpWithProfile(owner, `smoke-share-${Date.now()}@rls.test`, 'Smoke Share');
  // The floating button, from any tab: here, Events, where sign-up lands.
  await owner.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Your code' }).click();
  await owner.waitForURL('**/share');

  await expect(owner.getByRole('img', { name: /QR code that opens/ })).toBeVisible();
  const link = owner.locator('.share-url');
  await expect(link).toHaveText(/\/t\/[0-9A-F]{14}$/);
  const oldUrl = (await link.textContent())!;
  const oldUid = oldUrl.slice(-14);
  // The button is current, and no tab is: the code is not a section of its own.
  const nav = owner.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Your code' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.locator('.shell-nav__item[aria-current="page"]')).toHaveCount(0);

  // A stranger's phone camera opens the URL: the same card a tap shows.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(oldUrl);
  await expect(stranger.getByRole('heading', { name: 'Smoke Share' })).toBeVisible();
  await expect(stranger.getByRole('link', { name: 'Connect' })).toBeVisible();
  const { data: scans } = await admin.from('tag_scans').select('scan_method').eq('tag_uid', oldUid);
  expect(scans).toEqual([{ scan_method: 'qr' }]);

  // Replacing asks first, then mints a new code.
  await owner.getByRole('button', { name: 'Replace code' }).click();
  await owner.getByRole('button', { name: 'Replace it' }).click();
  await expect(owner.getByText('New code ready. The old one no longer opens your card.')).toBeVisible();
  await expect(link).not.toHaveText(oldUrl);
  const newUrl = (await link.textContent())!;

  await stranger.goto(oldUrl);
  await expect(stranger.getByRole('heading', { name: 'This tag is inactive' })).toBeVisible();
  await stranger.goto(newUrl);
  await expect(stranger.getByRole('heading', { name: 'Smoke Share' })).toBeVisible();
});

test('at phone width the button rises out of the middle of the bottom bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signUpWithProfile(page, `smoke-share-phone-${Date.now()}@rls.test`, 'Smoke Phone');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const bar = (await nav.boundingBox())!;
  const fab = (await nav.getByRole('link', { name: 'Your code' }).boundingBox())!;
  // Centered in the bar: three tabs, two left and one right that takes the same width.
  expect(Math.abs(fab.x + fab.width / 2 - (bar.x + bar.width / 2))).toBeLessThan(2);
  // Raised: its top sits above the bar's.
  expect(fab.y).toBeLessThan(bar.y);
  await nav.getByRole('link', { name: 'Your code' }).click();
  await expect(page.getByRole('img', { name: /QR code that opens/ })).toBeVisible();
});

test('without a profile, the button asks for one first and comes back', async ({ page }) => {
  await page.goto('/login');
  await signUp(page, `smoke-share-noprofile-${Date.now()}@rls.test`);
  await page.waitForURL(/\/profile\?/);
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Your code' }).click();
  // The shell's own guard: no card yet, so no code yet.
  await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
  await expect.poll(() => returnToOf(page)).toBe('/share');
  await page.getByLabel('Name').fill('Smoke Later');
  await agreeToTerms(page);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL('**/share');
  await expect(page.getByRole('img', { name: /QR code that opens Smoke Later/ })).toBeVisible();
});
