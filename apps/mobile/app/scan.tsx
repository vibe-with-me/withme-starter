import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Button, Card, Field, Muted, Title } from '../components/ui';
import { cancelRead, isNfcAvailable, readTagUid } from '../lib/nfc';
import { space, useTokens } from '../lib/tokens';

/**
 * Scan entry point. Native NFC reading appears only in development builds
 * (react-native-nfc-manager is feature-gated); a QR code (scan-qr.tsx) and
 * manual UID entry work everywhere, including Expo Go. `via` tells the
 * resolver how the tap arrived, for the scan log.
 */
function open(value: string, via: 'nfc' | 'direct') {
  const cleaned = value.trim().toUpperCase();
  if (cleaned) {
    router.push({ pathname: '/t/[uid]', params: { uid: cleaned, via } });
  }
}

export default function ScanScreen() {
  const t = useTokens();
  const [uid, setUid] = useState('');
  const [nfcReady, setNfcReady] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    isNfcAvailable()
      .then(setNfcReady)
      .catch(() => setNfcReady(false));
    // leaving the screen mid-read must release the NFC session
    return () => {
      cancelRead();
    };
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: t.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Card>
        <Title>Scan a tag</Title>
        {nfcReady ? (
          <Button
            kind="connect"
            label={reading ? 'Hold near the tag…' : 'Read NFC tag'}
            disabled={reading}
            onPress={async () => {
              setReading(true);
              try {
                const tagUid = await readTagUid();
                if (tagUid) open(tagUid, 'nfc');
              } finally {
                setReading(false);
              }
            }}
          />
        ) : (
          <Muted>
            NFC reading needs a development build — in Expo Go, type the UID printed on the tag.
          </Muted>
        )}
        <Button label="Scan a QR code" onPress={() => router.push('/scan-qr')} />
        <Field
          label="Tag UID"
          value={uid}
          onChangeText={setUid}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="04A3B2C1D05E80"
        />
        <Button label="Open" onPress={() => open(uid, 'direct')} disabled={!uid.trim()} />
        <Button label="Back" kind="quiet" onPress={() => router.back()} />
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
