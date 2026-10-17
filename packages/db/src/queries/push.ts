import type { Db } from '../index.ts';

/** Register or refresh this device's token for the caller (register_push_token). */
export async function registerPushToken(
  db: Db,
  token: string,
  platform: 'ios' | 'android',
): Promise<void> {
  const { error } = await db.rpc('register_push_token', { p_token: token, p_platform: platform });
  if (error) throw error;
}

/** Delete one of the caller's tokens. RLS makes someone else's a silent no-op. */
export async function unregisterPushToken(db: Db, token: string): Promise<void> {
  const { error } = await db.from('push_tokens').delete().eq('token', token);
  if (error) throw error;
}
