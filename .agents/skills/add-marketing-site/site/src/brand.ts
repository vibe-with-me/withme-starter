// The site's brand-bearing values. make-it-yours sets the same names in the
// app; keep them identical. Colors and fonts are not here: the layout imports
// the web app's tokens.css and app.css, so a token swap restyles both.

/** The lowercase mark, as the app's header renders it. */
export const WORDMARK = 'withme';
/** The name in a sentence. */
export const DISPLAY_NAME = 'withme';
/** One line under the wordmark: the app's landing promise. */
export const PROMISE = 'Find your people in what you love to do.';
/** The meta description: one plain sentence of what the app does. */
export const DESCRIPTION =
  'An NFC tag that opens your card. Tap it to meet someone, connect when you both say yes.';
/** Where people reach you. The support and privacy pages name it. */
export const CONTACT_EMAIL = 'hello@example.com';

// Build-time links, from apps/site/.env locally and .env.production for a
// deploy. Each is optional: an unset link removes its button, so the site
// never ships a dead link (the same dormant seam as the app's store URL).
const env = import.meta.env;
const origin = (value: string | undefined) => (value ?? '').trim().replace(/\/+$/, '');

export const APP_URL = origin(env.PUBLIC_APP_URL);
export const STORE_URL = (env.PUBLIC_STORE_URL ?? '').trim();
