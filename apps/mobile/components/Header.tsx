import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, SHELL, space, TAP_TARGET, useTokens } from '../lib/tokens';

/**
 * The shared tab header: wordmark left, scan right. There is no home tab, so
 * the physical action stays one tap away from every tab.
 */
export function Header() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.header,
        {
          height: insets.top + SHELL.headerHeight,
          paddingTop: insets.top,
          backgroundColor: t.bg,
          borderBottomColor: t.border,
        },
      ]}
    >
      <Text accessibilityRole="header" style={[styles.wordmark, { color: t.ink }]}>withme</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a tag"
        hitSlop={8}
        onPress={() => router.push('/scan')}
        style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
      >
        <Feather name="maximize" size={22} color={t.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.s5,
    borderBottomWidth: 1,
  },
  // A setting, not a drawing: display face, 700, -0.03em, lowercase (mirrors .wordmark).
  wordmark: {
    fontFamily: fonts.displayBold,
    fontSize: 20,
    letterSpacing: -0.6,
  },
  action: {
    minWidth: TAP_TARGET,
    minHeight: TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
