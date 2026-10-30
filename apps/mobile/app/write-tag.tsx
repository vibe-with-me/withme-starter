import { MAX_OWNED_TAGS } from '@withme/contract';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, ErrorText, Muted, Title } from '../components/ui';
import { api } from '../lib/api';
import { cancelRead, isNfcAvailable, writeTag } from '../lib/nfc';
import {
  locksTags,
  usesTemporaryAddress,
  writeResultMessage,
  type WriteResult,
} from '../lib/tag-writer';
import { space, useTokens } from '../lib/tokens';
import { webUrl } from '../lib/web-url';

/**
 * Profile → My tags → Add a tag, or Write to a tag on one row. One hold checks
 * the sticker, makes the tag if there isn't one yet, writes it and locks it;
 * lib/tag-writer.ts decides each step, and tests them. Locking can't be undone,
 * so the screen says that before the hold.
 */
export default function WriteTagScreen() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ uid?: string }>();
  // A row minted by a failed attempt becomes the target of the retry, so
  // trying again doesn't make a second one.
  const [uid, setUid] = useState<string | null>(params.uid ?? null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [atCap, setAtCap] = useState(false);
  const [holding, setHolding] = useState(false);
  const [result, setResult] = useState<WriteResult | null>(null);

  useEffect(() => {
    isNfcAvailable()
      .then(setReady)
      .catch(() => setReady(false));
    // Add a tag says so up front at the cap. The RPC is what enforces it.
    if (!params.uid) {
      api.app.tags
        .listMine()
        .then(({ tags }) => setAtCap(tags.length >= MAX_OWNED_TAGS))
        .catch(() => undefined);
    }
    // leaving the screen mid-hold must release the NFC session
    return () => {
      cancelRead();
    };
    // oxlint-disable-next-line exhaustive-deps
  }, []);

  async function hold(origin: string) {
    setHolding(true);
    setResult(null);
    try {
      const outcome = await writeTag({
        origin,
        uid,
        mint: () => api.app.tags.mint().then((minted) => minted.uid),
      });
      if (outcome && 'uid' in outcome) setUid(outcome.uid);
      if (outcome?.kind === 'at-cap') setAtCap(true);
      setResult(outcome);
    } finally {
      setHolding(false);
    }
  }

  const done = result?.kind === 'done';
  const failed = result !== null && !done;

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.s5 }]}
    >
      <Card>
        <Title>{params.uid ? 'Write to a tag' : 'Add a tag'}</Title>
        {!webUrl ? (
          <Muted>
            Writing isn’t set up. Set EXPO_PUBLIC_WEB_URL to your web app’s address; a tag opens a
            page there.
          </Muted>
        ) : ready === false ? (
          <Muted>Writing a tag needs a phone with NFC turned on.</Muted>
        ) : atCap && !uid ? (
          <Muted accessibilityLiveRegion="polite">
            You’ve reached the limit of {MAX_OWNED_TAGS} tags, so no new one can be made.
          </Muted>
        ) : done ? (
          <Muted accessibilityLiveRegion="polite">{writeResultMessage(result)}</Muted>
        ) : (
          <>
            {locksTags(webUrl) ? (
              <Muted>
                Hold a blank sticker to your phone. It’s locked for good once it’s written, so it
                can’t be written again, but you can change where it points whenever you like.
              </Muted>
            ) : (
              <Muted>
                Hold a blank sticker to your phone. This address isn’t https, so it’s a test tag and
                won’t be locked.
              </Muted>
            )}
            {usesTemporaryAddress(webUrl) ? (
              <ErrorText>
                This app’s address is a workers.dev one, and a locked sticker keeps it for good. Use
                your own domain for tags you’ll hand out.
              </ErrorText>
            ) : null}
            {failed ? <ErrorText>{writeResultMessage(result)}</ErrorText> : null}
            <Button
              kind="connect"
              label={holding ? 'Hold near the sticker…' : failed ? 'Try again' : 'Write the sticker'}
              disabled={holding || ready === null}
              onPress={() => void hold(webUrl)}
            />
          </>
        )}
        <Button label={done ? 'Done' : 'Back'} kind="quiet" onPress={() => router.back()} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.s5, gap: space.s4 },
});
