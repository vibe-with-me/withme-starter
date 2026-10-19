// Mobile e2e: seeds what every flow needs (people, connections, tags, a
// gathering), stamped for this run, then runs the Maestro flows in flows/
// against the app on a booted simulator or emulator. Local and opt-in:
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
//   MAESTRO_BIN                 default maestro (the CLI, if not on PATH)
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

/** A confirmed account with a profile, as sign-up would leave it (on the current terms unless told). */
async function person(
  label: string,
  terms_version: string = TERMS_VERSION,
): Promise<{ id: string; email: string; name: string }> {
  const email = `maestro-${label}-${stamp}@rls.test`;
  const name = `Maestro ${label[0]!.toUpperCase()}${label.slice(1)} ${stamp}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, terms_version });
  if (profileError) throw profileError;
  return { id: data.user.id, email, name };
}

async function connect(a: { id: string }, b: { id: string }): Promise<void> {
  const [user_a, user_b] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  const { error } = await admin.from('connections').insert({ user_a, user_b });
  if (error) throw error;
}

/** A fresh tag UID: 14 uppercase hex characters, as an NTAG213 reports. */
function freshUid(): string {
  return Array.from({ length: 14 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
}

/** A tag: unclaimed, or claimed by `owner` and pointing at their profile or a gathering. */
async function tag(owner?: { id: string }, gatheringId?: string): Promise<string> {
  const uid = freshUid();
  const { error } = await admin.from('tags').insert(
    owner
      ? {
          uid,
          status: 'claimed',
          claimed_by: owner.id,
          destination: gatheringId ? { type: 'gathering', gathering_id: gatheringId } : { type: 'profile' },
        }
      : { uid },
  );
  if (error) throw error;
  return uid;
}

/** A gathering tomorrow, its host already going, as create_gathering leaves it. */
async function gathering(host: { id: string }, title: string): Promise<string> {
  const starts_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('gatherings')
    .insert({ host_id: host.id, title, starts_at })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('gathering insert returned no row');
  const { error: memberError } = await admin
    .from('gathering_members')
    .insert({ gathering_id: data.id, profile_id: host.id });
  if (memberError) throw memberError;
  return data.id;
}

// Every flow gets its own people, so the flows run in any order, alone or
// together, and a rerun never meets the last run's state.

// sign-in.yaml: Ada signs in and finds Bob among her connections.
const ada = await person('ada');
const bob = await person('bob');
await connect(ada, bob);

// handshake.yaml: Kim claims a fresh tag; Lee taps it and asks to connect.
const kim = await person('kim');
const lee = await person('lee');
const handshakeUid = await tag();

// gatherings.yaml: Hal hosts; Gus, his connection, finds it and joins.
const hal = await person('hal');
const gus = await person('gus');
await connect(hal, gus);

// gathering-controls.yaml: Cora's connections-only gathering with two spots,
// her tag pointed at it. Finn takes the second spot, Fay finds it full, and
// Sid, a stranger, never sees it.
const cora = await person('cora');
const finn = await person('finn');
const fay = await person('fay');
const sid = await person('sid');
await connect(cora, finn);
await connect(cora, fay);
const coraUid = await tag(cora);

// blocks.yaml: Bea blocks Ben, her connection, whose tag she can no longer read.
const bea = await person('bea');
const ben = await person('ben');
await connect(bea, ben);
const beaUid = await tag(bea);

// reports.yaml: Rae taps Rex's tag and reports him.
const rae = await person('rae');
const rex = await person('rex');
const rexUid = await tag(rex);

// terms.yaml: Tom agreed to an older version of the terms.
const tom = await person('tom', 'maestro-old');

// signed-out.yaml: Sue, signed out, taps Oli's tag and then Oli's gathering tag.
const sue = await person('sue');
const oli = await person('oli');
const oliUid = await tag(oli);
const oliGatheringTitle = `Maestro Picnic ${stamp}`;
const oliGatheringUid = await tag(oli, await gathering(oli, oliGatheringTitle));

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
  HS_UID: handshakeUid,
  HS_OWNER_EMAIL: kim.email,
  HS_OWNER_NAME: kim.name,
  HS_TAPPER_EMAIL: lee.email,
  HS_TAPPER_NAME: lee.name,
  GA_HOST_EMAIL: hal.email,
  GA_HOST_NAME: hal.name,
  GA_GUEST_EMAIL: gus.email,
  GA_TITLE: `Maestro Rooftop ${stamp}`,
  GC_HOST_EMAIL: cora.email,
  GC_HOST_NAME: cora.name,
  GC_HOST_UID: coraUid,
  GC_FRIEND_EMAIL: finn.email,
  GC_LATE_EMAIL: fay.email,
  GC_STRANGER_EMAIL: sid.email,
  GC_TITLE: `Maestro Supper ${stamp}`,
  BL_BLOCKER_EMAIL: bea.email,
  BL_BLOCKER_NAME: bea.name,
  BL_BLOCKER_UID: beaUid,
  BL_BLOCKED_EMAIL: ben.email,
  BL_BLOCKED_NAME: ben.name,
  RP_REPORTER_EMAIL: rae.email,
  RP_TARGET_NAME: rex.name,
  RP_TARGET_UID: rexUid,
  TM_EMAIL: tom.email,
  SO_EMAIL: sue.email,
  SO_OWNER_NAME: oli.name,
  SO_OWNER_UID: oliUid,
  SO_GATHERING_UID: oliGatheringUid,
  SO_GATHERING_TITLE: oliGatheringTitle,
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
