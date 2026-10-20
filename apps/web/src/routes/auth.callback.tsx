import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { safeReturnTo } from '../lib/auth-guard.ts';
import { getSupabase } from '../lib/supabase.ts';

/** OAuth landing: exchanges the PKCE code for a session, then returns. */
export const Route = createFileRoute('/auth/callback')({
  ssr: false,
  validateSearch: (search): { returnTo?: string; error_description?: string } => ({
    ...(safeReturnTo(search.returnTo) ? { returnTo: safeReturnTo(search.returnTo) } : {}),
    ...(typeof search.error_description === 'string'
      ? { error_description: search.error_description }
      : {}),
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const { returnTo, error_description } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(error_description ?? null);

  useEffect(() => {
    if (error_description) return;
    // The exchange takes the code alone; the whole URL is no flow the server knows.
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) {
      setError('This sign-in link is missing its code. Try signing in again.');
      return;
    }
    let cancelled = false;
    getSupabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (cancelled) return;
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
        navigate({ href: returnTo ?? '/gatherings', replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [error_description, navigate, returnTo]);

  return (
    <main className="page">
      <div className="card">
        {error ? (
          <>
            <h1>Sign-in failed</h1>
            <p className="form-error">{error}</p>
            <a className="btn" href="/login">
              Back to sign in
            </a>
          </>
        ) : (
          <p className="hint">Signing you in…</p>
        )}
      </div>
    </main>
  );
}
