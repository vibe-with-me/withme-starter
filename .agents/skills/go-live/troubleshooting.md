# go-live — troubleshooting

Symptom → cause for the go-live runbook (`SKILL.md` beside this file).

| Symptom | Cause |
|---|---|
| MCP Supabase tools can't see the new org | MCP tokens are org-scoped; use the CLI |
| `wrangler deploy` 502/504/524 | Cloudflare API blip — retry with backoff |
| Printed workers.dev URL is on another account's subdomain | Several accounts and no `account_id` pinned — pin it in both wrangler configs |
| Deploy says "register a workers.dev subdomain", link 404s | Retired onboarding URL — Workers & Pages → account details → Subdomain; redeploy |
| New workers.dev URL: `curl` prints `000` | The subdomain is still propagating — wait ~2 minutes |
| Python body check gets 403 | Cloudflare blocks urllib's default User-Agent — send a browser one |
| `db push` refuses: migration history differs | Reused project with an older schema — owner runs `supabase db reset --linked` |
| Authed calls 401 after a good sign-in | Project JWKS has no asymmetric key — enable JWT signing keys |
| `bunx eas-cli`: `Cannot find module 'yallist'` | Broken bunx cache — `npx -y eas-cli@24.13.0 …` (the version last verified) |
| Web resolver errors only in production SSR | Service binding name ≠ api worker name |
| Signups never confirm | Default SMTP delivers to org members only — set up custom SMTP; never turn confirmation off for real users |
| Seed: "Refusing to seed a hosted project without SEED_DEMO_PASSWORD" | Keys file predates this runbook — append `SEED_DEMO_PASSWORD=` plus a random 24+ character value |
| Phone sign-in: "Unsupported phone provider" | The Phone provider is off in the dashboard |
| Phone sign-in texts some numbers only | Twilio trial account: verify the number or upgrade |
| `eas update` fails non-interactively | Missing `--environment` |
| Published app seems to point at localhost | You byte-grepped Hermes bytecode — use `--no-bytecode` to verify |
| Demo DB unreachable weeks later | Free-tier project paused — wake it in the dashboard |
| A `.env.demo-seed` file sits in the repo root | An older copy of this runbook wrote the keys file there (`.env.*` keeps it out of git): move it to `$HOME/.config/<name>/demo-seed.env`, `chmod 600` it, and retire its service-role key as section 5 says |
| git status shows .supabase-demo-db-password, or the repo has one | an older copy of this runbook wrote it into the repo root (the starter's .gitignore now ignores the name; older forks do not): move it to `$HOME/.config/<name>/supabase-db-password` (the name the commands read), `chmod 600` it, and never commit it. If it was ever committed, moving it does not remove it from history: reset the database password (Dashboard → Project Settings → Database) and write the new one to `$HOME/.config/<name>/supabase-db-password` |
