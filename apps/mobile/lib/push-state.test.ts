/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { pushSetting } from './push-state';

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
