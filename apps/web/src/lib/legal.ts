/**
 * The fork's own terms of use and privacy policy. Sign-up and the re-ask
 * screen link to them; until they are set the agreement still shows, with
 * no links (go-live sets both). Only an https URL counts.
 */
function httpsUrl(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return /^https:\/\/\S+$/.test(trimmed) ? trimmed : null;
}

export const TERMS_URL = httpsUrl(import.meta.env.VITE_TERMS_URL);
export const PRIVACY_URL = httpsUrl(import.meta.env.VITE_PRIVACY_URL);
