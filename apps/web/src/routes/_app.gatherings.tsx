import {
  isGatheringFull,
  WHEN_FILTER_EMPTY,
  WHEN_FILTER_LABELS,
  WHEN_FILTERS,
  whenWindow,
  type GatheringListItem,
  type WhenFilter,
} from '@withme/contract';
import { createFileRoute, Link, useLoaderData, useRouterState } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { shellStates } from '../components/CalmStates.tsx';
import { GatheringMeta } from '../components/GatheringMeta.tsx';
import { asSignedInAccount } from '../lib/account-scope.ts';
import { api } from '../lib/api.ts';
import { whenAndWhere } from '../lib/format-time.ts';
import { FULL_LABEL, audienceMark, goingLine, withLine } from '../lib/going.ts';

type View = 'yours';
/** Discover's window; `all` is the bare URL. */
type When = Exclude<WhenFilter, 'all'>;

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
 * Discover's "when" filter is one more (`?when=weekend`), turned into a
 * window of start times on this device, in its time zone (`whenWindow`).
 */
export const Route = createFileRoute('/_app/gatherings')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'Events — withme' }] }),
  // Always returns the key: a route's search is the parent's spread under
  // this result, so leaving `view` out would let a raw ?view=foo through.
  validateSearch: (search): { view?: View; when?: When } => ({
    view: search.view === 'yours' ? search.view : undefined,
    when: search.when !== 'all' && WHEN_FILTERS.includes(search.when as When)
      ? (search.when as When)
      : undefined,
  }),
  loaderDeps: ({ search }): { when: WhenFilter } => ({ when: search.when ?? 'all' }),
  // ssr: false (the _app layout), so the window is the viewer's own week.
  loader: async ({ deps }) => {
    const bounds = whenWindow(deps.when);
    const [feed, { gatherings: mine }] = await asSignedInAccount(() =>
      Promise.all([api.app.gatherings.list(bounds), api.app.gatherings.listMine()]),
    );
    return { happening: feed.gatherings, nextCursor: feed.next_cursor, bounds, mine };
  },
  component: GatheringsPage,
});

function GatheringsPage() {
  const { happening: firstPage, nextCursor: firstCursor, bounds, mine } = Route.useLoaderData();
  const { view, when = 'all' } = Route.useSearch();
  // A new window keeps the old rows up until its first page is in: busy, dimmed.
  const reloading = useRouterState({ select: (state) => state.isLoading });
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
      // The first page's window, not a fresh one: the feed pages through one window.
      const page = await api.app.gatherings.list({ ...bounds, cursor });
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
        <section className="discover" aria-label="Discover" aria-busy={reloading || undefined}>
          <nav className="when" aria-label="When">
            {WHEN_FILTERS.map((filter) => (
              <WhenLink key={filter} current={when} filter={filter} />
            ))}
          </nav>
          {happening.length === 0 ? (
            <p className="empty">{WHEN_FILTER_EMPTY[when]}</p>
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

/** One "when" window: a quiet pill, the current one ringed in ink. Each is
 * its own URL, so the current one is aria-current="page", as the segments;
 * switching replaces the history entry. */
function WhenLink({ current, filter }: { current: WhenFilter; filter: WhenFilter }) {
  const active = filter === current;
  return (
    <Link
      to="/gatherings"
      search={filter === 'all' ? {} : { when: filter }}
      replace
      className={active ? 'link when__item when__item--active' : 'link when__item'}
      aria-current={active ? 'page' : undefined}
      activeOptions={{ exact: true }}
      activeProps={{}}
    >
      {WHEN_FILTER_LABELS[filter]}
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
