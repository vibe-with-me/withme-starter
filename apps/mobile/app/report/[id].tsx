import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from '@withme/contract';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Choice, ErrorText, Field, Muted, SectionHeader, Title } from '../../components/ui';
import { api } from '../../lib/api';
import { space, useTokens } from '../../lib/tokens';

/**
 * Report a person (web: components/ReportDialog.tsx), presented as a modal
 * over the card or list it came from. A reason from the fixed list,
 * optional words, and the offer to block in the same step. `name` is a
 * display hint only; `block=0` hides the offer (already blocked).
 */
export default function ReportScreen() {
  const t = useTokens();
  const params = useLocalSearchParams<{ id: string; name?: string; block?: string }>();
  const name = params.name?.trim() || 'this person';
  const canBlock = params.block !== '0';
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(canBlock);
  const [state, setState] = useState<'idle' | 'sending' | 'failed' | 'limited'>('idle');
  const [sent, setSent] = useState<null | { blocked: boolean }>(null);
  const inFlight = useRef(false);

  async function submit() {
    if (!reason || inFlight.current) return;
    inFlight.current = true;
    setState('sending');
    try {
      const blocked = canBlock && block;
      await api.app.reports.create({
        reported_id: params.id,
        reason,
        details: details.trim() === '' ? undefined : details.trim(),
        block: blocked,
      });
      setSent({ blocked });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      setState(code === 'TOO_MANY_REQUESTS' ? 'limited' : 'failed');
    } finally {
      inFlight.current = false;
    }
  }

  if (sent) {
    return (
      <View style={[styles.page, { backgroundColor: t.bg }]}>
        <Card>
          <Title>Thanks</Title>
          <Muted accessibilityLiveRegion="polite">
            Your report is in{sent.blocked ? ` and ${name} is blocked` : ''}. They aren't told.
          </Muted>
          <Button label="Done" onPress={() => router.back()} />
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Title>Report {name}</Title>
          <Muted>
            Only the people who run this app see reports. {name} isn't told who reported them, or that
            anyone did.
          </Muted>
          <SectionHeader>What's wrong?</SectionHeader>
          <View accessibilityRole="radiogroup" style={styles.choices}>
            {REPORT_REASONS.map((value) => (
              <Choice
                key={value}
                kind="radio"
                label={REPORT_REASON_LABELS[value]}
                checked={reason === value}
                onPress={() => setReason(value)}
              />
            ))}
          </View>
          <Field
            label="Anything else? (optional)"
            value={details}
            onChangeText={setDetails}
            maxLength={REPORT_DETAILS_MAX}
            multiline
            autoCorrect
            spellCheck
          />
          {canBlock ? (
            <Choice label={`Also block ${name}`} checked={block} onPress={() => setBlock(!block)} />
          ) : null}
          {state === 'failed' || state === 'limited' ? (
            <ErrorText>
              {state === 'limited'
                ? "You've sent a lot of reports today. Try again tomorrow."
                : "That didn't go through. Try again."}
            </ErrorText>
          ) : null}
          <Button
            label={state === 'sending' ? 'Sending…' : 'Send report'}
            onPress={submit}
            disabled={!reason || state === 'sending'}
          />
          <Button label="Cancel" kind="quiet" onPress={() => router.back()} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: space.s5 },
  content: { padding: space.s5, gap: space.s4 },
  choices: { width: '100%' },
});
