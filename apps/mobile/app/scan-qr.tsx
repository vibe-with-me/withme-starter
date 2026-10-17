import { tagUidFromUrl } from '@withme/contract';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Muted, Title } from '../components/ui';
import { space, useTokens } from '../lib/tokens';
import { webUrl } from '../lib/web-url';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.dismissTo('/');
}

/**
 * The QR scanner. Every code it sees goes through tagUidFromUrl first: only
 * this app's own resolver URL (`EXPO_PUBLIC_WEB_URL` + /t/{UID}) opens, in
 * the app, on the resolver screen. Anything else is refused calmly and never
 * opened, not even in a browser. The camera keeps looking after a refusal.
 */
export default function ScanQrScreen() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [refused, setRefused] = useState(false);
  // One scan opens one card: the camera reports the same code many times a second.
  const opened = useRef(false);

  // Back from Settings: the answer may have changed while the app was away.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') getPermission().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [getPermission]);

  function onScanned({ data }: BarcodeScanningResult) {
    if (opened.current || !webUrl) return;
    const uid = tagUidFromUrl(data, webUrl);
    if (!uid) {
      setRefused(true);
      return;
    }
    opened.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    router.replace({ pathname: '/t/[uid]', params: { uid, via: 'qr' } });
  }

  const page = [styles.page, { backgroundColor: t.bg, paddingTop: insets.top + space.s5 }];

  if (!webUrl) {
    return (
      <View style={page}>
        <Card>
          <Title>Scanning isn’t set up</Title>
          <Muted>Set EXPO_PUBLIC_WEB_URL to your web app’s address; only its codes open here.</Muted>
          <Button label="Back" kind="quiet" onPress={goBack} />
        </Card>
      </View>
    );
  }

  // Still asking the OS what the answer is.
  if (!permission) return <View style={page} />;

  if (!permission.granted) {
    return (
      <View style={page}>
        <Card>
          {permission.canAskAgain ? (
            <>
              <Title>Scan a code</Title>
              <Muted>The camera is used only to read the code on someone’s screen.</Muted>
              <Button label="Allow camera" onPress={() => requestPermission()} />
            </>
          ) : (
            <>
              <Title>Camera access is off</Title>
              <Muted>Turn it on in Settings to scan codes. Tags still work without it.</Muted>
              <Button label="Open Settings" onPress={() => Linking.openSettings()} />
            </>
          )}
          <Button label="Back" kind="quiet" onPress={goBack} />
        </Card>
      </View>
    );
  }

  return (
    <View style={[styles.camera, { backgroundColor: t.bg }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.s5 }]}>
        <Card>
          <Title>{refused ? 'Not a card here' : 'Scan a code'}</Title>
          <Muted accessibilityLiveRegion="polite">
            {refused
              ? 'That code doesn’t open a card in this app, so it stays closed. Try another.'
              : 'Point the camera at the code on their screen.'}
          </Muted>
          <Button label="Back" kind="quiet" onPress={goBack} />
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: space.s5 },
  camera: { flex: 1, justifyContent: 'flex-end' },
  sheet: { paddingHorizontal: space.s5 },
});
