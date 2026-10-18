/** "Thu, Oct 9 · 7:00 PM" in the device locale and timezone; null when unparseable. */
export function formatStartsAt(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const when = new Date(ms);
  const day = when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = when.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

export interface DateAndTime {
  date: string;
  time: string;
}

/** Local wall-clock parts for the two form fields. */
export function toDateAndTime(when: Date): DateAndTime {
  return {
    date: `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`,
    time: `${pad(when.getHours())}:${pad(when.getMinutes())}`,
  };
}

/** The create form's pre-fill: tomorrow at 18:00 local. */
export function tomorrowEvening(): DateAndTime {
  const when = new Date();
  when.setDate(when.getDate() + 1);
  when.setHours(18, 0, 0, 0);
  return toDateAndTime(when);
}

/**
 * "2026-10-09" + "18:00" (local) -> ISO instant, or null when either part is
 * malformed. Two plain fields instead of a native picker: no new dependency,
 * and a keyboard is enough for a date and a time.
 */
export function parseLocalDateTime(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  if (hour > 23 || minute > 59) return null;
  if (month < 1 || month > 12 || day < 1) return null;
  const when = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(when.getTime()) || when.getDate() !== day) return null; // e.g. Feb 30
  return when.toISOString();
}

/**
 * A gathering's meta line in three parts, so a screen can render the
 * location as a Maps link: "Hosting · Thu, Oct 9 · 7:00 PM", "The roof",
 * "1 going". Shown joined by " · "; an empty part is left out.
 *
 * The seam for a fork's own field: `location` is the one place a map can
 * open (a fork may put its own place there, a course or a venue); `head`
 * is the row's first line, cut to one line; the location and `tail` share
 * the next, which may wrap to two lines and is cut past that. The date reads
 * best in `head`; a helper that moves it into `tail` still shows it while
 * the second line fits.
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
