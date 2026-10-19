// Reports are private (docs/safety-model.md, Guideline 1.2): report a person
// from their card or a gathering from its page, and block in the same step.
// Only the operator sees the report. The terms gate is in terms.spec.ts.
import { expect, test } from '@playwright/test';
import {
  admin,
  claimFreshTag,
  createGathering,
  newPerson,
  profileIdByName,
  signUpWithProfile,
  uniqueStamp,
} from './helpers.ts';

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

test('a guest reports a gathering and blocks its host; the report names the gathering', async ({
  browser,
}) => {
  const stamp = uniqueStamp();
  const title = `Report Picnic ${stamp}`;
  const hostName = `Report Host ${stamp}`;
  const host = await newPerson(browser);
  await signUpWithProfile(host, `report-host-${stamp}@rls.test`, hostName);
  const detailPath = await createGathering(host, title);
  const gatheringId = detailPath.split('/').pop()!;
  // The host never sees Report or Block on their own gathering.
  await expect(host.getByRole('button', { name: 'Report' })).toHaveCount(0);
  await expect(host.getByRole('button', { name: 'Block host' })).toHaveCount(0);

  const guest = await newPerson(browser);
  await signUpWithProfile(guest, `report-guest-${stamp}@rls.test`, `Report Guest ${stamp}`);
  await guest.goto(detailPath);
  await guest.getByRole('button', { name: 'Report' }).click();
  const dialog = guest.getByRole('dialog', { name: 'Report this gathering' });
  await dialog.getByRole('radio', { name: 'Spam or a scam' }).check();
  await expect(dialog.getByRole('checkbox', { name: 'Also block the host' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(guest.getByText('Thanks. Your report is in and the host is blocked.', { exact: false })).toBeVisible();

  const hostId = await profileIdByName(hostName);
  const { data: reports } = await admin.from('reports').select('*').eq('gathering_id', gatheringId);
  expect(reports).toHaveLength(1);
  expect(reports?.[0]).toMatchObject({ reported_id: hostId, reason: 'spam', status: 'open' });
  const { data: blocks } = await admin
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', reports![0]!.reporter_id);
  expect(blocks).toEqual([{ blocked_id: hostId }]);

  // The block hides the gathering from the reporter from now on.
  await guest.goto(detailPath);
  await guest.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(guest.getByText("This gathering isn't available.")).toBeVisible();
});
