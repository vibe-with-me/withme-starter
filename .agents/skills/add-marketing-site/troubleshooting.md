# add-marketing-site — troubleshooting

Symptom → cause for the add-marketing-site runbook (`SKILL.md` beside this file).

| Symptom | Cause |
|---|---|
| Site keeps the old accent after a token change | No `@withme/site#build` task in `turbo.json`; turbo replayed a cached build (step 2) |
| A new `PUBLIC_*` value does not show up | The same: turbo neither hashes `.env` files nor lists `PUBLIC_*` without the package task |
| `bun run lint` fails on `apps/site/.astro/types.d.ts` | `.astro` missing from `.oxlintrc.json` `ignorePatterns` and `.gitignore` |
| `/privacy` answers 307 to `/privacy/` | `build.format: 'file'` was removed from `astro.config.mjs` |
| Canonical link says `/index` or `.html` | The `canonical` line in `Base.astro` was changed |
| `bun run deploy`: "The build's canonical URL is http://localhost:4321/" | `PUBLIC_SITE_URL` missing from `apps/site/.env.production`; set it and rebuild |
| Canonical link says `localhost` in production | Deployed with a bare `wrangler deploy` past the check, or `astro.config.mjs` reads `process.env` directly (the config runs before Astro loads `.env` files; keep the `loadEnv` call) |
| `Cannot find module 'vite' imported from …/astro.config.mjs` | `vite` dropped from `apps/site/package.json` devDependencies |
| Taps on old tags 404 after the site took their hostname | The site took the tags' hostname without `public/_redirects` (step 1) |
| "Open the app" or "Get tags" missing | The button is dormant: set `PUBLIC_APP_URL` / `PUBLIC_STORE_URL` and rebuild |
| Deploy lands on another account | No `account_id` pinned in `apps/site/wrangler.jsonc` |
