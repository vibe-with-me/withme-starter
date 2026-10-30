import { z } from 'zod';
import { DestinationSchema } from './destination.ts';

/** Immutable NTAG213-style UID: 7 bytes = 14 hex chars, canonically uppercase. */
export const TagUidSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9A-F]{14}$/, 'Expected a 14-hex-char NFC UID');

export const TagStatusSchema = z.enum(['unclaimed', 'claimed', 'disabled']);

/** Public shape of a tag. tenant_id and claimed_by never cross the API boundary. */
export const TagSchema = z.object({
  uid: TagUidSchema,
  status: TagStatusSchema,
  destination: DestinationSchema.nullable(),
});

/**
 * What an owner may set: a tag off ('disabled') and back on ('claimed').
 * Releasing a tag is not theirs to do; the tags_state_consistent CHECK
 * agrees.
 */
export const OwnerTagStatusSchema = z.enum(['claimed', 'disabled']);

/**
 * Re-point and/or switch one of your tags. The uid identifies the tag (a path
 * parameter under OpenAPI; the RPC link sends it in the body). At least one
 * field.
 */
export const UpdateMyTagInputSchema = z
  .object({
    uid: TagUidSchema,
    destination: DestinationSchema.optional(),
    status: OwnerTagStatusSchema.optional(),
  })
  .refine((patch) => patch.destination !== undefined || patch.status !== undefined, {
    message: 'Nothing to update',
  });

/** The most physical tags one person may own before minting stops. */
export const MAX_OWNED_TAGS = 25;

/** A tag the database just minted, already claimed to the caller. */
export const MintedTagSchema = z.object({ uid: TagUidSchema });

export type TagUid = z.infer<typeof TagUidSchema>;
export type TagStatus = z.infer<typeof TagStatusSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type OwnerTagStatus = z.infer<typeof OwnerTagStatusSchema>;
export type UpdateMyTagInput = z.infer<typeof UpdateMyTagInputSchema>;
export type MintedTag = z.infer<typeof MintedTagSchema>;
