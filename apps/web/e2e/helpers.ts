import { expect, type Browser, type Locator, type Page } from '@playwright/test';
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

/**
 * A suffix for this test's emails, names and titles. Date.now() alone can
 * repeat across workers under --repeat-each; the random tail cannot.
 */
export function uniqueStamp(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A page in a fresh browser context: a separate person, with no shared session. */
export async function newPerson(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** Setup, not the path under test: the profile id behind a (stamped, so unique) display name. */
export async function profileIdByName(name: string): Promise<string> {
  const { data, error } = await admin.from('profiles').select('id').eq('display_name', name).single();
  if (error || !data) throw error ?? new Error(`no profile named ${name}`);
  return data.id as string;
}

/** Setup, not the path under test: an accepted connection, as accept_connect_request writes it. */
export async function connectByAdmin(a: string, b: string): Promise<void> {
  const [user_a, user_b] = a < b ? [a, b] : [b, a];
  const { error } = await admin.from('connections').insert({ user_a, user_b });
  if (error) throw error;
}

/**
 * The feed comes a page at a time, and other tests fill the first page:
 * press Load more until the row shows, as a person would.
 */
export async function revealInFeed(feed: Locator, title: string): Promise<void> {
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

/**
 * The other half: load every page, then the row must be absent. A hidden
 * gathering has to be missing from the whole feed, not just the first page.
 */
export async function expectNotInFeed(page: Page, title: string): Promise<void> {
  const feed = page.getByRole('region', { name: 'Discover' });
  const more = feed.getByRole('button', { name: 'Load more' });
  // The feed has rendered once it shows a row or its empty line.
  await expect(feed.locator('.row, .empty').first()).toBeVisible();
  for (let n = 0; n < 200 && (await more.isVisible()); n++) {
    await more.click();
    await expect(feed.getByRole('button', { name: 'Loading…' })).toHaveCount(0);
  }
  await expect(more).toHaveCount(0);
  await expect(feed.getByText(title)).toHaveCount(0);
}

/** Creates a gathering on its own page, which lands on the detail; returns the detail path. */
export async function createGathering(page: Page, title: string): Promise<string> {
  await page.goto('/gatherings/new');
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Create gathering' }).click();
  await page.waitForURL(/\/gatherings\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  return new URL(page.url()).pathname;
}

/** Drives the login page's sign-up form. Local Supabase has confirmations off. */
export async function signUp(page: Page, email: string): Promise<void> {
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('smoke-pass-1!');
  await page.getByRole('button', { name: 'Sign up' }).click();
}

/** Ticks the sign-up agreement (terms of use and privacy policy) a new profile requires. */
export async function agreeToTerms(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: /I agree to/ }).check();
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
  await agreeToTerms(page);
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
  await agreeToTerms(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Claim tag' }).click();
  await page.waitForURL(`**/t/${uid}`);
  return uid;
}
