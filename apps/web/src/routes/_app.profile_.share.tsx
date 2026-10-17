import { tagUrl } from '@withme/contract';
import { createFileRoute, Link, useLoaderData } from '@tanstack/react-router';
import { useState } from 'react';
import { shellStates } from '../components/CalmStates.tsx';
import { ShareCodeImage } from '../components/ShareCode.tsx';
import { asSignedInAccount } from '../lib/account-scope.ts';
import { api } from '../lib/api.ts';

/**
 * Profile → Your code. A QR code that opens your card, for someone without
 * a tag or without NFC: their phone's camera opens the same resolver a tap
 * does. Show only; phones scan with the system camera, so the web app has
 * no scanner. The code is a tag row of its own (app.shareCode), so
 * replacing it makes every copy of the old one, screenshots included, open
 * an inactive tag.
 */
export const Route = createFileRoute('/_app/profile_/share')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'Your code — withme' }] }),
  loader: () => asSignedInAccount(() => api.app.shareCode.get()),
  component: SharePage,
});

function SharePage() {
  const { profile } = useLoaderData({ from: '/_app' });
  const loaded = Route.useLoaderData();
  const [uid, setUid] = useState(loaded.uid);
  const [status, setStatus] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // The shell renders client-side only (ssr: false), so the origin is the
  // page's own: the domain the tags encode, in production.
  const url = tagUrl(window.location.origin, uid);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied.');
    } catch {
      setStatus('Couldn’t copy. Select the link and copy it instead.');
    }
  }

  async function replace() {
    setBusy(true);
    setStatus(null);
    try {
      const next = await api.app.shareCode.replace();
      setUid(next.uid);
      setConfirming(false);
      setStatus('New code ready. The old one no longer opens your card.');
    } catch (error) {
      setStatus(
        (error as { code?: string }).code === 'TOO_MANY_REQUESTS'
          ? 'That’s a lot of new codes. Try again in an hour.'
          : 'That didn’t go through. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card" aria-labelledby="share-title">
        <h1 id="share-title">Your code</h1>
        <ShareCodeImage url={url} label={`QR code that opens ${profile?.display_name ?? 'your'} card`} />
        <p className="hint">
          Point a phone’s camera at it. It opens your card, the same one a tap on your tag shows.
        </p>
        <p className="share-url">{url}</p>
        <div className="share-actions">
          <button className="btn" type="button" onClick={copy}>
            Copy link
          </button>
        </div>
        {/* Always mounted: a live region created with its message is not announced. */}
        <p className="hint" role="status">
          {status}
        </p>
      </section>
      <section className="card" aria-labelledby="replace-title">
        <h2 id="replace-title" className="section-title">
          Replace code
        </h2>
        <p className="hint">
          Shared it somewhere you shouldn’t have? A new code makes the old one, and every
          screenshot or print of it, open an inactive tag.
        </p>
        {confirming ? (
          <div className="share-actions">
            <button className="btn" type="button" disabled={busy} onClick={replace}>
              {busy ? 'Replacing…' : 'Replace it'}
            </button>
            <button
              className="btn btn--quiet"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep this one
            </button>
          </div>
        ) : (
          <button className="btn btn--quiet" type="button" onClick={() => setConfirming(true)}>
            Replace code
          </button>
        )}
      </section>
      <p className="hint">
        <Link to="/profile">Back to your profile</Link>
      </p>
    </div>
  );
}
