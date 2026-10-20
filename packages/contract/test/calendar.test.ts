import { describe, expect, it } from 'bun:test';
import {
  gatheringCalendarEvent,
  gatheringIcs,
  gatheringIcsFilename,
  gatheringUrl,
  isGatheringOver,
} from '../src/index.ts';

const ID = '7f1c2a9e-3b4d-4e5f-8a6b-9c0d1e2f3a4b';
const NOW = new Date('2026-10-01T12:00:00Z');
const gathering = {
  id: ID,
  title: 'Rooftop drinks',
  starts_at: '2026-10-17T09:00:00+02:00',
  location: 'The roof',
};

/** The unfolded property lines, as a calendar app reads them. */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
}
const prop = (ics: string, name: string) =>
  unfold(ics).find((line) => line.startsWith(`${name}:`))?.slice(name.length + 1);

describe('gatheringIcs', () => {
  it('writes one VEVENT with UTC times, a two-hour default and CRLF line ends', () => {
    const ics = gatheringIcs(gathering, gatheringUrl('https://withme.example/', ID), NOW);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(prop(ics, 'DTSTART')).toBe('20261017T070000Z');
    expect(prop(ics, 'DTEND')).toBe('20261017T090000Z');
    expect(prop(ics, 'DTSTAMP')).toBe('20261001T120000Z');
    expect(prop(ics, 'SUMMARY')).toBe('Rooftop drinks');
    expect(prop(ics, 'LOCATION')).toBe('The roof');
    expect(prop(ics, 'URL')).toBe(`https://withme.example/gatherings/${ID}`);
    expect(prop(ics, 'DESCRIPTION')).toBe(`https://withme.example/gatherings/${ID}`);
  });

  it('keys the UID on the gathering id, so a re-import updates the entry', () => {
    const first = gatheringIcs(gathering, null, NOW);
    const renamed = gatheringIcs({ ...gathering, title: 'Moved inside' }, null, new Date());
    expect(prop(first, 'UID')).toBe(`gathering-${ID}@withme`);
    expect(prop(renamed, 'UID')).toBe(prop(first, 'UID'));
  });

  it('escapes commas, semicolons, backslashes and line breaks in text', () => {
    const ics = gatheringIcs(
      { ...gathering, title: 'Tea, cake; and \\ more', location: 'Line one\nLine two\r\nthree' },
      null,
      NOW,
    );
    expect(prop(ics, 'SUMMARY')).toBe('Tea\\, cake\\; and \\\\ more');
    expect(prop(ics, 'LOCATION')).toBe('Line one\\nLine two\\nthree');
  });

  it('omits LOCATION, URL and DESCRIPTION when there are none', () => {
    const ics = gatheringIcs({ ...gathering, location: null }, null, NOW);
    expect(ics).not.toContain('LOCATION');
    expect(ics).not.toContain('URL');
    expect(ics).not.toContain('DESCRIPTION');
  });

  it('folds lines at 75 octets without splitting a character', () => {
    const title = `${'a'.repeat(60)}😀${'é'.repeat(40)}`;
    const ics = gatheringIcs({ ...gathering, title }, null, NOW);
    const encoder = new TextEncoder();
    for (const line of ics.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
      // A cut through a surrogate pair would leave a lone half behind.
      expect(line).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(ics).toContain('\r\n ');
    expect(prop(ics, 'SUMMARY')).toBe(title);
  });

  it('carries only the title, time, location and link', () => {
    const ics = gatheringIcs(
      // Extra fields a caller might pass by spreading the whole list item.
      { ...gathering, member_count: 987, host_id: 'host-uuid', members: [{ name: 'Ada' }] } as never,
      null,
      NOW,
    );
    const names = unfold(ics).map((line) => line.split(/[:;]/)[0]);
    expect(new Set(names)).toEqual(
      new Set(['BEGIN', 'VERSION', 'PRODID', 'CALSCALE', 'METHOD', 'UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY', 'LOCATION', 'END']),
    );
    expect(ics).not.toContain('987');
    expect(ics).not.toContain('host-uuid');
    expect(ics).not.toContain('Ada');
  });
});

describe('gatheringCalendarEvent', () => {
  it('ends two hours after the start', () => {
    const event = gatheringCalendarEvent(gathering, null);
    expect(event.start.toISOString()).toBe('2026-10-17T07:00:00.000Z');
    expect(event.end.toISOString()).toBe('2026-10-17T09:00:00.000Z');
    expect(Object.keys(event).toSorted()).toEqual(['end', 'location', 'start', 'title', 'url']);
  });
});

describe('isGatheringOver', () => {
  it('is over only once the default duration has passed', () => {
    expect(isGatheringOver(gathering, new Date('2026-10-17T06:59:00Z'))).toBe(false);
    expect(isGatheringOver(gathering, new Date('2026-10-17T08:59:00Z'))).toBe(false);
    expect(isGatheringOver(gathering, new Date('2026-10-17T09:00:00Z'))).toBe(true);
  });
});

describe('gatheringUrl', () => {
  it('drops any trailing slashes from the origin, however many', () => {
    expect(gatheringUrl('https://withme.example', ID)).toBe(`https://withme.example/gatherings/${ID}`);
    expect(gatheringUrl(`https://withme.example${'/'.repeat(50_000)}`, ID)).toBe(
      `https://withme.example/gatherings/${ID}`,
    );
  });
});

describe('gatheringIcsFilename', () => {
  it('slugs the title and falls back when nothing is left', () => {
    expect(gatheringIcsFilename('Rooftop drinks!')).toBe('rooftop-drinks.ics');
    expect(gatheringIcsFilename('Café Zürich')).toBe('cafe-zurich.ics');
    expect(gatheringIcsFilename('🎉🎉')).toBe('gathering.ics');
  });
});
