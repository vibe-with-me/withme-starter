// Discover's "when" windows. Every date here is built from local calendar
// fields, so the expectations hold in whatever time zone the suite runs.
import { describe, expect, it } from 'bun:test';
import { whenWindow } from '../src/index.ts';

/** A local instant: October 2026 by default (the 19th is a Monday). */
const at = (day: number, hour = 0, minute = 0, month = 9) =>
  new Date(2026, month, day, hour, minute);
const iso = (date: Date) => date.toISOString();

describe('whenWindow', () => {
  it('all is the whole feed', () => {
    expect(whenWindow('all', at(21, 9))).toEqual({});
  });

  it('this week runs from now to the end of Sunday', () => {
    const monday = at(19, 0, 0);
    const nextMonday = iso(at(26));
    expect(whenWindow('week', monday)).toEqual({ from: iso(monday), to: nextMonday });
    const wednesday = at(21, 14, 30);
    expect(whenWindow('week', wednesday)).toEqual({ from: iso(wednesday), to: nextMonday });
    // Sunday night is still this week, until midnight.
    const sunday = at(25, 23, 59);
    expect(whenWindow('week', sunday)).toEqual({ from: iso(sunday), to: nextMonday });
  });

  it('this weekend is Friday 18:00 to the end of Sunday, or now to its end once it has begun', () => {
    const weekend = { from: iso(at(23, 18)), to: iso(at(26)) };
    expect(whenWindow('weekend', at(19, 0))).toEqual(weekend); // Monday: the coming one
    expect(whenWindow('weekend', at(23, 17, 59))).toEqual(weekend); // Friday afternoon
    expect(whenWindow('weekend', at(23, 18))).toEqual(weekend); // it starts
    const saturday = at(24, 11);
    expect(whenWindow('weekend', saturday)).toEqual({ from: iso(saturday), to: weekend.to });
    const sunday = at(25, 22);
    expect(whenWindow('weekend', sunday)).toEqual({ from: iso(sunday), to: weekend.to });
  });

  it('later is everything after this week', () => {
    expect(whenWindow('later', at(21, 9))).toEqual({ from: iso(at(26)) });
    expect(whenWindow('later', at(25, 23))).toEqual({ from: iso(at(26)) });
    expect(whenWindow('later', at(26, 0))).toEqual({ from: iso(at(2, 0, 0, 10)) }); // a new week: the next one
  });

  it('crosses a month and a year by calendar days', () => {
    // Thursday 31 December 2026: the week ends Monday 4 January 2027.
    const newYearsEve = new Date(2026, 11, 31, 20);
    const monday = iso(new Date(2027, 0, 4));
    expect(whenWindow('week', newYearsEve)).toEqual({ from: iso(newYearsEve), to: monday });
    expect(whenWindow('weekend', newYearsEve)).toEqual({
      from: iso(new Date(2027, 0, 1, 18)),
      to: monday,
    });
  });

  it('ends at local midnight across a DST change', () => {
    // Europe falls back on 25 October 2026 and the US on 1 November: run with
    // TZ=Europe/London or TZ=America/New_York to see either inside a window.
    expect(whenWindow('week', at(31, 12))).toEqual({
      from: iso(at(31, 12)),
      to: iso(at(2, 0, 0, 10)),
    });
    expect(new Date(whenWindow('week', at(24, 12)).to!).getHours()).toBe(0);
  });

  it('every window starts before it ends', () => {
    for (let hour = 0; hour < 24 * 14; hour += 5) {
      const now = new Date(2026, 9, 19, hour);
      for (const filter of ['week', 'weekend'] as const) {
        const { from, to } = whenWindow(filter, now);
        expect(Date.parse(from!)).toBeLessThan(Date.parse(to!));
        expect(Date.parse(from!)).toBeGreaterThanOrEqual(now.getTime());
      }
    }
  });
});
