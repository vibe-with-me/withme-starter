// Phone sign-in: number, texted code, signed in. The test number takes a fixed
// code from [auth.sms.test_otp] in supabase/config.toml and never reaches Twilio.
import { expect, type Page, test } from '@playwright/test';
import { admin, freshUid } from './helpers.ts';

const TEST_PHONE = '+1 (555) 555-0100';
const TEST_CODE = '123456';

// Every test signs in as the one test number, so they take turns.
test.describe.configure({ mode: 'serial' });

/** Deletes the test number's auth user, so each test starts as a new phone. */
async function forgetTestPhone(): Promise<void> {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.phone === '15555550100');
    if (match) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(match.id);
      if (deleteError) throw deleteError;
      return;
    }
    if (data.users.length < perPage) return;
  }
}

/** From /login: switches to phone and asks for a code for the test number. */
async function requestCode(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Use phone instead' }).click();
  await page.getByLabel('Phone number').fill(TEST_PHONE);
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('+15555550100');
}

test.beforeEach(forgetTestPhone);

test('a new number signs up with a texted code and lands on profile creation', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use phone instead' }).click();

  // No country code: caught before anything is sent.
  await page.getByLabel('Phone number').fill('555-555-0100');
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await expect(page.getByRole('alert')).toContainText('country code');

  await page.getByLabel('Phone number').fill(TEST_PHONE);
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();

  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByLabel('Code').fill(TEST_CODE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/profile\?/);
  await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
});

test('a tag tap keeps its thread through phone sign-in', async ({ page }) => {
  const uid = freshUid();
  const { error } = await admin.from('tags').insert({ uid });
  if (error) throw error;

  await page.goto(`/t/${uid}`);
  await page.waitForURL('**/login**');
  await requestCode(page);
  await page.getByLabel('Code').fill(TEST_CODE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**/claim/${uid}`);
});

test('"Use email instead" goes back to the email form', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use phone instead' }).click();
  await page.getByRole('button', { name: 'Use email instead' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
});
