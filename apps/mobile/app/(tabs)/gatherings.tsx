import type { GatheringListItem } from '@withme/contract';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card, ErrorText, Field, Muted, Title } from '../../components/ui';
import { api } from '../../lib/api';
import { parseLocalDateTime, tomorrowEvening, whenAndWhere } from '../../lib/format-time';
import { goingLine, withLine } from '../../lib/going';
import { supabase } from '../../lib/supabase';
import { fonts, space, useTokens } from '../../lib/tokens';

/**
 * The Events tab: what is happening in the domain, and your own calendar.
 * "Happening" is every upcoming gathering the viewer may see — a bulletin
 * board, not a directory: a row carries the headcount and names only the
 * viewer's connections among the members. The tap is still how people
 * meet; the list is how they find out where.
 */
export default function GatheringsScreen() {
  const t = useTokens();
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
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(tomorrowEvening);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  // The form's error (create/validation) and the list's are separate: a
  // failed load must not read as an empty list, nor show up inside the form.
  const [error, setError] = useState<string | null>(null);
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
  // edited, or deleted a gathering underneath this list.
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

  async function create() {
    if (busy) return;
    const startsAt = parseLocalDateTime(when.date, when.time);
    if (!startsAt) {
      setError('Enter the date as YYYY-MM-DD and the time as HH:MM.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.app.gatherings.create({
        title: title.trim(),
        starts_at: startsAt,
        location: location.trim() === '' ? null : location.trim(),
      });
      setTitle('');
      setLocation('');
      setWhen(tomorrowEvening());
      await load();
    } catch {
      setError('Could not create the gathering. Check the fields and try again.');
    } finally {
      setBusy(false);
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
    const line = [mark, whenAndWhere(gathering), goingLine(gathering.member_count)]
      .filter(Boolean)
      .join(' · ');
    const names = withLine(gathering.members, viewerId);
    return (
      <Pressable
        key={gathering.id}
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/gathering/[id]', params: { id: gathering.id } })}
        style={({ pressed }) => [
          styles.row,
          { borderTopColor: t.border },
          pressed && { opacity: 0.6 },
        ]}
      >
        <View style={styles.rowBody}>
          <Text style={[styles.rowName, { color: t.ink }]}>{gathering.title}</Text>
          <Text numberOfLines={1} style={[styles.rowSub, { color: t.inkMuted }]}>
            {line}
          </Text>
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
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
        <Card>
          <Title>Create a gathering</Title>
          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            placeholder="e.g. Rooftop listening session"
          />
          <Field
            label="Date"
            value={when.date}
            onChangeText={(date) => setWhen((w) => ({ ...w, date }))}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            placeholder="2026-10-09"
          />
          <Field
            label="Time"
            value={when.time}
            onChangeText={(time) => setWhen((w) => ({ ...w, time }))}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            placeholder="18:00"
          />
          <Field
            label="Location (optional)"
            value={location}
            onChangeText={setLocation}
            maxLength={160}
            placeholder="Where to find it"
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            label={busy ? 'Creating…' : 'Create gathering'}
            onPress={create}
            disabled={busy || !title.trim() || !when.date.trim() || !when.time.trim()}
          />
        </Card>

        <Text style={[styles.sectionTitle, { color: t.ink }]}>Happening</Text>
        {!loaded ? null : loadError ? (
          <ErrorText>Could not load gatherings. Pull to retry.</ErrorText>
        ) : happening.length === 0 ? (
          <Muted>Nothing happening yet. Create the first one.</Muted>
        ) : (
          happening.map(row)
        )}
        {loaded && !loadError && moreError ? (
          <ErrorText>Could not load more. Try again.</ErrorText>
        ) : null}
        {loaded && !loadError && cursor !== null ? (
          <Button
            kind="quiet"
            label={loadingMore ? 'Loading…' : 'Load more'}
            onPress={loadMore}
            disabled={loadingMore}
          />
        ) : null}

        <Text style={[styles.sectionTitle, { color: t.ink }]}>Yours</Text>
        {!loaded || loadError ? null : gatherings.length === 0 ? (
          <Muted>Join one above, or create your own.</Muted>
        ) : upcoming.length === 0 ? (
          <Muted>Nothing coming up.</Muted>
        ) : (
          upcoming.map(row)
        )}
        {!loadError && past.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: t.ink }]}>Past</Text>
            {past.map(row)}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
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
    fontSize: 20,
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
});
