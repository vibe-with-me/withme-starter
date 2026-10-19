// Blocks are absolute and invisible (docs/safety-model.md): a block ends
// the connection, the blocked person's requests are dropped without a
// word, and the blocker's gatherings look like they do not exist. The
// blocked side sees what a stranger sees, never a sign of the block.
import { expect, test } from '@playwright/test';
import {
  admin,
  claimFreshTag,
  connectByAdmin,
  createGathering,
  expectNotInFeed,
  newPerson,
  profileIdByName,
  signUpWithProfile,
  uniqueStamp,
} from './helpers.ts';

test.describe('Blocks', () => {
  test('blocking a connection ends it for both, and the blocked side gets no signal', async ({
    browser,
  }) => {
    const stamp = uniqueStamp();
    const adaName = `Block Ada ${stamp}`;
    const bobName = `Block Bob ${stamp}`;
    const ada = await newPerson(browser);
    const uid = await claimFreshTag(ada, `block-ada-${stamp}@rls.test`, adaName);
    const bob = await newPerson(browser);
    await signUpWithProfile(bob, `block-bob-${stamp}@rls.test`, bobName);
    const [adaId, bobId] = [await profileIdByName(adaName), await profileIdByName(bobName)];
    await connectByAdmin(adaId, bobId);

    // --- Ada blocks Bob from her connections list --------------------------------
    await ada.goto('/connections');
    const segments = ada.getByRole('navigation', { name: 'Connections lists' });
    await ada.locator('.row', { hasText: bobName }).getByRole('button', { name: 'Block' }).click();
    await expect(ada.getByText(bobName)).toHaveCount(0);
    // She knew his card, so her block list keeps it (reveals_card), with Unblock.
    await segments.getByRole('link', { name: 'Blocked' }).click();
    const blockedRow = ada.locator('.row', { hasText: bobName });
    await expect(blockedRow.getByRole('button', { name: 'Unblock' })).toBeVisible();

    // --- Bob: the connection is simply gone ----------------------------------------
    await bob.goto('/connections');
    await expect(bob.getByText("No connections yet. Tap someone's tag to start.")).toBeVisible();
    await expect(bob.getByText(adaName)).toHaveCount(0);

    // A request from him reads as sent, exactly like a stored one, and never arrives.
    await bob.goto(`/t/${uid}`);
    await bob.getByRole('button', { name: 'Connect' }).click();
    await expect(bob.getByText(/request sent/i)).toBeVisible();
    await ada.goto('/connections?tab=requests');
    await expect(ada.getByText('No requests right now.')).toBeVisible();
    const { data: requests } = await admin
      .from('connect_requests')
      .select('id')
      .eq('requester_id', bobId)
      .eq('recipient_id', adaId);
    expect(requests).toEqual([]);

    // --- Unblocking lifts the block and does not restore the connection ----------------
    await ada.goto('/connections?tab=blocked');
    await ada.locator('.row', { hasText: bobName }).getByRole('button', { name: 'Unblock' }).click();
    await expect(ada.getByText('No one is blocked.')).toBeVisible();
    await ada.goto('/connections');
    await expect(ada.getByText("No connections yet. Tap someone's tag to start.")).toBeVisible();
  });

  test("blocking a gathering's host hides the gathering and reveals nothing about the host", async ({
    browser,
  }) => {
    const stamp = uniqueStamp();
    const hostName = `Block Host ${stamp}`;
    const title = `Block Picnic ${stamp}`;
    const host = await newPerson(browser);
    await signUpWithProfile(host, `block-host-${stamp}@rls.test`, hostName);
    const detailPath = await createGathering(host, title);

    // A stranger reads the listed gathering, then blocks its host from the detail.
    const guest = await newPerson(browser);
    await signUpWithProfile(guest, `block-guest-${stamp}@rls.test`, `Block Guest ${stamp}`);
    await guest.goto(detailPath);
    await expect(guest.getByRole('heading', { name: title })).toBeVisible();
    await guest.getByRole('button', { name: 'Block host' }).click();
    await guest.getByRole('button', { name: 'Block', exact: true }).click();
    await guest.waitForURL('**/gatherings');

    // Gone from the whole feed, and the link reads like one that does not exist.
    await expectNotInFeed(guest, title);
    await guest.goto(detailPath);
    await expect(guest.getByRole('heading', { name: 'Join this gathering?' })).toBeVisible();
    await expect(guest.getByText(title)).toHaveCount(0);
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(guest.getByText("This gathering isn't available.")).toBeVisible();

    // Blocking a stranger is not a way to see them: no card in the block list.
    await guest.goto('/connections?tab=blocked');
    await expect(guest.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
    await expect(guest.getByText(hostName)).toHaveCount(0);

    // The host is not told: their gathering still counts one, with no one new.
    await host.reload();
    await expect(host.getByText('1 going')).toBeVisible();
  });
});
