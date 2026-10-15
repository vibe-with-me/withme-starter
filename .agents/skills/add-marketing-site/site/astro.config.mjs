import { defineConfig } from 'astro/config';

// Static output and no adapter: `astro build` writes plain HTML and CSS to
// dist/, and wrangler serves it as static assets. There is no server code to
// secure and nothing to hydrate. Set `site` to the origin the site deploys to.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:4321',
  output: 'static',
  // privacy.html, not privacy/index.html: wrangler serves /privacy without a
  // redirect to /privacy/, and the canonical URLs match the links.
  build: { format: 'file' },
});
