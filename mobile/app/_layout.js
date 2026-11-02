// Главный «каркас» приложения: шрифты, язык, вход пользователя, окна-подтверждения
// и список экранов. Каждый файл в папке app/ — это отдельный экран (expo-router):
//   app/welcome.js           → вход через Telegram
//   app/email.js             → вход, регистрация и смена пароля по почте
//   app/(tabs)/...           → вкладки «Подписки», «Платежи», «Профиль»
//   app/group/new.js         → создание группы
//   app/group/[id]/index.js  → экран группы (id — номер группы)
//   app/privacy.js, terms.js → политика конфиденциальности и условия (видны всем)
import { Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold } from "@expo-google-fonts/onest";
import { Unbounded_600SemiBold, Unbounded_700Bold } from "@expo-google-fonts/unbounded";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Linking, Platform, Pressable } from "react-native";

import { WebFrame } from "../components/WebFrame";
import { api } from "../lib/api";
import { AuthProvider, useAuth } from "../lib/auth";
import { DialogProvider, useDialogs } from "../lib/dialogs";
import { LanguageProvider, t, useLanguage } from "../lib/i18n";
import { colors, fonts } from "../lib/theme";
import { APK_URL, checkForUpdate } from "../lib/updates";

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
      <LanguageProvider>
        <WebFrame>
          <DialogProvider>
            <RootNavigator fontsLoaded={fontsLoaded} />
          </DialogProvider>
        </WebFrame>
      </LanguageProvider>
    </AuthProvider>
  );
}

function RootNavigator({ fontsLoaded }) {
  const { user, ready, updateUser } = useAuth();
  const { language } = useLanguage();
  const { confirm } = useDialogs();
  const loaded = fontsLoaded && ready;

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  // Язык в аккаунте должен совпадать с языком приложения: на нём бот пишет напоминания.
  // Проверяем после входа и при смене языка; пока никто не вошёл, сервер не спрашиваем
  useEffect(() => {
    if (user && user.language !== language) {
      api.updateMe({ language }).then(updateUser).catch(() => {});
    }
  }, [user?.id, language]);

  // Вышла новая версия APK — предлагаем скачать (только в Android-приложении)
  useEffect(() => {
    if (!loaded) return;
    checkForUpdate().then(async (version) => {
      if (!version) return;
      const ok = await confirm({
        title: t("Вышла новая версия {version}", { version }),
        message: t("Скачайте и установите её поверх старой — данные сохранятся."),
        confirmText: t("Скачать"),
        cancelText: t("Позже"),
      });
      if (ok) Linking.openURL(APK_URL);
    });
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
          // В браузере после обновления страницы истории переходов нет, и стрелки «назад»
          // не было бы — рисуем свою: она вернёт назад или на главный экран
          headerLeft: Platform.OS === "web" ? WebBackButton : undefined,
        }}
      >
        {/* Эти экраны видны только после входа */}
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="group/new" options={{ title: t("Новая группа") }} />
          <Stack.Screen name="group/[id]/index" options={{ title: t("Группа") }} />
          <Stack.Screen name="group/[id]/invite" options={{ title: t("Добавить участника") }} />
          <Stack.Screen name="group/[id]/edit" options={{ title: t("Изменить группу") }} />
        </Stack.Protected>

        {/* Экран входа — только для тех, кто ещё не вошёл */}
        <Stack.Protected guard={!user}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          {/* Заголовок шага — на самом экране, поэтому сверху только стрелка «назад» */}
          <Stack.Screen name="email" options={{ title: "" }} />
        </Stack.Protected>

        {/* Документы видны всем: ссылки на них есть и на экране входа */}
        <Stack.Screen name="privacy" options={{ title: t("Конфиденциальность") }} />
        <Stack.Screen name="terms" options={{ title: t("Условия использования") }} />
      </Stack>
    </>
  );
}

function WebBackButton({ tintColor }) {
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      accessibilityRole="button"
      accessibilityLabel={t("Назад")}
      style={{ padding: 8, marginLeft: 4 }}
    >
      <Ionicons name="arrow-back" size={24} color={tintColor} />
    </Pressable>
  );
}
