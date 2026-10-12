// Главный «каркас» приложения: шрифты, вход пользователя, окна-подтверждения
// и список экранов. Каждый файл в папке app/ — это отдельный экран (expo-router):
//   app/welcome.js           → вход и регистрация
//   app/(tabs)/...           → вкладки «Подписки», «Платежи», «Профиль»
//   app/group/new.js         → создание группы
//   app/group/[id]/index.js  → экран группы (id — номер группы)
import { Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold } from "@expo-google-fonts/onest";
import { Unbounded_600SemiBold, Unbounded_700Bold } from "@expo-google-fonts/unbounded";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { WebFrame } from "../components/WebFrame";
import { AuthProvider, useAuth } from "../lib/auth";
import { DialogProvider } from "../lib/dialogs";
import { colors, fonts } from "../lib/theme";

// Держим заставку, пока не загрузились шрифты и сохранённый пользователь
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Unbounded_600SemiBold,
    Unbounded_700Bold,
    Onest_400Regular,
    Onest_500Medium,
    Onest_600SemiBold,
    Onest_700Bold,
  });

  return (
    <AuthProvider>
      <WebFrame>
        <DialogProvider>
          <RootNavigator fontsLoaded={fontsLoaded} />
        </DialogProvider>
      </WebFrame>
    </AuthProvider>
  );
}

function RootNavigator({ fontsLoaded }) {
  const { user, ready } = useAuth();
  const loaded = fontsLoaded && ready;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.cloud },
          headerTintColor: colors.midnight,
          headerTitleStyle: { fontFamily: fonts.headingSemi, fontSize: 17 },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.cloud },
        }}
      >
        {/* Эти экраны видны только после входа */}
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="group/new" options={{ title: "Новая группа" }} />
          <Stack.Screen name="group/[id]/index" options={{ title: "Группа" }} />
          <Stack.Screen name="group/[id]/invite" options={{ title: "Добавить участника" }} />
          <Stack.Screen name="group/[id]/edit" options={{ title: "Изменить группу" }} />
        </Stack.Protected>

        {/* Экран входа — только для тех, кто ещё не вошёл */}
        <Stack.Protected guard={!user}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
