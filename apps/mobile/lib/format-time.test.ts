import { describe, expect, test } from 'bun:test';

import {
  formatStartsAt,
  gatheringLine,
  parseLocalDateTime,
  toDateAndTime,
  tomorrowEvening,
  whenAndWhere,
} from './format-time';

const pad = (n: number) => String(n).padStart(2, '0');

describe('formatStartsAt', () => {
  test('day and time, joined by a dot', () => {
    const iso = new Date(2026, 9, 9, 19, 0).toISOString();
    const when = new Date(iso);
    const day = when.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const time = when.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
    expect(formatStartsAt(iso)).toBe(`${day} · ${time}`);
  });

  test('null when unparseable', () => {
    expect(formatStartsAt('not a date')).toBeNull();
    expect(formatStartsAt('')).toBeNull();
  });
});

describe('toDateAndTime', () => {
  test('zero-pads local wall-clock parts', () => {
    expect(toDateAndTime(new Date(2026, 0, 5, 7, 3))).toEqual({
      date: '2026-01-05',
      time: '07:03',
    });
    expect(toDateAndTime(new Date(2026, 11, 31, 23, 59))).toEqual({
      date: '2026-12-31',
      time: '23:59',
    });
  });
});

describe('tomorrowEvening', () => {
  test('is tomorrow at 18:00 local', () => {
    const expected = new Date();
    expected.setDate(expected.getDate() + 1);
    expect(tomorrowEvening()).toEqual({
      date: `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`,
      time: '18:00',
    });
  });
});

describe('parseLocalDateTime', () => {
  test('a local date and time becomes the ISO instant', () => {
    expect(parseLocalDateTime('2026-10-09', '18:00')).toBe(
      new Date(2026, 9, 9, 18, 0).toISOString(),
    );
    expect(parseLocalDateTime(' 2026-10-09 ', ' 7:05 ')).toBe(
      new Date(2026, 9, 9, 7, 5).toISOString(),
    );
  });

  test('round-trips with toDateAndTime', () => {
    const { date, time } = toDateAndTime(new Date(2027, 1, 28, 0, 0));
    expect(parseLocalDateTime(date, time)).toBe(new Date(2027, 1, 28, 0, 0).toISOString());
  });

  test('null for a malformed or impossible date or time', () => {
    for (const [date, time] of [
      ['2026-10-9', '18:00'],
      ['10/09/2026', '18:00'],
      ['2026-10-09', '18'],
      ['2026-10-09', '6pm'],
      ['2026-10-09', '24:00'],
      ['2026-10-09', '18:60'],
      ['2026-00-09', '18:00'],
      ['2026-13-09', '18:00'],
      ['2026-10-00', '18:00'],
      ['2026-02-30', '18:00'],
      ['2026-04-31', '18:00'],
      ['', ''],
    ] as const) {
      expect(parseLocalDateTime(date, time)).toBeNull();
    }
  });

  test('accepts Feb 29 only in a leap year', () => {
    expect(parseLocalDateTime('2028-02-29', '12:00')).not.toBeNull();
    expect(parseLocalDateTime('2027-02-29', '12:00')).toBeNull();
  });
});

describe('whenAndWhere', () => {
  const iso = new Date(2026, 9, 9, 19, 0).toISOString();
  const formatted = formatStartsAt(iso);

  test('the date leads the head; location and tail are their own parts', () => {
    expect(
      whenAndWhere({ starts_at: iso, location: 'The roof' }, ['Hosting'], ['1 going']),
    ).toEqual({
      head: `Hosting · ${formatted}`,
      location: 'The roof',
      tail: '1 going',
    });
  });

  test('empty parts are left out', () => {
    expect(whenAndWhere({ starts_at: iso, location: null }, [null, ''], [null])).toEqual({
      head: `${formatted}`,
      location: null,
      tail: '',
    });
  });

  test('an unparseable start shows as given rather than vanishing', () => {
    expect(whenAndWhere({ starts_at: 'soon', location: null }).head).toBe('soon');
  });
});

describe('gatheringLine', () => {
  test('the title leads the head', () => {
    const iso = new Date(2026, 9, 9, 19, 0).toISOString();
    expect(gatheringLine({ title: 'Sunrise 5K', starts_at: iso, location: 'Park' })).toEqual({
      head: `Sunrise 5K · ${formatStartsAt(iso)}`,
      location: 'Park',
      tail: '',
    });
  });
});
