// The seed and the provisioning script default to the local stack. With no
// SUPABASE_SERVICE_ROLE_KEY in the environment and a local target, ask the
// Supabase CLI for the local stack's key, so `bun run db:seed` works straight
// after `bun run db:start`. A remote target never reaches the CLI: it needs the
// key exported (go-live and provision-tags load it from the keys file).
// Imported before `@withme/db/test-utils`, which refuses to load without it.
const target = new URL(process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321');
const local = ['127.0.0.1', 'localhost'].includes(target.hostname);

if (local && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const status = Bun.spawnSync(
    [
      'supabase',
      'status',
      '-o',
      'env',
      '--override-name',
      'auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY',
    ],
    { stderr: 'ignore' },
  );
  const line = status.stdout
    .toString()
    .split('\n')
    .find((entry) => entry.startsWith('SUPABASE_SERVICE_ROLE_KEY='));
  const key = line?.slice('SUPABASE_SERVICE_ROLE_KEY='.length).replace(/^"|"$/g, '');
  if (key) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
}
