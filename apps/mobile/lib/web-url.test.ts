import { afterEach, describe, expect, test } from 'bun:test';

const original = process.env.EXPO_PUBLIC_WEB_URL;
let fresh = 0;

/** web-url reads the env at import, so each case imports its own copy. */
async function webUrlFor(value: string | undefined): Promise<string | null> {
  if (value === undefined) delete process.env.EXPO_PUBLIC_WEB_URL;
  else process.env.EXPO_PUBLIC_WEB_URL = value;
  const mod = (await import(`./web-url.ts?case=${++fresh}`)) as typeof import('./web-url');
  return mod.webUrl;
}

afterEach(() => {
  if (original === undefined) delete process.env.EXPO_PUBLIC_WEB_URL;
  else process.env.EXPO_PUBLIC_WEB_URL = original;
});

describe('webUrl', () => {
  test('null when unset or empty', async () => {
    expect(await webUrlFor(undefined)).toBeNull();
    expect(await webUrlFor('')).toBeNull();
  });

  test('trims whitespace and trailing slashes', async () => {
    expect(await webUrlFor('https://app.example')).toBe('https://app.example');
    expect(await webUrlFor(' https://app.example/ ')).toBe('https://app.example');
    expect(await webUrlFor('https://app.example///')).toBe('https://app.example');
  });

  test('null when nothing is left after trimming', async () => {
    expect(await webUrlFor('   ')).toBeNull();
    expect(await webUrlFor('///')).toBeNull();
  });
});
