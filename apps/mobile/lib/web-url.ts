// Read as a plain member expression: Expo inlines EXPO_PUBLIC_* at build time.
const raw = process.env.EXPO_PUBLIC_WEB_URL;

/**
 * The web app's origin, without a trailing slash: what a share code encodes
 * and the only origin the QR scanner opens. Null when unset; the share and
 * scan screens then say so instead of guessing.
 */
export const webUrl: string | null = raw ? raw.trim().replace(/\/+$/, '') || null : null;
