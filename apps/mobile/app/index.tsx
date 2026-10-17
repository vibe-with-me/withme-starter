import { Redirect } from 'expo-router';
import { useTermsStatus } from '../lib/terms-gate';
import { useSession } from '../lib/use-session';

/**
 * Auth router and the always-available anchor route. Sends signed-in users
 * to the tabs (or to agree to updated terms first) and everyone else to sign-in; public routes (t/[uid],
 * scan) are reached directly by deep link and bypass this.
 */
export default function Index() {
  const { session, loading } = useSession();
  // Read-only: the root layout owns the terms checks (see useTermsGate).
  const terms = useTermsStatus();
  if (loading) return null;
  if (!session) return <Redirect href="/login" />;
  if (terms === 'unknown') return null;
  return <Redirect href={terms === 'needs' ? '/terms-update' : '/gatherings'} />;
}
