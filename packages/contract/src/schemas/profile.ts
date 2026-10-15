import { z } from 'zod';
import { PLAIN_TEXT_MESSAGE, isPlainText } from './text.ts';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** The Storage bucket every avatar lives in: public read by path, per-user folders, never listable. */
export const AVATARS_BUCKET = 'avatars';

/**
 * The upload cap (1 MiB). The contract validates the file's size, but only
 * after oRPC has buffered the whole multipart body, so the API also rejects
 * an oversized request by its Content-Length before reading it; the bucket's
 * file_size_limit is the last line. Clients send 512px squares, far below it.
 */
export const AVATAR_MAX_BYTES = 1_048_576;

/**
 * Where an avatar lives inside the bucket: `<user-uuid>/<uuid>.(webp|jpg)`,
 * lowercase, one folder deep. A path, never a URL: an off-origin avatar is
 * unrepresentable, and each client builds the URL from its own configured
 * Supabase URL with avatarPublicUrl(). The database CHECK also binds the
 * folder to the profile's own id.
 */
export const AvatarPathSchema = z
  .string()
  .regex(new RegExp(`^${UUID}/${UUID}\\.(webp|jpg)$`), 'Expected <user-uuid>/<uuid>.(webp|jpg)');

/** The public URL for an avatar path, built from the caller's own Supabase URL. */
export function avatarPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`;
}

const DisplayNameSchema = z
  .string()
  .min(1)
  .max(80)
  .refine((v) => isPlainText(v), PLAIN_TEXT_MESSAGE);
const BioSchema = z
  .string()
  .max(280)
  .refine((v) => isPlainText(v, { multiline: true }), PLAIN_TEXT_MESSAGE);

export const ProfileSchema = z.object({
  id: z.uuid(),
  display_name: DisplayNameSchema,
  avatar_path: AvatarPathSchema.nullable(),
  bio: BioSchema.nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

/**
 * The card. Everything a stranger may see after a tap — and nothing more.
 * Reachable only via a tag scan or an existing connection (no enumeration).
 */
export const PublicProfileSchema = ProfileSchema.pick({
  id: true,
  display_name: true,
  avatar_path: true,
  bio: true,
});

/**
 * Name and bio. The photo has its own endpoints (uploadAvatar /
 * removeAvatar): a path is chosen by the API, never by the client, so this
 * input has no avatar key at all (unknown keys are stripped).
 */
export const UpdateProfileInputSchema = z.object({
  display_name: DisplayNameSchema.optional(),
  bio: BioSchema.nullable().optional(),
});

/**
 * A photo the client has already squared and resized to 512px. The API
 * reads the bytes to decide JPEG or WebP (a declared type is the client's
 * claim, not a fact), so there is no mime rule here.
 */
export const AvatarUploadInputSchema = z.object({
  file: z.file().min(1).max(AVATAR_MAX_BYTES),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type PublicProfile = z.infer<typeof PublicProfileSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;
export type AvatarUploadInput = z.infer<typeof AvatarUploadInputSchema>;
