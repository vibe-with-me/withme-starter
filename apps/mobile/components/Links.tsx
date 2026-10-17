import {
  LINK_PLATFORM_IDS,
  LINK_PLATFORMS,
  linkHref,
  linkIcon,
  linkLabel,
  normalizeLinkValue,
  type LinkGlyph,
  type LinkKind,
  type LinkPlatformId,
  type ProfileLink,
} from '@withme/contract';
import { Feather } from '@expo/vector-icons';
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
import Svg, { Path } from 'react-native-svg';
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

const GLYPHS: Record<LinkGlyph, keyof typeof Feather.glyphMap> = {
  phone: 'phone',
  email: 'mail',
  website: 'globe',
  link: 'link',
};

const ICON_SIZE = 16;

/**
 * A platform's icon, in the colour of the text beside it. Decorative and
 * never focusable: the chip and the picker button already say the
 * platform's name.
 */
function PlatformIcon({ platform, color }: { platform: LinkPlatformId; color: string }) {
  const icon = linkIcon(platform);
  if ('glyph' in icon) {
    return (
      <Feather
        name={GLYPHS[icon.glyph]}
        size={ICON_SIZE}
        color={color}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }
  // The marks fill their 24×24 box; a 2-unit margin sets them at Feather's weight.
  return (
    <Svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="-2 -2 28 28"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={icon.path} fill={color} />
    </Svg>
  );
}

interface Row {
  platform: LinkPlatformId;
  value: string;
  error: string | null;
}

type Direction = 'up' | 'down';

/** The list with the row at `from` swapped with its neighbour; unchanged at either end. */
function moved(rows: Row[], from: number, direction: Direction): Row[] {
  const to = direction === 'up' ? from - 1 : from + 1;
  const a = rows[from];
  const b = rows[to];
  if (!a || !b) return rows;
  return rows.map((row, i) => (i === from ? b : i === to ? a : row));
}

/** Say it outright on both platforms: iOS has no live regions, and the status text here has none either. */
function announce(message: string) {
  if (Platform.OS === 'ios') {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  } else {
    AccessibilityInfo.announceForAccessibility(message);
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
  const moves = useRef(new Map<string, View>());
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

  function move(platform: LinkPlatformId, direction: Direction) {
    const from = rows.findIndex((row) => row.platform === platform);
    const to = direction === 'up' ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= rows.length) return;
    // The order is a draft until Save links, like a changed value.
    setRows((prev) => moved(prev, from, direction));
    setStatus(null);
    setFailed(false);
    // At either end the pressed control is gone: stay on the row's other move.
    // The controls settle on the next frame; the position is read after the focus move.
    const other = direction === 'up' ? 'down' : 'up';
    setTimeout(() => {
      const target =
        moves.current.get(`${platform}:${direction}`) ?? moves.current.get(`${platform}:${other}`);
      if (target) AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
      announce(`${LINK_PLATFORMS[platform].label} moved to ${to + 1} of ${rows.length}.`);
    }, 0);
  }

  function edit(platform: LinkPlatformId, value: string) {
    setRows((prev) =>
      prev.map((row) => (row.platform === platform ? { ...row, value, error: null } : row)),
    );
    // A draft is not saved: drop "Links saved." (or a failure) once a value changes.
    setStatus(null);
    setFailed(false);
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
          {rows.map((row, i) => {
            const { label, kind, placeholder } = LINK_PLATFORMS[row.platform];
            const moveRef = (direction: Direction) => (el: View | null) => {
              if (el) moves.current.set(`${row.platform}:${direction}`, el);
              else moves.current.delete(`${row.platform}:${direction}`);
            };
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
                {/* Up, Down, Remove under the field: three beside it would squeeze it. */}
                <View style={styles.rowActions}>
                  {i === 0 ? null : (
                    <Button
                      ref={moveRef('up')}
                      inline
                      label="Up"
                      kind="quiet"
                      accessibilityLabel={`Move ${label} up`}
                      disabled={busy}
                      onPress={() => move(row.platform, 'up')}
                    />
                  )}
                  {i === rows.length - 1 ? null : (
                    <Button
                      ref={moveRef('down')}
                      inline
                      label="Down"
                      kind="quiet"
                      accessibilityLabel={`Move ${label} down`}
                      disabled={busy}
                      onPress={() => move(row.platform, 'down')}
                    />
                  )}
                  <Button
                    inline
                    label="Remove"
                    kind="quiet"
                    accessibilityLabel={`Remove ${label}`}
                    disabled={busy}
                    onPress={() => remove(row.platform)}
                  />
                </View>
              </View>
            );
          })}
          {available.length > 0 ? (
            <Button
              label={rows.length === 0 ? 'Add a link' : 'Add another link'}
              kind="quiet"
              expanded={choosing}
              // A save's response replaces the rows: a platform added mid-save would vanish.
              disabled={busy}
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
                  // A default button's label is surface on ink.
                  icon={<PlatformIcon platform={platform} color={t.surface} />}
                  disabled={busy}
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
            <PlatformIcon platform={link.platform} color={t.ink} />
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
  row: { width: '100%' },
  rowField: { width: '100%', gap: space.s2 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end' },
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
