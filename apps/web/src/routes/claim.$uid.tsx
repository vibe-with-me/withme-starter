import { TERMS_VERSION, termsAreCurrent } from '@withme/contract';
import { createFileRoute, Link, Navigate, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { asSignedInAccount } from '../lib/account-scope.ts';
import { TermsCheckbox } from '../components/TermsAgreement.tsx';
import { api } from '../lib/api.ts';
import { requireSession } from '../lib/auth-guard.ts';

/** Auth-gated claim flow: authenticate -> confirm -> claim binds tag to profile. */
export const Route = createFileRoute('/claim/$uid')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Claim tag — withme' }] }),
  beforeLoad: ({ params }) => requireSession(`/claim/${params.uid}`),
  // Outside the shell, so the account scope's re-load does not reach here: the
  // load itself must belong to one account.
  loader: () => asSignedInAccount(() => api.app.profile.get()),
  component: ClaimPage,
});

function ClaimPage() {
  const { uid } = Route.useParams();
  const { profile } = Route.useLoaderData();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [hasProfile, setHasProfile] = useState(profile !== null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Creating a profile is signing up: it carries the terms agreement.
      await api.app.profile.update({ display_name: displayName.trim(), terms_version: TERMS_VERSION });
      setHasProfile(true);
    } catch {
      setError('Could not save your name. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      await api.public.claim({ uid });
      navigate({ to: '/t/$uid', params: { uid }, replace: true });
    } catch (claimError) {
      const code = (claimError as { code?: string }).code;
      setError(
        // One answer for unknown, taken and disabled tags: the API does not
        // say which, so nobody can probe which tags exist.
        code === 'CONFLICT'
          ? "This tag can't be claimed. It may already belong to someone."
          : code === 'TOO_MANY_REQUESTS'
            ? 'Too many tries. Wait a while, then try again.'
            : 'Something went wrong. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  // Outside the shell, so its terms gate does not run here: an account that
  // agreed to an older version agrees again first, then comes back.
  if (profile && !termsAreCurrent(profile)) {
    return <Navigate to="/terms" search={{ returnTo: `/claim/${uid}` }} replace />;
  }

  if (!hasProfile) {
    return (
      <main className="page">
        <form className="card" onSubmit={createProfile}>
          <h1>First, your name</h1>
          <p className="hint">This is what people see when they tap your tag.</p>
          <div className="field">
            <label htmlFor="display_name">Name</label>
            <input
              id="display_name"
              required
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <TermsCheckbox checked={agreed} onChange={setAgreed} />
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn" type="submit" disabled={busy || !displayName.trim() || !agreed}>
            Continue
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="card">
        <h1>Claim this tag</h1>
        <p className="bio">
          Tag <code>{uid}</code> will point to your profile. You can disable it any time.
        </p>
        {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        <button className="btn btn--connect" type="button" onClick={claim} disabled={busy}>
          {busy ? 'Claiming…' : 'Claim tag'}
        </button>
        <Link className="btn btn--quiet" to="/t/$uid" params={{ uid }}>
          Cancel
        </Link>
      </div>
    </main>
  );
}
