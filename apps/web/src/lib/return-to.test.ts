import { describe, expect, test } from 'bun:test';

import { returnToSearch, safeReturnTo } from './return-to.ts';

const offSite = [
  'https://evil.example',
  'evil.example/path',
  '//evil.example',
  '//evil.example/steal',
  '/\\evil.example',
  '\\\\evil.example',
  'javascript:alert(1)',
  '',
];

describe('safeReturnTo', () => {
  test('keeps same-app paths', () => {
    for (const path of ['/', '/gatherings', '/gatherings?view=yours', '/t/04E2E000000000', '/a#b']) {
      expect(safeReturnTo(path)).toBe(path);
    }
  });

  test('refuses anything that could leave the app', () => {
    for (const bad of offSite) {
      expect(safeReturnTo(bad)).toBeUndefined();
    }
  });

  test('refuses control characters, which browsers strip before parsing', () => {
    for (const bad of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/\u0000x']) {
      expect(safeReturnTo(bad)).toBeUndefined();
    }
  });

  test('refuses non-strings', () => {
    for (const bad of [undefined, null, 1, ['/gatherings'], { href: '/gatherings' }]) {
      expect(safeReturnTo(bad)).toBeUndefined();
    }
  });
});

describe('returnToSearch', () => {
  test('keeps a safe returnTo', () => {
    expect(returnToSearch({ returnTo: '/connections' })).toEqual({ returnTo: '/connections' });
  });

  test('drops the key for an unsafe or missing returnTo', () => {
    for (const bad of [...offSite, undefined]) {
      expect(returnToSearch({ returnTo: bad })).toEqual({});
    }
    expect(returnToSearch({})).toEqual({});
  });

  // Why every use site re-checks: the router spreads the raw parent search
  // under the validated one, so a dropped key is no protection on its own.
  test('a dropped key comes back when merged over the raw search', () => {
    const raw = { returnTo: '//evil.example/steal' };
    const merged: { returnTo?: unknown } = { ...raw, ...returnToSearch(raw) };
    expect(merged.returnTo).toBe('//evil.example/steal');
    expect(safeReturnTo(merged.returnTo)).toBeUndefined();
  });
});
