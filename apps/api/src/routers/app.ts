import { ORPCError } from '@orpc/server';
import { GATHERINGS_PAGE_SIZE } from '@withme/contract';
import type { Connection, Gathering, Profile, ProfileLink, Tag } from '@withme/contract';
import {
  blockUser,
  decodeFeedCursor,
  deleteGathering,
  encodeFeedCursor,
  getGathering,
  getGatheringMemberCount,
  getOwnProfile,
  leaveGathering,
  listBlocks,
  listConnections,
  listGatheringMembers,
  listMyGatherings,
  listUpcomingGatherings,
  listOwnAvatarObjects,
  listOwnLinks,
  listOwnTags,
  listPendingRequests,
  registerPushToken,
  removeAvatarObjects,
  removeConnection,
  replaceOwnLinks,
  setOwnAvatarPath,
  unblockUser,
  unregisterPushToken,
  updateGathering,
  updateOwnTag,
  uploadAvatarObject,
  upsertOwnProfile,
} from '@withme/db/queries';
import { sniffAvatar } from '../lib/avatar.ts';
import { throwFromDbError } from '../lib/errors.ts';
import { appProcedure } from '../lib/orpc.ts';
import type { ApiContext } from '../lib/orpc.ts';

function isDbError(error: unknown): error is { code: string; message?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

async function run<T>(context: ApiContext, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isDbError(error)) throwFromDbError(error, context.logger);
    throw error;
  }
}

/**
 * Storage answers with HTTP statuses, not SQLSTATEs, so throwFromDbError
 * does not apply: log the status only, answer a fixed 500.
 */
async function storageCall<T>(context: ApiContext, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    context.logger.error('storage call failed', storageFailure(error));
    throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Internal error' });
  }
}

/**
 * Every HTTP failure is a StorageApiError, which carries both status (the
 * HTTP number) and statusCode (Storage's own string). A StorageUnknownError
 * is a network failure and sets neither, so the error's name is logged too:
 * it tells a request that never got an answer from one that got an odd one.
 */
function storageFailure(error: unknown): { name: string; status: string } {
  if (typeof error !== 'object' || error === null) return { name: 'unknown', status: 'unknown' };
  const { name, statusCode, status } = error as { name?: unknown; statusCode?: unknown; status?: unknown };
  return {
    name: typeof name === 'string' ? name : 'unknown',
    status:
      typeof statusCode === 'string' && statusCode !== ''
        ? statusCode
        : typeof status === 'number'
          ? String(status)
          : 'unknown',
  };
}

/** Best effort: a file the profile no longer points at is a stray, not a broken profile. */
async function removeQuietly(context: ApiContext, path: string): Promise<void> {
  try {
    await removeAvatarObjects(context.db, [path]);
  } catch (error) {
    context.logger.warn('stale avatar not removed', storageFailure(error));
  }
}

const getProfile = appProcedure.profile.get.handler(async ({ context }) => {
  const { userId } = context;
  const profile = await run(context, () => getOwnProfile(context.db, userId));
  return { profile: profile as Profile | null };
});

const updateProfile = appProcedure.profile.update.handler(async ({ input, context }) => {
  const { userId } = context;
  const profile = await run(context, () => upsertOwnProfile(context.db, userId, input));
  return { profile: profile as Profile };
});

const profileUploadAvatar = appProcedure.profile.uploadAvatar.handler(async ({ input, context }) => {
  const { userId } = context;
  const { file } = input;
  // z.file() already checked this at runtime. Under workers-types zod's File
  // type carries only size and type (File is a global class there, not a
  // globalThis property), so this guard is what types the bytes read.
  if (!(file instanceof Blob)) throw new ORPCError('BAD_REQUEST', { message: 'Unsupported image' });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffAvatar(bytes);
  if (!kind) throw new ORPCError('BAD_REQUEST', { message: 'Unsupported image' });

  const existing = await run(context, () => getOwnProfile(context.db, userId));
  if (!existing) throw new ORPCError('BAD_REQUEST', { message: 'Profile required' });

  // A fresh name every time: objects are immutable (no update policy).
  const path = `${userId}/${crypto.randomUUID()}.${kind.ext}`;
  await storageCall(context, () => uploadAvatarObject(context.db, path, bytes, kind.contentType));

  // Two systems, so no single RPC: compensate instead. A failed pointer
  // update removes the file it would have pointed at.
  let profile: Awaited<ReturnType<typeof setOwnAvatarPath>>;
  try {
    profile = await run(context, () => setOwnAvatarPath(context.db, userId, path));
  } catch (error) {
    await removeQuietly(context, path);
    throw error;
  }
  if (existing.avatar_path) await removeQuietly(context, existing.avatar_path);
  context.logger.info('avatar uploaded');
  return { profile: profile as Profile };
});

const profileRemoveAvatar = appProcedure.profile.removeAvatar.handler(async ({ context }) => {
  const { userId } = context;
  const existing = await run(context, () => getOwnProfile(context.db, userId));
  if (!existing) throw new ORPCError('BAD_REQUEST', { message: 'Profile required' });
  const profile = await run(context, () => setOwnAvatarPath(context.db, userId, null));
  if (existing.avatar_path) await removeQuietly(context, existing.avatar_path);
  return { profile: profile as Profile };
});

const profileDeleteAccount = appProcedure.profile.deleteAccount.handler(async ({ context }) => {
  const { userId } = context;
  // 1. Clear the pointer first, so a failure in a later step never leaves the
  //    card pointing at a file that is gone. No pointer, nothing to clear.
  const existing = await run(context, () => getOwnProfile(context.db, userId));
  if (existing?.avatar_path) await run(context, () => setOwnAvatarPath(context.db, userId, null));
  // 2. Sweep the files, through the Storage API and the caller's own JWT: a
  //    SQL delete on storage.objects would orphan the blobs. Paged and bounded.
  for (let page = 0; ; page++) {
    const paths = await storageCall(context, () => listOwnAvatarObjects(context.db, userId));
    if (paths.length === 0) break;
    if (page === 10) {
      context.logger.error('avatar folder did not empty');
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Internal error' });
    }
    await storageCall(context, () => removeAvatarObjects(context.db, paths));
  }
  // 3. Then the account itself; the cascades do the rest.
  const { error } = await context.db.rpc('delete_my_account');
  if (error) throwFromDbError(error, context.logger);
  context.logger.info('account deleted');
  return { ok: true as const };
});

// Profile → Links. The database stores only canonical values (the CHECK),
// and the contract admits only those, so a value here is already in shape.
const linksListMine = appProcedure.links.listMine.handler(async ({ context }) => {
  const { userId } = context;
  const links = await run(context, () => listOwnLinks(context.db, userId));
  return { links: links as ProfileLink[] };
});

const linksReplace = appProcedure.links.replace.handler(async ({ input, context }) => {
  const links = await run(context, () => replaceOwnLinks(context.db, input.links));
  return { links: links as ProfileLink[] };
});

const sendRequest = appProcedure.requests.send.handler(async ({ input, context }) => {
  const { error } = await context.db.rpc('send_connect_request', {
    p_recipient: input.recipient_id,
  });
  if (error) throwFromDbError(error, context.logger);
  return { ok: true as const };
});

const listPending = appProcedure.requests.listPending.handler(async ({ context }) => {
  const rows = await run(context, () => listPendingRequests(context.db));
  return {
    requests: rows.map((row) => ({
      id: row.id,
      requester: row.requester,
      status: 'pending' as const,
      created_at: row.created_at,
      expires_at: row.expires_at,
    })),
  };
});

const acceptRequest = appProcedure.requests.accept.handler(async ({ input, context }) => {
  const { data, error } = await context.db.rpc('accept_connect_request', {
    p_request_id: input.id,
  });
  if (error) throwFromDbError(error, context.logger);
  return { connection: data as unknown as Connection };
});

const declineRequest = appProcedure.requests.decline.handler(async ({ input, context }) => {
  const { error } = await context.db.rpc('decline_connect_request', { p_request_id: input.id });
  if (error) throwFromDbError(error, context.logger);
  return { ok: true as const };
});

const connectionsList = appProcedure.connections.list.handler(async ({ context }) => {
  const { userId } = context;
  const connections = await run(context, () => listConnections(context.db, userId));
  return { connections: connections as Connection[] };
});

const connectionsRemove = appProcedure.connections.remove.handler(async ({ input, context }) => {
  await run(context, () => removeConnection(context.db, input.id));
  return { ok: true as const };
});

const block = appProcedure.blocks.block.handler(async ({ input, context }) => {
  const { userId } = context;
  await run(context, () => blockUser(context.db, userId, input.user_id));
  context.logger.info('user blocked');
  return { ok: true as const };
});

const unblock = appProcedure.blocks.unblock.handler(async ({ input, context }) => {
  const { userId } = context;
  await run(context, () => unblockUser(context.db, userId, input.user_id));
  return { ok: true as const };
});

const blocksList = appProcedure.blocks.list.handler(async ({ context }) => {
  const blocks = await run(context, () => listBlocks(context.db));
  return { blocks };
});

const gatheringsCreate = appProcedure.gatherings.create.handler(async ({ input, context }) => {
  const { data, error } = await context.db.rpc('create_gathering', {
    p_title: input.title,
    p_starts_at: input.starts_at,
    p_location: input.location ?? undefined,
  });
  if (error) throwFromDbError(error, context.logger);
  context.logger.info('gathering created');
  return { gathering: data as Gathering };
});

const gatheringsGet = appProcedure.gatherings.get.handler(async ({ input, context }) => {
  const gathering = await run(context, () => getGathering(context.db, input.id));
  if (!gathering) {
    // invisible (blocked either way with the host) and nonexistent are the same answer
    throw new ORPCError('NOT_FOUND', { message: 'Not found' });
  }
  // members: the viewer and their connections; member_count: everyone
  const [members, member_count] = await Promise.all([
    run(context, () => listGatheringMembers(context.db, input.id)),
    run(context, () => getGatheringMemberCount(context.db, input.id)),
  ]);
  return { gathering, members, member_count };
});

const gatheringsJoin = appProcedure.gatherings.join.handler(async ({ input, context }) => {
  const { error } = await context.db.rpc('join_gathering', { p_gathering_id: input.id });
  if (error) throwFromDbError(error, context.logger);
  return { ok: true as const };
});

const gatheringsLeave = appProcedure.gatherings.leave.handler(async ({ input, context }) => {
  const { userId } = context;
  await run(context, () => leaveGathering(context.db, input.id, userId));
  return { ok: true as const };
});

const gatheringsList = appProcedure.gatherings.list.handler(async ({ input, context }) => {
  const { userId } = context;
  const cursor = input?.cursor === undefined ? null : decodeFeedCursor(input.cursor);
  if (input?.cursor !== undefined && cursor === null) {
    throw new ORPCError('BAD_REQUEST', { message: 'Invalid cursor' });
  }
  const limit = input?.limit ?? GATHERINGS_PAGE_SIZE;
  const page = await run(context, () =>
    listUpcomingGatherings(context.db, userId, { cursor, limit }),
  );
  return {
    gatherings: page.gatherings,
    next_cursor: page.nextCursor ? encodeFeedCursor(page.nextCursor) : null,
  };
});

const gatheringsListMine = appProcedure.gatherings.listMine.handler(async ({ context }) => {
  const { userId } = context;
  const gatherings = await run(context, () => listMyGatherings(context.db, userId));
  return { gatherings };
});

const gatheringsUpdate = appProcedure.gatherings.update.handler(async ({ input, context }) => {
  const { id, ...patch } = input;
  const gathering = await run(context, () => updateGathering(context.db, id, patch));
  if (!gathering) {
    // not the host, or not visible at all: the same answer
    throw new ORPCError('NOT_FOUND', { message: 'Not found' });
  }
  return { gathering };
});

const gatheringsRemove = appProcedure.gatherings.remove.handler(async ({ input, context }) => {
  await run(context, () => deleteGathering(context.db, input.id));
  return { ok: true as const };
});

const tagsListMine = appProcedure.tags.listMine.handler(async ({ context }) => {
  const tags = await run(context, () => listOwnTags(context.db));
  return { tags: tags as Tag[] };
});

const tagsUpdate = appProcedure.tags.update.handler(async ({ input, context }) => {
  const { uid, ...patch } = input;
  const tag = await run(context, () => updateOwnTag(context.db, uid, patch));
  if (!tag) {
    // not yours and nonexistent are the same answer
    throw new ORPCError('NOT_FOUND', { message: 'Not found' });
  }
  return { tag: tag as Tag };
});

const pushRegister = appProcedure.push.register.handler(async ({ input, context }) => {
  await run(context, () => registerPushToken(context.db, input.token, input.platform));
  return { ok: true as const };
});

const pushUnregister = appProcedure.push.unregister.handler(async ({ input, context }) => {
  await run(context, () => unregisterPushToken(context.db, input.token));
  return { ok: true as const };
});

export const appRouter = {
  profile: {
    get: getProfile,
    update: updateProfile,
    uploadAvatar: profileUploadAvatar,
    removeAvatar: profileRemoveAvatar,
    deleteAccount: profileDeleteAccount,
  },
  links: { listMine: linksListMine, replace: linksReplace },
  requests: {
    send: sendRequest,
    listPending: listPending,
    accept: acceptRequest,
    decline: declineRequest,
  },
  connections: { list: connectionsList, remove: connectionsRemove },
  blocks: { block, unblock, list: blocksList },
  gatherings: {
    create: gatheringsCreate,
    get: gatheringsGet,
    join: gatheringsJoin,
    leave: gatheringsLeave,
    list: gatheringsList,
    listMine: gatheringsListMine,
    update: gatheringsUpdate,
    remove: gatheringsRemove,
  },
  tags: { listMine: tagsListMine, update: tagsUpdate },
  push: { register: pushRegister, unregister: pushUnregister },
};
