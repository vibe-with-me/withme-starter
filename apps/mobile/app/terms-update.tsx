import { TERMS_VERSION } from '@withme/contract';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { AccountSection } from '../components/AccountSection';
import { TERMS_SENTENCE, TermsLinks } from '../components/TermsAgreement';
import { Button, Card, ErrorText, Muted, Title } from '../components/ui';
import { api } from '../lib/api';
import { markTermsCurrent } from '../lib/terms-gate';
import { space, useTokens } from '../lib/tokens';

/**
 * The re-ask screen (web: _app.terms.tsx). The root layout shows it instead
 * of the app whenever the profile agreed to another TERMS_VERSION, and it
 * cannot be swiped away. Declining is leaving: Account (sign out, delete)
 * stays on the screen.
 */
export default function TermsUpdateScreen() {
  const t = useTokens();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await api.app.profile.acceptTerms({ version: TERMS_VERSION });
      // The guard flips and the router leaves this screen for the tabs.
      markTermsCurrent();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content}>
      <Card>
        <Title>Updated terms</Title>
        <Muted>To keep using the app, agree to {TERMS_SENTENCE}</Muted>
        <TermsLinks />
        {failed ? <ErrorText>That didn't go through. Try again.</ErrorText> : null}
        <Button label={busy ? 'Saving…' : 'I agree'} onPress={accept} disabled={busy} />
      </Card>
      <AccountSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.s5, paddingTop: space.s7, gap: space.s4 },
});
