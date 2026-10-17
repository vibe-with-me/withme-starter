import type { ConnectRequest, Connection } from '@withme/contract';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { LinkChips } from '../../components/Links';
import { AccessibilityInfo, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import {
  Button,
  ErrorText,
  ListLadder,
  PersonRow,
  SegmentedTabs,
  type ListState,
} from '../../components/ui';
import { api, type Api } from '../../lib/api';
import { cardLine } from '../../lib/card-line';
import { space, useTokens } from '../../lib/tokens';

type BlockRow = Awaited<ReturnType<Api['app']['blocks']['list']>>['blocks'][number];
type Segment = 'connections' | 'requests' | 'blocked';
type ListKey = 'pending' | 'connections' | 'blocks';

/**
 * Settle one list into its ladder state; a failure stays on that list.
 * `isLatest` drops a stale answer: a focus reload and an action reload can
 * overlap, and the slower one must not overwrite the newer.
 */
async function settleInto<T>(
  load: () => Promise<T[]>,
  set: (state: ListState<T>) => void,
  isLatest: () => boolean,
) {
  let next: ListState<T>;
  try {
    next = { status: 'ready', items: await load() };
  } catch {
    next = { status: 'error' };
  }
  if (isLatest()) set(next);
}

// The report screen pushes over the tabs; focus reloads the lists after it.
function report(id: string, name: string, canBlock = true) {
  return (
    <Button
      inline
      label="Report"
      kind="quiet"
      accessibilityLabel={`Report ${name}`}
      onPress={() =>
        router.push({ pathname: '/report/[id]', params: { id, name, block: canBlock ? '1' : '0' } })
      }
    />
  );
}

/**
 * Connections: three lists behind in-page segments, mirroring the web tab.
 * Each list loads and fails on its own and climbs the same ladder.
 * Reloaded on focus: a request may have arrived while you were elsewhere.
 */
export default function ConnectionsScreen() {
  const t = useTokens();
  const [segment, setSegment] = useState<Segment>('connections');
  const [pending, setPending] = useState<ListState<ConnectRequest>>({ status: 'loading' });
  const [connections, setConnections] = useState<ListState<Connection>>({ status: 'loading' });
  const [blocks, setBlocks] = useState<ListState<BlockRow>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // One counter per list: every load (a retry included) takes the next
  // number, and only the latest number's answer lands.
  const seq = useRef<Record<ListKey, number>>({ pending: 0, connections: 0, blocks: 0 });
  const ticket = useCallback((list: ListKey) => {
    const mine = ++seq.current[list];
    return () => seq.current[list] === mine;
  }, []);

  const loadPending = useCallback(
    () =>
      settleInto(
        async () => (await api.app.requests.listPending()).requests,
        setPending,
        ticket('pending'),
      ),
    [ticket],
  );
  const loadConnections = useCallback(
    () =>
      settleInto(
        async () => (await api.app.connections.list()).connections,
        setConnections,
        ticket('connections'),
      ),
    [ticket],
  );
  const loadBlocks = useCallback(
    () => settleInto(async () => (await api.app.blocks.list()).blocks, setBlocks, ticket('blocks')),
    [ticket],
  );
  const loadAll = useCallback(
    () => Promise.all([loadPending(), loadConnections(), loadBlocks()]),
    [loadPending, loadConnections, loadBlocks],
  );

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

  async function act(id: string, work: () => Promise<unknown>) {
    setBusyIds((prev) => new Set(prev).add(id));
    setActionError(null);
    try {
      await work();
    } catch {
      const message = "That didn't go through. Try again.";
      setActionError(message);
      // The message sits above the lists, so bring it into view; iOS does
      // not announce accessibilityRole="alert", so say it outright.
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      AccessibilityInfo.announceForAccessibility(message);
    }
    // Reload either way: a failure may mean the row is stale (a request
    // withdrawn, a connection already gone), and the reload clears it.
    // settleInto never throws, so the busy flag always clears.
    await loadAll();
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const quiet = (label: string, id: string, work: () => Promise<unknown>) => (
    <Button inline label={label} kind="quiet" disabled={busyIds.has(id)} onPress={() => act(id, work)} />
  );
  const requestCount = pending.status === 'ready' ? pending.items.length : 0;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await loadAll();
            setRefreshing(false);
          }}
        />
      }
    >
      <SegmentedTabs
        items={[
          { key: 'connections', label: 'Connections' },
          { key: 'requests', label: 'Requests', count: requestCount, countNoun: 'pending' },
          { key: 'blocked', label: 'Blocked' },
        ]}
        active={segment}
        onChange={setSegment}
      />
      {actionError ? <ErrorText>{actionError}</ErrorText> : null}

      {segment === 'requests' ? (
        <ListLadder
          state={pending}
          what="your requests"
          empty="No requests right now."
          onRetry={() => {
            setPending({ status: 'loading' });
            loadPending();
          }}
        >
          {(requests) =>
            requests.map((request) => (
              <PersonRow
                key={request.id}
                name={request.requester.display_name}
                path={request.requester.avatar_path}
                line={cardLine(request.requester)}
                sub={request.requester.bio}
              >
                {/* Accepting completes the handshake — the accent's job. */}
                <Button
                  inline
                  label="Accept"
                  kind="connect"
                  disabled={busyIds.has(request.id)}
                  onPress={() => act(request.id, () => api.app.requests.accept({ id: request.id }))}
                />
                {quiet('Decline', request.id, () => api.app.requests.decline({ id: request.id }))}
                {report(request.requester.id, request.requester.display_name)}
              </PersonRow>
            ))
          }
        </ListLadder>
      ) : segment === 'blocked' ? (
        <ListLadder
          state={blocks}
          what="your block list"
          empty="No one is blocked."
          onRetry={() => {
            setBlocks({ status: 'loading' });
            loadBlocks();
          }}
        >
          {(list) =>
            list.map((block) => (
              <PersonRow
                key={block.user.id}
                name={block.user.display_name}
                path={block.user.avatar_path}
                line={cardLine(block.user)}
              >
                {quiet('Unblock', block.user.id, () => api.app.blocks.unblock({ user_id: block.user.id }))}
                {report(block.user.id, block.user.display_name, false)}
              </PersonRow>
            ))
          }
        </ListLadder>
      ) : (
        <ListLadder
          state={connections}
          what="your connections"
          empty="No connections yet. Tap someone's tag to start."
          onRetry={() => {
            setConnections({ status: 'loading' });
            loadConnections();
          }}
        >
          {(list) =>
            list.map((connection) => (
              <PersonRow
                key={connection.id}
                name={connection.profile.display_name}
                path={connection.profile.avatar_path}
                line={cardLine(connection.profile)}
                sub={connection.profile.bio}
                extra={<LinkChips links={connection.links} />}
              >
                {quiet('Remove', connection.id, () => api.app.connections.remove({ id: connection.id }))}
                {quiet('Block', connection.id, () =>
                  api.app.blocks.block({ user_id: connection.profile.id }),
                )}
                {report(connection.profile.id, connection.profile.display_name)}
              </PersonRow>
            ))
          }
        </ListLadder>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.s5,
    gap: space.s3,
  },
});
