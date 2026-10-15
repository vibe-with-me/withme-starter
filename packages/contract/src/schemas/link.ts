import { z } from 'zod';

/**
 * Profile links: the places a person can be reached, one per platform.
 * Connections tier — only the owner and accepted connections read them
 * (public.profile_links and its policies); the card never carries them.
 *
 * The registry below is the one list every surface derives from: the
 * picker, the input, the chip, the public URL. A fork adds a platform here
 * and in private.is_link_value (the database restates the shape).
 */

/** What an input for this platform holds, and how it is checked. */
export type LinkKind = 'handle' | 'phone' | 'email' | 'url';

export interface LinkPlatform {
  label: string;
  kind: LinkKind;
  /** Shown in the empty input. */
  placeholder: string;
  /** A handle platform that writes the @ in front of the name. */
  at?: boolean;
  /** The public page for a canonical value, or null when the platform has none. */
  href: ((value: string) => string) | null;
}

export const LINK_PLATFORM_IDS = [
  'instagram',
  'tiktok',
  'x',
  'threads',
  'snapchat',
  'facebook',
  'youtube',
  'linkedin',
  'bluesky',
  'telegram',
  'discord',
  'whatsapp',
  'signal',
  'phone',
  'email',
  'website',
] as const;

export type LinkPlatformId = (typeof LINK_PLATFORM_IDS)[number];

export const LinkPlatformSchema = z.enum(LINK_PLATFORM_IDS);

const digits = (value: string) => value.replace(/\D/g, '');

export const LINK_PLATFORMS: Record<LinkPlatformId, LinkPlatform> = {
  instagram: {
    label: 'Instagram',
    kind: 'handle',
    placeholder: 'username',
    at: true,
    href: (h) => `https://instagram.com/${h}`,
  },
  tiktok: {
    label: 'TikTok',
    kind: 'handle',
    placeholder: 'username',
    at: true,
    href: (h) => `https://tiktok.com/@${h}`,
  },
  x: { label: 'X', kind: 'handle', placeholder: 'username', at: true, href: (h) => `https://x.com/${h}` },
  threads: {
    label: 'Threads',
    kind: 'handle',
    placeholder: 'username',
    at: true,
    href: (h) => `https://threads.net/@${h}`,
  },
  snapchat: {
    label: 'Snapchat',
    kind: 'handle',
    placeholder: 'username',
    href: (h) => `https://snapchat.com/add/${h}`,
  },
  facebook: {
    label: 'Facebook',
    kind: 'handle',
    placeholder: 'username',
    href: (h) => `https://facebook.com/${h}`,
  },
  youtube: {
    label: 'YouTube',
    kind: 'handle',
    placeholder: 'channel',
    at: true,
    href: (h) => `https://youtube.com/@${h}`,
  },
  linkedin: {
    label: 'LinkedIn',
    kind: 'handle',
    placeholder: 'your-name',
    href: (h) => `https://linkedin.com/in/${h}`,
  },
  bluesky: {
    label: 'Bluesky',
    kind: 'handle',
    placeholder: 'you.bsky.social',
    href: (h) => `https://bsky.app/profile/${h}`,
  },
  telegram: {
    label: 'Telegram',
    kind: 'handle',
    placeholder: 'username',
    at: true,
    href: (h) => `https://t.me/${h}`,
  },
  // No public page for a username: shown, not linked.
  discord: { label: 'Discord', kind: 'handle', placeholder: 'username', href: null },
  whatsapp: {
    label: 'WhatsApp',
    kind: 'phone',
    placeholder: '+1 555 123 4567',
    href: (v) => `https://wa.me/${digits(v)}`,
  },
  signal: { label: 'Signal', kind: 'phone', placeholder: '+1 555 123 4567', href: null },
  phone: { label: 'Phone', kind: 'phone', placeholder: '+1 555 123 4567', href: (v) => `tel:${v}` },
  email: { label: 'Email', kind: 'email', placeholder: 'you@example.com', href: (v) => `mailto:${v}` },
  website: { label: 'Website', kind: 'url', placeholder: 'https://example.com', href: (v) => v },
};

/** One link per platform, so the list can never be longer than the registry. */
export const MAX_PROFILE_LINKS = LINK_PLATFORM_IDS.length;

/** Longest value any platform stores. The database CHECK caps it too. */
export const LINK_VALUE_MAX = 200;

/**
 * The canonical shape per kind, mirrored by private.is_link_value in SQL
 * (keep the two in step). Handles have no leading @; phone numbers are
 * digits with an optional leading +; a website carries its scheme.
 */
const SHAPE: Record<LinkKind, RegExp> = {
  handle: /^[A-Za-z0-9._-]{1,64}$/,
  phone: /^\+?[0-9]{7,15}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/[^\s/]+\.[^\s/]+/,
};

/** True when `value` is already in the stored form for its platform. */
export function isCanonicalLinkValue(platform: LinkPlatformId, value: string): boolean {
  if (value.length === 0 || value.length > LINK_VALUE_MAX) return false;
  const { kind } = LINK_PLATFORMS[platform];
  if (!SHAPE[kind].test(value)) return false;
  if (kind === 'url') {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * What a person typed, in its stored form — or null when it cannot be one.
 * Forgiving on the way in (an @, spaces and dashes in a number, a bare
 * domain), strict on the way out: the result always passes
 * isCanonicalLinkValue.
 */
export function normalizeLinkValue(platform: LinkPlatformId, raw: string): string | null {
  const { kind } = LINK_PLATFORMS[platform];
  let value = raw.trim();
  switch (kind) {
    case 'handle':
      if (value.startsWith('@')) value = value.slice(1);
      break;
    case 'phone':
      value = value.replace(/[\s().-]/g, '');
      break;
    case 'email':
      value = value.toLowerCase();
      break;
    case 'url':
      // A phone keyboard capitalizes the first letter: "Https://…" is still a URL.
      if (/^https?:\/\//i.test(value)) value = value.replace(/^https?/i, (s) => s.toLowerCase());
      else if (value !== '') value = `https://${value}`;
      break;
  }
  return isCanonicalLinkValue(platform, value) ? value : null;
}

/** The public page for a stored link, or null when the platform has none. */
export function linkHref(platform: LinkPlatformId, value: string): string | null {
  return LINK_PLATFORMS[platform].href?.(value) ?? null;
}

/** The value as a person reads it: "@ada" where the platform writes an @, the value otherwise. */
export function linkLabel(platform: LinkPlatformId, value: string): string {
  return LINK_PLATFORMS[platform].at ? `@${value}` : value;
}

/** A stored link. Only canonical values parse: clients normalize first. */
export const ProfileLinkSchema = z
  .object({
    platform: LinkPlatformSchema,
    value: z.string().min(1).max(LINK_VALUE_MAX),
  })
  .refine((link) => isCanonicalLinkValue(link.platform, link.value), {
    message: 'Not a stored form for this platform',
    path: ['value'],
  });

/** The whole list, in display order, one row per platform. Empty clears them all. */
export const ProfileLinksInputSchema = z.object({
  links: z
    .array(ProfileLinkSchema)
    .max(MAX_PROFILE_LINKS)
    .refine((links) => new Set(links.map((link) => link.platform)).size === links.length, {
      message: 'One link per platform',
    }),
});

export type ProfileLink = z.infer<typeof ProfileLinkSchema>;
export type ProfileLinksInput = z.infer<typeof ProfileLinksInputSchema>;
