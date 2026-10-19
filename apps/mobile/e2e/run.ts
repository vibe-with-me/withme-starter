// Mobile e2e: seeds the people a flow needs, then runs the Maestro flows in
// flows/ against the app on a booted simulator or emulator. Local and opt-in:
// docs/testing.md says how to run it and why CI does not (yet).
//
//   bun run --cwd apps/mobile e2e                 # every flow
//   bun run --cwd apps/mobile e2e flows/sign-up.yaml
//
// Needs: the local stack and its service-role key (as the web e2e does), the
// API worker, Metro (or a dev build) pointed at them through apps/mobile/.env,
// and the Maestro CLI (https://maestro.dev). Env:
//   SUPABASE_URL                default http://127.0.0.1:55321
//   SUPABASE_SERVICE_ROLE_KEY   required; setup only, never the path under test
//   MAESTRO_OPEN_URL            default exp://127.0.0.1:8081 (Expo Go + Metro);
//                               a dev build uses withme:// (your app.json scheme)
//   MAESTRO_APP_ID              default host.exp.Exponent; a dev build uses its
//                               bundle id (co.withme.starter in the starter)
//   MAESTRO_DEVICE              optional simulator UDID / emulator serial
//   MAESTRO_BIN                 default maestro
import { TERMS_VERSION } from '@withme/contract';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. Export it as for the web e2e (docs/testing.md):\n' +
      '  eval "export $(supabase status -o env --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY | grep ^SUPABASE_SERVICE_ROLE_KEY=)"',
  );
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const PASSWORD = 'maestro-pass-1!';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** A confirmed account with a profile on the current terms, as sign-up would leave it. */
async function person(label: string): Promise<{ id: string; email: string; name: string }> {
  const email = `maestro-${label}-${stamp}@rls.test`;
  const name = `Maestro ${label[0]!.toUpperCase()}${label.slice(1)} ${stamp}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, terms_version: TERMS_VERSION });
  if (profileError) throw profileError;
  return { id: data.user.id, email, name };
}

// sign-in.yaml signs in as Ada and finds Bob among her connections.
const ada = await person('ada');
const bob = await person('bob');
const [user_a, user_b] = ada.id < bob.id ? [ada.id, bob.id] : [bob.id, ada.id];
const { error } = await admin.from('connections').insert({ user_a, user_b });
if (error) throw error;

const env: Record<string, string> = {
  APP_ID: process.env.MAESTRO_APP_ID ?? 'host.exp.Exponent',
  OPEN_URL: process.env.MAESTRO_OPEN_URL ?? 'exp://127.0.0.1:8081',
  PASSWORD,
  EMAIL: ada.email,
  NAME: ada.name,
  FRIEND: bob.name,
  // sign-up.yaml makes this account itself.
  NEW_EMAIL: `maestro-new-${stamp}@rls.test`,
  NEW_NAME: `Maestro New ${stamp}`,
};

const flows = process.argv.slice(2);
const args = [
  ...(process.env.MAESTRO_DEVICE ? ['--device', process.env.MAESTRO_DEVICE] : []),
  'test',
  ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
  // Screenshots and the view hierarchy of each step; maestro.log beside them.
  '--test-output-dir',
  'e2e/.maestro',
  '--debug-output',
  'e2e/.maestro',
  '--format',
  'junit',
  '--output',
  'e2e/.maestro/report.xml',
  ...(flows.length > 0 ? flows.map((f) => (f.startsWith('e2e/') ? f : `e2e/${f}`)) : ['e2e/flows']),
];
const child = Bun.spawn([process.env.MAESTRO_BIN ?? 'maestro', ...args], {
  cwd: `${import.meta.dir}/..`,
  stdio: ['inherit', 'inherit', 'inherit'],
  env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' },
});
process.exit(await child.exited);
