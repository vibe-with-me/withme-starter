/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { gatheringHref } from './gathering-link';
import { pushScreen, pushSetting } from './push-state';

describe('pushSetting', () => {
  test('offers once: unasked until a choice is stored', () => {
    expect(pushSetting('undetermined', null)).toBe('unasked');
    expect(pushSetting('granted', null)).toBe('unasked');
  });

  test('the OS refusing wins over any choice', () => {
    expect(pushSetting('denied', null)).toBe('denied');
    expect(pushSetting('denied', 'on')).toBe('denied');
    expect(pushSetting('denied', 'off')).toBe('denied');
  });

  test('on needs both the choice and the grant', () => {
    expect(pushSetting('granted', 'on')).toBe('on');
    expect(pushSetting('undetermined', 'on')).toBe('off');
    expect(pushSetting('granted', 'off')).toBe('off');
  });
});

describe('pushScreen', () => {
  const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

  test('a gathering push opens the screen gatheringHref builds', () => {
    // A fork that renames the screen changes gatheringHref, and this follows.
    expect(pushScreen(`/gathering/${id}`)).toBe(gatheringHref(id));
  });

  test('every other path opens as it is', () => {
    expect(pushScreen('/connections?segment=requests')).toBe('/connections?segment=requests');
    expect(pushScreen('/connections')).toBe('/connections');
  });
});
