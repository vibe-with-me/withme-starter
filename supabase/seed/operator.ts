// Makes a local account an operator: it can open /admin. The account must
// exist and have a profile (sign up in the app first).
//
//   bun run db:operator you@example.com
//
// Local stacks only. Operators are rows in private.operators, which no
// client path can write; this writes one over the local database URL
// (SUPABASE_DB_URL, default the starter's 55322). On a hosted project, make
// an operator in the SQL Editor instead (docs/moderation.md).
import './local-env.ts';
import type { Db } from '@withme/db';
import { SUPABASE_DB_URL, admin, makeOperator } from '@withme/db/test-utils';

/** The auth user with this email, across every page of users. */
export async function findUserByEmail(client: Db, email: string): Promise<string | null> {
  const wanted = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === wanted);
    if (user) return user.id;
    if (data.users.length < perPage) return null;
  }
}

if (import.meta.main) {
  // Local only, whatever else is set: never SEED_ALLOW_REMOTE.
  const target = new URL(process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321');
  if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
    console.error(
      `Refusing to make an operator on ${target.origin}: use the SQL Editor (docs/moderation.md).`,
    );
    process.exit(1);
  }
  // The lookup goes to SUPABASE_URL and the write to SUPABASE_DB_URL: a
  // local stack's database port is its API port plus one (config.toml), so
  // a second stack set in one and not the other is caught here, not by a
  // confusing foreign-key error.
  const db = new URL(SUPABASE_DB_URL);
  if (Number(db.port) !== Number(target.port) + 1) {
    console.error(
      `SUPABASE_URL (${target.origin}) and SUPABASE_DB_URL (port ${db.port}) look like two ` +
        'different stacks. Set both to the same one (docs/testing.md).',
    );
    process.exit(1);
  }
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: bun run db:operator <email>');
    process.exit(1);
  }
  const userId = await findUserByEmail(admin, email);
  if (!userId) {
    console.error(`No account with the email ${email}. Sign up in the app first.`);
    process.exit(1);
  }
  await makeOperator(userId);
  console.log(`${email} is an operator: sign in and open /admin.`);
}
