import { z } from 'zod';

/**
 * An Expo push token, the shape the push_tokens_token_shape CHECK accepts.
 * A device's address for pushes: owner-only, never shown to anyone else.
 */
export const PushTokenSchema = z
  .string()
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/, 'Expected an Expo push token');

export const PushPlatformSchema = z.enum(['ios', 'android']);

export const RegisterPushTokenInputSchema = z.object({
  token: PushTokenSchema,
  platform: PushPlatformSchema,
});

export const UnregisterPushTokenInputSchema = z.object({ token: PushTokenSchema });

/**
 * Where a tapped notification may take the app: Requests, Connections, or
 * one gathering. The database builds these paths; a client opens nothing
 * else, whatever a payload says.
 */
export const PushPathSchema = z
  .string()
  .regex(
    /^\/(connections(\?segment=requests)?|gathering\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
  );

/** The path a notification's data carries, if it is one the app opens. */
export function pushPath(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const parsed = PushPathSchema.safeParse((data as { path?: unknown }).path);
  return parsed.success ? parsed.data : undefined;
}
