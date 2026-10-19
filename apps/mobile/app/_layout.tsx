import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from '@expo-google-fonts/inter';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { usePushRouting } from '../lib/push';
import { useTermsGate } from '../lib/terms-gate';
import { useSession } from '../lib/use-session';
import { useTokens } from '../lib/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const t = useTokens();
  const { session, loading } = useSession();
  const { needsTerms, checking } = useTermsGate(!!session);
  const [fontsLoaded] = useFonts({
    ...Feather.font,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  // The splash holds until the first terms check answers, so a profile that
  // must agree again never sees the tabs first (a failed check opens the app).
  const ready = fontsLoaded && !loading && !checking;
  // Signed in and mounted: refresh this device's token, open tapped pushes.
  usePushRouting(ready && !!session);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        {/* Always-available anchor: redirects by session (see index.tsx). */}
        <Stack.Screen name="index" />
        {/* Public — the resolver is the product and works signed out. */}
        <Stack.Screen name="t/[uid]" />
        <Stack.Screen name="scan" />
        <Stack.Screen name="scan-qr" />
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        {/* Signed in and agreed to the current terms: the app. */}
        <Stack.Protected guard={!!session && !needsTerms}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="gathering/new" />
          <Stack.Screen name="gathering/[id]" />
          <Stack.Screen name="claim/[uid]" />
          <Stack.Screen name="share" />
          <Stack.Screen name="report/[id]" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        {/* Signed in under older terms: only the re-ask screen, not dismissible. */}
        <Stack.Protected guard={!!session && needsTerms}>
          <Stack.Screen name="terms-update" options={{ gestureEnabled: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
