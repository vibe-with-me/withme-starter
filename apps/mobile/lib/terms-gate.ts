import { termsAreCurrent } from '@withme/contract';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { api } from './api';

/**
 * Whether the signed-in profile must agree to the terms again before the app
 * opens: it agreed to another TERMS_VERSION, or to none (made before terms
 * existed). No profile yet is not a "yes": creating one carries the
 * agreement. Checked when the session changes and whenever the app returns
 * to the foreground; the root layout's Stack.Protected reads it.
 *
 * A failed check opens the app (the next foreground checks again): the
 * gate records an agreement, it is not a safety boundary, and a flaky
 * network must not lock people out.
 */
type GateState = 'unknown' | 'current' | 'needs';

let state: GateState = 'unknown';
const listeners = new Set<() => void>();

function set(next: GateState) {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let generation = 0;
async function check(): Promise<void> {
  const mine = ++generation;
  try {
    const { profile } = await api.app.profile.get();
    if (mine === generation) set(profile && !termsAreCurrent(profile) ? 'needs' : 'current');
  } catch {
    if (mine === generation) set('current');
  }
}

/** Called by the re-ask screen once the API has recorded the agreement. */
export function markTermsCurrent(): void {
  generation += 1;
  set('current');
}

/** The gate for the root layout. `checking` is true until the first answer for this session. */
export function useTermsGate(signedIn: boolean): { needsTerms: boolean; checking: boolean } {
  const current = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (!signedIn) {
      generation += 1;
      set('unknown');
      return;
    }
    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => subscription.remove();
  }, [signedIn]);
  return { needsTerms: signedIn && current === 'needs', checking: signedIn && current === 'unknown' };
}
