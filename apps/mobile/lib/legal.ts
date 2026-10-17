import { Linking } from 'react-native';

/**
 * The fork's own terms of use and privacy policy. Sign-up and the re-ask
 * screen link to them; until they are set the agreement still shows, with
 * no links (go-live sets both). Only an https URL counts.
 */
function httpsUrl(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return /^https:\/\/\S+$/.test(trimmed) ? trimmed : null;
}

export const TERMS_URL = httpsUrl(process.env.EXPO_PUBLIC_TERMS_URL);
export const PRIVACY_URL = httpsUrl(process.env.EXPO_PUBLIC_PRIVACY_URL);

/**
 * Opens a document in the in-app browser, or the system browser if that is
 * not available (a native module loaded on demand, as Merch does).
 */
export async function openDocument(url: string): Promise<void> {
  try {
    const WebBrowser = await import('expo-web-browser');
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}
