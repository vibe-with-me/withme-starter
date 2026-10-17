import { router } from 'expo-router';
import { useState } from 'react';
import { AccessibilityInfo, Alert, Platform, View } from 'react-native';
import { api } from '../lib/api';
import { clearThisDevice, forgetThisDevice } from '../lib/push';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorText, SectionHeader } from './ui';

const DELETE_COPY =
  "Your profile, connections, requests, blocks, and the gatherings you host are deleted, and your photo with them. Your tags are released so anyone can claim them. This can't be undone.";

const FAILED = "That didn't go through. Try again.";

/** iOS has no live regions, so say it outright; Android reads the live region below. */
function announceFailure() {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(FAILED);
}

/**
 * Profile → Account: sign out, and delete the account behind the system's
 * destructive confirmation. Afterwards the session is dropped locally only;
 * the server no longer has it.
 */
export function AccountSection() {
  const [state, setState] = useState<'idle' | 'signingOut' | 'deleting'>('idle');
  const [failed, setFailed] = useState(false);
  const working = state !== 'idle';

  async function signOut() {
    setState('signingOut');
    setFailed(false);
    // While the session still exists: the server forgets this device's token.
    await forgetThisDevice();
    let ok: boolean;
    try {
      // auth-js reports a network failure as { error } and keeps the session.
      const { error } = await supabase.auth.signOut();
      ok = error === null;
    } catch {
      ok = false;
    }
    if (!ok) {
      // Still signed in: stay here rather than leave a live session behind the login screen.
      setState('idle');
      setFailed(true);
      announceFailure();
      return;
    }
    // Belt and braces: Stack.Protected already falls back to login when the session drops.
    router.replace('/login');
  }

  async function deleteAccount() {
    setState('deleting');
    setFailed(false);
    try {
      await api.app.profile.deleteAccount();
    } catch {
      setState('idle');
      setFailed(true);
      announceFailure();
      return;
    }
    // The account is gone server-side either way: leave even if dropping the
    // local copy fails, rather than stick on "Deleting…". Its push tokens
    // went with it.
    await clearThisDevice();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Nothing to recover: the session it held no longer exists.
    } finally {
      // Explicit, so leaving never depends on the local sign-out having succeeded.
      router.replace('/login');
    }
  }

  function confirmDelete() {
    Alert.alert('Delete your account?', DELETE_COPY, [
      { text: 'Keep my account', style: 'cancel' },
      { text: 'Delete my account', style: 'destructive', onPress: deleteAccount },
    ]);
  }

  return (
    <>
      <SectionHeader>Account</SectionHeader>
      <Card>
        <Button label="Sign out" kind="quiet" disabled={working} onPress={signOut} />
        <Button
          label={state === 'deleting' ? 'Deleting…' : 'Delete account'}
          kind="quiet"
          disabled={working}
          onPress={confirmDelete}
        />
        {/* Always mounted: a live region created with its message is not announced. */}
        <View accessibilityLiveRegion="polite">{failed ? <ErrorText>{FAILED}</ErrorText> : null}</View>
      </Card>
    </>
  );
}
