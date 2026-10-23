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
import { admin, makeOperator } from '@withme/db/test-utils';

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
