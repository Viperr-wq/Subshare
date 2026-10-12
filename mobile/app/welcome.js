// Экран входа и регистрации. Его видно, только пока никто не вошёл
// (см. Stack.Protected в app/_layout.js). После signIn(user) приложение само
// переключится на вкладки — никуда переходить не нужно.
//
// Шаг 1 «phone»: номер телефона → вход.
// Шаг 2 «register»: если такого номера нет (сервер ответил 404) — спрашиваем имя
// и создаём аккаунт с этим номером.
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../components/Button";
import { Field, PhoneField } from "../components/Field";
import { Logo } from "../components/Logo";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatPhone, normalizePhone } from "../lib/format";
import { colors, fonts, radius } from "../lib/theme";

// Демо-пользователь Аружан из seed.py — у неё уже есть группы и платежи
const DEMO_PHONE = "+77010000001";

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
    icon: "receipt",
    color: colors.violet,
    background: "rgba(157, 112, 252, 0.18)",
    text: "Счета со сроком оплаты — одной кнопкой",
  },
];

export default function WelcomeScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);

  const [step, setStep] = useState("phone"); // "phone" или "register"
  const [digits, setDigits] = useState(""); // 10 цифр номера без +7: «7010000001»
  const [name, setName] = useState("");
  const [phoneError, setPhoneError] = useState(null);
  const [nameError, setNameError] = useState(null);
  const [error, setError] = useState(null); // ошибка сервера или сети
  const [slow, setSlow] = useState(false); // сервер долго не отвечает
  // Что сейчас ждёт ответа сервера: "login", "demo", "register" или null (ничего).
  // Пока ответа нет, другие действия не запускаем — иначе два ответа придут почти
  // одновременно и приложение может открыться не под тем аккаунтом.
  const [busy, setBusy] = useState(null);

  // Когда открывается клавиатура, прокручиваем вниз, к форме, чтобы поле было видно.
  // Пауза нужна, чтобы экран успел подвинуться над клавиатурой.
  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    });
    return () => subscription.remove();
  }, []);

  // Ждёт ответа сервера на действие action ("login", "demo" или "register").
  // Если ответа нет дольше 4 секунд — показываем подсказку:
  // бесплатный сервер «засыпает», и первое включение занимает до минуты.
  async function waitForServer(action, request) {
    setBusy(action);
    setError(null);
    const timer = setTimeout(() => setSlow(true), 4000);
    try {
      return await request;
    } finally {
      clearTimeout(timer);
      setSlow(false);
      setBusy(null);
    }
  }

  // Вызывается и кнопкой «Войти», и клавишей Enter (кнопкой «Go» на клавиатуре телефона)
  async function handleLogin() {
    if (busy) return; // уже ждём ответа сервера — второй запрос не отправляем
    if (digits.length !== 10) {
      setPhoneError("Введите 10 цифр номера после +7");
      return;
    }
    try {
      const user = await waitForServer("login", api.login(normalizePhone(digits)));
      await signIn(user);
    } catch (e) {
      if (e.status === 404) {
        setStep("register"); // такого номера ещё нет — знакомимся
      } else {
        setError(e.message);
      }
    }
  }

  async function handleDemo() {
    if (busy) return;
    try {
      const user = await waitForServer("demo", api.login(DEMO_PHONE));
      await signIn(user);
    } catch (e) {
      setError(
        e.status === 404
          ? "Демо-данные не загружены. Запустите на сервере: python seed.py"
          : e.message
      );
    }
  }

  async function handleRegister() {
    if (busy) return;
    // Имя — от 1 до 100 символов, как на сервере. Длиннее 100 ввести не даст maxLength у поля.
    const cleanName = name.trim();
    if (!cleanName) {
      setNameError("Напишите, как вас зовут");
      return;
    }
    try {
      const user = await waitForServer("register", api.register(cleanName, normalizePhone(digits)));
      await signIn(user);
    } catch (e) {
      setError(e.message);
    }
  }

  function changePhone(text) {
    setDigits(text);
    setPhoneError(null);
    setError(null);
  }

  function changeName(text) {
    setName(text);
    setNameError(null);
    setError(null);
  }

  function backToPhone() {
    setStep("phone");
    setNameError(null);
    setError(null);
  }

  // Неразрывные пробелы (\u00A0) — чтобы номер не разорвался на две строки
  const phoneText = formatPhone(`+7${digits}`).replace(/ /g, "\u00A0");

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Декоративные «свечения». Сами круги спрятаны за краем экрана, а на экран
          падает только их большая размытая тень (boxShadow) — мягкий отсвет без резкой границы. */}
      <View style={[styles.glow, styles.glowViolet]} />
      <View style={[styles.glow, styles.glowBlue]} />
      <View style={[styles.glow, styles.glowMint]} />

      <SafeAreaView style={styles.flex} edges={["top"]}>
        {/* Поднимает форму над клавиатурой. "padding" нужен и на iPhone, и на Android:
            приложение рисуется «от края до края», и Android сам экран не сжимает.
            В браузере это обычный View. */}
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.hero}>
              <View style={styles.inner}>
                <Logo size={64} />
                <Text style={styles.brand} accessibilityRole="header">
                  SubShare
                </Text>
                <Text style={styles.tagline}>
                  Подписки <Text style={styles.accent}>вскладчину</Text> — без таблиц и неловких
                  напоминаний
                </Text>

                <View style={styles.features}>
                  {FEATURES.map((feature) => (
                    <View key={feature.text} style={styles.feature}>
                      <View style={[styles.featureIcon, { backgroundColor: feature.background }]}>
                        <Ionicons name={feature.icon} size={18} color={feature.color} />
                      </View>
                      <Text style={styles.featureText}>{feature.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Белая «шторка» с формой. Снизу — отступ под системную полоску телефона */}
            <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
              <View style={[styles.inner, styles.form]}>
                {step === "phone" ? (
                  <>
                    <View style={styles.titleBlock}>
                      <Text style={styles.title} accessibilityRole="header">
                        Вход по номеру телефона
                      </Text>
                    </View>
                    <PhoneField
                      label={null}
                      accessibilityLabel="Номер телефона"
                      value={digits}
                      onChangeText={changePhone}
                      error={phoneError}
                      returnKeyType="go"
                      onSubmitEditing={handleLogin}
                    />
                    {/* Кнопка сама показывает загрузку, только когда нажали именно её.
                        Если вход начали клавишей Enter — меняем надпись на «Входим…» */}
                    <Button
                      title={busy === "login" ? "Входим…" : "Войти"}
                      onPress={handleLogin}
                      disabled={busy === "demo"}
                    />
                    <ServerMessage slow={slow} error={error} />

                    <View style={styles.noteRow}>
                      <Ionicons
                        name="information-circle-outline"
                        size={15}
                        color={colors.textMuted}
                      />
                      <Text style={styles.note}>Без SMS-кода — это учебная версия</Text>
                    </View>

                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>или</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    <Button
                      title="Посмотреть демо"
                      variant="secondary"
                      icon="play"
                      onPress={handleDemo}
                      disabled={busy === "login"}
                    />
                  </>
                ) : (
                  <>
                    <View style={styles.titleBlock}>
                      <Text style={styles.title} accessibilityRole="header">
                        Давайте знакомиться
                      </Text>
                      <Text style={styles.text}>
                        Номер <Text style={styles.phone}>{phoneText}</Text> ещё не зарегистрирован
                      </Text>
                    </View>
                    <Field
                      label="Как вас зовут?"
                      placeholder="Например, Аружан"
                      value={name}
                      onChangeText={changeName}
                      error={nameError}
                      hint="Это имя увидят участники ваших групп"
                      maxLength={100}
                      autoFocus
                      autoCapitalize="words"
                      autoComplete="name"
                      returnKeyType="done"
                      onSubmitEditing={handleRegister}
                    />
                    <Button
                      title={busy === "register" ? "Создаём аккаунт…" : "Создать аккаунт"}
                      onPress={handleRegister}
                    />
                    <ServerMessage slow={slow} error={error} />
                    <Button
                      title="Изменить номер"
                      variant="ghost"
                      icon="arrow-back"
                      onPress={backToPhone}
                      disabled={busy === "register"}
                    />
                  </>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// Под главной кнопкой: подсказка, что сервер просыпается, или текст ошибки
function ServerMessage({ slow, error }) {
  if (slow) {
    return (
      <View style={styles.message}>
        <Ionicons name="hourglass-outline" size={18} color={colors.sapphire} />
        <Text style={styles.messageText}>
          Сервер просыпается — первое включение занимает до минуты
        </Text>
      </View>
    );
  }
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
  accent: { color: colors.mint },
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
  phone: { fontFamily: fonts.semibold, color: colors.text },
  noteRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  note: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  divider: { flexDirection: "row", alignItems: "center", gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
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
