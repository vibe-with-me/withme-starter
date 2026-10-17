export interface GatheringHints {
  title?: string;
  starts_at?: string;
}

/**
 * The detail screen's href as a string, carrying the resolver's display-only
 * hints. It is used where the href travels as a redirect (through login, or
 * through the profile screen), and such a string is decoded twice before the
 * detail screen reads it: once into the redirect param, once when the router
 * parses the href. So the title drops what a second decode would misread
 * (& # + % ?) and what safeRedirect refuses (\ and control characters), and
 * the start time travels as a UTC instant, which has no '+'. Lossy is fine:
 * a hint is never data.
 */
export function gatheringHref(id: string, hints: GatheringHints = {}): string {
  const query: string[] = [];
  if (hints.title) {
    const cleaned = hints.title
      // oxlint-disable-next-line no-control-regex -- stripping control chars is the point
      .replace(/[\\\u0000-\u001f#&+%?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Cut by code point: a UTF-16 slice can split an emoji's surrogate pair,
    // and encodeURIComponent throws on the half left behind.
    const title = Array.from(cleaned).slice(0, 60).join('');
    if (title) query.push(`title=${encodeURIComponent(title)}`);
  }
  if (hints.starts_at) {
    const ms = Date.parse(hints.starts_at);
    if (!Number.isNaN(ms)) query.push(`starts_at=${encodeURIComponent(new Date(ms).toISOString())}`);
  }
  return query.length > 0 ? `/gathering/${id}?${query.join('&')}` : `/gathering/${id}`;
}
