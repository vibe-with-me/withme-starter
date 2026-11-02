import type { Profile } from '@withme/contract';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { api } from '../lib/api';
import { squareAvatar } from '../lib/avatar';
import { fonts, space, useTokens } from '../lib/tokens';
import { Avatar, Button } from './ui';

type PhotoState = 'idle' | 'working' | 'done' | 'removed' | 'failed' | 'unreadable';

const MESSAGES: Record<Exclude<PhotoState, 'idle'>, string> = {
  working: 'Uploading…',
  done: 'Photo updated.',
  removed: 'Photo removed.',
  failed: "That didn't go through. Try again.",
  unreadable: "That photo couldn't be read. Try a different one.",
};

/**
 * The profile photo: the system picker (square crop), a 512px JPEG made on
 * the device, sent as a File through app.profile.uploadAvatar. The app
 * never talks to Storage itself.
 */
export function AvatarPicker({
  name,
  path,
  onChange,
}: {
  name: string;
  path: string | null;
  onChange: (profile: Profile) => void;
}) {
  const t = useTokens();
  const [state, setState] = useState<PhotoState>('idle');
  const working = state === 'working';
  const chooseButton = useRef<ViewInstance>(null);

  useEffect(() => {
    if (state === 'idle') return;
    // "Remove photo" unmounts with the photo; keep screen-reader focus on the
    // control that adds one rather than letting it fall back to the top.
    if (state === 'removed' && chooseButton.current) {
      AccessibilityInfo.sendAccessibilityEvent(chooseButton.current, 'focus');
    }
    // Android reads the status line's live region; iOS has no live regions,
    // so the message is posted, queued behind the focus move's readout.
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibilityWithOptions(MESSAGES[state], { queue: true });
    }
  }, [state]);

  async function choose() {
    let picked: ImagePicker.ImagePickerResult;
    try {
      picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
    } catch {
      // The picker could not open: say so, rather than an unhandled rejection.
      setState('failed');
      return;
    }
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    setState('working');
    let file: File;
    try {
      file = await squareAvatar(asset);
    } catch {
      setState('unreadable');
      return;
    }
    try {
      const { profile } = await api.app.profile.uploadAvatar({ file });
      onChange(profile);
      setState('done');
    } catch {
      setState('failed');
    }
  }

  async function remove() {
    setState('working');
    try {
      const { profile } = await api.app.profile.removeAvatar();
      onChange(profile);
      setState('removed');
    } catch {
      setState('failed');
    }
  }

  return (
    <View style={styles.field}>
      <Avatar name={name} path={path} />
      <View style={styles.actions}>
        <Button
          ref={chooseButton}
          inline
          kind="quiet"
          label={path ? 'Change photo' : 'Add a photo'}
          disabled={working}
          onPress={choose}
        />
        {path ? <Button inline kind="quiet" label="Remove photo" disabled={working} onPress={remove} /> : null}
      </View>
      {/* Always mounted: a live region created with its message is not announced. */}
      <Text
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        style={[styles.status, { color: t.inkMuted }]}
      >
        {state !== 'idle' ? MESSAGES[state] : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { alignItems: 'center', gap: space.s2, width: '100%' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.s2 },
  status: { fontFamily: fonts.body, fontSize: 15, textAlign: 'center' },
});
