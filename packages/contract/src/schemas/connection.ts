import { z } from 'zod';
import { ProfileLinkSchema } from './link.ts';
import { PublicProfileSchema } from './profile.ts';

export const ConnectRequestStatusSchema = z.enum(['pending', 'accepted', 'declined', 'expired']);

/** An incoming connect request as the recipient sees it. */
export const ConnectRequestSchema = z.object({
  id: z.uuid(),
  requester: PublicProfileSchema,
  status: ConnectRequestStatusSchema,
  created_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }),
});

/**
 * A connection as either party sees it: the other person's card, and their
 * links — the one place links travel. Always present; `[]` when they have
 * none.
 */
export const ConnectionSchema = z.object({
  id: z.uuid(),
  profile: PublicProfileSchema,
  links: z.array(ProfileLinkSchema),
  created_at: z.iso.datetime({ offset: true }),
});

export type ConnectRequestStatus = z.infer<typeof ConnectRequestStatusSchema>;
export type ConnectRequest = z.infer<typeof ConnectRequestSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
