import type { AnyRouter } from '@tanstack/react-router';
import { useSyncExternalStore } from 'react';
import { getSessionUserId, getSupabase } from './supabase.ts';

/**
 * Loader data belongs to the signed-in account. The router keeps a route's
 * data after you leave it and reuses it on re-entry, and a page already on
 * screen keeps its data while it re-loads. Left alone, a second account on
 * the same browser would be shown the first account's profile and
 * connections. So on any account change (sign-out, sign-in, another tab):
 * the cache is dropped, the shell hides its content at once, and the content
 * comes back only when the new account's data has loaded.
 */

let switchesInFlight = 0;
const listeners = new Set<() => void>();

function setSwitchesInFlight(next: number): void {
  const was = switchesInFlight > 0;
  switchesInFlight = Math.max(0, next);
  if (was !== switchesInFlight > 0) for (const listener of listeners) listener();
}

// Module-level so useSyncExternalStore never re-subscribes on a re-render.
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return switchesInFlight > 0;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True from the moment the account changes until its data has loaded. */
export function useAccountSwitching(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Runs a load as the signed-in account. A request carries the token of
 * whoever is signed in when it is sent; if the account changed while it was
 * in flight (another tab), its result belongs to the previous account, and
 * the router would keep it: a load already in flight is reused by the
 * re-load, not run again. So it runs again here, until one account held for
 * the whole of it.
 */
export async function asSignedInAccount<T>(load: () => Promise<T>): Promise<T> {
  let account = await getSessionUserId();
  for (;;) {
    // A rejection is kept too: the previous account's request failing (its
    // token gone) must not put the new account's page into the error state.
    const outcome = await load().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const now = await getSessionUserId();
    if (now === account) {
      if (outcome.ok) return outcome.value;
      throw outcome.error;
    }
    account = now;
  }
}

export function scopeRouterToAccount(router: AnyRouter): void {
  if (typeof window === 'undefined') return;
  let supabase: ReturnType<typeof getSupabase>;
  try {
    supabase = getSupabase();
  } catch {
    // No Supabase env: nothing signs in, so there is nothing to scope.
    return;
  }
  let accountId: string | null | undefined;
  supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user.id ?? null;
    const changed = accountId !== undefined && next !== accountId;
    accountId = next;
    if (!changed) return;

    // Synchronous and Supabase-free, so the very next navigation cannot be
    // served the previous account's data.
    router.clearCache();

    // Nothing of the previous account is on screen or about to be (the login
    // page, a tag): the cleared cache is all that is needed. A pending
    // navigation into the shell counts: its loader ran as the previous account.
    // `latestLocation` is the navigation's destination as soon as it starts.
    // The admin area is guarded per account the same way (its guard asks
    // the API whether this account is an operator).
    const guarded = (id: string) => id === '/_app' || id === '/admin';
    const [destination] = router.getMatchedRoutes(router.latestLocation.pathname);
    const shellOnScreen =
      router.state.matches.some((match) => guarded(match.routeId)) ||
      destination.some((route) => guarded(route.id));
    if (!shellOnScreen) return;

    setSwitchesInFlight(switchesInFlight + 1);
    // Deferred so this callback stays quick and a sign-out's own navigation
    // starts before the re-load (auth-js holds no lock by default; none is
    // waited on here). `sync` makes the promise settle when the loaders have.
    setTimeout(() => {
      router
        .invalidate({ sync: true })
        .catch(() => undefined)
        .finally(() => setSwitchesInFlight(switchesInFlight - 1));
    }, 0);
  });
}
