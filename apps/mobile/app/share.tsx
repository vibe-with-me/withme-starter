import { tagUrl } from '@withme/contract';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShareCodeImage } from '../components/ShareCode';
import { Button, Card, ErrorText, Muted, SectionHeader, Title } from '../components/ui';
import { api } from '../lib/api';
import { fonts, space, useTokens } from '../lib/tokens';
import { webUrl } from '../lib/web-url';

/** Back to Profile, or to it when this screen is the whole stack (a cold deep link). */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.dismissTo('/profile');
}

/**
 * Your code, opened from the tab bar's raised button. A QR code that opens your card, for someone without
 * a tag or without NFC: their phone's camera opens the same resolver a tap
 * does. The code is a tag row of its own (app.shareCode); replacing it makes
 * every copy of the old one, screenshots included, open an inactive tag.
 * Scanning someone else's code is one tap away, as on a tag's scan screen.
 */
export default function ShareScreen() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [uid, setUid] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // A code opens a card: without a profile there is nothing to open yet.
  const [noProfile, setNoProfile] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoadFailed(false);
    api.app.shareCode
      .get()
      .then((code) => setUid(code.uid))
      .catch((e: { code?: string }) => {
        if (e.code === 'BAD_REQUEST') setNoProfile(true);
        else setLoadFailed(true);
      });
  };
  // oxlint-disable-next-line exhaustive-deps
  useEffect(load, []);

  async function replace() {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const next = await api.app.shareCode.replace();
      setUid(next.uid);
      setConfirming(false);
      setStatus('New code ready. The old one no longer opens your card.');
    } catch (e) {
      setError(
        (e as { code?: string }).code === 'TOO_MANY_REQUESTS'
          ? 'That’s a lot of new codes. Try again in an hour.'
          : 'That didn’t go through. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const url = webUrl && uid ? tagUrl(webUrl, uid) : null;

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.s5 }]}
    >
      {!webUrl ? (
        <Card>
          <Title>Sharing isn’t set up</Title>
          <Muted>
            Set EXPO_PUBLIC_WEB_URL to your web app’s address; a code opens a page there.
          </Muted>
        </Card>
      ) : noProfile ? (
        <Card>
          <Title>Your code</Title>
          <Muted>Your code opens your card. Make your card first.</Muted>
          <Button label="Create your profile" onPress={() => router.dismissTo('/profile')} />
        </Card>
      ) : loadFailed ? (
        <Card>
          <Title>Couldn’t load your code</Title>
          <ErrorText>Check your connection and try again.</ErrorText>
          <Button label="Retry" onPress={load} />
        </Card>
      ) : url ? (
        <>
          <Card settle>
            <Title>Your code</Title>
            <ShareCodeImage url={url} label="QR code that opens your card" />
            <Muted>
              Point a phone’s camera at it. It opens your card, the same one a tap on your tag
              shows.
            </Muted>
            <Text selectable style={[styles.url, { color: t.inkMuted }]}>
              {url}
            </Text>
            <Button label="Share link" onPress={() => Share.share({ message: url })} />
            {status ? <Muted accessibilityLiveRegion="polite">{status}</Muted> : null}
          </Card>
          <Card>
            <SectionHeader>Replace code</SectionHeader>
            <Muted>
              Shared it somewhere you shouldn’t have? A new code makes the old one, and every
              screenshot or print of it, open an inactive tag.
            </Muted>
            {error ? <ErrorText>{error}</ErrorText> : null}
            {confirming ? (
              <>
                <Button label={busy ? 'Replacing…' : 'Replace it'} disabled={busy} onPress={replace} />
                <Button
                  label="Keep this one"
                  kind="quiet"
                  disabled={busy}
                  onPress={() => setConfirming(false)}
                />
              </>
            ) : (
              <Button label="Replace code" kind="quiet" onPress={() => setConfirming(true)} />
            )}
          </Card>
        </>
      ) : null}
      {/* Scanning someone else's code needs no code of your own: it stays
          whenever the origin is set, even with no profile or a failed load. */}
      {webUrl ? (
        <Button label="Scan a code" kind="quiet" onPress={() => router.push('/scan-qr')} />
      ) : null}
      <Button label="Back" kind="quiet" onPress={goBack} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.s5, gap: space.s4 },
  url: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
