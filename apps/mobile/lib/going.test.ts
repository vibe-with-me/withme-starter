import { describe, expect, it } from 'bun:test';
import { audienceMark, goingLine, parseSpots } from './going';

describe('goingLine', () => {
  it('counts everyone, and reads against the capacity when there is one', () => {
    expect(goingLine(1)).toBe('1 going');
    expect(goingLine(3, null)).toBe('3 going');
    expect(goingLine(3, 4)).toBe('3 of 4 going');
    // lowered below the headcount: nobody was removed
    expect(goingLine(5, 2)).toBe('5 of 2 going');
  });
});

describe('parseSpots', () => {
  it('empty is no limit; 2 to 500 is a capacity; anything else is not one', () => {
    expect(parseSpots('')).toBeNull();
    expect(parseSpots('   ')).toBeNull();
    expect(parseSpots('4')).toBe(4);
    expect(parseSpots(' 500 ')).toBe(500);
    expect(parseSpots('2')).toBe(2);
    for (const bad of ['1', '0', '501', '3.5', '-4', '4 people', 'four', '1e2']) {
      expect(parseSpots(bad)).toBeUndefined();
    }
  });
});

describe('audienceMark', () => {
  it('marks a connections-only gathering and nothing else', () => {
    expect(audienceMark('connections')).toBe('Connections only');
    expect(audienceMark('everyone')).toBeNull();
  });
});
