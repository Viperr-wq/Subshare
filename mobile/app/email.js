// Вход по почте. Шаги экрана:
//   login    — почта и пароль;
//   register — имя, почта, номер и пароль → сервер присылает на почту код;
//   forgot   — почта → сервер присылает код для смены пароля;
//   code     — код из письма (а при смене пароля — ещё и новый пароль).
// После входа приложение само переключится на вкладки (см. Stack.Protected в app/_layout.js).
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Field, PasswordField, PhoneField } from "../components/Field";
import { Screen } from "../components/Screen";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { normalizePhone } from "../lib/format";
import { t } from "../lib/i18n";
import { colors, fonts, radius } from "../lib/theme";

const MIN_PASSWORD = 8;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; // как на сервере (app/schemas.py)

export default function EmailScreen() {
  const { signIn } = useAuth();
  const [step, setStep] = useState("login");
  const [codeFor, setCodeFor] = useState("register"); // зачем пришёл код: "register" или "reset"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(""); // 10 цифр без +7
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState({}); // ошибки под полями
  const [message, setMessage] = useState(null); // { text, ok } — ответ сервера над кнопкой

  function goTo(next) {
    setStep(next);
    setErrors({});
    setMessage(null);
  }

  // Проверяет нужные поля и показывает ошибки под ними. true — всё верно
  function validate(fields) {
    const found = {};
    if (fields.includes("name") && !name.trim()) found.name = t("Введите имя");
    if (fields.includes("email") && !EMAIL_PATTERN.test(email.trim())) {
      found.email = t("Проверьте адрес почты");
    }
    if (fields.includes("phone") && !normalizePhone(phone)) found.phone = t("Номер — 10 цифр после +7");
    if (fields.includes("password") && password.length < MIN_PASSWORD) {
      found.password = t("Пароль — не короче 8 символов");
    }
    if (fields.includes("code") && !/^\d{6}$/.test(code)) found.code = t("Введите 6 цифр из письма");
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  // Запрос к серверу. Ошибку показываем над кнопкой и возвращаем null
  async function send(request) {
    setMessage(null);
    try {
      return await request();
    } catch (e) {
      setMessage({ text: e.message });
      return null;
    }
  }

  async function handleLogin() {
    if (!validate(["email"])) return;
    if (!password) {
      setErrors({ password: t("Введите пароль") });
      return;
    }
    const session = await send(() => api.loginEmail(email.trim(), password));
    if (session) await signIn(session);
  }

  // Прислать код: для регистрации или для смены пароля. С шага «код» — ещё раз
  async function requestCode(purpose) {
    if (!validate(purpose === "register" ? ["name", "email", "phone", "password"] : ["email"])) return;
    const sent = await send(() =>
      purpose === "register"
        ? api.registerEmail({ name: name.trim(), email: email.trim(), phone: normalizePhone(phone), password })
        : api.forgotPassword(email.trim())
    );
    if (!sent) return;
    if (step === "code") {
      setMessage({ text: t("Отправили новый код"), ok: true });
      return;
    }
    setCodeFor(purpose);
    setCode("");
    if (purpose === "reset") setPassword(""); // на шаге «код» здесь вводят новый пароль
    goTo("code");
  }

  async function handleCode() {
    if (!validate(codeFor === "reset" ? ["code", "password"] : ["code"])) return;
    const session = await send(() =>
      codeFor === "register"
        ? api.confirmEmail(email.trim(), code)
        : api.resetPassword(email.trim(), code, password)
    );
    if (session) await signIn(session);
  }

  const emailField = (
    <Field
      label={t("Почта")}
      value={email}
      onChangeText={setEmail}
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      maxLength={254}
      error={errors.email}
    />
  );

  return (
    <Screen>
      {step === "login" ? (
        <>
          <Text style={styles.title}>{t("Вход по почте")}</Text>
          {emailField}
          <PasswordField
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            onSubmitEditing={handleLogin}
            error={errors.password}
          />
          <Message message={message} />
          <Button title={t("Войти")} icon="log-in-outline" onPress={handleLogin} />
          <LinkButton title={t("Забыли пароль?")} onPress={() => goTo("forgot")} />
          <LinkButton title={t("Нет аккаунта? Зарегистрируйтесь")} onPress={() => goTo("register")} />
        </>
      ) : null}

      {step === "register" ? (
        <>
          <Text style={styles.title}>{t("Регистрация по почте")}</Text>
          <Text style={styles.text}>{t("На почту придёт код — так мы убедимся, что адрес ваш.")}</Text>
          <Field
            label={t("Имя")}
            value={name}
            onChangeText={setName}
            autoComplete="name"
            maxLength={100}
            error={errors.name}
          />
          {emailField}
          <PhoneField
            value={phone}
            onChangeText={setPhone}
            hint={t("По этому номеру друзья добавят вас в группу")}
            error={errors.phone}
          />
          <PasswordField
            label={t("Придумайте пароль")}
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            hint={t("Не короче 8 символов")}
            error={errors.password}
          />
          <Message message={message} />
          <Button title={t("Получить код")} icon="mail-outline" onPress={() => requestCode("register")} />
          <Text style={styles.note}>
            {t("Регистрируясь, вы принимаете")}{" "}
            <Text style={styles.link} onPress={() => router.push("/terms")}>
              {t("условия использования")}
            </Text>{" "}
            {t("и")}{" "}
            <Text style={styles.link} onPress={() => router.push("/privacy")}>
              {t("политику конфиденциальности")}
            </Text>
          </Text>
          <LinkButton title={t("Уже есть аккаунт? Войти")} onPress={() => goTo("login")} />
        </>
      ) : null}

      {step === "forgot" ? (
        <>
          <Text style={styles.title}>{t("Смена пароля")}</Text>
          <Text style={styles.text}>{t("Пришлём на почту код, чтобы задать новый пароль.")}</Text>
          {emailField}
          <Message message={message} />
          <Button title={t("Получить код")} icon="mail-outline" onPress={() => requestCode("reset")} />
          <LinkButton title={t("Вспомнили пароль? Войти")} onPress={() => goTo("login")} />
        </>
      ) : null}

      {step === "code" ? (
        <>
          <Text style={styles.title}>{t("Код из письма")}</Text>
          <Text style={styles.text}>
            {t("Мы отправили код на {email}. Если письма нет, проверьте папку «Спам».", {
              email: email.trim(),
            })}
          </Text>
          <Field
            label={t("Код")}
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            error={errors.code}
          />
          {codeFor === "reset" ? (
            <PasswordField
              label={t("Новый пароль")}
              value={password}
              onChangeText={setPassword}
              autoComplete="new-password"
              hint={t("Не короче 8 символов")}
              error={errors.password}
            />
          ) : null}
          <Message message={message} />
          <Button title={t("Подтвердить")} icon="checkmark-circle" onPress={handleCode} />
          <LinkButton title={t("Отправить код ещё раз")} onPress={() => requestCode(codeFor)} />
          <LinkButton
            title={t("Изменить почту")}
            onPress={() => goTo(codeFor === "register" ? "register" : "forgot")}
          />
        </>
      ) : null}
    </Screen>
  );
}

// Ответ сервера над кнопкой: ошибка (розовая) или «готово» (мятная)
function Message({ message }) {
  if (!message) return null;
  return (
    <View style={[styles.message, message.ok && styles.messageOk]}>
      <Ionicons
        name={message.ok ? "checkmark-circle" : "alert-circle"}
        size={18}
        color={message.ok ? "#0E8A72" : colors.overdue}
      />
      <Text style={styles.messageText}>{message.text}</Text>
    </View>
  );
}

function LinkButton({ title, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.linkButton}>
      <Text style={styles.linkText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  text: { marginTop: -4, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textMuted },
  note: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: "center",
  },
  link: { fontFamily: fonts.semibold, color: colors.sapphire },
  linkButton: { alignSelf: "center", paddingVertical: 6, paddingHorizontal: 12 },
  linkText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.sapphire },
  // Как на экране входа: тёмный текст на розовом фоне читается лучше красного
  message: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.m,
    backgroundColor: "rgba(255, 107, 107, 0.12)",
  },
  messageOk: { backgroundColor: "rgba(53, 218, 185, 0.16)" },
  messageText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.text },
});
