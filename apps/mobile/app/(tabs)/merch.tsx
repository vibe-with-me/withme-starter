import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Card, ErrorText, Muted, Title } from '../../components/ui';
import { space, useTokens } from '../../lib/tokens';

const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL;

/**
 * Opens the store in the in-app browser, or the system browser if that is
 * not available. The in-app browser is a native module loaded on demand, so
 * an app binary built before it was added still gets a working button.
 */
async function openStore(url: string): Promise<void> {
  try {
    const WebBrowser = await import('expo-web-browser');
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}

/** The fulfillment pointer as a tab: one card, one link out. No commerce here. */
export default function MerchScreen() {
  const t = useTokens();
  const [failed, setFailed] = useState(false);
  if (!STORE_URL) return __DEV__ ? <MerchSetup /> : <Redirect href="/gatherings" />;
  return (
    <View style={[styles.page, { backgroundColor: t.bg }]}>
      <Card>
        <Title>Merch</Title>
        <Muted>Tags and gear from the store.</Muted>
        {failed ? <ErrorText>Couldn't open the store. Try again in a moment.</ErrorText> : null}
        <Button
          label="Open store"
          onPress={() => {
            setFailed(false);
            openStore(STORE_URL).catch(() => setFailed(true));
          }}
        />
      </Card>
    </View>
  );
}

/** Development builds only: what this tab is for and how to turn it on. */
function MerchSetup() {
  const t = useTokens();
  return (
    <View style={[styles.page, { backgroundColor: t.bg }]}>
      <Card>
        <Title>Merch</Title>
        <Muted>
          No store yet. Your users don't see this tab until you set EXPO_PUBLIC_STORE_URL; it then
          opens your store.
        </Muted>
        <Muted>
          You see it now because this is a development build. docs/merch.md is the tested path to a
          store selling tags for your vertical.
        </Muted>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    padding: space.s5,
  },
});
