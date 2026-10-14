// The resolver must never strand a tapper on a card with no way forward.
import { expect, test } from '@playwright/test';
import { claimFreshTag } from './helpers.ts';

test('a failed session read still offers Connect', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const uid = await claimFreshTag(owner, `smoke-resolver-${Date.now()}@rls.test`, 'Smoke Resolver');

  // Storage that throws on read, as blocked site data or some private modes
  // do: Supabase's session read rejects instead of answering "signed out".
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith('sb-')) throw new DOMException('storage unavailable', 'SecurityError');
      return getItem.call(this, key);
    };
  });
  const tapper = await context.newPage();
  await tapper.goto(`/t/${uid}`);

  await expect(tapper.getByRole('heading', { name: 'Smoke Resolver' })).toBeVisible();
  await expect(tapper.getByRole('link', { name: 'Connect' })).toBeVisible();
});
