import { useColorScheme } from 'react-native';

/**
 * Design tokens — the mobile mirror of apps/web/src/styles/tokens.css.
 * Same dormant-seam logic: V2 theming is a token swap, not a redesign.
 * Near-monochrome warm neutrals with EXACTLY ONE vivid accent, reserved
 * for the handshake pair (Connect and Accept).
 */
export interface Tokens {
  bg: string;
  surface: string;
  border: string;
  borderInput: string;
  ink: string;
  inkMuted: string;
  accent: string;
  accentInk: string;
}

const light: Tokens = {
  bg: '#f3efe8',
  surface: '#fffefb',
  border: 'rgba(28, 25, 22, 0.09)',
  borderInput: 'rgba(28, 25, 22, 0.5)',
  ink: '#1c1916',
  inkMuted: '#6f6a62',
  accent: '#c2410c',
  accentInk: '#ffffff',
};

const dark: Tokens = {
  bg: '#141210',
  surface: '#26221e',
  border: 'rgba(240, 236, 229, 0.1)',
  borderInput: 'rgba(240, 236, 229, 0.5)',
  ink: '#f0ece5',
  inkMuted: '#a39c91',
  accent: '#ff6a3d',
  accentInk: '#211008',
};

export function useTokens(): Tokens {
  return useColorScheme() === 'dark' ? dark : light;
}

/**
 * Elevation — the mirror of --shadow-card and --shadow-bar in tokens.css,
 * as React Native shadow props. Cards have no border; the shadow and the
 * bg/surface step do the work. The bar has no shadow in dark (it vanishes
 * on a dark ground) and keeps a hairline instead.
 */
export interface Shadow {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

export const shadow = {
  card: {
    light: {
      shadowColor: '#1c1916',
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    dark: {
      shadowColor: '#000000',
      shadowOpacity: 0.55,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
  },
  bar: {
    light: {
      shadowColor: '#1c1916',
      shadowOpacity: 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -6 },
      elevation: 8,
    },
    dark: null,
  },
} as const satisfies { card: Record<'light' | 'dark', Shadow>; bar: Record<'light' | 'dark', Shadow | null> };

export function useShadow(): { card: Shadow; bar: Shadow | null } {
  const isDark = useColorScheme() === 'dark';
  return isDark
    ? { card: shadow.card.dark, bar: shadow.bar.dark }
    : { card: shadow.card.light, bar: shadow.bar.light };
}

export const fonts = {
  display: 'SpaceGrotesk_600SemiBold',
  displayMedium: 'SpaceGrotesk_500Medium',
  displayBold: 'SpaceGrotesk_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
} as const;

export const radius = {
  card: 24,
  control: 14,
  pill: 999,
} as const;

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
  s7: 48,
} as const;

/** Minimum tap target (pt). Taps happen outdoors and at night events. */
export const TAP_TARGET = 44;

/** Mirror of --shell-nav-height in tokens.css. The tab bar keeps React Navigation's default height. */
export const SHELL = { headerHeight: 56 } as const;
