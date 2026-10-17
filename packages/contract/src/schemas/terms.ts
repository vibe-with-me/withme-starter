import { z } from 'zod';

/**
 * The version of the fork's terms of use and privacy policy that people
 * agree to. Change it whenever either document changes in a way people
 * must agree to again: everyone whose profile records another version is
 * asked again before the app opens (web shell, mobile root layout).
 *
 * The documents themselves live at the fork's own URLs (VITE_TERMS_URL /
 * VITE_PRIVACY_URL, EXPO_PUBLIC_TERMS_URL / EXPO_PUBLIC_PRIVACY_URL); the
 * starter's placeholder text is docs/terms-template.md.
 */
export const TERMS_VERSION = '2026-10-16';

/** Accepting is agreeing to exactly the current version, nothing else. */
export const AcceptTermsInputSchema = z.object({
  version: z.literal(TERMS_VERSION),
});

/** True when the profile agreed to the current terms. */
export function termsAreCurrent(profile: { terms_version: string | null }): boolean {
  return profile.terms_version === TERMS_VERSION;
}

export type AcceptTermsInput = z.infer<typeof AcceptTermsInputSchema>;
