// The test utils refuse a hosted project unless the caller opts in, so a
// shell that still has production SUPABASE_URL and service-role values
// exported cannot turn `bun test` into a production write.
import { describe, expect, it } from 'bun:test';

const UTILS = new URL('../src/test-utils/index.ts', import.meta.url).pathname;

function load(env: Record<string, string>) {
  const result = Bun.spawnSync([process.execPath, '-e', `await import(${JSON.stringify(UTILS)})`], {
    env: { PATH: process.env.PATH ?? '', SUPABASE_SERVICE_ROLE_KEY: 'not-a-real-key', ...env },
  });
  return { exitCode: result.exitCode, stderr: result.stderr.toString() };
}

describe('test-utils remote guard', () => {
  it('refuses a non-local SUPABASE_URL', () => {
    const { exitCode, stderr } = load({ SUPABASE_URL: 'https://example.supabase.co' });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Refusing to use non-local Supabase');
  });

  it('loads against the local stack', () => {
    expect(load({ SUPABASE_URL: 'http://127.0.0.1:55321' }).exitCode).toBe(0);
    expect(load({}).exitCode).toBe(0);
  });

  it('loads a remote target only with SEED_ALLOW_REMOTE=1', () => {
    const { exitCode } = load({
      SUPABASE_URL: 'https://example.supabase.co',
      SEED_ALLOW_REMOTE: '1',
    });
    expect(exitCode).toBe(0);
  });
});
