import {
  LINK_PLATFORM_IDS,
  LINK_PLATFORMS,
  linkHref,
  linkLabel,
  normalizeLinkValue,
  type LinkKind,
  type LinkPlatformId,
  type ProfileLink,
} from '@withme/contract';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../lib/api';
import { fonts, radius, space, TAP_TARGET, useTokens } from '../lib/tokens';
import { Button, Card, ErrorText, Field, Muted, SectionHeader } from './ui';

const KEYBOARD: Record<LinkKind, 'default' | 'phone-pad' | 'email-address' | 'url'> = {
  handle: 'default',
  phone: 'phone-pad',
  email: 'email-address',
  url: 'url',
};

const INVALID: Record<LinkKind, string> = {
  handle: 'Letters, numbers, dots, dashes and underscores only.',
  phone: 'Enter a phone number with its country code.',
  email: 'Enter an email address.',
  url: 'Enter a web address.',
};

interface Row {
  platform: LinkPlatformId;
  value: string;
  error: string | null;
}

/** iOS has no live regions: say it outright. Android reads the live region. */
function announce(message: string) {
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  }
}

/**
 * Profile → Links, the mirror of web's: the places people can reach you,
 * one per platform, from a picker of every platform the starter knows.
 * Saved as a whole list through app.links.replace; only your connections
 * ever read it. Loaded once: a focus reload would clobber a draft.
 */
export function Links() {
  const t = useTokens();
  const [load, setLoad] = useState<'loading' | 'error' | 'ready'>('loading');
  const [rows, setRows] = useState<Row[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const inputs = useRef(new Map<LinkPlatformId, TextInput>());
  const taken = new Set(rows.map((row) => row.platform));
  const available = LINK_PLATFORM_IDS.filter((platform) => !taken.has(platform));

  const reload = () => {
    setLoad('loading');
    api.app.links
      .listMine()
      .then(({ links }) => {
        setRows(links.map((link) => ({ ...link, error: null })));
        setLoad('ready');
      })
      // A failed load must NOT render an empty editor: saving it would clear the list.
      .catch(() => setLoad('error'));
  };
  // oxlint-disable-next-line exhaustive-deps
  useEffect(reload, []);

  function add(platform: LinkPlatformId) {
    setRows((prev) => [...prev, { platform, value: '', error: null }]);
    setChoosing(false);
    setStatus(null);
    // The input mounts on the next frame.
    setTimeout(() => inputs.current.get(platform)?.focus(), 0);
  }

  function remove(platform: LinkPlatformId) {
    setRows((prev) => prev.filter((row) => row.platform !== platform));
    setStatus(null);
  }

  function edit(platform: LinkPlatformId, value: string) {
    setRows((prev) =>
      prev.map((row) => (row.platform === platform ? { ...row, value, error: null } : row)),
    );
  }

  async function save() {
    setStatus(null);
    setFailed(false);
    const checked = rows.map((row) => {
      const value = normalizeLinkValue(row.platform, row.value);
      return value === null
        ? { ...row, error: INVALID[LINK_PLATFORMS[row.platform].kind] }
        : { ...row, value, error: null };
    });
    const firstInvalid = checked.find((row) => row.error);
    if (firstInvalid) {
      setRows(checked);
      announce(`${LINK_PLATFORMS[firstInvalid.platform].label}: ${firstInvalid.error}`);
      inputs.current.get(firstInvalid.platform)?.focus();
      return;
    }
    setBusy(true);
    try {
      const saved = await api.app.links.replace({
        links: checked.map(({ platform, value }) => ({ platform, value })),
      });
      setRows(saved.links.map((link) => ({ ...link, error: null })));
      setStatus('Links saved.');
      announce('Links saved.');
    } catch {
      setFailed(true);
      announce("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeader>Links</SectionHeader>
      <Muted>Where people can reach you. Only the people you’ve connected with can see these.</Muted>
      {load === 'loading' ? (
        <Muted accessibilityRole="progressbar" accessibilityLiveRegion="polite">
          Loading…
        </Muted>
      ) : load === 'error' ? (
        <View style={styles.loadError}>
          <ErrorText>Couldn't load your links.</ErrorText>
          <Button label="Try again" kind="quiet" onPress={reload} />
        </View>
      ) : (
        <>
          {rows.map((row) => {
            const { label, kind, placeholder } = LINK_PLATFORMS[row.platform];
            return (
              <View key={row.platform} style={styles.row}>
                <View style={styles.rowField}>
                  <Field
                    ref={(el: TextInput | null) => {
                      if (el) inputs.current.set(row.platform, el);
                      else inputs.current.delete(row.platform);
                    }}
                    label={label}
                    value={row.value}
                    placeholder={placeholder}
                    keyboardType={KEYBOARD[kind]}
                    autoCapitalize="none"
                    maxLength={200}
                    editable={!busy}
                    onChangeText={(value) => edit(row.platform, value)}
                  />
                  {row.error ? <ErrorText>{row.error}</ErrorText> : null}
                </View>
                <Button
                  inline
                  label="Remove"
                  kind="quiet"
                  accessibilityLabel={`Remove ${label}`}
                  disabled={busy}
                  onPress={() => remove(row.platform)}
                />
              </View>
            );
          })}
          {available.length > 0 ? (
            <Button
              label={rows.length === 0 ? 'Add a link' : 'Add another link'}
              kind="quiet"
              expanded={choosing}
              onPress={() => setChoosing((open) => !open)}
            />
          ) : null}
          {choosing ? (
            <View style={styles.chooser} accessibilityLabel="Choose a platform">
              {available.map((platform) => (
                <Button
                  key={platform}
                  inline
                  label={LINK_PLATFORMS[platform].label}
                  onPress={() => add(platform)}
                />
              ))}
            </View>
          ) : null}
          {status ? (
            <Text accessibilityRole="text" style={{ color: t.inkMuted }}>
              {status}
            </Text>
          ) : null}
          {failed ? <ErrorText>That didn't go through. Try again.</ErrorText> : null}
          <Button label={busy ? 'Saving…' : 'Save links'} onPress={save} disabled={busy} />
        </>
      )}
    </Card>
  );
}

/**
 * Someone's links as chips: opens the platform's page where it has one,
 * plain text where it has none (Discord, Signal). Shown only on a
 * connection's row — the database admits them nowhere else.
 */
export function LinkChips({ links }: { links: ProfileLink[] }) {
  const t = useTokens();
  if (links.length === 0) return null;
  return (
    <View style={styles.chips}>
      {links.map((link) => {
        const { label } = LINK_PLATFORMS[link.platform];
        const href = linkHref(link.platform, link.value);
        const text = linkLabel(link.platform, link.value);
        const body = (
          <>
            <Text style={[styles.chipPlatform, { color: t.inkMuted }]}>{label}</Text>
            <Text style={[styles.chipValue, { color: t.ink }]} numberOfLines={1}>
              {text}
            </Text>
          </>
        );
        if (!href) {
          return (
            <View
              key={link.platform}
              accessible
              accessibilityLabel={`${label} ${text}`}
              style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border }]}
            >
              {body}
            </View>
          );
        }
        return (
          <Pressable
            key={link.platform}
            accessibilityRole="link"
            accessibilityLabel={`${label} ${text}`}
            onPress={() => Linking.openURL(href).catch(() => undefined)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: t.bg, borderColor: pressed ? t.ink : t.border },
            ]}
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  loadError: { width: '100%', alignItems: 'center', gap: space.s2 },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.s2,
  },
  rowField: { flex: 1, minWidth: 0, gap: space.s2 },
  chooser: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.s2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.s2,
    marginTop: space.s2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s1,
    minHeight: TAP_TARGET,
    paddingHorizontal: space.s3,
    borderWidth: 1,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  chipPlatform: { fontFamily: fonts.body, fontSize: 14 },
  chipValue: { fontFamily: fonts.bodySemiBold, fontSize: 14, flexShrink: 1 },
});
