// Нижние вкладки: «Подписки», «Платежи», «Профиль».
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts } from "../../lib/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.sapphire,
        tabBarInactiveTintColor: "#8A92AD",
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        // Стандартной высоты панели шрифту Onest не хватает — подписи обрезались снизу.
        // insets.bottom — место под полоску «домой» внизу экрана у новых телефонов.
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          height: 62 + insets.bottom,
        },
        sceneStyle: { backgroundColor: colors.cloud },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Подписки",
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: "Платежи",
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
