// Batch-provision unclaimed tags and emit the encode list.
//
//   bun run db:provision -- --count 10 --base-url https://your-domain.example
//
// Writes each tag as an unclaimed row (operator action — service role), then
// prints one encode line per tag and writes a CSV + printable HTML sheet to
// ./provisioned-tags.{csv,html}. Same remote-safety gate as the seed: refuses
// a non-local SUPABASE_URL unless SEED_ALLOW_REMOTE=1.
import './local-env.ts';
import { admin } from '@withme/db/test-utils';

const target = new URL(process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321');
if (
  !['127.0.0.1', 'localhost'].includes(target.hostname) &&
  process.env.SEED_ALLOW_REMOTE !== '1'
) {
  console.error(
    `Refusing to provision against non-local Supabase at ${target.origin}. Set SEED_ALLOW_REMOTE=1 to override.`,
  );
  process.exit(1);
}

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

const count = Number(arg('count', '10'));
const baseUrl = arg('base-url', 'http://localhost:3000').replace(/\/+$/, '');
if (!Number.isInteger(count) || count < 1 || count > 1000) {
  console.error('--count must be an integer between 1 and 1000');
  process.exit(1);
}

/** NXP-style UID: 0x04 vendor byte + 6 random bytes = 14 uppercase hex chars. */
function randomUid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `04${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const uids: string[] = [];
while (uids.length < count) {
  const batch = Array.from({ length: count - uids.length }, randomUid);
  const { data, error } = await admin
    .from('tags')
    .upsert(
      batch.map((uid) => ({ uid })),
      { onConflict: 'uid', ignoreDuplicates: true },
    )
    .select('uid');
  if (error) {
    console.error('provisioning failed:', error.message);
    process.exit(1);
  }
  // collisions (already-existing uids) are skipped by ignoreDuplicates;
  // loop fills the remainder with fresh randoms
  uids.push(...(data ?? []).map((row) => row.uid));
}

const rows = uids.map((uid) => ({ uid, url: `${baseUrl}/t/${uid}` }));

console.log(`Provisioned ${rows.length} unclaimed tags on ${target.origin}\n`);
for (const row of rows) console.log(`  ${row.uid}  ${row.url}`);

const csv = `uid,encode_url\n${rows.map((r) => `${r.uid},${r.url}`).join('\n')}\n`;
await Bun.write('provisioned-tags.csv', csv);

const html = `<!doctype html>
<meta charset="utf-8"><title>Tag encode sheet</title>
<style>
  body { font: 14px/1.6 system-ui; max-width: 48rem; margin: 2rem auto; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-family: ui-monospace, monospace; }
  @media print { body { margin: 0 } }
</style>
<h1>Tag encode sheet — ${rows.length} tags</h1>
<p>Write each URL to its tag as an NDEF URI record, then tap to verify it
resolves to the claim flow.</p>
<table><tr><th>#</th><th>UID</th><th>Encode URL</th></tr>
${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.uid}</td><td>${r.url}</td></tr>`).join('\n')}
</table>`;
await Bun.write('provisioned-tags.html', html);

console.log('\nWrote provisioned-tags.csv and provisioned-tags.html (printable).');
