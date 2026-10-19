import { describe, expect, it } from 'bun:test';
import type { GatheringMember } from '@withme/contract';
import { audienceMark, goingLine, parseSpots, withLine } from './going';

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

const member = (id: string, display_name: string) =>
  ({ profile: { id, display_name } }) as unknown as GatheringMember;

describe('withLine', () => {
  const me = member('me', 'Me');
  const ada = member('a', 'Ada');
  const lin = member('l', 'Lin');
  const sam = member('s', 'Sam');
  const kit = member('k', 'Kit');

  it('names nobody when the viewer is alone or the list is empty', () => {
    expect(withLine([], 'me')).toBeNull();
    expect(withLine([me], 'me')).toBeNull();
  });

  it('names one, two, or two and a count, leaving the viewer out', () => {
    expect(withLine([me, ada], 'me')).toBe('With Ada');
    expect(withLine([ada, me, lin], 'me')).toBe('With Ada and Lin');
    expect(withLine([ada, lin, me, sam], 'me')).toBe('With Ada, Lin, and 1 more');
    expect(withLine([ada, lin, sam, kit], 'me')).toBe('With Ada, Lin, and 2 more');
  });

  it('a signed-out viewer (null) leaves nobody out', () => {
    expect(withLine([me, ada], null)).toBe('With Me and Ada');
  });
});
