/**
 * Only same-origin paths may be used as post-auth redirect targets.
 * Backslashes and control chars are rejected too: browsers normalize
 * '\' to '/' during URL resolution, so '/\evil.com' would escape.
 */
export function safeReturnTo(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    // oxlint-disable-next-line no-control-regex -- rejecting control chars is the point
    !/[\\\u0000-\u001f]/.test(value)
    ? value
    : undefined;
}

/**
 * validateSearch for routes that take a `returnTo`. It types the param but
 * cannot drop a bad one: TanStack Router builds a route's search as
 * `{ ...parentSearch, ...validated }`, and the root's search is the raw URL's,
 * so an unsafe value leaves out of `validated` and comes straight back. Read
 * it through `safeReturnTo` again wherever it is used.
 */
export function returnToSearch(search: Record<string, unknown>): { returnTo?: string } {
  const returnTo = safeReturnTo(search.returnTo);
  return returnTo ? { returnTo } : {};
}
