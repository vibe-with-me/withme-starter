import type { Destination, Gathering, GatheringMember, Tag } from '@withme/contract';
import { createFileRoute, useLoaderData, useNavigate, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { shellStates } from '../components/CalmStates.tsx';
import { Avatar } from '../components/ProfileCard.tsx';
import { ReportButton, reportThanks } from '../components/ReportDialog.tsx';
import { asSignedInAccount } from '../lib/account-scope.ts';
import { api } from '../lib/api.ts';
import { cardLine } from '../lib/card-line.ts';
import { formatStartsAt, toDateTimeLocal, whenAndWhere } from '../lib/format-time.ts';
import { goingLine } from '../lib/going.ts';

type LoaderResult =
  | { kind: 'detail'; gathering: Gathering; members: GatheringMember[]; memberCount: number }
  // Blocked either way with the host, or missing — the same NOT_FOUND, so
  // the page offers a calm join (which answers "not available": a hidden
  // gathering cannot be joined) instead of an error. A stranger who found
  // the gathering in the feed gets the detail, with Join on it.
  | { kind: 'not_found' };

/** Display-only hints carried from the tag resolver, shown before joining. Never data. */
interface Hints {
  title?: string;
  starts_at?: string;
}

export const Route = createFileRoute('/_app/gatherings_/$id')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'Gathering — withme' }] }),
  validateSearch: (search): Hints => {
    const hints: Hints = {};
    if (typeof search.title === 'string' && search.title !== '') {
      hints.title = search.title.slice(0, 120);
    }
    if (typeof search.starts_at === 'string' && search.starts_at !== '') {
      hints.starts_at = search.starts_at.slice(0, 40);
    }
    return hints;
  },
  loader: async ({ params }): Promise<LoaderResult> => {
    try {
      const { gathering, members, member_count } = await asSignedInAccount(() =>
        api.app.gatherings.get({ id: params.id }),
      );
      return { kind: 'detail', gathering, members, memberCount: member_count };
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') return { kind: 'not_found' };
      throw error;
    }
  },
  component: GatheringPage,
});

function GatheringPage() {
  const result = Route.useLoaderData();
  // The layout fetched the viewer's profile once; every _app child may read it.
  const { profile } = useLoaderData({ from: '/_app' });
  if (result.kind === 'not_found') return <JoinCard />;
  return (
    <GatheringDetail
      gathering={result.gathering}
      members={result.members}
      memberCount={result.memberCount}
      viewerId={profile?.id ?? null}
    />
  );
}

/** The gathering is hidden (blocked, or gone): offer the join the tag promised; it answers "not available". */
function JoinCard() {
  const { id } = Route.useParams();
  const { title, starts_at } = Route.useSearch();
  const router = useRouter();
  const [join, setJoin] = useState<'idle' | 'joining' | 'failed' | 'unavailable'>('idle');
  const hint = [title ?? null, starts_at ? formatStartsAt(starts_at) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="card card--settle">
      <h1>Join this gathering?</h1>
      {hint ? <p className="hint">{hint}</p> : null}
      {join === 'unavailable' ? (
        <p className="hint">This gathering isn't available.</p>
      ) : (
        <button
          type="button"
          className="btn btn--connect"
          disabled={join === 'joining'}
          onClick={async () => {
            setJoin('joining');
            try {
              await api.app.gatherings.join({ id });
              // The loader now sees the gathering as a member; wait for the
              // re-fetch (sync) so this card never lingers over stale data.
              await router.invalidate({ sync: true });
            } catch (error) {
              setJoin((error as { code?: string }).code === 'NOT_FOUND' ? 'unavailable' : 'failed');
            }
          }}
        >
          {join === 'joining' ? 'Joining…' : join === 'failed' ? 'Try again' : 'Join'}
        </button>
      )}
    </div>
  );
}

interface GatheringPatch {
  title: string;
  starts_at: string;
  location: string | null;
}

function GatheringDetail({
  gathering,
  members,
  memberCount,
  viewerId,
}: {
  gathering: Gathering;
  members: GatheringMember[];
  memberCount: number;
  viewerId: string | null;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete' | 'confirm-block'>('view');
  // Set after a report; a report that also blocked hides the gathering, so
  // the page then offers only the way back.
  const [reported, setReported] = useState<null | { blocked: boolean }>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isHost = viewerId === gathering.host_id;
  // The member list is the viewer's view, so the viewer's own row is in it iff they joined.
  const isMember = viewerId !== null && members.some((member) => member.profile.id === viewerId);

  async function join() {
    setBusy(true);
    setActionError(null);
    try {
      await api.app.gatherings.join({ id: gathering.id });
      // Wait for the re-fetch (sync) so Join never lingers over a joined gathering.
      await router.invalidate({ sync: true });
    } catch (error) {
      setActionError(
        (error as { code?: string }).code === 'NOT_FOUND'
          ? "This gathering isn't available."
          : 'That didn’t go through. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(patch: GatheringPatch) {
    setBusy(true);
    setActionError(null);
    try {
      await api.app.gatherings.update({ id: gathering.id, ...patch });
      // Wait for the re-fetch (sync) before leaving edit mode so view never shows the old title.
      await router.invalidate({ sync: true });
      setMode('view');
    } catch {
      setActionError('Could not save. Check the fields and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setActionError(null);
    try {
      await api.app.gatherings.remove({ id: gathering.id });
      // Replace, so Back does not land on a gathering that no longer exists.
      navigate({ to: '/gatherings', replace: true });
    } catch {
      setActionError('That didn’t go through. Try again.');
      setBusy(false);
    }
  }

  async function blockHost() {
    setBusy(true);
    setActionError(null);
    try {
      await api.app.blocks.block({ user_id: gathering.host_id });
      // The gathering is hidden from a blocker: back to the list (replace,
      // so Back does not return to a gathering that is now NOT_FOUND).
      navigate({ to: '/gatherings', replace: true });
    } catch {
      setActionError('That didn’t go through. Try again.');
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    setActionError(null);
    try {
      await api.app.gatherings.leave({ id: gathering.id });
      // Back to the list (replace, so Back does not return here): the
      // gathering is still visible, but the tab is where it is listed.
      navigate({ to: '/gatherings', replace: true });
    } catch {
      setActionError('That didn’t go through. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        {mode === 'edit' ? (
          <EditForm
            gathering={gathering}
            busy={busy}
            onSave={save}
            onCancel={() => setMode('view')}
          />
        ) : (
          <>
            <h1>{gathering.title}</h1>
            <p className="hint">{whenAndWhere(gathering)}</p>
            <p className="hint">{goingLine(memberCount)}</p>
          </>
        )}
        {/* Members only: a tag whose owner is not a member degrades to the
            profile card. Outside the ternary so it stays mounted across
            Edit/Cancel and does not refetch the viewer's tags; hidden, not
            unmounted, while editing. */}
        {isMember ? (
          <div hidden={mode === 'edit'}>
            <TagPointer gatheringId={gathering.id} />
          </div>
        ) : null}
        {actionError ? (
          <p className="form-error" role="alert">
            {actionError}
          </p>
        ) : null}
        {mode === 'view' && isHost ? (
          <div className="row-actions">
            <button
              type="button"
              className="btn btn--quiet"
              disabled={busy}
              onClick={() => setMode('edit')}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn--quiet"
              disabled={busy}
              onClick={() => setMode('confirm-delete')}
            >
              Delete gathering
            </button>
          </div>
        ) : null}
        {mode === 'confirm-delete' ? (
          <>
            <p className="bio">
              Delete this gathering? Members lose it, and tags pointing here fall back to your
              profile.
            </p>
            <div className="row-actions">
              <button type="button" className="btn" disabled={busy} onClick={remove}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                disabled={busy}
                onClick={() => setMode('view')}
              >
                Keep
              </button>
            </div>
          </>
        ) : null}
        {mode === 'view' && isMember && !isHost && !reported?.blocked ? (
          <button type="button" className="btn btn--quiet" disabled={busy} onClick={leave}>
            {busy ? 'Leaving…' : 'Leave gathering'}
          </button>
        ) : null}
        {/* Joining is the consent moment: the accent's job, as on the resolver. */}
        {mode === 'view' && !isMember && !reported?.blocked ? (
          <button type="button" className="btn btn--connect" disabled={busy} onClick={join}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        ) : null}
        {/* Report and Block (Guideline 1.2): everyone sees a gathering, so
            anyone but the host can report it or block the person behind it. */}
        {reported ? (
          <>
            <p className="hint" role="status">
              {reportThanks('the host', reported.blocked)}
            </p>
            {reported.blocked ? (
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => navigate({ to: '/gatherings', replace: true })}
              >
                Back to gatherings
              </button>
            ) : null}
          </>
        ) : null}
        {mode === 'view' && !isHost && !reported ? (
          <div className="row-actions">
            <ReportButton
              profileId={gathering.host_id}
              gatheringId={gathering.id}
              name="the host"
              onDone={(blocked) => setReported({ blocked })}
            />
            <button
              type="button"
              className="btn btn--quiet"
              disabled={busy}
              onClick={() => setMode('confirm-block')}
            >
              Block host
            </button>
          </div>
        ) : null}
        {mode === 'confirm-block' ? (
          <>
            <p className="bio">
              Block the host? This gathering and any they host disappear for you, and they aren’t
              told. You can undo it in Connections → Blocked.
            </p>
            <div className="row-actions">
              <button type="button" className="btn" disabled={busy} onClick={blockHost}>
                {busy ? 'Blocking…' : 'Block'}
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                disabled={busy}
                onClick={() => setMode('view')}
              >
                Cancel
              </button>
            </div>
          </>
        ) : null}
      </div>

      <h2 className="section-title">Who's going</h2>
      <p className="hint">
        {members.length === 0
          ? "You'll see the people you're connected with here."
          : "The people you're connected with. Everyone else, you meet there."}
      </p>
      {members.map((member) => {
        const line = cardLine(member.profile);
        return (
          <div className="row" key={member.profile.id}>
            <Avatar profile={member.profile} size="row" />
            <div className="row-body">
              <span className="name">{member.profile.display_name}</span>
              {line ? <span className="sub">{line}</span> : null}
              {member.profile.id === gathering.host_id ? (
                <span className="sub">Host</span>
              ) : member.profile.bio ? (
                <span className="sub">{member.profile.bio}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EditForm({
  gathering,
  busy,
  onSave,
  onCancel,
}: {
  gathering: Gathering;
  busy: boolean;
  onSave: (patch: GatheringPatch) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(gathering.title);
  const [startsAt, setStartsAt] = useState(() => toDateTimeLocal(new Date(gathering.starts_at)));
  const [location, setLocation] = useState(gathering.location ?? '');
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          title: title.trim(),
          starts_at: new Date(startsAt).toISOString(),
          location: location.trim() === '' ? null : location.trim(),
        });
      }}
    >
      <div className="field">
        <label htmlFor="edit_title">Title</label>
        <input
          id="edit_title"
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="edit_starts_at">Starts</label>
        <input
          id="edit_starts_at"
          type="datetime-local"
          required
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="edit_location">Location (optional)</label>
        <input
          id="edit_location"
          maxLength={160}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>
      <div className="row-actions">
        <button className="btn" type="submit" disabled={busy || !title.trim() || !startsAt}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn--quiet" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Members aim their own claimed tags at this gathering so a tap joins it.
 * Through the contract (app.tags.listMine / app.tags.update): the web app
 * owns no data access, even for single-row owner CRUD. The database still
 * enforces it — RLS plus the (destination, status) column grant.
 */
function TagPointer({ gatheringId }: { gatheringId: string }) {
  const [tags, setTags] = useState<Tag[] | 'loading' | 'failed'>('loading');
  const [busy, setBusy] = useState(false);
  const [pointError, setPointError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { tags: mine } = await api.app.tags.listMine();
      setTags(mine.filter((tag) => tag.status === 'claimed'));
    } catch {
      setTags('failed');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (tags === 'loading' || tags === 'failed') return null;
  if (tags.length === 0) return <p className="hint">Claim a tag to point it at this gathering.</p>;

  const pointsHere = (tag: Tag) =>
    tag.destination?.type === 'gathering' && tag.destination.gathering_id === gatheringId;
  const here = tags.filter(pointsHere);
  // After a partial failure the tags are split; offer both actions so it can be finished.
  const elsewhere = tags.filter((tag) => !pointsHere(tag));

  async function repoint(targets: Tag[], destination: Destination) {
    setBusy(true);
    setPointError(null);
    const results = await Promise.allSettled(
      targets.map((tag) => api.app.tags.update({ uid: tag.uid, destination })),
    );
    if (results.some((result) => result.status === 'rejected')) {
      setPointError('That didn’t go through. Try again.');
    }
    await load();
    setBusy(false);
  }

  const forward =
    elsewhere.length > 0 ? (
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => repoint(elsewhere, { type: 'gathering', gathering_id: gatheringId })}
      >
        Point my tags at this gathering
      </button>
    ) : null;
  const back =
    here.length > 0 ? (
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => repoint(here, { type: 'profile' })}
      >
        Point my tags back to my profile
      </button>
    ) : null;

  return (
    <>
      {forward && back ? (
        <div className="row-actions">
          {back}
          {forward}
        </div>
      ) : (
        (back ?? forward)
      )}
      {pointError ? (
        <p className="form-error" role="alert">
          {pointError}
        </p>
      ) : null}
    </>
  );
}
