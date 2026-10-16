// The gathering: tap the host's tag, join, see the headcount but not the
// host; connect, and the host appears in who's going. The feed lists it to
// the whole domain.
import { expect, test, type Locator } from '@playwright/test';
import { admin, freshUid, signUp } from './helpers.ts';

/** The feed comes a page at a time, and other runs fill the first page:
 * press Load more until the row shows, as a person would. */
async function revealInFeed(feed: Locator, title: string): Promise<void> {
  const row = feed.getByText(title);
  const more = feed.getByRole('button', { name: 'Load more' });
  for (let page = 0; page < 50; page++) {
    await expect(row.or(more).first()).toBeVisible();
    if (await row.isVisible()) return;
    await more.click();
    await expect(feed.getByRole('button', { name: 'Loading…' })).toHaveCount(0);
  }
  await expect(row).toBeVisible();
}

test("tap a host's tag, join from the feed, and who's going shows only connections", async ({
  browser,
}) => {
  const uid = freshUid();
  const stamp = Date.now();
  const { error } = await admin.from('tags').insert({ uid });
  expect(error).toBeNull();

  // --- Ada: sign up with no destination -> Events is the default --------------
  const ada = await (await browser.newContext()).newPage();
  await ada.goto('/login');
  await signUp(ada, `smoke-host-${stamp}@rls.test`);
  await ada.waitForURL(/\/profile\?/);
  await ada.getByLabel('Name').fill('Smoke Ada');
  await ada.getByRole('button', { name: 'Save' }).click();
  await ada.waitForURL('**/gatherings');
  const adaNav = ada.getByRole('navigation', { name: 'Primary' });
  await expect(adaNav.getByRole('link', { name: 'Events' })).toHaveAttribute('aria-current', 'page');

  // --- Ada claims a tag (signed in: tap -> claim flow) --------------------------
  await ada.goto(`/t/${uid}`);
  await ada.waitForURL(`**/claim/${uid}`);
  await ada.getByRole('button', { name: 'Claim tag' }).click();
  await ada.waitForURL(`**/t/${uid}`);
  await expect(ada.getByText('This is your tag.')).toBeVisible();

  // --- Ada creates a gathering: it lands in Happening and in Yours ------------
  await ada.goto('/gatherings');
  const title = `Smoke Rooftop ${stamp}`;
  await ada.getByLabel('Title').fill(title);
  await ada.getByLabel('Location (optional)').fill('The roof');
  await ada.getByRole('button', { name: 'Create gathering' }).click();
  const adaHappening = ada.getByRole('region', { name: 'Happening' });
  const adaYours = ada.getByRole('region', { name: 'Yours' });
  await revealInFeed(adaHappening, title);
  await expect(adaHappening.getByText(/Hosting · .* · 1 going/)).toBeVisible();
  await expect(adaYours.getByText(title)).toBeVisible();

  // --- ...and she points her tag at it from the detail ---------------------------
  await adaYours.getByRole('link', { name: 'Open' }).click();
  await ada.waitForURL(/\/gatherings\/[0-9a-f-]{36}$/);
  const detailPath = new URL(ada.url()).pathname;
  await expect(ada.getByRole('heading', { name: title })).toBeVisible();
  await expect(ada.getByText('1 going')).toBeVisible();
  await expect(ada.getByText('Host', { exact: true })).toBeVisible();
  await ada.getByRole('button', { name: 'Point my tags at this gathering' }).click();
  await expect(ada.getByRole('button', { name: 'Point my tags back to my profile' })).toBeVisible();

  // --- Bob: taps anonymously, sees the invitation, signs up, lands on the detail
  const bob = await (await browser.newContext()).newPage();
  await bob.goto(`/t/${uid}`);
  await expect(bob.getByRole('heading', { name: 'Smoke Ada' })).toBeVisible();
  await expect(bob.getByText(title)).toBeVisible();
  await bob.getByRole('link', { name: 'Join this gathering' }).click(); // shell guard -> login
  await bob.waitForURL(/\/login\?/);
  await signUp(bob, `smoke-guest-${stamp}@rls.test`);
  await bob.waitForURL(/\/profile\?/); // no profile yet: name first, destination remembered
  await bob.getByLabel('Name').fill('Smoke Bob');
  await bob.getByRole('button', { name: 'Save' }).click();

  // A stranger reads the detail: the headcount, no member rows, and Join.
  await bob.waitForURL(`**${detailPath}**`);
  await expect(bob.getByRole('heading', { name: title })).toBeVisible();
  await expect(bob.getByText('1 going')).toBeVisible();
  await expect(bob.getByText('Smoke Ada')).toHaveCount(0);
  await bob.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(bob.getByText('2 going')).toBeVisible();
  await expect(bob.getByRole('button', { name: 'Leave gathering' })).toBeVisible();
  // Joining revealed Bob's own row and nothing else: the host is not a connection yet.
  await expect(bob.getByText('Smoke Bob')).toBeVisible();
  await expect(bob.getByText('Smoke Ada')).toHaveCount(0);

  // Tapping the tag again as a member opens the gathering instead of inviting twice.
  await bob.goto(`/t/${uid}`);
  await expect(bob.getByRole('link', { name: 'Open gathering' })).toBeVisible();

  // The feed lists it to Bob as Going; Ada's side counts him without naming him.
  await bob.goto('/gatherings');
  const bobHappening = bob.getByRole('region', { name: 'Happening' });
  await revealInFeed(bobHappening, title);
  await expect(bobHappening.getByText(/Going · .* · 2 going/)).toBeVisible();
  await ada.reload();
  await expect(ada.getByText('2 going')).toBeVisible();
  await expect(ada.getByText('Smoke Bob')).toHaveCount(0);

  // --- Connecting is what reveals who's going -------------------------------------
  // Ada points her tag back at her profile so a tap offers Connect.
  await ada.getByRole('button', { name: 'Point my tags back to my profile' }).click();
  await expect(ada.getByRole('button', { name: 'Point my tags at this gathering' })).toBeVisible();
  await bob.goto(`/t/${uid}`);
  await bob.getByRole('button', { name: 'Connect' }).click();
  await expect(bob.getByText(/request sent/i)).toBeVisible();
  await ada.goto('/connections');
  const adaSegments = ada.getByRole('navigation', { name: 'Connections lists' });
  await adaSegments.getByRole('link', { name: 'Requests, 1 pending' }).click();
  await ada.getByRole('button', { name: 'Accept' }).click();
  await expect(adaSegments.getByRole('link', { name: 'Requests', exact: true })).toBeVisible();

  // Now each sees the other in who's going, and the feed names them.
  await bob.goto(detailPath);
  await expect(bob.getByText('Smoke Ada')).toBeVisible();
  await bob.goto('/gatherings');
  await revealInFeed(bobHappening, title);
  await expect(bobHappening.getByText('With Smoke Ada')).toBeVisible();
  await ada.goto(detailPath);
  await expect(ada.getByText('Smoke Bob')).toBeVisible();
});
