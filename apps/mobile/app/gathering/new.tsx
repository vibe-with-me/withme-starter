import type { GatheringVisibility } from '@withme/contract';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GatheringControls } from '../../components/GatheringControls';
import { Button, Card, ErrorText, Field, Title } from '../../components/ui';
import { api } from '../../lib/api';
import { parseLocalDateTime, tomorrowEvening } from '../../lib/format-time';
import { parseSpots } from '../../lib/going';
import { space, useTokens } from '../../lib/tokens';

/** Back to the Events tab, or to it when this screen is the whole stack (a cold deep link). */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.dismissTo('/gatherings');
}

/**
 * Create a gathering (web: _app.gatherings_.new.tsx), pushed from the Events
 * tab. A created gathering replaces this screen with its own, so Back from
 * there returns to the tab rather than to an emptied form.
 */
export default function NewGatheringScreen() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(tomorrowEvening);
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<GatheringVisibility>('everyone');
  const [spots, setSpots] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const { gathering } = await api.app.gatherings.create({
        title: title.trim(),
        starts_at: startsAt,
        location: location.trim() === '' ? null : location.trim(),
        visibility,
        capacity: parseSpots(spots) ?? null,
      });
      router.replace({ pathname: '/gathering/[id]', params: { id: gathering.id } });
    } catch {
      setError('Could not create the gathering. Check the fields and try again.');
      setBusy(false);
    }
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
          <GatheringControls
            visibility={visibility}
            onVisibility={setVisibility}
            spots={spots}
            onSpots={setSpots}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            label={busy ? 'Creating…' : 'Create gathering'}
            onPress={create}
            disabled={
              busy ||
              !title.trim() ||
              !when.date.trim() ||
              !when.time.trim() ||
              parseSpots(spots) === undefined
            }
          />
        </Card>
        <Button label="Cancel" kind="quiet" onPress={goBack} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.s5,
    gap: space.s3,
  },
});
