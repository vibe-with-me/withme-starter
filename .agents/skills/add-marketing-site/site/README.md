# apps/site

The marketing site: what the tag does, how to get one, and the privacy and
support pages the app stores ask for. Astro, static output, no adapter: the
build is plain HTML and CSS in `dist/`, served by Cloudflare as static
assets. No API, no Supabase, no client JavaScript, no analytics.

The site wears the app's design system. `src/layouts/Base.astro` imports
`apps/web/src/styles/tokens.css` and `app.css`, so a token or font change in
the app restyles the site on its next build. Brand words live in
`src/brand.ts`; keep them identical to the app's.

```sh
bun run dev                              # http://localhost:4321
bun run build && bunx wrangler dev       # the built site, served as it will be
bun run build && bunx wrangler deploy    # the owner's OK first
```

Made by `.agents/skills/add-marketing-site/` (the full runbook, including
the hostname decision and the deploy).
