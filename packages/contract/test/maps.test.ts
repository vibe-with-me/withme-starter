import { describe, expect, it } from 'bun:test';
import { MAPS_SEARCH_PLATFORMS, mapsSearchUrl } from '../src/index.ts';

describe('mapsSearchUrl', () => {
  it('builds each platform’s search URL', () => {
    expect(mapsSearchUrl('The roof', 'web')).toBe(
      'https://www.google.com/maps/search/?api=1&query=The%20roof',
    );
    expect(mapsSearchUrl('The roof', 'ios')).toBe('maps:?q=The%20roof');
    expect(mapsSearchUrl('The roof', 'android')).toBe('geo:0,0?q=The%20roof');
  });

  it('encodes every URL-significant character, so the text stays one query value', () => {
    const hostile = 'Bar & Grill #2? a=b/c%20 + javascript:alert(1)';
    for (const platform of MAPS_SEARCH_PLATFORMS) {
      const url = mapsSearchUrl(hostile, platform);
      const prefix = mapsSearchUrl('x', platform)!.slice(0, -1);
      expect(url!.startsWith(prefix)).toBe(true);
      const query = url!.slice(prefix.length);
      // nothing in the value can end the parameter, start a fragment or add a path
      expect(query).not.toMatch(/[&#?/=+:\s]/);
      expect(decodeURIComponent(query)).toBe(hostile);
    }
  });

  it('never changes the URL’s scheme or host, whatever the text says', () => {
    const urls = ['https://evil.example', '//evil.example', 'javascript:alert(1)'].map((text) =>
      mapsSearchUrl(text, 'web'),
    );
    for (const url of urls) {
      expect(new URL(url!).origin).toBe('https://www.google.com');
      expect(new URL(url!).pathname).toBe('/maps/search/');
    }
  });

  it('keeps non-ASCII text as UTF-8', () => {
    expect(mapsSearchUrl('Café Zürich', 'web')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Caf%C3%A9%20Z%C3%BCrich',
    );
  });

  it('trims, and has no URL for a blank location', () => {
    expect(mapsSearchUrl('  The roof \n', 'ios')).toBe('maps:?q=The%20roof');
    expect(mapsSearchUrl('', 'web')).toBeNull();
    expect(mapsSearchUrl('   ', 'android')).toBeNull();
  });

  it('does not throw on a lone surrogate (encodeURIComponent would)', () => {
    expect(mapsSearchUrl('Pier \uD800 7', 'web')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Pier%20%EF%BF%BD%207',
    );
    expect(mapsSearchUrl('\uDC00', 'ios')).toBe('maps:?q=%EF%BF%BD');
  });
});
