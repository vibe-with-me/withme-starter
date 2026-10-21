import { Feather } from '@expo/vector-icons';
import type { Destination, Gathering, Tag } from '@withme/contract';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewInstance,
} from 'react-native';
import { api } from '../lib/api';
import {
  describeTag,
  destinationFromKey,
  destinationKey,
  gatheringChoiceLabel,
} from '../lib/my-tags';
import { fonts, radius, space, TAP_TARGET, useTokens } from '../lib/tokens';
import { Button, ErrorText, ListLadder, Muted, SectionHeader, type ListState } from './ui';

type TagPatch = { destination: Destination } | { status: 'claimed' | 'disabled' };

interface Snapshot {
  tags: Tag[] | null;
  gatherings: Gathering[] | null;
}

/** iOS has no live regions: post the message, queued behind any focus readout. Android reads the live region. */
function announce(message: string) {
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  }
}

/**
 * Profile → My tags, the mirror of web's: what a tap does now, where it
 * points, off and on. Through app.tags.listMine / update only. Reloaded on
 * focus: a gathering detail may have pointed your tags somewhere new.
 */
export function MyTags() {
  const [tags, setTags] = useState<ListState<Tag>>({ status: 'loading' });
  // null when not loaded: describeTag never claims you left a gathering it could not see.
  const [gatherings, setGatherings] = useState<Gathering[] | null>(null);
  // Per tag: saving one row never re-enables another mid-save.
  const [busyUids, setBusyUids] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Only the newest load writes state: a slow focus reload that started
  // before a save must not land after the save's own reload.
  const loads = useRef(0);

  const load = useCallback(async (): Promise<Snapshot> => {
    const ticket = ++loads.current;
    const [mine, yours] = await Promise.allSettled([
      api.app.tags.listMine(),
      api.app.gatherings.listMine(),
    ]);
    const snapshot: Snapshot = {
      tags: mine.status === 'fulfilled' ? mine.value.tags : null,
      gatherings: yours.status === 'fulfilled' ? yours.value.gatherings : null,
    };
    if (ticket === loads.current) {
      setTags(snapshot.tags ? { status: 'ready', items: snapshot.tags } : { status: 'error' });
      setGatherings(snapshot.gatherings);
    }
    return snapshot;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /** True when the change saved. */
  async function update(uid: string, patch: TagPatch): Promise<boolean> {
    setBusyUids((prev) => new Set(prev).add(uid));
    setError(null);
    setStatus(null);
    try {
      let saved = false;
      try {
        await api.app.tags.update({ uid, ...patch });
        saved = true;
      } catch {
        const message = "That didn't go through. Try again.";
        setError(message);
        announce(message);
      }
      // Reload either way: a failure may mean the row is stale (the tag
      // released elsewhere, a gathering gone), and the reload shows what is true.
      const fresh = await load();
      if (saved) {
        const now = fresh.tags?.find((row) => row.uid === uid);
        const message = now ? `${uid} saved. ${describeTag(now, fresh.gatherings)}` : 'Saved.';
        setStatus(message);
        announce(message);
      }
      return saved;
    } finally {
      setBusyUids((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    }
  }

  return (
    <>
      <SectionHeader>My tags</SectionHeader>
      {/* Always mounted: a live region created with its message is not announced. */}
      <View accessibilityLiveRegion="polite" style={styles.notices}>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {status ? <Muted>{status}</Muted> : null}
      </View>
      <ListLadder
        state={tags}
        what="your tags"
        empty="No tags yet. Tap an unclaimed tag to claim it."
        onRetry={() => {
          setTags({ status: 'loading' });
          void load();
        }}
      >
        {(list) =>
          list.map((tag) => (
            <TagRow
              key={tag.uid}
              tag={tag}
              gatherings={gatherings}
              busy={busyUids.has(tag.uid)}
              onUpdate={(patch) => update(tag.uid, patch)}
            />
          ))
        }
      </ListLadder>
    </>
  );
}

function TagRow({
  tag,
  gatherings,
  busy,
  onUpdate,
}: {
  tag: Tag;
  gatherings: Gathering[] | null;
  busy: boolean;
  onUpdate: (patch: TagPatch) => Promise<boolean>;
}) {
  const t = useTokens();
  const [choosing, setChoosing] = useState(false);
  const toggle = useRef<ViewInstance>(null);
  const refocus = useRef(false);
  const current = destinationKey(tag.destination);
  const off = tag.status === 'disabled';
  const known = gatherings ?? [];
  const choices = [
    { key: 'profile', label: 'My profile' },
    ...known.map((g) => ({ key: `gathering:${g.id}`, label: gatheringChoiceLabel(g) })),
  ];
  // A destination outside the list (left, deleted, or the list failed) stays shown as itself.
  const orphan = current !== 'profile' && !known.some((g) => `gathering:${g.id}` === current);

  // Closing the list unmounts the radio that had screen-reader focus; hand
  // focus back to the button that opens it rather than the top of the screen.
  useEffect(() => {
    if (!choosing && refocus.current) {
      refocus.current = false;
      if (toggle.current) AccessibilityInfo.sendAccessibilityEvent(toggle.current, 'focus');
    }
  }, [choosing]);

  function close() {
    refocus.current = true;
    setChoosing(false);
  }

  // One deliberate tap per option saves it (a press, never focus or scroll).
  // The list stays open while it saves, and on failure, so the radios keep
  // showing where the tag really points and the choice can be retried.
  async function choose(key: string) {
    if (key === current) {
      close();
      return;
    }
    if (await onUpdate({ destination: destinationFromKey(key) })) close();
  }

  return (
    <View style={[styles.tag, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.uid, { color: t.ink }]}>{tag.uid}</Text>
      <Text style={[styles.sub, { color: t.inkMuted }]}>{describeTag(tag, gatherings)}</Text>
      <View style={styles.actions}>
        <Button
          ref={toggle}
          inline
          kind="quiet"
          label={choosing ? 'Close' : 'Point it at…'}
          accessibilityLabel={choosing ? `Close where ${tag.uid} points` : `Point it at…, ${tag.uid}`}
          expanded={choosing}
          disabled={busy}
          onPress={() => setChoosing((open) => !open)}
        />
        <Button
          inline
          kind="quiet"
          label={off ? 'Turn on' : 'Turn off'}
          accessibilityLabel={`${off ? 'Turn on' : 'Turn off'} ${tag.uid}`}
          disabled={busy}
          onPress={() => void onUpdate({ status: off ? 'claimed' : 'disabled' })}
        />
      </View>
      {choosing ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={`Where ${tag.uid} points`}
          style={styles.choices}
        >
          {choices.map((choice) => (
            <Choice
              key={choice.key}
              label={choice.label}
              checked={choice.key === current}
              disabled={busy}
              onPress={() => void choose(choice.key)}
            />
          ))}
          {orphan ? (
            <Choice
              label={gatherings === null ? 'A gathering' : "A gathering you're not in"}
              checked
              disabled
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Choice({
  label,
  checked,
  disabled,
  onPress,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onPress?: () => void;
}) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="radio"
      // The label alone: the check glyph is not text worth reading.
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { borderColor: t.border },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text
        style={[
          styles.choiceLabel,
          { color: t.ink, fontFamily: checked ? fonts.bodySemiBold : fonts.body },
        ]}
      >
        {label}
      </Text>
      {checked ? <Feather name="check" size={18} color={t.ink} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notices: { gap: space.s2 },
  tag: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    gap: space.s1,
  },
  uid: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  sub: { fontFamily: fonts.body, fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.s2 },
  choices: { gap: space.s1 },
  choice: {
    minHeight: TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s2,
    borderTopWidth: 1,
    paddingHorizontal: space.s2,
  },
  choiceLabel: { fontSize: 15, flexShrink: 1 },
});
