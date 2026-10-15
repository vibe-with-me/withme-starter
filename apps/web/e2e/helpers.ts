import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
// No default in source; see packages/db/src/test-utils for why.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. For the local stack, take it from ' +
      'the `bun run db:start` output (the Secret key) or `supabase status -o env`:\n' +
      '  eval "export $(supabase status -o env --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY | grep ^SUPABASE_SERVICE_ROLE_KEY=)"\n' +
      'docs/local-development.md has the details.',
  );
}

/** Service-role client: test setup only (provisioning tags), never the path under test. */
export const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export function freshUid(): string {
  let uid = '';
  for (let i = 0; i < 14; i++) {
    uid += '0123456789ABCDEF'[Math.floor(Math.random() * 16)];
  }
  return uid;
}

/** Drives the login page's sign-up form. Local Supabase has confirmations off. */
export async function signUp(page: Page, email: string): Promise<void> {
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('smoke-pass-1!');
  await page.getByRole('button', { name: 'Sign up' }).click();
}

/** The `returnTo` search param of the current URL, decoded. */
export function returnToOf(page: Page): string | null {
  return new URL(page.url()).searchParams.get('returnTo');
}

/** Signs up from /login and creates the profile; lands on Events, the default. */
export async function signUpWithProfile(page: Page, email: string, name: string): Promise<void> {
  await page.goto('/login');
  await signUp(page, email);
  await page.waitForURL(/\/profile\?/);
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL('**/gatherings');
}

/** Provisions a fresh tag, signs up from its tap, and claims it. Returns the uid. */
export async function claimFreshTag(page: Page, email: string, name: string): Promise<string> {
  const uid = freshUid();
  const { error } = await admin.from('tags').insert({ uid });
  if (error) throw error;
  await page.goto(`/t/${uid}`);
  await page.waitForURL('**/login**');
  await signUp(page, email);
  await page.waitForURL(`**/claim/${uid}`);
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Claim tag' }).click();
  await page.waitForURL(`**/t/${uid}`);
  return uid;
}
