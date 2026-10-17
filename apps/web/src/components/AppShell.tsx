import { Link, Outlet } from '@tanstack/react-router';
import { Calendar, QrCode, ShoppingBag, User, Users, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useAccountSwitching } from '../lib/account-scope.ts';
import { ErrorBody, PendingBody } from './CalmStates.tsx';

interface NavItem {
  to: '/gatherings' | '/connections' | '/merch' | '/profile';
  label: string;
  icon: LucideIcon;
}

/**
 * The tabs. One array drives one <nav>; app.css puts it top-right on wide
 * screens and makes it a bottom bar under 720px — the DOM never changes.
 * Adding a top-level section = adding one entry here (see docs/the-slice.md
 * step 5). Events leads: the one universal feature is the first thing a
 * signed-in user sees. Merch exists only when a store is configured: the
 * fulfillment pointer is dormant by default. In development it shows
 * anyway, as a setup card, so a forker meets it while running the demo
 * instead of at launch; a production build never has it without a store.
 */
export const navItems: readonly [NavItem, ...NavItem[]] = [
  { to: '/gatherings', label: 'Events', icon: Calendar },
  { to: '/connections', label: 'Connections', icon: Users },
  ...(import.meta.env.VITE_STORE_URL || import.meta.env.DEV
    ? ([{ to: '/merch', label: 'Merch', icon: ShoppingBag }] as const)
    : []),
  { to: '/profile', label: 'Profile', icon: User },
];

// The share button sits in the middle of the bar; with an odd count the
// extra tab goes left, and the right-hand tabs grow to match the left half's
// width (app.css reads --nav-grow under 720px) so the button stays centered.
const shareSlot = Math.ceil(navItems.length / 2);
const rightGrow = shareSlot / Math.max(navItems.length - shareSlot, 1);

function navLink({ to, label, icon: Icon }: NavItem, index: number) {
  const grow = index + 1 > shareSlot ? rightGrow : 1;
  return (
    <Link
      key={to}
      to={to}
      className="shell-nav__item"
      style={{ '--nav-grow': grow } as CSSProperties}
      /* TanStack sets aria-current itself; this only replaces its default className="active". */
      activeProps={{ 'aria-current': 'page' }}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

/**
 * Your code, one tap from every tab: the handshake for someone without a
 * tag. Not a tab (it has no section of its own). app.css raises it out of
 * the bottom bar on phones and floats it bottom-right on wide screens.
 */
function ShareButton() {
  return (
    <Link
      to="/share"
      className="share-fab"
      aria-label="Your code"
      title="Your code"
      activeProps={{ 'aria-current': 'page' }}
    >
      <QrCode aria-hidden="true" />
    </Link>
  );
}

/**
 * The signed-in chrome. Rendered by the pathless `_app` layout route around
 * the active tab, or around `children` when the layout itself is pending or
 * has failed (a route's fallback replaces its component, chrome included).
 */
export function AppShell({ children }: { children?: ReactNode }) {
  // An account change unmounts the previous account's content at once; it
  // comes back, freshly mounted, once the new account's data has loaded.
  const switching = useAccountSwitching();
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        <Link to={navItems[0].to} className="wordmark">
          withme
        </Link>
      </header>
      <main id="main" className="shell-main">
        {switching ? <PendingBody /> : (children ?? <Outlet />)}
      </main>
      <nav className="shell-nav" aria-label="Primary">
        {navItems.slice(0, shareSlot).map(navLink)}
        <ShareButton />
        {navItems.slice(shareSlot).map((item, i) => navLink(item, shareSlot + i))}
      </nav>
    </div>
  );
}

/**
 * The layout's own fallbacks. A route's fallback replaces its component, so
 * these bring the chrome with them: a slow or failed profile load keeps the
 * tabs on screen. They live here, not in the route file, because the router
 * plugin code-splits route files and only carries imports across the split.
 */
export function ShellPending() {
  return (
    <AppShell>
      <PendingBody />
    </AppShell>
  );
}

export function ShellError() {
  return (
    <AppShell>
      <ErrorBody />
    </AppShell>
  );
}
