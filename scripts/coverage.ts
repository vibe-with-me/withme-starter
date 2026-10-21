#!/usr/bin/env bun
// One line-coverage number for the whole repo, the README's coverage pill.
// Runs every unit suite with lcov output, merges the reports (a line counts
// as covered if any suite ran it, so the API tests' calls into packages/db
// count for packages/db), and totals the files in each package's unit scope
// below. Web routes, components and mobile screens are left out on purpose:
// the Playwright and Maestro flows test those (docs/testing.md).
//
// Bun's lcov lists only the files a test loaded, which would hide exactly
// the untested ones. So every file in scope that no suite loaded is added
// at 0%, with its line count estimated from the package's own ratio of
// Bun-counted lines to source lines.
//
//   bun run coverage              all suites (packages/db needs the local stack)
//   bun run coverage --skip db    without the database suite
//
// Writes coverage/summary.md and coverage/badge.json (a shields.io endpoint).
// In CI, the summary goes on the run page and main publishes the badge.
//
// A fork that adds a package with tests adds a line to `suites`; the script
// warns about any workspace package with a `test` script that isn't listed.
// A listed package the fork deleted is skipped with a warning.

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { Glob } from 'bun'

const root = resolve(import.meta.dir, '..')
const out = join(root, 'coverage')

type Suite = {
  name: string
  cwd: string
  // The package's own unit scope: what its tests are meant to cover.
  scope: string[]
  // Inside the scope but not code a person wrote: generated files.
  ignore?: string[]
  run: (dir: string) => string[]
}

const bunTest = (args: string[]) => (dir: string) => [
  'bun',
  'test',
  ...args,
  '--coverage',
  '--coverage-reporter=lcov',
  `--coverage-dir=${dir}`,
]

const suites: Suite[] = [
  { name: 'contract', cwd: 'packages/contract', scope: ['src/**/*.ts'], run: bunTest([]) },
  {
    name: 'db',
    cwd: 'packages/db',
    scope: ['src/**/*.ts'],
    ignore: ['src/types/supabase.ts'], // `bun run db:types` writes it
    run: bunTest(['--timeout', '20000']),
  },
  {
    name: 'nfc-sdk',
    cwd: 'packages/nfc-sdk',
    scope: ['src/**/*.ts'],
    run: (dir) => [
      'bunx',
      'vitest',
      'run',
      '--coverage.enabled',
      '--coverage.provider=v8',
      '--coverage.reporter=lcovonly',
      `--coverage.reportsDirectory=${dir}`,
    ],
  },
  { name: 'api', cwd: 'apps/api', scope: ['src/**/*.ts'], run: bunTest(['test']) },
  { name: 'web', cwd: 'apps/web', scope: ['src/lib/**/*.ts'], run: bunTest(['src']) },
  { name: 'mobile', cwd: 'apps/mobile', scope: ['lib/**/*.ts'], run: bunTest(['lib']) },
]

const skipAt = process.argv.indexOf('--skip')
const skip = new Set(skipAt === -1 ? [] : (process.argv[skipAt + 1] ?? '').split(','))
const warnings: string[] = []

for (const suite of suites) {
  if (!existsSync(join(root, suite.cwd, 'package.json'))) {
    warnings.push(`\`${suite.cwd}\` is listed in scripts/coverage.ts but doesn't exist; skipped.`)
    skip.add(suite.name)
  }
}

// Workspace packages with tests that no suite covers: their tests run in
// `bun run test` but would never reach the number.
const workspaces: string[] = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces
const listed = new Set(suites.map((s) => s.cwd))
for (const pattern of workspaces) {
  for (const manifest of new Glob(`${pattern}/package.json`).scanSync({ cwd: root })) {
    const dir = manifest.slice(0, -'/package.json'.length)
    const { scripts } = JSON.parse(readFileSync(join(root, manifest), 'utf8'))
    if (scripts?.test && !listed.has(dir)) {
      warnings.push(`\`${dir}\` has a test script but no line in scripts/coverage.ts; not counted.`)
    }
  }
}
for (const w of warnings) console.warn(`coverage: ${w.replaceAll('`', '')}`)

// Absolute path → line → hits, merged across every suite.
const lines = new Map<string, Map<number, number>>()

rmSync(out, { recursive: true, force: true })
for (const suite of suites) {
  if (skip.has(suite.name)) continue
  const dir = join(out, 'lcov', suite.name)
  mkdirSync(dir, { recursive: true })
  const cwd = join(root, suite.cwd)
  const proc = Bun.spawnSync(suite.run(dir), { cwd, stdout: 'inherit', stderr: 'inherit' })
  if (proc.exitCode !== 0) {
    console.error(`coverage: the ${suite.name} suite failed`)
    process.exit(1)
  }
  readLcov(join(dir, 'lcov.info'), cwd)
}

function readLcov(file: string, cwd: string) {
  // A suite that passed but wrote no report would otherwise vanish from the
  // totals, its files all counted as untested.
  if (!existsSync(file)) {
    console.error(`coverage: no lcov report at ${relative(root, file)}`)
    process.exit(1)
  }
  let current: Map<number, number> | undefined
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      const path = resolve(cwd, line.slice(3))
      current = lines.get(path) ?? new Map()
      lines.set(path, current)
    } else if (line.startsWith('DA:') && current) {
      const [n, hits] = line.slice(3).split(',').map(Number)
      current.set(n, Math.max(current.get(n) ?? 0, hits))
    } else if (line === 'end_of_record') {
      current = undefined
    }
  }
}

// Lines left once types are stripped, minus blanks and import/re-export
// lines: the yardstick for the estimate, never the reported count. A file
// of types alone comes out at 0.
const transpiler = new Bun.Transpiler({ loader: 'ts' })
function sourceLines(path: string) {
  const js = transpiler.transformSync(readFileSync(path, 'utf8'))
  return js
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('import ') && !/^export (\*|\{)[^;]*from /.test(l)).length
}

const isTest = (p: string) => /\.(test|spec)\.tsx?$|\.d\.ts$|\/test\/|\/e2e\//.test(p)

type Row = { name: string; found: number; hit: number; untested: string[]; estimated: boolean }
const rows: Row[] = []

for (const suite of suites) {
  if (skip.has(suite.name)) continue
  const cwd = join(root, suite.cwd)
  const files = suite.scope
    .flatMap((pattern) => [...new Glob(pattern).scanSync({ cwd, absolute: true })])
    .filter((p) => !isTest(p) && !p.includes('node_modules'))
    .filter((p) => !suite.ignore?.includes(relative(cwd, p)))
  let found = 0,
    hit = 0,
    loadedSource = 0
  const missing: string[] = []
  for (const file of files) {
    const record = lines.get(file)
    if (!record || record.size === 0) {
      missing.push(file)
      continue
    }
    found += record.size
    hit += [...record.values()].filter((h) => h > 0).length
    loadedSource += sourceLines(file)
  }
  const ratio = loadedSource > 0 ? found / loadedSource : 1
  for (const file of missing) found += Math.round(sourceLines(file) * ratio)
  rows.push({
    name: suite.name,
    found,
    hit,
    untested: missing.map((p) => relative(root, p)),
    estimated: missing.length > 0,
  })
}

const total = rows.reduce((a, r) => ({ found: a.found + r.found, hit: a.hit + r.hit }), {
  found: 0,
  hit: 0,
})
const pct = (hit: number, found: number) => (found === 0 ? 100 : (hit / found) * 100)
const percent = pct(total.hit, total.found)
const color =
  percent >= 90
    ? 'brightgreen'
    : percent >= 80
      ? 'green'
      : percent >= 70
        ? 'yellow'
        : percent >= 60
          ? 'orange'
          : 'red'

writeFileSync(
  join(out, 'badge.json'),
  JSON.stringify({
    schemaVersion: 1,
    label: 'coverage',
    message: `${Math.floor(percent)}%`,
    color,
  }) + '\n',
)

const summary = [
  `### Unit test coverage: ${percent.toFixed(1)}% of lines`,
  '',
  '| Package | Lines | Covered | Files no test loads |',
  '| --- | ---: | ---: | --- |',
  ...rows.map(
    (r) =>
      `| ${r.name} | ${r.found}${r.estimated ? '*' : ''} | ${pct(r.hit, r.found).toFixed(1)}% | ${
        r.untested.length ? r.untested.map((f) => `\`${f}\``).join(', ') : 'none'
      } |`,
  ),
  '',
  '\\* includes an estimate for the files no test loads, counted at 0%.',
  skip.size ? `\nSkipped: ${[...skip].join(', ')}.` : '',
  ...warnings.map((w) => `\n> [!WARNING]\n> ${w}`),
].join('\n')

writeFileSync(join(out, 'summary.md'), summary + '\n')
console.log('\n' + summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
