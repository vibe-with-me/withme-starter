import { z } from 'zod';
import { PublicProfileSchema } from './profile.ts';
import { PLAIN_TEXT_MESSAGE, isPlainText } from './text.ts';

const plain = (v: string) => isPlainText(v);

/** An emptied location means "no location": the entity never carries ''. */
const LocationInputSchema = z
  .string()
  .trim()
  .max(160)
  .refine(plain, PLAIN_TEXT_MESSAGE)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

/** How far ahead a gathering may start. The database enforces a year too. */
export const GATHERING_MAX_LEAD_DAYS = 365;

/** A start on the way in: ISO with an offset, and at most a year out. */
const StartsAtInputSchema = z.iso
  .datetime({ offset: true })
  .refine(
    (value) => Date.parse(value) <= Date.now() + GATHERING_MAX_LEAD_DAYS * 86_400_000,
    'At most a year ahead',
  );

/** A gathering as its members see it. host_id tells the UI who runs it. */
export const GatheringSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(120).refine(plain, PLAIN_TEXT_MESSAGE),
  starts_at: z.iso.datetime({ offset: true }),
  location: z.string().min(1).max(160).refine(plain, PLAIN_TEXT_MESSAGE).nullable(),
  host_id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
});

/**
 * What an anonymous tap on a gathering tag may learn — capability-based:
 * holding the tag is the invitation. Crosses the anonymous resolve boundary,
 * so nothing private ever joins this pick.
 */
export const GatheringSummarySchema = GatheringSchema.pick({
  id: true,
  title: true,
  starts_at: true,
  location: true,
});

/**
 * A member as the viewer may see them: the card plus when they joined. Only
 * the viewer's own row and their accepted connections' rows are ever
 * readable (RLS); a gathering never reveals a stranger's card.
 */
export const GatheringMemberSchema = z.object({
  joined_at: z.iso.datetime({ offset: true }),
  profile: PublicProfileSchema,
});

/**
 * A gathering as the Events tab lists it: the entity plus the viewer's view
 * of who is going. `member_count` counts every member; `members` carries
 * only the ones the viewer may see (themself and their connections).
 */
export const GatheringListItemSchema = GatheringSchema.extend({
  member_count: z.number().int().nonnegative(),
  is_member: z.boolean(),
  members: z.array(GatheringMemberSchema),
});

export const CreateGatheringInputSchema = z.object({
  title: z.string().trim().min(1).max(120).refine(plain, PLAIN_TEXT_MESSAGE),
  starts_at: StartsAtInputSchema,
  location: LocationInputSchema,
});

/** Host-only patch; the id travels in the path. At least one field. */
export const UpdateGatheringInputSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(120).refine(plain, PLAIN_TEXT_MESSAGE).optional(),
    starts_at: StartsAtInputSchema.optional(),
    location: LocationInputSchema,
  })
  .refine(
    (patch) =>
      patch.title !== undefined || patch.starts_at !== undefined || patch.location !== undefined,
    { message: 'Nothing to update' },
  );

/** A page of the feed: 20 by default, 50 at most. */
export const GATHERINGS_PAGE_SIZE = 20;

/**
 * The feed's page request. `cursor` is the previous page's `next_cursor`,
 * opaque to clients; omit it for the first page.
 */
export const ListGatheringsInputSchema = z
  .object({
    cursor: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .optional();

export const GatheringsPageSchema = z.object({
  gatherings: z.array(GatheringListItemSchema),
  /** Pass it back for the next page; null on the last one. */
  next_cursor: z.string().nullable(),
});

export type Gathering = z.infer<typeof GatheringSchema>;
export type GatheringSummary = z.infer<typeof GatheringSummarySchema>;
export type GatheringMember = z.infer<typeof GatheringMemberSchema>;
export type GatheringListItem = z.infer<typeof GatheringListItemSchema>;
export type CreateGatheringInput = z.infer<typeof CreateGatheringInputSchema>;
export type UpdateGatheringInput = z.infer<typeof UpdateGatheringInputSchema>;
export type ListGatheringsInput = z.infer<typeof ListGatheringsInputSchema>;
export type GatheringsPage = z.infer<typeof GatheringsPageSchema>;
