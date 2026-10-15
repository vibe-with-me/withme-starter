/**
 * Characters no name, bio, title or location may carry, mirrored by
 * private.is_plain_text in SQL (keep the two in step): control characters,
 * the bidi embeddings, overrides and isolates (U+202A–U+202E, U+2066–U+2069),
 * the direction marks (U+200E, U+200F), and the invisible spaces and joiners
 * that render as nothing (U+200B, U+2060, U+FEFF). Together they let one
 * person's name read as another's, or reorder what a card says.
 *
 * Allowed on purpose: U+200C and U+200D (the zero-width non-joiner and
 * joiner). Persian and Indic scripts need the first, and every multi-person,
 * flag and skin-tone emoji sequence needs the second.
 */
// oxlint-disable-next-line no-control-regex -- rejecting control chars is the point
const UNSAFE = /[\p{Cc}​‎‏‪-‮⁠⁦-⁩﻿]/u;
/** The same, minus the line feed a multi-line field (a bio) keeps. */
// oxlint-disable-next-line no-control-regex -- rejecting control chars is the point
const UNSAFE_MULTILINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​‎‏‪-‮⁠⁦-⁩﻿]/u;

export const PLAIN_TEXT_MESSAGE = 'Contains control or invisible characters';

/** True when `value` has none of the characters above (a line feed only where `multiline`). */
export function isPlainText(value: string, { multiline = false } = {}): boolean {
  return !(multiline ? UNSAFE_MULTILINE : UNSAFE).test(value);
}
