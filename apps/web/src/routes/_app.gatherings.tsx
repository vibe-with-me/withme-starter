import { isGatheringFull, type GatheringListItem } from '@withme/contract';
import { createFileRoute, Link, useLoaderData } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { shellStates } from '../components/CalmStates.tsx';
import { GatheringMeta } from '../components/GatheringMeta.tsx';
import { asSignedInAccount } from '../lib/account-scope.ts';
import { api } from '../lib/api.ts';
import { whenAndWhere } from '../lib/format-time.ts';
import { FULL_LABEL, audienceMark, goingLine, withLine } from '../lib/going.ts';

type View = 'yours';

/**
 * The Events tab: what is happening in the domain, and your own calendar,
 * behind two in-page segments. "Discover" is every upcoming gathering the
 * viewer may see — a bulletin board, not a directory: a row carries the
 * headcount and names only the viewer's connections among the members
 * (docs/the-slice.md). "Yours" is what you host or are going to, then what
 * is past. The tap is still how people meet; the list is how they find out
 * where. Creating one is its own page (_app.gatherings_.new.tsx).
 *
 * The segment is a search param, as on Connections: each list is a URL that
 * a reload or a link keeps, and switching replaces the history entry.
 */
export const Route = createFileRoute('/_app/gatherings')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'Events — withme' }] }),
  // Always returns the key: a route's search is the parent's spread under
  // this result, so leaving `view` out would let a raw ?view=foo through.
  validateSearch: (search): { view?: View } => ({
    view: search.view === 'yours' ? search.view : undefined,
  }),
  loader: async () => {
    const [feed, { gatherings: mine }] = await asSignedInAccount(() =>
      Promise.all([api.app.gatherings.list(), api.app.gatherings.listMine()]),
    );
    return { happening: feed.gatherings, nextCursor: feed.next_cursor, mine };
  },
  component: GatheringsPage,
});

function GatheringsPage() {
  const { happening: firstPage, nextCursor: firstCursor, mine } = Route.useLoaderData();
  const { view } = Route.useSearch();
  // Later feed pages, appended under the loader's first one. A re-load (an
  // account switch, a return from a gathering) starts the feed over from its
  // first page.
  const [laterPages, setLaterPages] = useState<GatheringListItem[]>([]);
  const [cursor, setCursor] = useState(firstCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [pagedFrom, setPagedFrom] = useState(firstPage);
  // The first page a Load more was asked for: an answer that arrives after
  // the loader replaced it is dropped, or it would append an old page (and an
  // old cursor) to the new feed.
  const firstPageRef = useRef(firstPage);
  firstPageRef.current = firstPage;
  if (pagedFrom !== firstPage) {
    // A new first page: drop what was appended to the old one (during render,
    // so the stale pages never paint under the new first page).
    setPagedFrom(firstPage);
    setLaterPages([]);
    setCursor(firstCursor);
    setMoreError(false);
  }
  const happening = [...firstPage, ...laterPages];
  // The layout fetched the viewer's profile once; every _app child may read it.
  const { profile } = useLoaderData({ from: '/_app' });
  const viewerId = profile?.id ?? null;

  const now = Date.now();
  const upcoming = mine.filter((g) => Date.parse(g.starts_at) >= now);
  // most recent first
  const past = mine.filter((g) => Date.parse(g.starts_at) < now).toReversed();

  async function loadMore() {
    if (cursor === null) return;
    const askedFor = firstPage;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await api.app.gatherings.list({ cursor });
      if (firstPageRef.current !== askedFor) return;
      setLaterPages((pages) => [...pages, ...page.gatherings]);
      setCursor(page.next_cursor);
    } catch {
      if (firstPageRef.current === askedFor) setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="stack">
      <h1 className="section-title">Events</h1>
      <Link className="btn" to="/gatherings/new">
        New gathering
      </Link>
      <nav className="segments" aria-label="Events lists">
        <SegmentLink current={view} label="Discover" />
        <SegmentLink current={view} view="yours" label="Yours" />
      </nav>

      {view === 'yours' ? (
        <section aria-label="Yours">
          {mine.length === 0 ? (
            <p className="empty">Join one from Discover, or create your own.</p>
          ) : upcoming.length === 0 ? (
            <p className="empty">Nothing coming up.</p>
          ) : (
            upcoming.map((g) => <GatheringRow key={g.id} gathering={g} viewerId={viewerId} />)
          )}
          {past.length > 0 ? (
            <>
              <h2 className="section-title">Past</h2>
              {past.map((g) => (
                <GatheringRow key={g.id} gathering={g} viewerId={viewerId} />
              ))}
            </>
          ) : null}
        </section>
      ) : (
        <section aria-label="Discover">
          {happening.length === 0 ? (
            <p className="empty">Nothing happening yet. Create the first one.</p>
          ) : (
            happening.map((g) => <GatheringRow key={g.id} gathering={g} viewerId={viewerId} />)
          )}
          {moreError ? (
            <p className="form-error" role="alert">
              Could not load more. Try again.
            </p>
          ) : null}
          {cursor !== null ? (
            <button
              className="btn btn--quiet"
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </section>
      )}
    </div>
  );
}

/**
 * One segment (mirrors Connections' SegmentLink). Active = ink and a 2px ink
 * underline, never the accent; it follows the validated view, so a stale
 * ?view=foo still shows Discover as current.
 */
function SegmentLink({
  current,
  view,
  label,
}: {
  current: View | undefined;
  view?: View;
  label: string;
}) {
  const active = view === current;
  return (
    <Link
      to="/gatherings"
      search={view ? { view } : {}}
      replace
      className={active ? 'segments__item segments__item--active' : 'segments__item'}
      aria-current={active ? 'page' : undefined}
      // exact keeps the router's own active marking from disagreeing:
      // without it, "Discover" would partially match ?view=yours too.
      activeOptions={{ exact: true }}
      activeProps={{}}
    >
      {label}
    </Link>
  );
}

function GatheringRow({
  gathering,
  viewerId,
}: {
  gathering: GatheringListItem;
  viewerId: string | null;
}) {
  const mark =
    viewerId !== null && gathering.host_id === viewerId
      ? 'Hosting'
      : gathering.is_member
        ? 'Going'
        : null;
  const names = withLine(gathering.members, viewerId);
  // Full only matters to someone who could still join.
  const full = !gathering.is_member && isGatheringFull(gathering, gathering.member_count);
  const tail = [
    goingLine(gathering.member_count, gathering.capacity),
    full ? FULL_LABEL : null,
    audienceMark(gathering.visibility),
  ];
  return (
    <div className="row">
      <div className="row-body">
        <span className="name">{gathering.title}</span>
        <span className="sub">
          <GatheringMeta
            line={whenAndWhere(gathering, [mark], tail)}
          />
        </span>
        {names ? <span className="sub">{names}</span> : null}
      </div>
      <div className="row-actions">
        <Link className="btn btn--quiet" to="/gatherings/$id" params={{ id: gathering.id }}>
          Open
        </Link>
      </div>
    </div>
  );
}
