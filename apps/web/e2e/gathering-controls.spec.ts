// The host's two controls: a connections-only gathering with three spots.
// A stranger's tap on the host's tag shows the card and no gathering, and
// the detail URL reads as unavailable; the host's connections see it, join
// until it is full, and the next one sees Full instead of Join.
import { expect, test, type Page } from '@playwright/test';
import {
  claimFreshTag,
  connectByAdmin,
  newPerson,
  profileIdByName,
  revealInFeed,
  signUpWithProfile,
} from './helpers.ts';

test.setTimeout(180_000);

test('a connections-only gathering with three spots: hidden from a stranger, full after two connections', async ({
  browser,
}) => {
  const stamp = Date.now();
  const hostName = `Cap Host ${stamp}`;
  const title = `Cap Round ${stamp}`;

  // --- the host claims a tag, then creates the gathering ------------------------
  const host = await newPerson(browser);
  const uid = await claimFreshTag(host, `cap-host-${stamp}@rls.test`, hostName);
  await host.goto('/gatherings');
  await host.getByLabel('Title').fill(title);
  await host.getByRole('radio', { name: /My connections/ }).check();
  await host.getByLabel('Spots (optional)').fill('3');
  await host.getByRole('button', { name: 'Create gathering' }).click();
  const yours = host.getByRole('region', { name: 'Yours' });
  await expect(yours.getByText(title)).toBeVisible();
  await expect(yours.getByText(/Hosting · .* · 1 of 3 going · Connections only/)).toBeVisible();
  await yours.getByRole('link', { name: 'Open', exact: true }).click();
  await host.waitForURL(/\/gatherings\/[0-9a-f-]{36}$/);
  const detailPath = new URL(host.url()).pathname;
  // The list can still be on screen for a moment after the URL changes:
  // wait for the detail, and match its line exactly (a row's line contains it).
  await expect(host.getByRole('heading', { name: title })).toBeVisible();
  await expect(host.getByText('1 of 3 going · Connections only', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'Point my tags at this gathering' }).click();
  await expect(host.getByRole('button', { name: 'Point my tags back to my profile' })).toBeVisible();

  // --- a stranger: the tap shows the card only, the URL reads as unavailable ----
  const stranger = await newPerson(browser);
  await stranger.goto(`/t/${uid}`);
  await expect(stranger.getByRole('heading', { name: hostName })).toBeVisible();
  await expect(stranger.getByText(title)).toHaveCount(0);
  await expect(stranger.getByRole('link', { name: 'Join this gathering' })).toHaveCount(0);
  await signUpWithProfile(stranger, `cap-stranger-${stamp}@rls.test`, `Cap Stranger ${stamp}`);
  await stranger.goto(detailPath);
  await expect(stranger.getByRole('heading', { name: 'Join this gathering?' })).toBeVisible();
  await expect(stranger.getByText(title)).toHaveCount(0);
  await stranger.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(stranger.getByText("This gathering isn't available.")).toBeVisible();

  // --- three of the host's connections ------------------------------------------
  const friends: Page[] = [];
  for (const n of [1, 2, 3]) {
    const page = await newPerson(browser);
    const name = `Cap Friend ${n} ${stamp}`;
    await signUpWithProfile(page, `cap-friend-${n}-${stamp}@rls.test`, name);
    await connectByAdmin(await profileIdByName(hostName), await profileIdByName(name));
    friends.push(page);
  }
  const [first, second, third] = friends as [Page, Page, Page];

  // A connection finds it in their feed, marked, and joins from the detail.
  // (Not from the tap: the web resolver runs before the session is known, so
  // a tap shows a connections-only gathering to nobody. safety-model.md.)
  await first.goto('/gatherings');
  const feed = first.getByRole('region', { name: 'Happening' });
  await revealInFeed(feed, title);
  const row = feed.locator('.row', { hasText: title });
  await expect(row.getByText(/1 of 3 going · Connections only/)).toBeVisible();
  await row.getByRole('link', { name: 'Open', exact: true }).click();
  await first.waitForURL(`**${detailPath}`);
  await expect(first.getByRole('heading', { name: title })).toBeVisible();
  await expect(first.getByText('1 of 3 going · Connections only', { exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(first.getByText('2 of 3 going · Connections only', { exact: true })).toBeVisible();

  await second.goto(detailPath);
  await second.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(second.getByText('3 of 3 going · Connections only', { exact: true })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Leave gathering' })).toBeVisible();

  // Full: the third connection sees it, and Full instead of Join.
  await third.goto(detailPath);
  await expect(third.getByText('3 of 3 going · Connections only', { exact: true })).toBeVisible();
  await expect(third.getByRole('button', { name: 'Full' })).toBeDisabled();
  await expect(third.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);

  // Leaving frees the spot.
  await second.getByRole('button', { name: 'Leave gathering' }).click();
  await second.waitForURL('**/gatherings');
  await third.reload();
  await third.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(third.getByText('3 of 3 going · Connections only', { exact: true })).toBeVisible();
});
