// Состояния экрана: загрузка, ошибка и «пока пусто».
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../lib/theme";
import { Button } from "./Button";
import { t } from "../lib/i18n";

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.sapphire} />
      <Text style={styles.text}>{t("Загрузка…")}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }) {
  return (
    <View style={styles.center}>
      <View style={[styles.iconCircle, { backgroundColor: "#FFE4E4" }]}>
        <Ionicons name="cloud-offline-outline" size={30} color="#D63C3C" />
      </View>
      <Text style={styles.title}>{t("Не получилось загрузить")}</Text>
      <Text style={styles.hint}>{message}</Text>
      {onRetry ? <Button title={t("Повторить")} icon="refresh" onPress={onRetry} small /> : null}
    </View>
  );
}

export function EmptyState({ icon = "sparkles-outline", title, text, action }) {
  return (
    <View style={styles.empty}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={30} color={colors.sapphire} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {text ? <Text style={styles.hint}>{text}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
    backgroundColor: colors.cloud,
  },
  empty: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 16, gap: 10 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E1E7FB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontFamily: fonts.headingSemi, fontSize: 17, color: colors.text, textAlign: "center" },
  text: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: "center",
    maxWidth: 320,
  },
});
