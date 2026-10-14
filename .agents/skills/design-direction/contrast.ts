// WCAG 2.x contrast for the pairs make-it-yours requires. Part of the
// design-direction skill; adds nothing to the app. Usage, from the repo root:
//   bun run .agents/skills/design-direction/contrast.ts '#c2410c' '#ffffff'
//     -> prints the ratio of one pair
//   bun run .agents/skills/design-direction/contrast.ts --sheet docs/brand-direction.md
//     -> reads the sheet's "## Colors" table (| token | light | dark |), requires all
//        eight tokens exactly once with both modes, derives the twelve pairs from
//        those values, and exits 1 if any token is missing or any pair fails.
//        The pairs are computed from the values make-it-yours will copy, so the
//        sheet carries no second table that could drift from them.
type Rgb = [number, number, number];
type Mode = 'light' | 'dark';

const TOKENS = ['bg', 'surface', 'border', 'border-input', 'ink', 'ink-muted', 'accent', 'accent-ink'] as const;
type Token = (typeof TOKENS)[number];

// What must hold in each mode: [foreground token, background token, minimum ratio].
const PAIRS: ReadonlyArray<readonly [Token, Token, number]> = [
  ['accent-ink', 'accent', 4.5],
  ['ink', 'surface', 4.5],
  ['ink', 'bg', 4.5],
  ['ink-muted', 'surface', 4.5],
  ['ink-muted', 'bg', 4.5],
  ['border-input', 'surface', 3],
];

// A color is #rgb, #rrggbb, or rgba(r, g, b, a) with channels 0-255 and
// alpha 0-1; anything else (a hex without its #, a channel of 300) is an
// error, not a guess. An rgba() foreground is composited over the background
// first (the token files use rgba borders).
function parse(color: string, over?: Rgb): Rgb {
  const s = color.trim();
  const bad = new Error(
    `not a color: ${color} (want #rgb, #rrggbb, or rgba(r, g, b, a) with channels 0-255 and alpha 0-1)`,
  );
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/.exec(s);
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number) as Rgb;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if ([r, g, b].some((c) => c > 255) || a > 1) throw bad;
    if (a === 1 || !over) return [r, g, b];
    return [r, g, b].map((c, i) => Math.round(c * a + over[i] * (1 - a))) as Rgb;
  }
  const h = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s)?.[1];
  if (!h) throw bad;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}
function linear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function lum([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}
export function ratio(fg: string, bg: string): number {
  const back = parse(bg);
  const [l1, l2] = [lum(parse(fg, back)), lum(back)].toSorted((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// The sheet's Colors table: one row per token, `| <token> | <light> | <dark> |`.
// Only the "## Colors" section is read, so a header or cell elsewhere that
// happens to be a token name (the Copy table once had a `surface` column) is
// never mistaken for a color row. The heading is required: the skill's
// template puts the table under it, and without it the whole sheet would be
// searched. Every token exactly once; a duplicate or a missing token is an error.
export function colorsSection(text: string): string {
  const heading = /^##\s+Colors\b[^\n]*\n/m.exec(text);
  if (!heading) throw new Error('no "## Colors" heading: the | token | light | dark | table goes under it');
  const start = heading.index + heading[0].length;
  const next = /^##\s/m.exec(text.slice(start));
  return next ? text.slice(start, start + next.index) : text.slice(start);
}
export function readColors(text: string): Record<Mode, Record<Token, string>> {
  const colors = { light: {} as Record<Token, string>, dark: {} as Record<Token, string> };
  const seen = new Set<string>();
  const errors: string[] = [];
  const rowPattern = /^\|\s*([a-z-]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm;
  for (const [, name, light, dark] of colorsSection(text).matchAll(rowPattern)) {
    if (!(TOKENS as readonly string[]).includes(name)) continue;
    if (seen.has(name)) {
      errors.push(`token ${name} appears more than once`);
      continue;
    }
    seen.add(name);
    colors.light[name as Token] = light;
    colors.dark[name as Token] = dark;
  }
  for (const name of TOKENS) if (!seen.has(name)) errors.push(`token ${name} is missing (| ${name} | <light> | <dark> |)`);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  return colors;
}

const args = process.argv.slice(2);
if (args[0] === '--sheet' && args[1]) {
  let colors: ReturnType<typeof readColors>;
  try {
    colors = readColors(await Bun.file(args[1]).text());
  } catch (error) {
    console.error(`${args[1]}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  let failed = 0;
  for (const mode of ['light', 'dark'] as const) {
    for (const [fg, bg, min] of PAIRS) {
      const fgValue = colors[mode][fg];
      const bgValue = colors[mode][bg];
      let r: number;
      try {
        r = ratio(fgValue, bgValue);
      } catch (error) {
        failed++;
        console.log(`FAIL ${fg} on ${bg} (${mode}): ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      const ok = r >= min;
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${fg} on ${bg} (${mode}): ${fgValue} on ${bgValue} = ${r.toFixed(2)}:1 (min ${min}:1)`);
    }
  }
  process.exit(failed ? 1 : 0);
} else if (args.length === 2) {
  console.log(`${ratio(args[0], args[1]).toFixed(2)}:1`);
} else {
  console.error('usage: bun run contrast.ts <fg> <bg> | --sheet <file>');
  process.exit(2);
}
