import { gatheringCalendarEvent, gatheringUrl, mapsSearchUrl, type Gathering } from '@withme/contract';
import { Feather } from '@expo/vector-icons';
import { createEventInCalendarAsync } from 'expo-calendar/legacy';
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text } from 'react-native';
import type { MetaLine } from '../lib/format-time';
import { fonts, space, TAP_TARGET, useTokens } from '../lib/tokens';
import { webUrl } from '../lib/web-url';
import { Button, ErrorText, Muted } from './ui';

/** What a screen reader says for a location link. */
export const mapsLinkLabel = (location: string) => `${location}, opens in Maps`;

/**
 * Searches the platform's maps app for a gathering's location: Apple Maps
 * on iOS, the maps chooser on Android, Google Maps on the web where neither
 * opens. Nothing leaves the phone until the viewer taps (docs/safety-model.md).
 *
 * openURL rejects when no app handles the scheme, which is the fallback's
 * signal. canOpenURL would need an allowlist per platform (iOS
 * LSApplicationQueriesSchemes, Android 11+ <queries>, which app.json cannot
 * declare) and answers false in Expo Go regardless.
 */
export async function openInMaps(location: string): Promise<void> {
  const web = mapsSearchUrl(location, 'web');
  const native =
    Platform.OS === 'ios' || Platform.OS === 'android' ? mapsSearchUrl(location, Platform.OS) : web;
  if (!web || !native) return;
  try {
    await Linking.openURL(native);
  } catch {
    await Linking.openURL(web).catch(() => undefined);
  }
}

/**
 * A gathering's location as a link on its own line, with the pin the Links
 * chips' way (a Feather glyph, decorative). Ink, not the accent: the accent
 * is a screen's primary action only.
 */
export function MapsLink({ location }: { location: string }) {
  const t = useTokens();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={mapsLinkLabel(location)}
      onPress={() => void openInMaps(location)}
      hitSlop={4}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
    >
      <Feather
        name="map-pin"
        size={14}
        color={t.ink}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text style={[styles.linkText, { color: t.ink }]}>{location}</Text>
    </Pressable>
  );
}

/** A meta line from lib/format-time.ts: the text before the location, the location as a Maps link, the text after. */
export function GatheringMeta({ line }: { line: MetaLine }) {
  return (
    <>
      {line.head ? <Muted>{line.head}</Muted> : null}
      {line.location ? <MapsLink location={line.location} /> : null}
      {line.tail ? <Muted>{line.tail}</Muted> : null}
    </>
  );
}

/**
 * Opens the system's own new-event sheet, filled in: the viewer picks the
 * calendar and saves, or cancels. No calendar permission: iOS 17+ and
 * Android write through the sheet, not the app (app.json declares none).
 * The event carries the title, time, location and a link back, never who
 * is going (packages/contract/src/schemas/calendar.ts).
 */
export function AddToCalendar({ gathering }: { gathering: Gathering }) {
  const [failed, setFailed] = useState(false);
  async function open() {
    setFailed(false);
    const event = gatheringCalendarEvent(gathering, webUrl ? gatheringUrl(webUrl, gathering.id) : null);
    try {
      await createEventInCalendarAsync({
        title: event.title,
        startDate: event.start,
        endDate: event.end,
        location: event.location ?? undefined,
        // url is iOS-only; the notes carry the link on Android too.
        url: event.url ?? undefined,
        notes: event.url ?? undefined,
      });
    } catch {
      // iOS 16 wants calendar access before the sheet, which this app never asks for.
      setFailed(true);
    }
  }
  return (
    <>
      <Button label="Add to calendar" kind="quiet" onPress={() => void open()} />
      {failed ? <ErrorText>Couldn't open your calendar.</ErrorText> : null}
    </>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s1,
    minHeight: TAP_TARGET,
    maxWidth: '100%',
  },
  linkText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    textDecorationLine: 'underline',
    flexShrink: 1,
    textAlign: 'center',
  },
});
