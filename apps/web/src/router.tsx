import { createRouter } from '@tanstack/react-router';
import { ErrorCard, NotFoundCard } from './components/CalmStates.tsx';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    // The resolver is the product and must be unbreakable: every failure
    // mode resolves to a calm card instead of a framework crash screen.
    // NOTE: no defaultPendingComponent. A content-bearing pending fallback
    // is SSR'd as the Suspense boundary for ssr:false routes (login/claim/
    // me) and triggers a React 19 hydration mismatch that aborts in-flight
    // navigations. The tap moment is SSR with an awaited loader, so it never
    // showed a pending state anyway.
    defaultNotFoundComponent: NotFoundCard,
    defaultErrorComponent: ErrorCard,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
