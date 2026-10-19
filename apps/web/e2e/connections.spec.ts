// Connections: three lists behind segments, each on its own ladder.
import { expect, test } from '@playwright/test';
import { admin, claimFreshTag, signUpWithProfile } from './helpers.ts';

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

test('a connection made at a gathering both are going to says so, and links to it', async ({ browser }) => {
  const stamp = Date.now();
  const ada = await (await browser.newContext()).newPage();
  const uid = await claimFreshTag(ada, `smoke-metat-ada-${stamp}@rls.test`, `MetAt Ada ${stamp}`);
  const bob = await (await browser.newContext()).newPage();
  await signUpWithProfile(bob, `smoke-metat-bob-${stamp}@rls.test`, `MetAt Bob ${stamp}`);

  // Setup only: a gathering starting within the hour, both of them going.
  const { data: people, error: peopleError } = await admin
    .from('profiles')
    .select('id, display_name')
    .in('display_name', [`MetAt Ada ${stamp}`, `MetAt Bob ${stamp}`]);
  expect(peopleError).toBeNull();
  const idOf = (name: string) => people!.find((p) => p.display_name === name)!.id;
  const title = `Mixer ${stamp}`;
  const { data: gathering, error: gatheringError } = await admin
    .from('gatherings')
    .insert({
      host_id: idOf(`MetAt Ada ${stamp}`),
      title,
      starts_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .select('id')
    .single();
  expect(gatheringError).toBeNull();
  const { error: membersError } = await admin.from('gathering_members').insert([
    { gathering_id: gathering!.id, profile_id: idOf(`MetAt Ada ${stamp}`) },
    { gathering_id: gathering!.id, profile_id: idOf(`MetAt Bob ${stamp}`) },
  ]);
  expect(membersError).toBeNull();

  // Bob taps Ada's tag and asks; Ada accepts.
  await bob.goto(`/t/${uid}`);
  await bob.getByRole('button', { name: 'Connect' }).click();
  await expect(bob.getByText(/request sent/i)).toBeVisible();
  await ada.goto('/connections?tab=requests');
  await ada.getByRole('button', { name: 'Accept' }).click();
  await expect(ada.getByText('No requests right now.')).toBeVisible();

  const metAt = new RegExp(`^Met at ${title} · `);
  await ada.goto('/connections');
  await expect(ada.getByText(`MetAt Bob ${stamp}`)).toBeVisible();
  await expect(ada.getByRole('link', { name: metAt })).toBeVisible();

  await bob.goto('/connections');
  await bob.getByRole('link', { name: metAt }).click();
  await bob.waitForURL(`**/gatherings/${gathering!.id}`);
  await expect(bob.getByRole('heading', { name: title })).toBeVisible();
});
