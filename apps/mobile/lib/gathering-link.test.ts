/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { gatheringHref } from './gathering-link';

describe('gatheringHref', () => {
  test('cuts the title hint at 60 characters, not 60 UTF-16 units', () => {
    // 59 letters then an emoji: .slice(0, 60) on the string would split the
    // emoji's surrogate pair and encodeURIComponent would throw URIError.
    const title = `${'a'.repeat(59)}😀 and more`;
    const href = gatheringHref('g1', { title });
    expect(href).toBe(`/gathering/g1?title=${encodeURIComponent(`${'a'.repeat(59)}😀`)}`);
  });

  test('keeps emoji that fit inside the hint', () => {
    expect(gatheringHref('g1', { title: 'Sunrise 5K 🏃' })).toBe(
      `/gathering/g1?title=${encodeURIComponent('Sunrise 5K 🏃')}`,
    );
  });

  test('drops characters a second decode would misread', () => {
    expect(gatheringHref('g1', { title: 'Tea & #cake 100%?' })).toBe('/gathering/g1?title=Tea%20cake%20100');
  });

  test('sends the start time as a UTC instant and no hints as a bare path', () => {
    expect(gatheringHref('g1', { starts_at: '2026-10-17T09:00:00+02:00' })).toBe(
      '/gathering/g1?starts_at=2026-10-17T07%3A00%3A00.000Z',
    );
    expect(gatheringHref('g1')).toBe('/gathering/g1');
  });
});
