// Окна подтверждения («Удалить группу?»), окно оценки (пять звёзд) и короткие
// всплывающие сообщения (toast). Стандартный Alert.alert не работает в веб-версии,
// поэтому сделаны свои — они одинаково выглядят и на телефоне, и в браузере.
//
//   const { confirm, rate, toast } = useDialogs();
//   if (await confirm({ title: "Удалить группу?", confirmText: "Удалить", danger: true })) { ... }
//   const stars = await rate({ title: "Данияр", stars: 4 }); // 1–5 или null («Отмена»)
//   toast("Группа создана");
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Stars } from "../components/Stars";
import { t } from "./i18n";
import { colors, fonts, radius } from "./theme";

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toastText, setToastText] = useState(null);
  const toastTimer = useRef(null);

  // Показывает окно и ждёт ответа: true — «Да», false — «Отмена»
  function confirm({ title, message, confirmText = t("Да"), cancelText = t("Отмена"), danger = false }) {
    return new Promise((resolve) => {
      setDialog({ title, message, confirmText, cancelText, danger, cancelAnswer: false, resolve });
    });
  }

  // Окно оценки: пять звёзд и «Сохранить». stars — прежняя оценка (0 — ещё не оценивали).
  // Ответ — сколько звёзд выбрали (1–5) или null («Отмена»)
  function rate({ title, message, stars = 0 }) {
    return new Promise((resolve) => {
      setDialog({ kind: "stars", title, message, stars, cancelAnswer: null, resolve });
    });
  }

  function close(answer) {
    dialog?.resolve(answer);
    setDialog(null);
  }

  // Системная кнопка «Назад» на Android закрывает открытое окно, как «Отмена»
  useEffect(() => {
    if (!dialog) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close(dialog.cancelAnswer);
      return true; // кнопку обработали — дальше (на прошлый экран) не идём
    });
    return () => subscription.remove();
  }, [dialog]);

  function toast(text) {
    setToastText(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(null), 2600);
  }

  return (
    <DialogContext.Provider value={{ confirm, rate, toast }}>
      <View style={styles.root}>
        {children}

        {toastText ? (
          <View pointerEvents="none" style={styles.toastWrap}>
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toastText}</Text>
            </View>
          </View>
        ) : null}

        {dialog ? (
          <View style={styles.overlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => close(dialog.cancelAnswer)} />
            {dialog.kind === "stars" ? (
              <StarsCard dialog={dialog} onClose={close} />
            ) : (
              <View style={styles.card}>
                <Text style={styles.title}>{dialog.title}</Text>
                {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
                <View style={styles.buttons}>
                  <Button
                    title={dialog.cancelText}
                    variant="secondary"
                    onPress={() => close(false)}
                    style={styles.button}
                  />
                  <Button
                    title={dialog.confirmText}
                    variant={dialog.danger ? "danger" : "primary"}
                    onPress={() => close(true)}
                    style={styles.button}
                  />
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </DialogContext.Provider>
  );
}

// Окно оценки. Пока окно открыто, выбранные звёзды хранит оно само; сначала — прежняя оценка
function StarsCard({ dialog, onClose }) {
  const [stars, setStars] = useState(dialog.stars);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{dialog.title}</Text>
      <Stars value={stars} size={38} onSelect={setStars} style={styles.stars} />
      {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
      <View style={styles.buttons}>
        <Button title={t("Отмена")} variant="secondary" onPress={() => onClose(null)} style={styles.button} />
        <Button title={t("Сохранить")} disabled={!stars} onPress={() => onClose(stars)} style={styles.button} />
      </View>
    </View>
  );
}

export function useDialogs() {
  return useContext(DialogContext);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(16, 23, 39, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: radius.l,
    padding: 22,
    gap: 10,
  },
  title: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text },
  message: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textMuted },
  buttons: { flexDirection: "row", gap: 10, marginTop: 10 },
  button: { flex: 1, paddingHorizontal: 8 },
  stars: { alignSelf: "center", marginVertical: 8 },
  toastWrap: { position: "absolute", left: 16, right: 16, bottom: 96, alignItems: "center" },
  toast: {
    backgroundColor: colors.midnight,
    borderRadius: radius.m,
    paddingVertical: 12,
    paddingHorizontal: 18,
    boxShadow: "0px 8px 24px rgba(16, 23, 39, 0.3)",
  },
  toastText: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.white, textAlign: "center" },
});
