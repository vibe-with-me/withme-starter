import {
  isGatheringFull,
  type Destination,
  type Gathering,
  type GatheringMember,
  type GatheringVisibility,
  type Tag,
} from '@withme/contract';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GatheringControls } from '../../components/GatheringControls';
import { GatheringMeta } from '../../components/GatheringMeta';
import { Button, Card, ErrorText, Field, Muted, PersonRow, Title } from '../../components/ui';
import { api } from '../../lib/api';
import { cardLine } from '../../lib/card-line';
import {
  formatStartsAt,
  parseLocalDateTime,
  toDateAndTime,
  whenAndWhere,
} from '../../lib/format-time';
import { gatheringHref } from '../../lib/gathering-link';
import { FULL_LABEL, audienceMark, goingLine, parseSpots } from '../../lib/going';
import { supabase } from '../../lib/supabase';
import { displaySize, fonts, space, useTokens } from '../../lib/tokens';

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'failed' }
  // Blocked either way with the host, connections-only and not for this
  // viewer, or missing — the same NOT_FOUND, so
  // the screen offers a calm join (which answers "not available") instead
  // of an error. A stranger who found the gathering in the feed gets the
  // detail, with Join on it.
  | { kind: 'join' }
  | {
      kind: 'detail';
      gathering: Gathering;
      members: GatheringMember[];
      memberCount: number;
      userId: string | null;
    };

/** The detail is a stack screen: it pushes over the tab bar (docs/the-slice.md step 6). */
/**
 * Back, or to the Events tab when there is nothing to go back to: after a
 * login redirect or a cold deep link this screen is the whole stack.
 */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.dismissTo('/gatherings');
}

export default function GatheringScreen() {
  const t = useTokens();
  // title/starts_at are display-only hints from the resolver — never data.
  const params = useLocalSearchParams<{ id: string; title?: string; starts_at?: string }>();
  const id = (params.id ?? '').trim();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [join, setJoin] = useState<'idle' | 'joining' | 'failed' | 'unavailable' | 'full'>('idle');
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    try {
      const [{ gathering, members, member_count }, { data }] = await Promise.all([
        api.app.gatherings.get({ id }),
        supabase.auth.getSession(),
      ]);
      setState({
        kind: 'detail',
        gathering,
        members,
        memberCount: member_count,
        userId: data.session?.user.id ?? null,
      });
    } catch (error) {
      setState((error as { code?: string }).code === 'NOT_FOUND' ? { kind: 'join' } : { kind: 'failed' });
    }
  }, [id]);

  // On focus, not mount: the join card pushes /profile and this screen stays
  // mounted underneath, so coming back must re-read who we are to it.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (state.kind === 'loading') {
    return <View style={[styles.page, { backgroundColor: t.bg }]} />;
  }

  if (state.kind === 'failed') {
    return (
      <View style={[styles.page, { backgroundColor: t.bg }]}>
        <Card>
          <Title>Couldn't load this gathering</Title>
          <ErrorText>Check your connection and try again.</ErrorText>
          <Button label="Retry" onPress={load} />
          <Button label="Back" kind="quiet" onPress={goBack} />
        </Card>
      </View>
    );
  }

  if (state.kind === 'join') {
    const hint = [params.title ?? null, params.starts_at ? formatStartsAt(params.starts_at) : null]
      .filter(Boolean)
      .join(' · ');
    return (
      <View style={[styles.page, { backgroundColor: t.bg }]}>
        <Card settle>
          <Title>Join this gathering?</Title>
          {hint ? <Muted>{hint}</Muted> : null}
          {join === 'unavailable' || join === 'full' ? (
            <Muted>{join === 'full' ? 'This gathering is full.' : "This gathering isn't available."}</Muted>
          ) : (
            <Button
              kind="connect"
              disabled={join === 'joining'}
              label={join === 'joining' ? 'Joining…' : join === 'failed' ? 'Try again' : 'Join'}
              onPress={async () => {
                // ref guard: two taps in one frame both pass the disabled check
                if (inFlight.current) return;
                inFlight.current = true;
                setJoin('joining');
                try {
                  // Members see your card, so a profile must exist before you join.
                  const { profile } = await api.app.profile.get();
                  if (!profile) {
                    setJoin('idle'); // this screen stays mounted under the push
                    // The hints ride along so the join card comes back as it was.
                    router.push({
                      pathname: '/profile',
                      params: {
                        redirect: gatheringHref(id, { title: params.title, starts_at: params.starts_at }),
                      },
                    });
                    return;
                  }
                  await api.app.gatherings.join({ id });
                  await load();
                } catch (error) {
                  const code = (error as { code?: string }).code;
                  setJoin(code === 'NOT_FOUND' ? 'unavailable' : code === 'CONFLICT' ? 'full' : 'failed');
                } finally {
                  // runs on the /profile early return too: back from Profile, Join taps again
                  inFlight.current = false;
                }
              }}
            />
          )}
          <Button label="Back" kind="quiet" onPress={goBack} />
        </Card>
      </View>
    );
  }

  return <GatheringDetail {...state} reload={load} />;
}

interface GatheringPatch {
  title: string;
  starts_at: string;
  location: string | null;
  visibility: GatheringVisibility;
  capacity: number | null;
}

function GatheringDetail({
  gathering,
  members,
  memberCount,
  userId,
  reload,
}: {
  gathering: Gathering;
  members: GatheringMember[];
  memberCount: number;
  userId: string | null;
  reload: () => Promise<void>;
}) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const isHost = userId === gathering.host_id;
  // The member list is the viewer's view, so the viewer's own row is in it iff they joined.
  const isMember = userId !== null && members.some((member) => member.profile.id === userId);
  const full = isGatheringFull(gathering, memberCount);

  async function join() {
    setBusy(true);
    setActionError(null);
    try {
      // Connections see your card here, so a profile must exist before you join.
      const { profile } = await api.app.profile.get();
      if (!profile) {
        router.push({ pathname: '/profile', params: { redirect: gatheringHref(gathering.id) } });
        return;
      }
      await api.app.gatherings.join({ id: gathering.id });
      await reload();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'CONFLICT') {
        // The last spot went while this screen was open: show the new headcount.
        await reload();
        setActionError('Someone took the last spot.');
      } else {
        setActionError(
          code === 'NOT_FOUND' ? "This gathering isn't available." : "That didn't go through. Try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function run(
    work: () => Promise<unknown>,
    then: 'reload' | 'list',
    failure = "That didn't go through. Try again.",
  ) {
    setBusy(true);
    setActionError(null);
    try {
      await work();
      if (then === 'list') {
        // Pop back to the tabs if they are below us; on a cold deep link,
        // replace this screen with them. Never stack a second tab shell.
        router.dismissTo('/gatherings');
        return;
      }
      await reload();
      setEditing(false);
    } catch {
      setActionError(failure);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete this gathering?',
      'Members lose it, and tags pointing here fall back to your profile.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => run(() => api.app.gatherings.remove({ id: gathering.id }), 'list'),
        },
      ],
    );
  }

  function confirmBlock() {
    Alert.alert(
      'Block the host?',
      "This gathering and any they host disappear for you, and they aren't told. You can undo it in Connections → Blocked.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          // A blocker cannot see the gathering any more: back to the list.
          onPress: () => run(() => api.app.blocks.block({ user_id: gathering.host_id }), 'list'),
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        // No stack header on this screen, so clear the status bar ourselves.
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.s5 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          {editing ? (
            <EditFields
              gathering={gathering}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={(patch) =>
                run(
                  () => api.app.gatherings.update({ id: gathering.id, ...patch }),
                  'reload',
                  // A form save says check the fields, as on web; one-tap actions keep the default.
                  'Could not save. Check the fields and try again.',
                )
              }
            />
          ) : (
            <>
              <Title>{gathering.title}</Title>
              <GatheringMeta line={whenAndWhere(gathering)} />
              <Muted>
                {[goingLine(memberCount, gathering.capacity), audienceMark(gathering.visibility)]
                  .filter(Boolean)
                  .join(' · ')}
              </Muted>
            </>
          )}
          {/* Members only: a tag whose owner is not a member degrades to the
              profile card. Outside the ternary so Edit/Cancel keeps its tags
              instead of refetching. */}
          {isMember ? <TagPointer gatheringId={gathering.id} hidden={editing} /> : null}
          {actionError ? <ErrorText>{actionError}</ErrorText> : null}
          {!editing && isHost ? (
            <>
              <Button label="Edit" kind="quiet" disabled={busy} onPress={() => setEditing(true)} />
              <Button label="Delete gathering" kind="quiet" disabled={busy} onPress={confirmDelete} />
            </>
          ) : null}
          {!editing && isMember && !isHost ? (
            <Button
              label={busy ? 'Leaving…' : 'Leave gathering'}
              kind="quiet"
              disabled={busy}
              onPress={() => run(() => api.app.gatherings.leave({ id: gathering.id }), 'list')}
            />
          ) : null}
          {/* Joining is the consent moment: the accent's job, as on the resolver. */}
          {!editing && !isMember && full ? <Button kind="quiet" label={FULL_LABEL} disabled onPress={() => {}} /> : null}
          {!editing && !isMember && !full ? (
            <Button kind="connect" label={busy ? 'Joining…' : 'Join'} disabled={busy} onPress={join} />
          ) : null}
          {/* Report and Block (Guideline 1.2): everyone sees a gathering, so
              anyone but the host can report it or block the person behind it. */}
          {!editing && !isHost ? (
            <>
              <Button
                label="Report"
                kind="quiet"
                disabled={busy}
                accessibilityLabel="Report this gathering"
                onPress={() =>
                  router.push({
                    pathname: '/report/[id]',
                    params: { id: gathering.host_id, gathering: gathering.id },
                  })
                }
              />
              <Button label="Block host" kind="quiet" disabled={busy} onPress={confirmBlock} />
            </>
          ) : null}
          {!editing ? <Button label="Back" kind="quiet" onPress={goBack} /> : null}
        </Card>

        <Text style={[styles.sectionTitle, { color: t.ink }]}>Who's going</Text>
        <Muted>
          {members.length === 0
            ? "You'll see the people you're connected with here."
            : "The people you're connected with. Everyone else, you meet there."}
        </Muted>
        {members.map((member) => (
          <PersonRow
            key={member.profile.id}
            name={member.profile.display_name}
            path={member.profile.avatar_path}
            line={cardLine(member.profile)}
            // Web's convention: "Host" takes the sub line; the row's right side is for actions.
            sub={member.profile.id === gathering.host_id ? 'Host' : member.profile.bio}
          />
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function EditFields({
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
  const [when, setWhen] = useState(() => toDateAndTime(new Date(gathering.starts_at)));
  const [location, setLocation] = useState(gathering.location ?? '');
  const [visibility, setVisibility] = useState(gathering.visibility);
  const [spots, setSpots] = useState(gathering.capacity === null ? '' : String(gathering.capacity));
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} />
      <Field
        label="Date"
        value={when.date}
        onChangeText={(date) => setWhen((w) => ({ ...w, date }))}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />
      <Field
        label="Time"
        value={when.time}
        onChangeText={(time) => setWhen((w) => ({ ...w, time }))}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />
      <Field label="Location (optional)" value={location} onChangeText={setLocation} maxLength={160} />
      <GatheringControls
        visibility={visibility}
        onVisibility={setVisibility}
        spots={spots}
        onSpots={setSpots}
        editing
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label={busy ? 'Saving…' : 'Save'}
        disabled={busy || !title.trim() || parseSpots(spots) === undefined}
        onPress={() => {
          const startsAt = parseLocalDateTime(when.date, when.time);
          if (!startsAt) {
            setError('Enter the date as YYYY-MM-DD and the time as HH:MM.');
            return;
          }
          setError(null);
          onSave({
            title: title.trim(),
            starts_at: startsAt,
            location: location.trim() === '' ? null : location.trim(),
            visibility,
            capacity: parseSpots(spots) ?? null,
          });
        }}
      />
      <Button label="Cancel" kind="quiet" disabled={busy} onPress={onCancel} />
    </>
  );
}

/**
 * Members aim their own claimed tags at this gathering so a tap joins it.
 * Through the contract (app.tags.listMine / app.tags.update) — the mobile
 * app's only data path is the API, same as web. `hidden` keeps the component
 * (and its fetched tags) mounted while the host edits.
 */
function TagPointer({ gatheringId, hidden }: { gatheringId: string; hidden: boolean }) {
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

  if (hidden || tags === 'loading' || tags === 'failed') return null;
  if (tags.length === 0) return <Muted>Claim a tag to point it at this gathering.</Muted>;

  const pointsHere = (tag: Tag) =>
    tag.destination?.type === 'gathering' && tag.destination.gathering_id === gatheringId;
  const here = tags.filter(pointsHere);
  const elsewhere = tags.filter((tag) => !pointsHere(tag));

  async function repoint(targets: Tag[], destination: Destination) {
    setBusy(true);
    setPointError(null);
    const results = await Promise.allSettled(
      targets.map((tag) => api.app.tags.update({ uid: tag.uid, destination })),
    );
    if (results.some((result) => result.status === 'rejected')) {
      setPointError("That didn't go through. Try again.");
    }
    await load();
    setBusy(false);
  }

  return (
    <>
      {here.length > 0 ? (
        <Button
          label="Point my tags back to my profile"
          disabled={busy}
          onPress={() => repoint(here, { type: 'profile' })}
        />
      ) : null}
      {elsewhere.length > 0 ? (
        <Button
          label="Point my tags at this gathering"
          disabled={busy}
          onPress={() => repoint(elsewhere, { type: 'gathering', gathering_id: gatheringId })}
        />
      ) : null}
      {pointError ? <ErrorText>{pointError}</ErrorText> : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: space.s5 },
  content: { padding: space.s5, gap: space.s3 },
  sectionTitle: { fontFamily: fonts.display, fontSize: displaySize.section, letterSpacing: -0.2, marginTop: space.s4 },
});
