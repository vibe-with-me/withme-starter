import { describe, expect, test } from 'bun:test';
import type { PublicProfile } from '@withme/contract';

import { cardLine } from './card-line';

describe('cardLine', () => {
  test("the starter's card has no vertical fields, so there is no line", () => {
    const profile = {
      id: 'u1',
      display_name: 'Ada',
      avatar_path: null,
    } as unknown as PublicProfile;
    expect(cardLine(profile)).toBeNull();
  });
});
