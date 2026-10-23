import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { PendingBody } from '../components/CalmStates.tsx';
import { asSignedInAccount, useAccountSwitching } from '../lib/account-scope.ts';
import { api } from '../lib/api.ts';
import { getSessionUserId } from '../lib/supabase.ts';

/**
 * The admin area, for operators (private.operators). Outside the user app:
 * no tab bar, and nothing links here; operators bookmark it. Client-only
 * (`ssr: false` cascades to every admin page), where the session lives.
 *
 * Anyone who is not an operator, signed out included, gets the app's normal
 * not-found page: no sign-in prompt and no "access denied", so the URL
 * never confirms there is an admin area. Every admin.* procedure checks
 * again, and so does every admin function in the database: this guard is
 * what the browser shows, not what keeps the data safe.
 */
export const Route = createFileRoute('/admin')({
  ssr: false,
  head: () => ({
    meta: [{ title: 'Admin — withme' }, { name: 'robots', content: 'noindex' }],
  }),
  beforeLoad: async () => {
    if (!(await getSessionUserId())) throw notFound();
    // Every failure is the not-found page, not only FORBIDDEN: an error
    // page here and not-found on a missing path would tell a non-operator
    // the route exists. An operator whose check failed (a network blip)
    // reloads.
    await asSignedInAccount(() => api.admin.session()).catch(() => {
      throw notFound();
    });
  },
  component: AdminLayout,
});

function AdminLayout() {
  // Another tab signed out or in as someone else: show nothing of this
  // account's until the guard above has run again for the new one.
  const switching = useAccountSwitching();
  return <main className="page">{switching ? <PendingBody /> : <Outlet />}</main>;
}
