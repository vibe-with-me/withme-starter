import { Link, Outlet } from '@tanstack/react-router';
import { Calendar, ShoppingBag, User, Users, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
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
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="shell-nav__item"
            /* TanStack sets aria-current itself; this only replaces its default className="active". */
            activeProps={{ 'aria-current': 'page' }}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
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
