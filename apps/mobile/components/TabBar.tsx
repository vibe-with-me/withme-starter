import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { fonts, useShadow, useTokens } from '../lib/tokens';

/** How far the share button rises out of the bar. */
const RISE = 20;
const SHARE_SIZE = 56;

/**
 * The tab bar with the share button raised out of its middle: your code,
 * one tap from every tab, the handshake for someone without a tag. The
 * button is not a tab (it pushes the share screen over the bar). With an
 * odd tab count the extra tab goes left, and the two halves get equal
 * width so the button sits at the center. Tabs hidden with `href: null`
 * (Merch without a store) are skipped, as the stock bar skips them.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const t = useTokens();
  const shadow = useShadow();
  const visible = state.routes.filter(
    (route) =>
      StyleSheet.flatten(descriptors[route.key]?.options.tabBarItemStyle as ViewStyle)?.display !==
      'none',
  );
  const half = Math.ceil(visible.length / 2);

  function tab(route: (typeof state.routes)[number]) {
    const { options } = descriptors[route.key]!;
    const focused = state.routes[state.index]?.key === route.key;
    const color = focused ? t.ink : t.inkMuted;
    const title = options.title ?? route.name;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={title}
        onPress={() => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        }}
        onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
        style={styles.tab}
      >
        {options.tabBarIcon?.({ focused, color, size: 24 })}
        {/* Active = ink weight, never the accent (mirrors the web nav rule in app.css). */}
        <Text style={[styles.label, { color, fontFamily: focused ? fonts.bodySemiBold : fonts.bodyMedium }]}>
          {title}
        </Text>
      </Pressable>
    );
  }

  return (
    // The outer view reaches up by RISE so the raised part of the button is
    // inside it: on iOS a touch outside a parent's bounds never reaches the
    // child. Only the inner backdrop is painted; the strip above it is clear.
    <View style={styles.outer}>
      <View
        style={[
          styles.backdrop,
          {
            backgroundColor: t.surface,
            // The bar floats on a shadow in light; in dark (no bar shadow) it keeps the hairline.
            borderTopColor: t.border,
            borderTopWidth: shadow.bar ? 0 : 1,
          },
          shadow.bar,
        ]}
      />
      <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
        <View style={styles.half}>{visible.slice(0, half).map(tab)}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your code"
          accessibilityHint="Shows a QR code that opens your card"
          onPress={() => router.push('/share')}
          // Solid ink, like the default button: the accent stays with a screen's primary action.
          style={({ pressed }) => [
            styles.share,
            { backgroundColor: t.ink },
            shadow.card,
            pressed && { opacity: 0.85 },
          ]}
        >
          <MaterialCommunityIcons name="qrcode" size={28} color={t.surface} />
        </Pressable>
        <View style={styles.half}>{visible.slice(half).map(tab)}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingTop: RISE },
  backdrop: { position: 'absolute', left: 0, right: 0, bottom: 0, top: RISE },
  bar: { flexDirection: 'row', alignItems: 'flex-start' },
  half: { flex: 1, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 6, paddingBottom: 4, gap: 2, minHeight: 49 },
  label: { fontSize: 12 },
  share: {
    width: SHARE_SIZE,
    height: SHARE_SIZE,
    borderRadius: SHARE_SIZE / 2,
    marginTop: -RISE,
    marginHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
