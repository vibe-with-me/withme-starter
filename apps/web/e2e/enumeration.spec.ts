// Nobody can list your users (docs/safety-model.md): a tag URL is the only
// way to a card, and no answer tells a prober whether a UID exists. An
// unknown UID reads like an unclaimed one, and claiming someone else's tag
// fails the same way as claiming one that was never made.
import { expect, test } from '@playwright/test';
import {
  admin,
  claimFreshTag,
  freshUid,
  newPerson,
  profileIdByName,
  returnToOf,
  signUpWithProfile,
  uniqueStamp,
} from './helpers.ts';

test.describe('No enumeration', () => {
  test('an unknown tag reads exactly like an unclaimed one: both go to the claim flow', async ({
    page,
  }) => {
    const unclaimed = freshUid();
    const { error } = await admin.from('tags').insert({ uid: unclaimed });
    expect(error).toBeNull();
    const unknown = freshUid();

    for (const uid of [unclaimed, unknown]) {
      await page.goto(`/t/${uid}`);
      await page.waitForURL(/\/login\?/);
      expect(returnToOf(page)).toBe(`/claim/${uid}`);
    }
  });

  test("claiming someone's tag fails the same way as claiming one that does not exist", async ({
    browser,
  }) => {
    const stamp = uniqueStamp();
    const owner = await newPerson(browser);
    const ownerName = `Enum Owner ${stamp}`;
    const owned = await claimFreshTag(owner, `enum-owner-${stamp}@rls.test`, ownerName);

    const prober = await newPerson(browser);
    await signUpWithProfile(prober, `enum-prober-${stamp}@rls.test`, `Enum Prober ${stamp}`);
    const answers: string[] = [];
    for (const uid of [owned, freshUid()]) {
      await prober.goto(`/claim/${uid}`);
      await prober.getByRole('button', { name: 'Claim tag' }).click();
      const alert = prober.getByRole('alert');
      await expect(alert).toBeVisible();
      answers.push((await alert.textContent()) ?? '');
    }
    expect(answers[0]).toBe("This tag can't be claimed. It may already belong to someone.");
    expect(answers[1]).toBe(answers[0]);

    // And the owner still holds it.
    const { data } = await admin.from('tags').select('claimed_by').eq('uid', owned).single();
    expect(data?.claimed_by).toBe(await profileIdByName(ownerName));
  });

  test('a malformed tag lands on the calm not-found card', async ({ page }) => {
    await page.goto('/t/not-a-tag');
    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'withme home' })).toBeVisible();
  });
});
