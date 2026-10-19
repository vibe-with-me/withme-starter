// Connections: three lists behind segments, each on its own ladder.
import { expect, test } from '@playwright/test';
import {
  claimFreshTag,
  connectByAdmin,
  newPerson,
  profileIdByName,
  signUpWithProfile,
  uniqueStamp,
} from './helpers.ts';

test('a failed list says so with a retry; the other lists still render', async ({ page }) => {
  await signUpWithProfile(page, `smoke-lists-${Date.now()}@rls.test`, 'Smoke Lists');

  await page.goto('/connections');
  const segments = page.getByRole('navigation', { name: 'Connections lists' });
  await expect(segments.getByRole('link', { name: 'Connections' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText("No connections yet. Tap someone's tag to start.")).toBeVisible();
  // No pending requests: the link is plain "Requests", with no count in its name.
  await segments.getByRole('link', { name: 'Requests', exact: true }).click();
  await expect(page).toHaveURL(/\/connections\?tab=requests$/);
  await expect(segments.getByRole('link', { name: 'Requests', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText('No requests right now.')).toBeVisible();

  // Break one list, then enter the page fresh.
  let failing = true;
  await page.route('**/rpc/app/blocks/list', (route) =>
    failing ? route.fulfill({ status: 500, body: '{}' }) : route.continue(),
  );
  await page.goto('/connections?tab=blocked');
  await expect(page.getByText("Couldn't load your block list.")).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

  await segments.getByRole('link', { name: 'Connections' }).click();
  await expect(page.getByText("No connections yet. Tap someone's tag to start.")).toBeVisible();

  await segments.getByRole('link', { name: 'Blocked' }).click();
  await expect(page.getByText("Couldn't load your block list.")).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('No one is blocked.')).toBeVisible();
});

// Connections are mutual (docs/safety-model.md): only an accept makes one,
// and either side can end it without the other being told.
test.describe('Connections are mutual', () => {
  test('a declined request makes no connection, and the requester is not told', async ({
    browser,
  }) => {
    const stamp = uniqueStamp();
    const adaName = `Decline Ada ${stamp}`;
    const bobName = `Decline Bob ${stamp}`;
    const ada = await newPerson(browser);
    const uid = await claimFreshTag(ada, `decline-ada-${stamp}@rls.test`, adaName);
    const bob = await newPerson(browser);
    await signUpWithProfile(bob, `decline-bob-${stamp}@rls.test`, bobName);
    await bob.goto(`/t/${uid}`);
    await bob.getByRole('button', { name: 'Connect' }).click();
    await expect(bob.getByText(/request sent/i)).toBeVisible();

    await ada.goto('/connections');
    const segments = ada.getByRole('navigation', { name: 'Connections lists' });
    await segments.getByRole('link', { name: 'Requests, 1 pending' }).click();
    await ada.locator('.row', { hasText: bobName }).getByRole('button', { name: 'Decline' }).click();
    await expect(ada.getByText('No requests right now.')).toBeVisible();
    await segments.getByRole('link', { name: 'Connections' }).click();
    await expect(ada.getByText("No connections yet. Tap someone's tag to start.")).toBeVisible();

    // Bob's side shows nothing either way: no connection, no "declined".
    await bob.goto('/connections');
    await expect(bob.getByText("No connections yet. Tap someone's tag to start.")).toBeVisible();
    await expect(bob.getByText(/declined/i)).toHaveCount(0);
  });

  test('removing a connection removes it for both', async ({ browser }) => {
    const stamp = uniqueStamp();
    const adaName = `Remove Ada ${stamp}`;
    const bobName = `Remove Bob ${stamp}`;
    const ada = await newPerson(browser);
    await signUpWithProfile(ada, `remove-ada-${stamp}@rls.test`, adaName);
    const bob = await newPerson(browser);
    await signUpWithProfile(bob, `remove-bob-${stamp}@rls.test`, bobName);
    await connectByAdmin(await profileIdByName(adaName), await profileIdByName(bobName));

    await bob.goto('/connections');
    await expect(bob.getByText(adaName)).toBeVisible();
    await ada.goto('/connections');
    await ada.locator('.row', { hasText: bobName }).getByRole('button', { name: 'Remove' }).click();
    await expect(ada.getByText("No connections yet. Tap someone's tag to start.")).toBeVisible();

    await bob.reload();
    await expect(bob.getByText("No connections yet. Tap someone's tag to start.")).toBeVisible();
    await expect(bob.getByText(adaName)).toHaveCount(0);
  });
});
