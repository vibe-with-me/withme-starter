import { createFileRoute, redirect } from '@tanstack/react-router';
import { navItems } from '../components/AppShell.tsx';
import { shellStates } from '../components/CalmStates.tsx';

const STORE_URL = import.meta.env.VITE_STORE_URL;

/**
 * The fulfillment pointer as a tab: one card, one link out to the configured
 * store. No commerce lives here. Dormant when VITE_STORE_URL is unset — the
 * nav hides the tab and this route bounces to the first one. In development
 * the tab stays and shows how to turn it on (see AppShell's navItems).
 */
export const Route = createFileRoute('/_app/merch')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'Merch — withme' }] }),
  beforeLoad: () => {
    if (!STORE_URL && !import.meta.env.DEV) throw redirect({ to: navItems[0].to, replace: true });
  },
  component: MerchPage,
});

function MerchPage() {
  if (!STORE_URL) return import.meta.env.DEV ? <MerchSetup /> : null;
  return (
    <div className="card">
      <h1>Merch</h1>
      <p className="bio">Tags and gear from the store.</p>
      <a className="btn" href={STORE_URL} target="_blank" rel="noopener noreferrer">
        Open store
      </a>
    </div>
  );
}

/** Development only: what this tab is for and how to turn it on. */
function MerchSetup() {
  return (
    <div className="card">
      <h1>Merch</h1>
      <p className="bio">
        No store yet. Your users don't see this tab until you set <code>VITE_STORE_URL</code>{' '}
        in <code>apps/web/.env</code>; it then links to your store, and the landing page gets a
        "Get tags" button.
      </p>
      <p className="hint">
        You see it now because this is a development build. docs/merch.md is the tested path to a
        store selling tags for your vertical.
      </p>
    </div>
  );
}
