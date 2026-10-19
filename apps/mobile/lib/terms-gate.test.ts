import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { TERMS_VERSION } from '@withme/contract';

// The gate is a module-level store behind two hooks. React here is the
// smallest stand-in that runs them: the effect runs at once and its cleanup
// is kept, so each "render" is a plain call. react-native gives AppState,
// and the API client answers whatever each test sets.
let cleanup: (() => void) | void;
let appStateListener: ((next: string) => void) | null = null;
let answer: () => Promise<{ profile: { terms_version: string | null } | null }>;

mock.module('react', () => ({
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
  useEffect: (effect: () => (() => void) | void) => {
    cleanup?.();
    cleanup = effect();
  },
}));
mock.module('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, listener: (next: string) => void) => {
      appStateListener = listener;
      return { remove: () => (appStateListener = null) };
    },
  },
}));
mock.module('./api', () => ({ api: { app: { profile: { get: () => answer() } } } }));

const { markTermsCurrent, useTermsGate, useTermsStatus } = await import('./terms-gate');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

type Answer = { profile: { terms_version: string | null } };
const unset = (_value: Answer) => {};

beforeEach(() => {
  // signing out resets the shared state to `unknown`
  useTermsGate(false);
  cleanup?.();
  cleanup = undefined;
});

describe('useTermsGate', () => {
  test('signed out is neither checking nor gated', () => {
    expect(useTermsGate(false)).toEqual({ needsTerms: false, checking: false });
    expect(useTermsStatus()).toBe('unknown');
  });

  test('checking until the first answer, then open for the current version', async () => {
    answer = async () => ({ profile: { terms_version: TERMS_VERSION } });
    expect(useTermsGate(true)).toEqual({ needsTerms: false, checking: true });
    await flush();
    expect(useTermsStatus()).toBe('current');
  });

  test('gated for another version or none', async () => {
    for (const terms_version of ['2020-01-01', null]) {
      useTermsGate(false);
      answer = async () => ({ profile: { terms_version } });
      useTermsGate(true);
      await flush();
      expect(useTermsStatus()).toBe('needs');
    }
  });

  test('no profile yet is open: creating one carries the agreement', async () => {
    answer = async () => ({ profile: null });
    useTermsGate(true);
    await flush();
    expect(useTermsStatus()).toBe('current');
  });

  test('a failed check opens the app rather than locking people out', async () => {
    answer = async () => {
      throw new Error('offline');
    };
    useTermsGate(true);
    await flush();
    expect(useTermsStatus()).toBe('current');
  });

  test('returning to the foreground checks again', async () => {
    answer = async () => ({ profile: { terms_version: TERMS_VERSION } });
    useTermsGate(true);
    await flush();
    expect(useTermsStatus()).toBe('current');

    answer = async () => ({ profile: { terms_version: '2020-01-01' } });
    appStateListener?.('background');
    await flush();
    expect(useTermsStatus()).toBe('current');
    appStateListener?.('active');
    await flush();
    expect(useTermsStatus()).toBe('needs');
  });

  test('markTermsCurrent wins over a check still in flight', async () => {
    let release = unset;
    answer = () => new Promise<Answer>((resolve) => (release = resolve));
    useTermsGate(true);
    markTermsCurrent();
    expect(useTermsStatus()).toBe('current');
    release({ profile: { terms_version: null } });
    await flush();
    expect(useTermsStatus()).toBe('current');
  });

  test('signing out while a check is in flight drops its answer', async () => {
    let release = unset;
    answer = () => new Promise<Answer>((resolve) => (release = resolve));
    useTermsGate(true);
    useTermsGate(false);
    release({ profile: { terms_version: null } });
    await flush();
    expect(useTermsStatus()).toBe('unknown');
  });
});
