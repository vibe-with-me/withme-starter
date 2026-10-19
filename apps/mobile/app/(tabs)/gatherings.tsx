import { isGatheringFull, type GatheringListItem } from '@withme/contract';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { mapsLinkLabel, openInMaps } from '../../components/GatheringMeta';
import { Button, ErrorText, Muted, SegmentedTabs } from '../../components/ui';
import { api } from '../../lib/api';
import { whenAndWhere } from '../../lib/format-time';
import { FULL_LABEL, audienceMark, goingLine, withLine } from '../../lib/going';
import { supabase } from '../../lib/supabase';
import { displaySize, fonts, space, useTokens } from '../../lib/tokens';

type Segment = 'discover' | 'yours';

/**
 * The Events tab: what is happening in the domain, and your own calendar,
 * behind two in-page segments (mirroring the web tab). "Discover" is every
 * upcoming gathering the viewer may see — a bulletin board, not a
 * directory: a row carries the headcount and names only the viewer's
 * connections among the members. "Yours" is what you host or are going to,
 * then what is past. The tap is still how people meet; the list is how they
 * find out where. Creating one is its own screen (app/gathering/new.tsx).
 */
export default function GatheringsScreen() {
  const t = useTokens();
  const [segment, setSegment] = useState<Segment>('discover');
  const [happening, setHappening] = useState<GatheringListItem[]>([]);
  // The feed comes a page at a time; null once the last page is in.
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  // Bumped by every full load: a Load more answer from before it is dropped,
  // or it would append an old page (and an old cursor) to the new feed.
  const feedGeneration = useRef(0);
  const [gatherings, setGatherings] = useState<GatheringListItem[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // A failed load must not read as an empty list.
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    feedGeneration.current += 1;
    try {
      const [feed, { gatherings: mine }, { data }] = await Promise.all([
        api.app.gatherings.list(),
        api.app.gatherings.listMine(),
        supabase.auth.getSession(),
      ]);
      // A re-load starts the feed over from its first page.
      setHappening(feed.gatherings);
      setCursor(feed.next_cursor);
      setMoreError(false);
      setGatherings(mine);
      setViewerId(data.session?.user.id ?? null);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Re-load whenever the tab regains focus: a detail screen may have left,
  // edited, or deleted a gathering underneath this list, and the create
  // screen may have added one.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function loadMore() {
    if (cursor === null || loadingMore) return;
    const generation = feedGeneration.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await api.app.gatherings.list({ cursor });
      if (generation !== feedGeneration.current) return;
      setHappening((rows) => [...rows, ...page.gatherings]);
      setCursor(page.next_cursor);
    } catch {
      if (generation === feedGeneration.current) setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const now = Date.now();
  const upcoming = gatherings.filter((g) => Date.parse(g.starts_at) >= now);
  // most recent first
  const past = gatherings.filter((g) => Date.parse(g.starts_at) < now).toReversed();

  const row = (gathering: GatheringListItem) => {
    const mark =
      viewerId !== null && gathering.host_id === viewerId
        ? 'Hosting'
        : gathering.is_member
          ? 'Going'
          : null;
    // Full only matters to someone who could still join.
    const full = !gathering.is_member && isGatheringFull(gathering, gathering.member_count);
    const line = whenAndWhere(
      gathering,
      [mark],
      [
        goingLine(gathering.member_count, gathering.capacity),
        full ? FULL_LABEL : null,
        audienceMark(gathering.visibility),
      ],
    );
    const where = line.location;
    const names = withLine(gathering.members, viewerId);
    return (
      <Pressable
        key={gathering.id}
        accessibilityRole="button"
        // The row is one element to a screen reader, so the location's link is an action on it.
        accessibilityActions={where ? [{ name: 'maps', label: mapsLinkLabel(where) }] : undefined}
        onAccessibilityAction={(event) => {
          if (where && event.nativeEvent.actionName === 'maps') void openInMaps(where);
        }}
        onPress={() => router.push({ pathname: '/gathering/[id]', params: { id: gathering.id } })}
        style={({ pressed }) => [
          styles.row,
          { borderTopColor: t.border },
          pressed && { opacity: 0.6 },
        ]}
      >
        <View style={styles.rowBody}>
          <Text style={[styles.rowName, { color: t.ink }]}>{gathering.title}</Text>
          {/* The location's link starts its own line, so a long head (a fork's
              field joined before the date) is cut short instead of hiding it.
              That line may wrap to two: a fork whose line helper moves the date
              into the tail (its own field in the location slot) still shows it
              while it fits, and an empty head takes no line at all. */}
          {line.head ? (
            <Text numberOfLines={1} style={[styles.rowSub, { color: t.inkMuted }]}>
              {line.head}
            </Text>
          ) : null}
          {where || line.tail ? (
            <Text numberOfLines={2} style={[styles.rowSub, { color: t.inkMuted }]}>
              {where ? (
                <Text
                  style={[styles.rowLink, { color: t.ink }]}
                  suppressHighlighting
                  onPress={() => void openInMaps(where)}
                >
                  {where}
                </Text>
              ) : null}
              {where && line.tail ? ' · ' : null}
              {line.tail || null}
            </Text>
          ) : null}
          {names ? (
            <Text numberOfLines={1} style={[styles.rowSub, { color: t.inkMuted }]}>
              {names}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <Button label="New gathering" onPress={() => router.push('/gathering/new')} />
      <SegmentedTabs
        items={[
          { key: 'discover', label: 'Discover' },
          { key: 'yours', label: 'Yours' },
        ]}
        active={segment}
        onChange={setSegment}
      />

      {!loaded ? null : loadError ? (
        <ErrorText>Could not load gatherings. Pull to retry.</ErrorText>
      ) : segment === 'yours' ? (
        <>
          {gatherings.length === 0 ? (
            <Muted>Join one from Discover, or create your own.</Muted>
          ) : upcoming.length === 0 ? (
            <Muted>Nothing coming up.</Muted>
          ) : (
            upcoming.map(row)
          )}
          {past.length > 0 ? (
            <>
              <Text accessibilityRole="header" style={[styles.sectionTitle, { color: t.ink }]}>
                Past
              </Text>
              {past.map(row)}
            </>
          ) : null}
        </>
      ) : (
        <>
          {happening.length === 0 ? (
            <Muted>Nothing happening yet. Create the first one.</Muted>
          ) : (
            happening.map(row)
          )}
          {moreError ? <ErrorText>Could not load more. Try again.</ErrorText> : null}
          {cursor !== null ? (
            <Button
              kind="quiet"
              label={loadingMore ? 'Loading…' : 'Load more'}
              onPress={loadMore}
              disabled={loadingMore}
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.s5,
    paddingTop: space.s5,
    gap: space.s3,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: displaySize.section,
    letterSpacing: -0.2,
    marginTop: space.s4,
  },
  // Rows are flat and ruled, not boxed (mirrors PersonRow and web's .row).
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    borderTopWidth: 1,
    paddingVertical: space.s3,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  rowSub: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
  },
  // Ink inside the muted line, never the accent (tokens.css).
  rowLink: { textDecorationLine: 'underline' },
});
