import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/components/core/app-icon';
import { colors } from '@/theme/tokens';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const icon =
    (activeName: AppIconName, idleName: AppIconName) =>
    ({ color, focused }: { color: string; focused: boolean }) => <AppIcon color={color} name={focused ? activeName : idleName} size={25} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: {
          borderTopColor: colors.line,
          height: 57 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 5
        },
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarIcon: icon('home', 'home-outline'), title: 'Trang chủ' }} />
      <Tabs.Screen name="explore" options={{ tabBarIcon: icon('bag-handle', 'bag-handle-outline'), title: 'Mall' }} />
      <Tabs.Screen name="video" options={{ tabBarIcon: icon('play-circle', 'play-circle-outline'), title: 'Live & Video' }} />
      <Tabs.Screen name="chat" options={{ tabBarIcon: icon('chatbubble-ellipses', 'chatbubble-ellipses-outline'), title: 'Tin nhắn' }} />
      <Tabs.Screen name="live" options={{ href: null }} />
      <Tabs.Screen name="cart" options={{ href: null }} />
      <Tabs.Screen name="account" options={{ tabBarIcon: icon('person', 'person-outline'), title: 'Tôi' }} />
    </Tabs>
  );
}
