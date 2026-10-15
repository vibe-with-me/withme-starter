// Removes everything the demo seed created: the demo users (their profiles,
// links, requests, connections, gatherings and memberships cascade) and the
// demo tags. Run it on a hosted project before real users arrive, so no
// shared login outlives the deploy checks.
//
//   bun run db:unseed
//
// Same remote-safety gate as the seed: refuses a non-local SUPABASE_URL
// unless SEED_ALLOW_REMOTE=1.
import './local-env.ts';
import { admin } from '@withme/db/test-utils';
import { DEMO_TAGS, findDemoUsers } from './demo.ts';

const target = new URL(process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321');
if (
  !['127.0.0.1', 'localhost'].includes(target.hostname) &&
  process.env.SEED_ALLOW_REMOTE !== '1'
) {
  console.error(
    `Refusing to unseed non-local Supabase at ${target.origin}. Set SEED_ALLOW_REMOTE=1 to override.`,
  );
  process.exit(1);
}

const demoUsers = await findDemoUsers(admin);
for (const user of demoUsers) {
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) throw deleteError;
}

const { error: tagError } = await admin.from('tags').delete().in('uid', Object.values(DEMO_TAGS));
if (tagError) throw tagError;

console.log(`Removed ${demoUsers.length} demo user(s) and the demo tags.`);
