/** The length of the sign-in code texted by Supabase Auth (Twilio Verify). */
export const OTP_CODE_LENGTH = 6;

/**
 * A typed phone number as E.164 (`+15555550100`), or null when it can't be
 * one. Spaces, dashes, dots and parens are dropped and a `00` prefix becomes
 * `+`; the country code is required because Supabase Auth and Twilio need
 * it, and there is no country picker to guess one from.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s().-]/g, '').replace(/^00/, '+');
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}
