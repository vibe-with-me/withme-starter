import { termsAreCurrent } from '@withme/contract';
import { createFileRoute, Navigate, useLocation, useRouterState } from '@tanstack/react-router';
import { AppShell, ShellError, ShellPending } from '../components/AppShell.tsx';
import { NotFoundBody } from '../components/CalmStates.tsx';
import { asSignedInAccount } from '../lib/account-scope.ts';
import { api } from '../lib/api.ts';
import { requireSession } from '../lib/auth-guard.ts';

/**
 * The signed-in shell. Pathless: it owns no URL segment, only the guard and
 * the chrome. `ssr: false` cascades to every child (selective SSR can only
 * get more restrictive), so tab pages render on the client, where the
 * Supabase session lives.
 */
export const Route = createFileRoute('/_app')({
  ssr: false,
  beforeLoad: ({ location }) => requireSession(location.href),
  // One profile fetch for the whole shell (run again only if the account
  // changed under it); children read it with
  // useLoaderData({ from: '/_app' }). Re-fetched on invalidate() or, after 60s, in
  // the background on the next navigation. The Profile page invalidates after saving.
  loader: async () => {
    const { profile } = await asSignedInAccount(() => api.app.profile.get());
    return { profile };
  },
  staleTime: 60_000,
  component: ShellRoute,
  // The layout's own fallbacks replace its component, so they bring the
  // chrome with them: a slow or failed profile load keeps the tabs on screen.
  pendingComponent: ShellPending,
  errorComponent: ShellError,
  // A bad path under the shell renders in the shell's outlet (no second <main>).
  notFoundComponent: NotFoundBody,
});

/**
 * A session without a profile is sent to create one, carrying the intended
 * destination. Not a `throw redirect` from the loader above: its target,
 * /profile, sits under this same layout, so the router would reuse the
 * redirected `/_app` match for it, and with the pending shell already on
 * screen (a profile fetch slower than defaultPendingMs) the stale
 * "redirected" match re-renders after the re-load has dropped its load
 * promise and throws `undefined` past every error boundary: a blank page.
 *
 * The gate holds off while a navigation is in flight. `useLocation()` is
 * where the router is going, not what is on screen: leaving the shell
 * (Sign out or Delete account from "Create your profile", both heading for
 * /), this layout stays mounted with its old profile-less data until the
 * new matches commit. Redirecting then would hijack the navigation out,
 * and with the session gone, `requireSession` and this gate would bounce
 * /login and /profile forever. `isLoading` turns false in the same commit
 * as the new matches, so on the way in the gate still fires on the first
 * committed render, with the real destination as `returnTo`.
 */
function ShellRoute() {
  const { profile } = Route.useLoaderData();
  const { pathname, href } = useLocation();
  const navigating = useRouterState({ select: (s) => s.isLoading });
  if (!profile && pathname !== '/profile') {
    if (navigating) return <ShellPending />;
    return (
      <>
        <Navigate to="/profile" search={{ returnTo: href }} replace />
        <ShellPending />
      </>
    );
  }
  // The same gate for terms: a profile that agreed to another version (or
  // none, from before terms existed) is asked again before anything else.
  if (profile && !termsAreCurrent(profile) && pathname !== '/terms') {
    if (navigating) return <ShellPending />;
    return (
      <>
        <Navigate to="/terms" search={{ returnTo: href }} replace />
        <ShellPending />
      </>
    );
  }
  return <AppShell />;
}
