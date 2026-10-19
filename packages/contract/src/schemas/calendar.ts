import type { Gathering } from './gathering.ts';

/**
 * How long a calendar entry for a gathering lasts. A gathering has a start
 * and no end (there is no ends_at column), so the export picks one: two
 * hours reads as "an evening thing" in every calendar app, and the viewer
 * can stretch it there.
 */
export const GATHERING_CALENDAR_HOURS = 2;

/** The gathering's page on the web app: what a calendar entry links back to. */
export function gatheringUrl(origin: string, id: string): string {
  // A loop, not /\/+$/: that regex backtracks polynomially on a long run of slashes.
  let end = origin.length;
  while (end > 0 && origin[end - 1] === '/') end--;
  return `${origin.slice(0, end)}/gatherings/${id}`;
}

/**
 * What a calendar learns about a gathering: its title, time, location and a
 * link back. Never who is going, how many, or who hosts — a calendar entry
 * syncs to wherever the viewer's calendar lives, outside the app's RLS.
 */
export interface GatheringCalendarEvent {
  title: string;
  start: Date;
  end: Date;
  location: string | null;
  /** Null when the app does not know its web origin (mobile without EXPO_PUBLIC_WEB_URL). */
  url: string | null;
}

/** The one pick both the .ics file and the native calendar sheet use. */
export function gatheringCalendarEvent(
  gathering: Pick<Gathering, 'title' | 'starts_at' | 'location'>,
  url: string | null,
): GatheringCalendarEvent {
  const start = new Date(gathering.starts_at);
  return {
    title: gathering.title,
    start,
    end: new Date(start.getTime() + GATHERING_CALENDAR_HOURS * 3_600_000),
    location: gathering.location,
    url,
  };
}

/**
 * Over: past its start plus the calendar duration. Add to calendar shows
 * until then, so a gathering already under way can still be saved.
 */
export function isGatheringOver(gathering: Pick<Gathering, 'starts_at'>, now: Date = new Date()): boolean {
  return now.getTime() >= Date.parse(gathering.starts_at) + GATHERING_CALENDAR_HOURS * 3_600_000;
}

/**
 * The gathering as an RFC 5545 calendar file, one VEVENT. Times are UTC
 * (no VTIMEZONE needed; every app shows them in the viewer's zone). The UID
 * is the gathering id, so importing it again updates the entry instead of
 * duplicating it. `now` is the DTSTAMP, a parameter so tests are stable.
 */
export function gatheringIcs(
  gathering: Pick<Gathering, 'id' | 'title' | 'starts_at' | 'location'>,
  url: string | null,
  now: Date = new Date(),
): string {
  const event = gatheringCalendarEvent(gathering, url);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//withme//gathering//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:gathering-${gathering.id}@withme`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${icsText(event.location)}`);
  if (event.url) {
    // URL is a URI value, not TEXT: no escaping, but never a line break.
    // Google Calendar ignores URL, so the description carries it too.
    lines.push(`URL:${event.url.replace(/[\r\n]/g, '')}`, `DESCRIPTION:${icsText(event.url)}`);
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** A download name from the title: "Rooftop drinks!" -> "rooftop-drinks.ics". */
export function gatheringIcsFilename(title: string): string {
  const slug = title
    .normalize('NFKD')
    // NFKD splits an accented letter into the letter and its mark: drop the mark.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return `${slug || 'gathering'}.ics`;
}

/** 20261017T070000Z: UTC, no separators, no milliseconds. */
function icsDate(when: Date): string {
  return when.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 TEXT: backslash, semicolon and comma escaped; any line break becomes \n. */
function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * Lines longer than 75 octets are folded: a CRLF and one space before the
 * rest. Counted in UTF-8 octets and cut between code points, so a folded
 * emoji or accented letter stays whole.
 */
function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  // The first line holds 75 octets; each continuation holds 74 after its space.
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
      limit = 74;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
