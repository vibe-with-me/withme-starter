import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { TermsCheckbox } from '../../components/TermsAgreement';
import { Button, Card, ErrorText, Field, Muted, Title } from '../../components/ui';
import { TERMS_VERSION, type Profile } from '@withme/contract';
import { api } from '../../lib/api';
import { space, useTokens } from '../../lib/tokens';

export default function ClaimScreen() {
  const t = useTokens();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = () => {
    setLoadFailed(false);
    api.app.profile
      .get()
      .then(({ profile }: { profile: Profile | null }) => setHasProfile(profile !== null))
      // a failed load must not render the name form: saving it would
      // overwrite an existing profile's display name
      .catch(() => setLoadFailed(true));
  };
  // oxlint-disable-next-line exhaustive-deps
  useEffect(loadProfile, []);

  async function createProfile() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Creating a profile is signing up: it carries the terms agreement.
      await api.app.profile.update({ display_name: displayName.trim(), terms_version: TERMS_VERSION });
      setHasProfile(true);
    } catch {
      setError('Could not save your name. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    if (busy) return;
    const normalizedUid = (uid ?? '').trim().toUpperCase();
    setBusy(true);
    setError(null);
    try {
      await api.public.claim({ uid: normalizedUid });
      router.replace({ pathname: '/t/[uid]', params: { uid: normalizedUid } });
    } catch (claimError) {
      const code = (claimError as { code?: string }).code;
      setError(
        // One answer for unknown, taken and disabled tags: the API does not
        // say which, so nobody can probe which tags exist.
        code === 'CONFLICT'
          ? "This tag can't be claimed. It may already belong to someone."
          : code === 'TOO_MANY_REQUESTS'
            ? 'Too many tries. Wait a while, then try again.'
            : 'Something went wrong. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadFailed) {
    return (
      <KeyboardAvoidingView style={[styles.page, { backgroundColor: t.bg }]}>
        <Card>
          <Title>Couldn't check your profile</Title>
          <ErrorText>Check your connection and try again.</ErrorText>
          <Button label="Retry" onPress={loadProfile} />
        </Card>
      </KeyboardAvoidingView>
    );
  }

  if (hasProfile === null) return null;

  if (!hasProfile) {
    return (
      <KeyboardAvoidingView
        style={[styles.page, { backgroundColor: t.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Card>
          <Title>First, your name</Title>
          <Muted>This is what people see when they tap your tag.</Muted>
          <Field label="Name" value={displayName} onChangeText={setDisplayName} maxLength={80} />
          <TermsCheckbox checked={agreed} onChange={setAgreed} />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            label="Continue"
            onPress={createProfile}
            disabled={busy || !displayName.trim() || !agreed}
          />
        </Card>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: t.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Card>
        <Title>Claim this tag</Title>
        <Muted>
          Tag {uid?.toUpperCase()} will point to your profile. You can disable it any time.
        </Muted>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button kind="connect" label={busy ? 'Claiming…' : 'Claim tag'} onPress={claim} disabled={busy} />
        <Button label="Cancel" kind="quiet" onPress={() => router.back()} />
      </Card>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    padding: space.s5,
  },
});
