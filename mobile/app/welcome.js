// Экран входа. Его видно, только пока никто не вошёл (см. Stack.Protected
// в app/_layout.js). После signIn(...) приложение само переключится на вкладки.
//
// Вход через Telegram:
//   1. сервер выдаёт секретный код и ссылку на бота (api.telegramStart);
//   2. приложение открывает бота, человек нажимает в нём «Поделиться номером»;
//   3. бот присылает код из 6 цифр — человек вводит его здесь и входит (api.telegramCheck).
//      Без кода не войти: так никто не войдёт в чужой аккаунт, прислав человеку ссылку на бота.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Logo } from "../components/Logo";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { LANGUAGES, t, useLanguage } from "../lib/i18n";
import { colors, fonts, radius } from "../lib/theme";
import { APK_URL } from "../lib/updates";

// Демо-вход из seed.py — только при разработке на своём компьютере (__DEV__):
// в настоящем приложении демо-аккаунта нет
const DEMO_PHONE = "+77010000001";
const DEMO_PASSWORD = "demo2026";

// Тексты переводятся при показе (t), поэтому здесь они просто по-русски
const FEATURES = [
  {
    icon: "pie-chart",
    color: colors.mint,
    background: "rgba(53, 218, 185, 0.16)",
    text: "Делит цену подписки на всех",
  },
  {
    icon: "checkmark-done",
    color: colors.blue,
    background: "rgba(73, 157, 252, 0.16)",
    text: "Показывает, чьи доли уже оплачены",
  },
  {
    icon: "notifications",
    color: colors.violet,
    background: "rgba(157, 112, 252, 0.18)",
    text: "Сам выставляет счета и напоминает в Telegram",
  },
];

export default function WelcomeScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();

  // { code, url } — вход начат: ждём код, который бот пришлёт в Telegram
  const [waiting, setWaiting] = useState(null);
  const [pin, setPin] = useState(""); // код из бота
  const [pinError, setPinError] = useState(null);
  const [error, setError] = useState(null); // ошибка сервера или сети

  // Пока ждём ответа сервера, на кнопке крутится индикатор (см. components/Button.js)
  async function startTelegram() {
    setError(null);
    try {
      const login = await api.telegramStart();
      setPin("");
      setPinError(null);
      setWaiting(login);
      openTelegram(login.url);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handlePin() {
    if (!/^\d{6}$/.test(pin)) {
      setPinError(t("Введите 6 цифр из Telegram"));
      return;
    }
    setPinError(null);
    try {
      await signIn(await api.telegramCheck(waiting.code, pin));
    } catch (e) {
      if (e.status === 410) {
        // Вход устарел (прошло 10 минут) или код 5 раз ввели неверно — начинать нужно заново
        setWaiting(null);
        setError(e.message);
      } else {
        setPinError(e.message);
      }
    }
  }

  function openTelegram(url) {
    Linking.openURL(url).catch(() =>
      setError(t("Не получилось открыть Telegram. Установите его и попробуйте ещё раз."))
    );
  }

  async function handleDemo() {
    setError(null);
    try {
      await signIn(await api.login(DEMO_PHONE, DEMO_PASSWORD));
    } catch (e) {
      setError(e.status === 401 ? t("Демо-данных нет. Запустите: python seed.py") : e.message);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Декоративные «свечения». Сами круги спрятаны за краем экрана, а на экран
          падает только их большая размытая тень (boxShadow) — мягкий отсвет без резкой границы. */}
      <View style={[styles.glow, styles.glowViolet]} />
      <View style={[styles.glow, styles.glowBlue]} />
      <View style={[styles.glow, styles.glowMint]} />

      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.hero}>
            <View style={styles.inner}>
              <LanguageSwitch />
              <Logo size={64} />
              <Text style={styles.brand} accessibilityRole="header">
                SubShare
              </Text>
              <Text style={styles.tagline}>
                {t("Подписки вскладчину — без таблиц и неловких напоминаний")}
              </Text>

              <View style={styles.features}>
                {FEATURES.map((feature) => (
                  <View key={feature.text} style={styles.feature}>
                    <View style={[styles.featureIcon, { backgroundColor: feature.background }]}>
                      <Ionicons name={feature.icon} size={18} color={feature.color} />
                    </View>
                    <Text style={styles.featureText}>{t(feature.text)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Белая «шторка» со входом. Снизу — отступ под системную полоску телефона */}
          <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
            <View style={[styles.inner, styles.form]}>
              <View style={styles.titleBlock}>
                <Text style={styles.title} accessibilityRole="header">
                  {waiting ? t("Подтвердите вход в Telegram") : t("Вход через Telegram")}
                </Text>
                <Text style={styles.text}>
                  {waiting
                    ? t("В боте SubShare нажмите «Поделиться номером» — бот пришлёт код из 6 цифр. Введите его здесь.")
                    : t("Откроется бот SubShare. Поделитесь в нём номером телефона — пароль не нужен.")}
                </Text>
              </View>

              {waiting ? (
                <>
                  <Field
                    label={t("Код из Telegram")}
                    value={pin}
                    onChangeText={(text) => setPin(text.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    error={pinError}
                  />
                  <Button title={t("Войти")} icon="log-in-outline" onPress={handlePin} />
                  <Button
                    title={t("Открыть Telegram")}
                    variant="secondary"
                    icon="paper-plane"
                    onPress={() => openTelegram(waiting.url)}
                  />
                  <Button title={t("Отмена")} variant="ghost" onPress={() => setWaiting(null)} />
                </>
              ) : (
                <>
                  <Button title={t("Войти через Telegram")} icon="paper-plane" onPress={startTelegram} />
                  <Button
                    title={t("Войти по почте")}
                    variant="secondary"
                    icon="mail"
                    onPress={() => router.push("/email")}
                  />
                </>
              )}
              <ServerMessage error={error} />

              <Text style={styles.note}>
                {t("Нажимая «Войти», вы принимаете")}{" "}
                <Text style={styles.link} onPress={() => router.push("/terms")}>
                  {t("условия использования")}
                </Text>{" "}
                {t("и")}{" "}
                <Text style={styles.link} onPress={() => router.push("/privacy")}>
                  {t("политику конфиденциальности")}
                </Text>
              </Text>

              {Platform.OS === "web" ? (
                <Button
                  title={t("Скачать приложение для Android")}
                  variant="secondary"
                  icon="logo-android"
                  onPress={() => Linking.openURL(APK_URL)}
                />
              ) : null}

              {__DEV__ ? (
                <Button
                  title={t("Демо-вход (только при разработке)")}
                  variant="ghost"
                  icon="play"
                  onPress={handleDemo}
                />
              ) : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// Кнопки «Рус · Қаз · Eng» в углу экрана
function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return (
    <View style={styles.languages}>
      {LANGUAGES.map((l) => (
        <Pressable
          key={l.code}
          onPress={() => setLanguage(l.code)}
          accessibilityRole="button"
          accessibilityState={{ selected: l.code === language }}
          style={[styles.language, l.code === language && styles.languageActive]}
        >
          <Text style={[styles.languageText, l.code === language && styles.languageTextActive]}>
            {l.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// Под главной кнопкой: текст ошибки
function ServerMessage({ error }) {
  if (error) {
    return (
      <View style={[styles.message, styles.messageError]}>
        <Ionicons name="alert-circle" size={18} color={colors.overdue} />
        <Text style={styles.messageText}>{error}</Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.midnight, overflow: "hidden" },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },

  // Свечения на фоне. boxShadow: "сдвиг по x, сдвиг по y, размытие, расширение, цвет".
  // Каждый круг целиком за краем экрана — видна только его тень. Расширение
  // не больше радиуса круга, иначе тень станет не круглой, а почти квадратной.
  glow: { position: "absolute" },
  glowViolet: {
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -210,
    right: -210,
    boxShadow: "0px 0px 120px 120px rgba(157, 112, 252, 0.45)",
  },
  glowBlue: {
    width: 180,
    height: 180,
    borderRadius: 90,
    top: 230,
    left: -190,
    boxShadow: "0px 0px 100px 90px rgba(73, 157, 252, 0.35)",
  },
  glowMint: {
    width: 160,
    height: 160,
    borderRadius: 80,
    top: 340,
    right: -170,
    boxShadow: "0px 0px 90px 80px rgba(53, 218, 185, 0.35)",
  },

  // Верх: логотип, девиз, преимущества
  hero: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
  },
  // На планшете и в широком окне браузера содержимое не растягивается шире 440
  inner: { width: "100%", maxWidth: 440, alignSelf: "center" },
  brand: {
    fontFamily: fonts.heading,
    fontSize: 34,
    color: colors.white,
    letterSpacing: -0.5,
    marginTop: 20,
  },
  tagline: {
    fontFamily: fonts.medium,
    fontSize: 16,
    lineHeight: 23,
    color: colors.lavender,
    maxWidth: 330,
    marginTop: 6,
  },
  features: { gap: 12, marginTop: 26 },
  feature: { flexDirection: "row", alignItems: "center", gap: 12 },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: "rgba(255, 255, 255, 0.88)",
  },

  // Низ: белая «шторка» с формой
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 26,
  },
  form: { gap: 12 },
  titleBlock: { gap: 6, marginBottom: 4 },
  title: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textMuted },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: "center" },
  languages: { flexDirection: "row", alignSelf: "flex-end", gap: 6, marginBottom: 12 },
  language: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.round,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  languageActive: { backgroundColor: colors.white },
  languageText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.lavender },
  languageTextActive: { color: colors.midnight },
  link: { fontFamily: fonts.semibold, color: colors.sapphire },
  message: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: radius.s,
    backgroundColor: "rgba(57, 89, 191, 0.08)",
  },
  messageError: { backgroundColor: "rgba(255, 107, 107, 0.12)" },
  messageText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 19,
    color: colors.text,
  },
});
