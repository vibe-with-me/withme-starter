import type { MetAtGathering, ProfileLink, PublicProfile } from '@withme/contract';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { shellStates } from '../components/CalmStates.tsx';
import { LinkList } from '../components/Links.tsx';
import { ListLadder } from '../components/ListStates.tsx';
import { Avatar } from '../components/ProfileCard.tsx';
import { ReportButton, reportThanks } from '../components/ReportDialog.tsx';
import { asSignedInAccount } from '../lib/account-scope.ts';
import { api } from '../lib/api.ts';
import { cardLine } from '../lib/card-line.ts';
import { metAtLine } from '../lib/format-time.ts';
import { settled } from '../lib/loaded.ts';

type Tab = 'requests' | 'blocked';

/**
 * Connections: three lists behind in-page segments (Connections, Requests,
 * Blocked). The segment is a search param, so each list is a URL that a
 * reload or a link keeps; switching replaces the history entry rather than
 * stacking one per tap. Each list settles on its own and climbs its own
 * ladder.
 */
export const Route = createFileRoute('/_app/connections')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'Connections — withme' }] }),
  // Always returns the key: a route's search is the parent's spread under
  // this result, so leaving `tab` out would let a raw ?tab=foo through.
  validateSearch: (search): { tab?: Tab } => ({
    tab: search.tab === 'requests' || search.tab === 'blocked' ? search.tab : undefined,
  }),
  loader: async () => {
    const [pending, connections, blocks] = await asSignedInAccount(() =>
      Promise.all([
        settled(api.app.requests.listPending().then(({ requests }) => requests)),
        settled(api.app.connections.list().then(({ connections: list }) => list)),
        settled(api.app.blocks.list().then(({ blocks: list }) => list)),
      ]),
    );
    return { pending, connections, blocks };
  },
  component: ConnectionsPage,
});

function ConnectionsPage() {
  const { pending, connections, blocks } = Route.useLoaderData();
  const { tab } = Route.useSearch();
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = (id: string) => busyIds.has(id);
  // Your own inbox, counted for you alone: the one number on this page.
  const requestCount = pending.ok ? pending.data.length : 0;

  async function act(id: string, work: () => Promise<unknown>) {
    setBusyIds((prev) => new Set(prev).add(id));
    setActionError(null);
    try {
      await work();
      await router.invalidate();
    } catch {
      setActionError('That didn’t go through. Try again.');
      // Reload anyway: a failure may mean the row is stale (a request
      // withdrawn, a connection already gone). The message is page state,
      // so it stays through the reload.
      await router.invalidate({ sync: true });
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  // Said at page level: a report that also blocked removes its row.
  function reported(name: string) {
    return (blocked: boolean) => {
      setNotice(reportThanks(name, blocked));
      if (blocked) void router.invalidate();
    };
  }

  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="stack">
      <h1 className="section-title">Connections</h1>
      <nav className="segments" aria-label="Connections lists">
        <SegmentLink current={tab} label="Connections" />
        <SegmentLink current={tab} tab="requests" label="Requests" count={requestCount} />
        <SegmentLink current={tab} tab="blocked" label="Blocked" />
      </nav>
      {actionError ? (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      ) : null}
      {/* Always mounted: a live region created with its message is not announced. */}
      <p className="hint" role="status">
        {notice}
      </p>

      {tab === 'requests' ? (
        <ListLadder
          state={pending}
          what="your requests"
          empty="No requests right now."
          retrying={retrying}
          onRetry={retry}
        >
          {(requests) =>
            requests.map((request) => (
              <PersonRow key={request.id} profile={request.requester} sub={request.requester.bio}>
                {/* Accepting completes the handshake — the accent's job. */}
                <button
                  type="button"
                  className="btn btn--connect"
                  disabled={busy(request.id)}
                  onClick={() => act(request.id, () => api.app.requests.accept({ id: request.id }))}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="btn btn--quiet"
                  disabled={busy(request.id)}
                  onClick={() => act(request.id, () => api.app.requests.decline({ id: request.id }))}
                >
                  Decline
                </button>
                <ReportButton
                  profileId={request.requester.id}
                  name={request.requester.display_name}
                  onDone={reported(request.requester.display_name)}
                />
              </PersonRow>
            ))
          }
        </ListLadder>
      ) : tab === 'blocked' ? (
        <ListLadder
          state={blocks}
          what="your block list"
          empty="No one is blocked."
          retrying={retrying}
          onRetry={retry}
        >
          {(list) =>
            list.map((block) => (
              <PersonRow key={block.user.id} profile={block.user}>
                <button
                  type="button"
                  className="btn btn--quiet"
                  disabled={busy(block.user.id)}
                  onClick={() =>
                    act(block.user.id, () => api.app.blocks.unblock({ user_id: block.user.id }))
                  }
                >
                  Unblock
                </button>
                <ReportButton
                  profileId={block.user.id}
                  name={block.user.display_name}
                  canBlock={false}
                  onDone={reported(block.user.display_name)}
                />
              </PersonRow>
            ))
          }
        </ListLadder>
      ) : (
        <ListLadder
          state={connections}
          what="your connections"
          empty="No connections yet. Tap someone's tag to start."
          retrying={retrying}
          onRetry={retry}
        >
          {(list) =>
            list.map((connection) => (
              <PersonRow
                key={connection.id}
                profile={connection.profile}
                sub={connection.profile.bio}
                metAt={connection.gathering}
                links={connection.links}
              >
                <button
                  type="button"
                  className="btn btn--quiet"
                  disabled={busy(connection.id)}
                  onClick={() =>
                    act(connection.id, () => api.app.connections.remove({ id: connection.id }))
                  }
                >
                  Remove
                </button>
                <button
                  type="button"
                  className="btn btn--quiet"
                  disabled={busy(connection.id)}
                  onClick={() =>
                    act(connection.id, () =>
                      api.app.blocks.block({ user_id: connection.profile.id }),
                    )
                  }
                >
                  Block
                </button>
                <ReportButton
                  profileId={connection.profile.id}
                  name={connection.profile.display_name}
                  onDone={reported(connection.profile.display_name)}
                />
              </PersonRow>
            ))
          }
        </ListLadder>
      )}
    </div>
  );
}

/**
 * One segment. Active = ink and a 2px ink underline, never the accent.
 * Active follows the validated tab, not the raw URL: a stale ?tab=foo (or
 * any extra param) still shows Connections, so Connections is current.
 */
function SegmentLink({
  current,
  tab,
  label,
  count = 0,
}: {
  current: Tab | undefined;
  tab?: Tab;
  label: string;
  count?: number;
}) {
  const active = tab === current;
  return (
    <Link
      to="/connections"
      search={tab ? { tab } : {}}
      replace
      className={active ? 'segments__item segments__item--active' : 'segments__item'}
      aria-current={active ? 'page' : undefined}
      // exact keeps the router's own active marking (it adds aria-current
      // when the raw search matches) from ever disagreeing: without it,
      // "Connections" would partially match ?tab=requests too.
      activeOptions={{ exact: true }}
      activeProps={{}}
      // Named outright: a hidden ", N pending" span inside this flex link is
      // blockified, and the computed name would read "Requests , N pending".
      aria-label={count > 0 ? `${label}, ${count} pending` : undefined}
    >
      {label}
      {count > 0 ? (
        <span className="badge" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

function PersonRow({
  profile,
  sub,
  metAt,
  links,
  children,
}: {
  profile: PublicProfile;
  sub?: string | null;
  /** Connections only: the gathering it was made at, linked to its page. */
  metAt?: MetAtGathering | null;
  /** Connections only: the one list that carries them. */
  links?: ProfileLink[];
  children: ReactNode;
}) {
  // The card tier, on every row: whatever a tap shows, a list shows too.
  const line = cardLine(profile);
  return (
    <div className="row">
      <Avatar profile={profile} size="row" />
      <div className="row-body">
        <span className="name">{profile.display_name}</span>
        {line ? <span className="sub">{line}</span> : null}
        {sub ? <span className="sub">{sub}</span> : null}
        {metAt ? (
          <Link className="sub met-at" to="/gatherings/$id" params={{ id: metAt.id }}>
            {metAtLine(metAt)}
          </Link>
        ) : null}
      </div>
      <div className="row-actions">{children}</div>
      {/* On its own line under the row: the chips need the width. */}
      {links ? <LinkList links={links} name={profile.display_name} /> : null}
    </div>
  );
}
