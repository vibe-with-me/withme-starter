// Runs before `bun run deploy`. astro.config.mjs falls back to localhost so a
// build without PUBLIC_SITE_URL still works (CI, local preview); a deploy must
// not ship that, or every canonical and og:url points at localhost.
import { readFileSync } from 'node:fs';

let html;
try {
  html = readFileSync(new URL('./dist/index.html', import.meta.url), 'utf8');
} catch {
  console.error('No dist/index.html: run `bun run build` first.');
  process.exit(1);
}

const href = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
const host = href ? new URL(href).hostname : '';
if (!host || host === 'localhost' || host === '127.0.0.1') {
  console.error(
    `The build's canonical URL is "${href}". Set PUBLIC_SITE_URL in apps/site/.env.production, rebuild, then deploy.`,
  );
  process.exit(1);
}
console.log(`Deploying with canonical origin https://${host}`);
