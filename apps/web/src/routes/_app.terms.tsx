import { TERMS_VERSION, termsAreCurrent } from '@withme/contract';
import { createFileRoute, Link, useLoaderData, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { AccountSection } from '../components/AccountSection.tsx';
import { shellStates } from '../components/CalmStates.tsx';
import { TermsSummary } from '../components/TermsAgreement.tsx';
import { api } from '../lib/api.ts';
import { returnToSearch, safeReturnTo } from '../lib/return-to.ts';

/**
 * The re-ask screen. The shell sends a profile here whenever it agreed to
 * another terms version than TERMS_VERSION (or none, from before terms
 * existed), and keeps sending it back until it agrees. Declining is
 * leaving: Account (sign out, delete) stays on the page.
 */
export const Route = createFileRoute('/_app/terms')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'Updated terms — withme' }] }),
  validateSearch: returnToSearch,
  component: TermsPage,
});

function TermsPage() {
  const { profile } = useLoaderData({ from: '/_app' });
  const returnTo = safeReturnTo(Route.useSearch().returnTo);
  const router = useRouter();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (profile && termsAreCurrent(profile)) {
    return (
      <div className="stack">
        <div className="card">
          <h1>You’re up to date</h1>
          <p className="hint">
            You agreed to <TermsSummary />
          </p>
          <Link className="btn" to="/gatherings">
            Continue
          </Link>
        </div>
      </div>
    );
  }

  async function accept() {
    setBusy(true);
    setFailed(false);
    try {
      await api.app.profile.acceptTerms({ version: TERMS_VERSION });
      // Wait for the shell's profile to re-fetch, so its gate sees the new version.
      await router.invalidate({ sync: true });
      navigate({ href: returnTo ?? '/gatherings', replace: true });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h1>Updated terms</h1>
        <p className="bio">
          To keep using the app, agree to <TermsSummary />
        </p>
        {failed ? (
          <p className="form-error" role="alert">
            That didn’t go through. Try again.
          </p>
        ) : null}
        <button type="button" className="btn" disabled={busy} onClick={accept}>
          {busy ? 'Saving…' : 'I agree'}
        </button>
      </div>
      {/* Not agreeing means leaving: sign out or delete the account. */}
      <AccountSection />
    </div>
  );
}
