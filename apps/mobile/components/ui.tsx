import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { avatarSrc } from '../lib/avatar';
import { fonts, radius, space, TAP_TARGET, useShadow, useTokens } from '../lib/tokens';

/** The card surface. `settle` plays the one animation in the motion budget. */
export function Card({ children, settle = false }: { children: ReactNode; settle?: boolean }) {
  const t = useTokens();
  const shadow = useShadow();
  const progress = useRef(new Animated.Value(settle ? 0 : 1)).current;

  useEffect(() => {
    if (!settle) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        progress.setValue(1);
        return;
      }
      Animated.timing(progress, { toValue: 1, duration: 360, useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
      progress.stopAnimation();
    };
  }, [settle, progress]);

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: t.surface },
        shadow.card,
        settle && {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTokens();
  return <Text style={[styles.title, { color: t.ink }]}>{children}</Text>;
}

/** Extra Text props (accessibility, mostly) pass through; the style is fixed. */
export function Muted({ children, ...textProps }: Omit<TextProps, 'style'> & { children: ReactNode }) {
  const t = useTokens();
  return (
    <Text {...textProps} style={[styles.muted, { color: t.inkMuted }]}>
      {children}
    </Text>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTokens();
  return (
    <Text
      accessibilityRole="alert"
      style={[styles.errorText, { color: t.ink, backgroundColor: t.bg }]}
    >
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  kind = 'default',
  disabled = false,
  inline = false,
  ref,
  accessibilityLabel,
  expanded,
}: {
  label: string;
  onPress: () => void;
  /** 'connect' is the accent's only home. */
  kind?: 'default' | 'connect' | 'quiet';
  disabled?: boolean;
  /** Size to the label instead of filling the card: for actions inside rows. */
  inline?: boolean;
  /** For moving screen-reader focus here when the control that had it goes away. */
  ref?: Ref<View>;
  /** When the label alone is ambiguous in a list ("Turn off" → "Turn off ABC123"). Keep the label's words in it. */
  accessibilityLabel?: string;
  /** For a button that shows and hides something below it. */
  expanded?: boolean;
}) {
  const t = useTokens();
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        inline && styles.buttonInline,
        // Rank by solidity: default is solid ink, connect is the accent, quiet is text.
        kind === 'connect' && { backgroundColor: t.accent },
        kind === 'default' && { backgroundColor: t.ink },
        kind === 'quiet' && styles.buttonQuiet,
        kind === 'quiet' && pressed && { backgroundColor: t.bg },
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          { color: kind === 'connect' ? t.accentInk : kind === 'quiet' ? t.inkMuted : t.surface },
          kind === 'connect' && styles.buttonLabelConnect,
          kind === 'quiet' && styles.buttonLabelQuiet,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  ref,
  ...inputProps
}: TextInputProps & {
  label: string;
  /** For moving focus into a field that was just added. */
  ref?: Ref<TextInput>;
}) {
  const t = useTokens();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: t.ink }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={t.inkMuted}
        // Off by default: emails, UIDs, and URLs must not be autocorrected.
        // Callers can re-enable per field via inputProps.
        autoCorrect={false}
        spellCheck={false}
        style={[
          styles.input,
          { color: t.ink, backgroundColor: t.bg, borderColor: t.borderInput },
        ]}
        {...inputProps}
      />
    </View>
  );
}

export function Avatar({
  name,
  path,
  size = 76,
}: {
  name: string;
  path: string | null;
  size?: number;
}) {
  const t = useTokens();
  const url = avatarSrc(path);
  // A photo that fails to load (deleted, storage down) falls back to the
  // initial, as on web; keyed by URL, so a new photo gets its own attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url && url !== failedUrl) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.avatar, { width: size, height: size, borderColor: t.border }]}
        onError={() => setFailedUrl(url)}
      />
    );
  }
  // The placeholder is a solid object (ink disc, surface initial): the first
  // thing a stranger sees. A photo keeps a hairline so a light photo has an edge.
  return (
    <View
      style={[
        styles.avatar,
        styles.avatarFallback,
        { width: size, height: size, backgroundColor: t.ink },
      ]}
    >
      <Text style={[styles.avatarInitial, { color: t.surface, fontSize: size * 0.42 }]}>
        {(name.trim().charAt(0) || '?').toUpperCase()}
      </Text>
    </View>
  );
}

export type ListState<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: T[] };

/** A section heading inside a screen (the mirror of web's .section-title). */
export function SectionHeader({ children }: { children: ReactNode }) {
  const t = useTokens();
  return (
    <Text accessibilityRole="header" style={[styles.sectionHeader, { color: t.ink }]}>
      {children}
    </Text>
  );
}

/** The typed empty state at the bottom of the ladder. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Muted>{children}</Muted>
    </View>
  );
}

/**
 * Every list climbs the same ladder: loading → error with retry → typed
 * empty → content. `what` completes "Couldn't load …".
 */
export function ListLadder<T>({
  state,
  what,
  empty,
  onRetry,
  children,
}: {
  state: ListState<T>;
  what: string;
  empty: string;
  onRetry: () => void;
  children: (items: T[]) => ReactNode;
}) {
  if (state.status === 'loading') {
    return (
      <Muted accessibilityRole="progressbar" accessibilityLiveRegion="polite">
        Loading…
      </Muted>
    );
  }
  if (state.status === 'error') {
    // A row of the list it failed to load, not a box (mirrors web's .list-error).
    return (
      <View style={styles.ladderError}>
        <LadderErrorText>{`Couldn't load ${what}.`}</LadderErrorText>
        <Button label="Try again" kind="quiet" inline onPress={onRetry} />
      </View>
    );
  }
  if (state.items.length === 0) return <EmptyState>{empty}</EmptyState>;
  return <>{children(state.items)}</>;
}

function LadderErrorText({ children }: { children: ReactNode }) {
  const t = useTokens();
  return (
    <Text accessibilityRole="alert" style={[styles.ladderErrorText, { color: t.ink }]}>
      {children}
    </Text>
  );
}

/**
 * A person in a list. Actions sit on their own line under the name and
 * wrap, so two buttons never push past the card (the Accept overflow): the
 * same rule app.css applies to rows under 480px.
 */
export function PersonRow({
  name,
  path,
  sub,
  extra,
  children,
}: {
  name: string;
  path: string | null;
  sub?: string | null;
  /** Under the name and sub, full width: a connection's link chips. */
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const t = useTokens();
  return (
    <View style={[styles.personRow, { borderTopColor: t.border }]}>
      <View style={styles.personMain}>
        <Avatar name={name} path={path} size={44} />
        <View style={styles.personBody}>
          <Text numberOfLines={2} style={[styles.personName, { color: t.ink }]}>
            {name}
          </Text>
          {sub ? (
            <Text numberOfLines={2} style={[styles.personSub, { color: t.inkMuted }]}>
              {sub}
            </Text>
          ) : null}
        </View>
      </View>
      {extra}
      {children ? <View style={styles.personActions}>{children}</View> : null}
    </View>
  );
}

export interface SegmentItem<K extends string> {
  key: K;
  label: string;
  /** Shown as an ink badge (never the accent); read as "<label>, <count> <countNoun>". */
  count?: number;
  countNoun?: string;
}

/** In-page segments. Selected = ink weight + a 2px ink underline, never the accent. */
export function SegmentedTabs<K extends string>({
  items,
  active,
  onChange,
}: {
  items: SegmentItem<K>[];
  active: K;
  onChange: (key: K) => void;
}) {
  const t = useTokens();
  return (
    <View accessibilityRole="tablist" style={[styles.segments, { borderBottomColor: t.border }]}>
      {items.map((item) => {
        const selected = item.key === active;
        const count = item.count ?? 0;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={
              count > 0 ? `${item.label}, ${count} ${item.countNoun ?? ''}`.trim() : item.label
            }
            onPress={() => onChange(item.key)}
            style={[styles.segment, { borderBottomColor: selected ? t.ink : 'transparent' }]}
          >
            <Text
              style={[
                styles.segmentLabel,
                { color: selected ? t.ink : t.inkMuted, fontFamily: selected ? fonts.bodySemiBold : fonts.body },
              ]}
            >
              {item.label}
            </Text>
            {count > 0 ? (
              <View style={[styles.badge, { backgroundColor: t.ink }]}>
                <Text style={[styles.badgeLabel, { color: t.surface }]}>
                  {count > 99 ? '99+' : String(count)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // No border: the shadow (tokens.shadow.card) and the bg/surface step do the work.
  card: {
    borderRadius: radius.card,
    paddingVertical: space.s6,
    paddingHorizontal: space.s5,
    alignItems: 'center',
    gap: space.s4,
    width: '100%',
    maxWidth: 416,
    alignSelf: 'center',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  // The meta role: 15 on 21, muted.
  muted: {
    fontFamily: fonts.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },
  // A bg well inside the card, no outline.
  errorText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    borderRadius: radius.control,
    paddingVertical: space.s3,
    paddingHorizontal: space.s4,
    width: '100%',
    textAlign: 'center',
  },
  button: {
    minHeight: 52,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.s5,
    width: '100%',
  },
  buttonQuiet: {
    backgroundColor: 'transparent',
    minHeight: TAP_TARGET,
    paddingHorizontal: space.s3,
  },
  buttonLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    // A long label wraps; keep both lines centred like a short one.
    textAlign: 'center',
  },
  buttonLabelConnect: {
    fontSize: 18,
  },
  buttonLabelQuiet: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
  },
  field: {
    width: '100%',
    gap: 6,
  },
  fieldLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
  input: {
    minHeight: TAP_TARGET,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 17,
    width: '100%',
  },
  avatar: {
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  avatarFallback: {
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: fonts.display,
  },
  buttonInline: {
    width: 'auto',
    maxWidth: '100%',
    flexShrink: 1,
    minHeight: TAP_TARGET,
    paddingHorizontal: space.s4,
  },
  sectionHeader: {
    fontFamily: fonts.display,
    fontSize: 20,
    letterSpacing: -0.2,
    marginTop: space.s4,
  },
  ladderError: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.s3,
    paddingVertical: space.s3,
  },
  ladderErrorText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    flexShrink: 1,
  },
  empty: {
    paddingVertical: space.s5,
  },
  // Rows are flat and ruled, not boxed: a hairline above each, no fill.
  personRow: {
    borderTopWidth: 1,
    paddingVertical: space.s3,
    gap: space.s2,
  },
  personMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
  },
  personBody: { flex: 1, minWidth: 0 },
  personName: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 22 },
  personSub: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  personActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: space.s2,
  },
  segments: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s2,
    minHeight: TAP_TARGET,
    paddingHorizontal: space.s2,
    borderBottomWidth: 2,
    marginBottom: -1,
  },
  segmentLabel: { fontSize: 15 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    paddingHorizontal: space.s2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
});
