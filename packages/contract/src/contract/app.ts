import { oc } from '@orpc/contract';
import { z } from 'zod';
import { ConnectRequestSchema, ConnectionSchema } from '../schemas/connection.ts';
import {
  CreateGatheringInputSchema,
  GatheringListItemSchema,
  GatheringMemberSchema,
  GatheringSchema,
  GatheringsPageSchema,
  ListGatheringsInputSchema,
  UpdateGatheringInputSchema,
} from '../schemas/gathering.ts';
import { ProfileLinkSchema, ProfileLinksInputSchema } from '../schemas/link.ts';
import {
  AvatarUploadInputSchema,
  ProfileSchema,
  PublicProfileSchema,
  UpdateProfileInputSchema,
} from '../schemas/profile.ts';
import { RegisterPushTokenInputSchema, UnregisterPushTokenInputSchema } from '../schemas/push.ts';
import { CreateReportInputSchema } from '../schemas/report.ts';
import { ShareCodeSchema } from '../schemas/share-code.ts';
import { TagSchema, UpdateMyTagInputSchema } from '../schemas/tag.ts';
import { AcceptTermsInputSchema } from '../schemas/terms.ts';

const getProfile = oc
  .route({ method: 'GET', path: '/me/profile', tags: ['Profile'] })
  .output(z.object({ profile: ProfileSchema.nullable() }));

const updateProfile = oc
  .route({ method: 'PATCH', path: '/me/profile', tags: ['Profile'] })
  .input(UpdateProfileInputSchema)
  .output(z.object({ profile: ProfileSchema }));

const acceptTerms = oc
  .route({ method: 'POST', path: '/me/terms', tags: ['Profile'] })
  .input(AcceptTermsInputSchema)
  // Agree to the current terms (the re-ask screen after TERMS_VERSION
  // changes). The database stamps terms_accepted_at. Without a profile,
  // BAD_REQUEST: creating one carries terms_version itself.
  .output(z.object({ profile: ProfileSchema }));

const uploadAvatar = oc
  .route({ method: 'POST', path: '/me/avatar', tags: ['Profile'] })
  .input(AvatarUploadInputSchema)
  // Stored as <your-id>/<uuid>.(jpg|webp) with your own JWT; the previous
  // file is deleted. Anything but JPEG or WebP bytes is BAD_REQUEST.
  .output(z.object({ profile: ProfileSchema }));

const removeAvatar = oc
  .route({ method: 'DELETE', path: '/me/avatar', tags: ['Profile'] })
  .output(z.object({ profile: ProfileSchema }));

// Links: Profile → Links. Connections tier: read back only by you and by
// accepted connections (through connections.list), never on the card.
const listMyLinks = oc
  .route({ method: 'GET', path: '/me/links', tags: ['Profile'] })
  .output(z.object({ links: z.array(ProfileLinkSchema) }));

const replaceMyLinks = oc
  .route({ method: 'PUT', path: '/me/links', tags: ['Profile'] })
  .input(ProfileLinksInputSchema)
  // The whole list, in order, one transaction: platforms left out are
  // removed. Values must already be canonical (normalizeLinkValue).
  .output(z.object({ links: z.array(ProfileLinkSchema) }));

const deleteAccount = oc
  .route({ method: 'DELETE', path: '/me', tags: ['Profile'] })
  // Irreversible. The photo pointer is cleared, the avatar files swept
  // (Storage API), then delete_my_account(): profile, connections, requests,
  // blocks, hosted gatherings and memberships go; claimed tags are released
  // (unclaimed, scans erased).
  .output(z.object({ ok: z.literal(true) }));

const sendRequest = oc
  .route({ method: 'POST', path: '/connect-requests', tags: ['Connect'] })
  .input(z.object({ recipient_id: z.uuid() }))
  // Deliberately a bare ack: a request silently dropped by a block returns
  // the exact same shape as one that was stored. No signal, ever.
  .output(z.object({ ok: z.literal(true) }));

const listPendingRequests = oc
  .route({ method: 'GET', path: '/connect-requests/pending', tags: ['Connect'] })
  .output(z.object({ requests: z.array(ConnectRequestSchema) }));

const acceptRequest = oc
  .route({ method: 'POST', path: '/connect-requests/{id}/accept', tags: ['Connect'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.object({ connection: ConnectionSchema }));

const declineRequest = oc
  .route({ method: 'POST', path: '/connect-requests/{id}/decline', tags: ['Connect'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.object({ ok: z.literal(true) }));

const listConnections = oc
  .route({ method: 'GET', path: '/connections', tags: ['Connections'] })
  .output(z.object({ connections: z.array(ConnectionSchema) }));

const removeConnection = oc
  .route({ method: 'DELETE', path: '/connections/{id}', tags: ['Connections'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.object({ ok: z.literal(true) }));

const block = oc
  .route({ method: 'POST', path: '/blocks', tags: ['Blocks'] })
  .input(z.object({ user_id: z.uuid() }))
  .output(z.object({ ok: z.literal(true) }));

const unblock = oc
  .route({ method: 'DELETE', path: '/blocks/{user_id}', tags: ['Blocks'] })
  .input(z.object({ user_id: z.uuid() }))
  .output(z.object({ ok: z.literal(true) }));

const listBlocks = oc
  .route({ method: 'GET', path: '/blocks', tags: ['Blocks'] })
  .output(
    z.object({
      blocks: z.array(
        z.object({
          user: PublicProfileSchema,
          created_at: z.iso.datetime({ offset: true }),
        }),
      ),
    }),
  );

const createReport = oc
  .route({ method: 'POST', path: '/reports', tags: ['Reports'] })
  .input(CreateReportInputSchema)
  // A bare ack whatever the id: an id that is not a person in your domain
  // answers exactly like a stored report (no existence oracle). Reports are
  // read by the operator only, never by you or the person reported. 10 per
  // rolling day, then TOO_MANY_REQUESTS. `block: true` also blocks them.
  .output(z.object({ ok: z.literal(true) }));

const createGathering = oc
  .route({ method: 'POST', path: '/gatherings', tags: ['Gatherings'] })
  .input(CreateGatheringInputSchema)
  .output(z.object({ gathering: GatheringSchema }));

const getGathering = oc
  .route({ method: 'GET', path: '/gatherings/{id}', tags: ['Gatherings'] })
  .input(z.object({ id: z.uuid() }))
  // A signed-in user may read a gathering they can see: every one marked
  // `everyone`, and a `connections` one when they host it, are the host's
  // accepted connection, or are already going. Hidden (that, or a block
  // either way with the host) and nonexistent are the same NOT_FOUND. `members` is
  // the viewer's view (themself and their connections); `member_count` is
  // everyone.
  .output(
    z.object({
      gathering: GatheringSchema,
      members: z.array(GatheringMemberSchema),
      member_count: z.number().int().nonnegative(),
    }),
  );

const joinGathering = oc
  .route({ method: 'POST', path: '/gatherings/{id}/join', tags: ['Gatherings'] })
  .input(z.object({ id: z.uuid() }))
  // NOT_FOUND for a gathering the caller cannot see, exactly as for a
  // missing id. CONFLICT "Gathering is full" once going (the host included)
  // reaches `capacity`; already going is a no-op ack even then.
  .output(z.object({ ok: z.literal(true) }));

const leaveGathering = oc
  .route({ method: 'POST', path: '/gatherings/{id}/leave', tags: ['Gatherings'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.object({ ok: z.literal(true) }));

const listGatherings = oc
  .route({ method: 'GET', path: '/gatherings', tags: ['Gatherings'] })
  // What is happening in the domain: every upcoming gathering the caller may
  // see (RLS: the tenant, minus a block either way with the host, and a
  // `connections` gathering only for the host's connections and its members), in
  // start-time order. A bulletin board, not a directory: nothing ranks or
  // filters, and no row reveals a stranger's card. Paged: one page holds at
  // most 50, so its who-is-going lookup stays one bounded request however
  // many gatherings the domain has.
  .input(ListGatheringsInputSchema)
  .output(GatheringsPageSchema);

const listMyGatherings = oc
  .route({ method: 'GET', path: '/me/gatherings', tags: ['Gatherings'] })
  // The caller's own calendar: hosting or joined, past included.
  .output(z.object({ gatherings: z.array(GatheringListItemSchema) }));

const updateGathering = oc
  .route({ method: 'PATCH', path: '/gatherings/{id}', tags: ['Gatherings'] })
  .input(UpdateGatheringInputSchema)
  // Host-only; a non-host's patch is NOT_FOUND, same as a stranger's read.
  .output(z.object({ gathering: GatheringSchema }));

const removeGathering = oc
  .route({ method: 'DELETE', path: '/gatherings/{id}', tags: ['Gatherings'] })
  .input(z.object({ id: z.uuid() }))
  .output(z.object({ ok: z.literal(true) }));

// My tags: Profile → My tags, and the gathering detail's "point my tags here".
const listMyTags = oc
  .route({ method: 'GET', path: '/me/tags', tags: ['Tags'] })
  .output(z.object({ tags: z.array(TagSchema) }));

const updateMyTag = oc
  .route({ method: 'PATCH', path: '/me/tags/{uid}', tags: ['Tags'] })
  .input(UpdateMyTagInputSchema)
  // Not yours and nonexistent are the same NOT_FOUND.
  .output(z.object({ tag: TagSchema }));

// Your code: the tab bar's raised button. A QR-only tag claimed to the caller.
// get mints it on first use: idempotent, but NOT side-effect free, so
// never cache, prefetch or preload it. replace retires it and mints a new
// one, so every copy of the old code opens an inactive tag.
const getMyShareCode = oc
  .route({ method: 'GET', path: '/me/share-code', tags: ['Tags'] })
  .output(ShareCodeSchema);

const replaceMyShareCode = oc
  .route({ method: 'POST', path: '/me/share-code/replace', tags: ['Tags'] })
  .output(ShareCodeSchema);

// Push: this device's token, for the three transactional pushes (a request
// to you, yours accepted, people joined your gathering). Owner-only.
const registerPushToken = oc
  .route({ method: 'PUT', path: '/me/push-tokens', tags: ['Push'] })
  .input(RegisterPushTokenInputSchema)
  // Registers or refreshes; a token another account held moves to you.
  .output(z.object({ ok: z.literal(true) }));

const unregisterPushToken = oc
  .route({ method: 'DELETE', path: '/me/push-tokens', tags: ['Push'] })
  .input(UnregisterPushTokenInputSchema)
  // Turning pushes off, and signing out. Not yours is the same ok.
  .output(z.object({ ok: z.literal(true) }));

/** Session-scoped surface — every procedure requires a verified Supabase JWT. */
export const appContract = {
  profile: {
    get: getProfile,
    update: updateProfile,
    acceptTerms,
    uploadAvatar,
    removeAvatar,
    deleteAccount,
  },
  links: { listMine: listMyLinks, replace: replaceMyLinks },
  requests: {
    send: sendRequest,
    listPending: listPendingRequests,
    accept: acceptRequest,
    decline: declineRequest,
  },
  connections: { list: listConnections, remove: removeConnection },
  blocks: { block, unblock, list: listBlocks },
  reports: { create: createReport },
  gatherings: {
    create: createGathering,
    get: getGathering,
    join: joinGathering,
    leave: leaveGathering,
    list: listGatherings,
    listMine: listMyGatherings,
    update: updateGathering,
    remove: removeGathering,
  },
  tags: { listMine: listMyTags, update: updateMyTag },
  shareCode: { get: getMyShareCode, replace: replaceMyShareCode },
  push: { register: registerPushToken, unregister: unregisterPushToken },
};
