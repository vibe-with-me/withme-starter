/** "Thu, Oct 9 · 7:00 PM" in the viewer's locale and timezone; null when unparseable. */
export function formatStartsAt(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const when = new Date(ms);
  const day = when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = when.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `datetime-local` value (local wall clock, no offset). */
export function toDateTimeLocal(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The create form's pre-fill: tomorrow at 18:00 local. */
export function tomorrowEvening(): string {
  const when = new Date();
  when.setDate(when.getDate() + 1);
  when.setHours(18, 0, 0, 0);
  return toDateTimeLocal(when);
}

/**
 * A gathering's meta line in three parts, so a screen can render the
 * location as a Maps link: "Hosting · Thu, Oct 9 · 7:00 PM", "The roof",
 * "1 going". Shown joined by " · "; an empty part is left out.
 */
export interface MetaLine {
  head: string;
  location: string | null;
  tail: string;
}

/** "Thu, Oct 9 · 7:00 PM · Location" (the location only when set), `before` and `after` around it. */
export function whenAndWhere(
  g: { starts_at: string; location: string | null },
  before: (string | null)[] = [],
  after: (string | null)[] = [],
): MetaLine {
  return {
    head: [...before, formatStartsAt(g.starts_at) ?? g.starts_at].filter(Boolean).join(' · '),
    location: g.location,
    tail: after.filter(Boolean).join(' · '),
  };
}

/** One line for a gathering: "Title · Thu, Oct 9 · 7:00 PM · Location". */
export function gatheringLine(g: {
  title: string;
  starts_at: string;
  location: string | null;
}): MetaLine {
  return whenAndWhere(g, [g.title]);
}
