import { describe, expect, test } from 'bun:test';

import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  test('keeps same-app paths', () => {
    for (const path of ['/', '/connections', '/gathering/g1?title=Sunrise%205K', '/a#b']) {
      expect(safeRedirect(path)).toBe(path);
    }
  });

  test('refuses anything that could leave the app', () => {
    for (const bad of [
      'https://evil.example',
      'evil.example/path',
      '//evil.example',
      '//evil.example/connections',
      '/\\evil.example',
      '\\\\evil.example',
      'javascript:alert(1)',
      '',
    ]) {
      expect(safeRedirect(bad)).toBeUndefined();
    }
  });

  test('refuses control characters, which browsers strip before parsing', () => {
    for (const bad of [
      '/\t/evil.example',
      '/\n/evil.example',
      '/\r/evil.example',
      '/a\u0000b',
      '/\u001f',
    ]) {
      expect(safeRedirect(bad)).toBeUndefined();
    }
  });

  test('caps the length at 512', () => {
    const at = `/${'a'.repeat(511)}`;
    expect(safeRedirect(at)).toBe(at);
    expect(safeRedirect(`${at}a`)).toBeUndefined();
  });

  test('refuses non-strings, such as a repeated search param', () => {
    for (const bad of [undefined, null, 1, ['/a', '/b'], { pathname: '/' }]) {
      expect(safeRedirect(bad)).toBeUndefined();
    }
  });
});
