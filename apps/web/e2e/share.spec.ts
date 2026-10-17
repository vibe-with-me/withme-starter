// Your code: a QR code that opens your card through the same resolver a tap
// does, and replacing it turns every copy of the old one into an inactive tag.
import { expect, test } from '@playwright/test';
import { admin, signUpWithProfile } from './helpers.ts';

test('a share code opens the card, logs as qr, and a replaced one goes inactive', async ({
  browser,
}) => {
  const owner = await (await browser.newContext()).newPage();
  await signUpWithProfile(owner, `smoke-share-${Date.now()}@rls.test`, 'Smoke Share');
  await owner.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Profile' }).click();
  await owner.getByRole('link', { name: 'Show my code' }).click();
  await owner.waitForURL('**/profile/share');

  await expect(owner.getByRole('img', { name: /QR code that opens/ })).toBeVisible();
  const link = owner.locator('.share-url');
  await expect(link).toHaveText(/\/t\/[0-9A-F]{14}$/);
  const oldUrl = (await link.textContent())!;
  const oldUid = oldUrl.slice(-14);
  // Still the Profile tab: the code lives under it, not in a tab of its own.
  await expect(
    owner.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Profile' }),
  ).toHaveAttribute('aria-current', 'page');

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
