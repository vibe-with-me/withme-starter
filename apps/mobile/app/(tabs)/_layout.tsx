import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { Header } from '../../components/Header';
import { TabBar } from '../../components/TabBar';
import { useTokens } from '../../lib/tokens';

type FeatherName = ComponentProps<typeof Feather>['name'];

// Dormant without a store URL: hidden from the bar and unreachable.
const STORE_URL = process.env.EXPO_PUBLIC_STORE_URL;

function icon(name: FeatherName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Feather name={name} color={color} size={size} />
  );
}

// Module scope, not inside TabsLayout: react/no-unstable-nested-components.
function header() {
  return <Header />;
}

function tabBar(props: BottomTabBarProps) {
  return <TabBar {...props} />;
}

/**
 * The signed-in tabs. Adding a top-level section = one Tabs.Screen here plus
 * a file in this folder (docs/the-slice.md step 6). Detail screens stay in
 * app/ as stack screens so they push over the bar, as the share button's
 * screen does.
 */
export default function TabsLayout() {
  const t = useTokens();
  return (
    <Tabs
      // The bar draws the tabs from these options and raises the share button
      // out of its middle (components/TabBar.tsx).
      tabBar={tabBar}
      screenOptions={{
        header,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="gatherings" options={{ title: 'Events', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="connections" options={{ title: 'Connections', tabBarIcon: icon('users') }} />
      <Tabs.Screen
        name="merch"
        options={{ title: 'Merch', href: STORE_URL ? undefined : null, tabBarIcon: icon('shopping-bag') }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
