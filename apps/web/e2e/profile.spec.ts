// Profile: the photo, My tags, and deleting the account (with or without a profile).
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { admin, claimFreshTag, signUp, signUpWithProfile } from './helpers.ts';

/** The auth user's id for an email, or undefined once it is gone. Pages through
 * every auth user: the local stack keeps the test users other suites create. */
async function authUserId(email: string): Promise<string | undefined> {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email === email);
    if (match) return match.id;
    if (data.users.length < perPage) return undefined;
  }
}

/** Signs up from /login and stops on "Create your profile", saving nothing. */
async function signUpWithoutProfile(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await signUp(page, email);
  await page.waitForURL(/\/profile\?/);
  await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
}

// A landscape PNG (900×600): the client must square it, shrink it to 512px, and
// re-encode as WebP or JPEG.
const LANDSCAPE_PNG = fileURLToPath(new URL('./fixtures/landscape.png', import.meta.url));

test('a photo replaces the initial: uploaded, shown, removable', async ({ page }) => {
  await signUpWithProfile(page, `smoke-photo-${Date.now()}@rls.test`, 'Smoke Photo');
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Profile' }).click();

  const field = page.locator('.avatar-field');
  // The page has more than one status region; the photo's lives in its field.
  const photoStatus = field.getByRole('status');
  const img = field.locator('img');
  // Profile has rendered (the field is there) before checking it has no photo yet.
  await expect(page.getByLabel('Add a photo')).toBeAttached();
  await expect(img).toHaveCount(0);

  await page.getByLabel('Add a photo').setInputFiles(LANDSCAPE_PNG);
  await expect(photoStatus).toHaveText('Photo updated.');

  await expect(img).toHaveAttribute(
    'src',
    /\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/,
  );
  const served = await page.request.get((await img.getAttribute('src'))!);
  expect(served.ok()).toBe(true);
  expect(['image/webp', 'image/jpeg']).toContain(served.headers()['content-type']);

  await page.reload();
  await expect(img).toBeVisible();
  await expect(page.getByLabel('Change photo')).toBeAttached();
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(photoStatus).toHaveText('Photo removed.');
  await expect(img).toHaveCount(0);
  await expect(page.getByLabel('Add a photo')).toBeFocused();
});

test('My tags: a claimed tag turns off and on, and re-points at a gathering', async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  const uid = await claimFreshTag(owner, `smoke-tags-${Date.now()}@rls.test`, 'Smoke Tags');

  await owner.goto('/profile');
  await expect(owner.getByText(uid, { exact: true })).toBeVisible();
  await expect(owner.getByText('A tap shows your card.')).toBeVisible();
  await owner.getByRole('button', { name: `Turn off ${uid}` }).click();
  await expect(owner.getByText('Off. A tap shows an inactive tag.')).toBeVisible();

  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`/t/${uid}`);
  await expect(stranger.getByRole('heading', { name: 'This tag is inactive' })).toBeVisible();

  await owner.getByRole('button', { name: `Turn on ${uid}` }).click();
  await expect(owner.getByText('A tap shows your card.')).toBeVisible();
  await stranger.reload();
  await expect(stranger.getByRole('heading', { name: 'Smoke Tags' })).toBeVisible();

  await owner.goto('/gatherings');
  await owner.getByLabel('Title').fill('Smoke Tag Night');
  await owner.getByRole('button', { name: 'Create gathering' }).click();
  await expect(owner.getByText('Smoke Tag Night')).toBeVisible();
  await owner.goto('/profile');
  // exact: the Save button's name ("Save where … points") contains the label.
  const destination = owner.getByLabel(`Where ${uid} points`, { exact: true });
  const save = owner.getByRole('button', { name: `Save where ${uid} points` });
  // A choice is staged: nothing changes until Save.
  await destination.selectOption({ index: 1 });
  await expect(save).toBeVisible();
  await expect(owner.getByText('A tap shows your card.')).toBeVisible();
  await save.click();
  await expect(owner.getByText('A tap invites people to Smoke Tag Night.')).toBeVisible();
  await expect(save).toHaveCount(0);
  await stranger.reload();
  await expect(stranger.getByText(/Smoke Tag Night/)).toBeVisible();

  await destination.selectOption('profile');
  await save.click();
  await expect(owner.getByText('A tap shows your card.')).toBeVisible();
});

test('deleting the account signs out and releases the tag', async ({ page }) => {
  const uid = await claimFreshTag(page, `smoke-leaving-${Date.now()}@rls.test`, 'Smoke Leaving');

  await page.goto('/profile');
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Delete your account?' })).toBeVisible();
  await expect(page.getByText(/This can't be undone/)).toBeVisible();
  // The confirm step opens on the safe choice.
  await expect(page.getByRole('button', { name: 'Keep my account' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete my account' }).click();

  await page.waitForURL((url) => url.pathname === '/');
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  const { data } = await admin.from('tags').select('status').eq('uid', uid).single();
  expect(data?.status).toBe('unclaimed');
  await page.goto(`/t/${uid}`);
  await page.waitForURL('**/login**'); // unclaimed again: the claim flow, signed out
});

// "Create your profile" offers Sign out and Delete account before anything is
// saved. Leaving the shell from there must land on / (a fixed regression: the
// profile gate used to hijack the navigation out, and bounce /login <-> /profile
// forever).
test('a session without a profile can delete its account', async ({ page }) => {
  const email = `smoke-noprofile-delete-${Date.now()}@rls.test`;
  await signUpWithoutProfile(page, email);
  expect(await authUserId(email)).toBeDefined();

  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click();

  await page.waitForURL((url) => url.pathname === '/', { timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await authUserId(email)).toBeUndefined();
  await page.goto('/profile');
  await page.waitForURL(/\/login\?/); // the session is gone, not just the landing page's guess
});

test('a session without a profile can sign out', async ({ page }) => {
  await signUpWithoutProfile(page, `smoke-noprofile-signout-${Date.now()}@rls.test`);

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();

  await page.waitForURL((url) => url.pathname === '/', { timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await page.goto('/profile');
  await page.waitForURL(/\/login\?/); // the session is gone, not just the landing page's guess
});
