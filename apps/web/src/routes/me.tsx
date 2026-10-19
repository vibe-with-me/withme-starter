import { createFileRoute, redirect } from '@tanstack/react-router';
import { returnToSearch, safeReturnTo } from '../lib/return-to.ts';

/** `/me` moved to `/profile`. Old links and in-flight auth emails still land. */
export const Route = createFileRoute('/me')({
  validateSearch: returnToSearch,
  beforeLoad: ({ search }) => {
    const returnTo = safeReturnTo(search.returnTo);
    throw redirect({ to: '/profile', search: returnTo ? { returnTo } : {}, replace: true });
  },
});
