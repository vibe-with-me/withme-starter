import { useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { declinePushOffer, turnPushOff, turnPushOn, usePushSetting } from '../lib/push';
import { fonts, space, useTokens } from '../lib/tokens';
import { Button, Card, ErrorText, Muted, SectionHeader, Title } from './ui';

const WHEN = 'when someone wants to connect, accepts your request, or joins your gathering. Nothing else.';
const FAILED = "That didn't go through. Try again.";

/**
 * The consent card: shown once per device, at a moment that explains it
 * (after your first request, and on Connections), never at launch. The
 * OS prompt only follows "Turn on".
 */
export function PushOffer({ bare = false }: { bare?: boolean }) {
  const [setting, setSetting] = usePushSetting();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (setting !== 'unasked') return null;

  const body = (
    <>
      <Title>Know when they answer</Title>
      <Muted>{`Get a notification ${WHEN}`}</Muted>
      {failed ? <ErrorText>{FAILED}</ErrorText> : null}
      <Button
        label={busy ? 'Turning on…' : 'Turn on notifications'}
        disabled={busy}
        onPress={async () => {
          setBusy(true);
          setFailed(false);
          try {
            setSetting(await turnPushOn());
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        label="Not now"
        kind="quiet"
        disabled={busy}
        onPress={async () => {
          await declinePushOffer().catch(() => undefined);
          setSetting('off');
        }}
      />
    </>
  );
  return bare ? <View style={styles.bare}>{body}</View> : <Card>{body}</Card>;
}

/** Profile → Notifications: one switch, for this device. */
export function PushSection() {
  const t = useTokens();
  const [setting, setSetting] = usePushSetting();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (setting === null) return null;

  const denied = setting === 'denied';
  return (
    <>
      <SectionHeader>Notifications</SectionHeader>
      <Card>
        <View style={styles.row}>
          <Text style={[styles.label, { color: t.ink }]} nativeID="push-switch-label">
            Push notifications
          </Text>
          <Switch
            accessibilityLabelledBy="push-switch-label"
            accessibilityLabel="Push notifications"
            value={setting === 'on'}
            disabled={busy || denied}
            trackColor={{ true: t.ink, false: t.border }}
            onValueChange={async (on) => {
              setBusy(true);
              setFailed(false);
              try {
                setSetting(on ? await turnPushOn() : await turnPushOff());
              } catch {
                setFailed(true);
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
        <Muted>{denied ? 'Notifications are turned off for this app in Settings.' : `A notification ${WHEN}`}</Muted>
        {denied ? <Button label="Open Settings" kind="quiet" onPress={() => Linking.openSettings()} /> : null}
        {failed ? <ErrorText>{FAILED}</ErrorText> : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s3 },
  bare: { gap: space.s3 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 16 },
});
