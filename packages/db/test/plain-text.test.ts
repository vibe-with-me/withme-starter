// Names, bios, gathering titles and locations refuse control, bidi and
// invisible characters at the database boundary (the CHECKs from
// 20261015140100_link_and_text_validation.sql), so a direct PostgREST write
// cannot store a name that reads as someone else's. The contract refuses the
// same set (packages/contract/src/schemas/text.ts).
import { beforeAll, describe, expect, it } from 'bun:test';
import { assertStackRunning, createTestUser } from '../src/test-utils/index.ts';

beforeAll(assertStackRunning);

const SPOOFS = [
  'Ad‮a', // right-to-left override
  'Ad⁧a', // right-to-left isolate
  'Ad‏a', // right-to-left mark
  'A​da', // zero-width space
  'A﻿da', // zero-width no-break space
  'Ada\u001b[31m', // terminal escape
  'Ada\tLovelace',
];

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

describe('plain text at the database boundary', () => {
  it('a profile name or bio with a spoofing character is refused', async () => {
    const alice = await createTestUser('Alice');
    for (const value of SPOOFS) {
      for (const patch of [{ display_name: value }, { bio: value }]) {
        const { error } = await alice.client.from('profiles').update(patch).eq('id', alice.id);
        expect(error?.code).toBe('23514');
      }
    }
    const { data } = await alice.client
      .from('profiles')
      .select('display_name, bio')
      .eq('id', alice.id);
    expect(data).toEqual([{ display_name: 'Alice', bio: null }]);
  });

  it('a bio keeps its line breaks, a name does not; emoji joiners pass', async () => {
    const alice = await createTestUser('Alice');
    const bio = 'line one\nline two';
    const name = 'Ada 👩‍💻';
    const { error } = await alice.client
      .from('profiles')
      .update({ display_name: name, bio })
      .eq('id', alice.id);
    expect(error).toBeNull();
    const { error: nameError } = await alice.client
      .from('profiles')
      .update({ display_name: 'Ada\nLovelace' })
      .eq('id', alice.id);
    expect(nameError?.code).toBe('23514');
  });

  it('a gathering title or location with a spoofing character is refused, on create and edit', async () => {
    const alice = await createTestUser('Alice');
    for (const value of SPOOFS) {
      for (const args of [
        { p_title: value, p_starts_at: tomorrow() },
        { p_title: 'Tee time', p_starts_at: tomorrow(), p_location: value },
      ]) {
        const { error } = await alice.client.rpc('create_gathering', args);
        expect(error?.code).toBe('23514');
      }
    }

    const { data, error } = await alice.client.rpc('create_gathering', {
      p_title: 'Tee time',
      p_starts_at: tomorrow(),
    });
    expect(error).toBeNull();
    const id = (data as { id: string }).id;
    for (const value of SPOOFS) {
      for (const patch of [{ title: value }, { location: value }]) {
        const { error: editError } = await alice.client
          .from('gatherings')
          .update(patch)
          .eq('id', id);
        expect(editError?.code).toBe('23514');
      }
    }
  });
});
