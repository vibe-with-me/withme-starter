import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { Text } from 'react-native';
import { Header } from '../../components/Header';
import { fonts, useShadow, useTokens } from '../../lib/tokens';

type FeatherName = ComponentProps<typeof Feather>['name'];

// Dormant without a store URL: hidden from the bar and unreachable. A
// development build shows it anyway, as a setup card (see merch.tsx), so a
// forker meets it while running the demo; a release build never does.
const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL;

function icon(name: FeatherName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Feather name={name} color={color} size={size} />
  );
}

// Active = ink weight, never the accent (mirrors the web nav rule in app.css).
function label({
  focused,
  color,
  children,
}: {
  focused: boolean;
  color: ColorValue;
  children: string;
}) {
  return (
    <Text style={{ color, fontSize: 12, fontFamily: focused ? fonts.bodySemiBold : fonts.bodyMedium }}>
      {children}
    </Text>
  );
}

// Module scope, not inside TabsLayout: react/no-unstable-nested-components.
function header() {
  return <Header />;
}

/**
 * The signed-in tabs. Adding a top-level section = one Tabs.Screen here plus
 * a file in this folder (docs/the-slice.md step 6). Detail screens stay in
 * app/ as stack screens so they push over the bar.
 */
export default function TabsLayout() {
  const t = useTokens();
  const shadow = useShadow();
  return (
    <Tabs
      screenOptions={{
        header,
        sceneStyle: { backgroundColor: t.bg },
        // The bar floats on a shadow in light; in dark (no bar shadow) it keeps the hairline.
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          borderTopWidth: shadow.bar ? 0 : 1,
          ...shadow.bar,
        },
        tabBarActiveTintColor: t.ink,
        tabBarInactiveTintColor: t.inkMuted,
        tabBarLabel: label,
      }}
    >
      <Tabs.Screen name="gatherings" options={{ title: 'Events', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="connections" options={{ title: 'Connections', tabBarIcon: icon('users') }} />
      <Tabs.Screen
        name="merch"
        options={{ title: 'Merch', href: STORE_URL || __DEV__ ? undefined : null, tabBarIcon: icon('shopping-bag') }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
