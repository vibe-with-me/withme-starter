import { Redirect } from 'expo-router';
import { useTermsGate } from '../lib/terms-gate';
import { useSession } from '../lib/use-session';

/**
 * Auth router and the always-available anchor route. Sends signed-in users
 * to the tabs (or to agree to updated terms first) and everyone else to sign-in; public routes (t/[uid],
 * scan) are reached directly by deep link and bypass this.
 */
export default function Index() {
  const { session, loading } = useSession();
  const { needsTerms, checking } = useTermsGate(!!session);
  if (loading || checking) return null;
  if (!session) return <Redirect href="/login" />;
  return <Redirect href={needsTerms ? '/terms-update' : '/gatherings'} />;
}
