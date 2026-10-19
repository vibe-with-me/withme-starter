import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getSessionUserId } from '../lib/supabase.ts';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  // The landing is SSR'd; the session is client-only, so the call to action
  // settles after hydration (both renders start as signed-out).
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getSessionUserId()
      .then((userId) => {
        if (!cancelled) setSignedIn(userId !== null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <div className="card">
        <h1 className="wordmark">withme</h1>
        <p className="bio">Find your people in what you love to do.</p>
        <p className="hint">
          This is the starter app — tags resolve at <code>/t/&lt;uid&gt;</code>.
        </p>
        {/* The tag link matches the seed script's claimed demo tag. */}
        {import.meta.env.VITE_DEMO_CREDENTIALS ? (
          <p className="hint">
            Try it: tap <a href="/t/04BBBBBBBBBBBB">a live demo tag</a>, or sign in as{' '}
            <code>{import.meta.env.VITE_DEMO_CREDENTIALS}</code>.
          </p>
        ) : null}
        {signedIn ? (
          <Link className="btn" to="/gatherings">
            Open the app
          </Link>
        ) : (
          <Link className="btn" to="/login">
            Sign in
          </Link>
        )}
        {/* Fulfillment pointer — dormant until the store URL is configured. */}
        {import.meta.env.VITE_STORE_URL ? (
          <a
            className="btn btn--quiet"
            href={import.meta.env.VITE_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get tags
          </a>
        ) : null}
      </div>
    </main>
  );
}
