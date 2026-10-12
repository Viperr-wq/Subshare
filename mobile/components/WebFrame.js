// В браузере на большом экране (ноутбук, проектор) приложение показывается
// в «рамке телефона» — чтобы на защите веб-версия выглядела как мобильное приложение.
// На телефоне рамки нет: приложение занимает весь экран.
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { colors, fonts } from "../lib/theme";
import { Logo } from "./Logo";

export function WebFrame({ children }) {
  const { width, height } = useWindowDimensions();

  if (Platform.OS !== "web" || width < 760) {
    return <View style={styles.full}>{children}</View>;
  }

  const showSide = width >= 1060; // слева — название и девиз, если хватает места
  return (
    <LinearGradient
      colors={[colors.midnight, "#18224A", "#2A2161"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.page}
    >
      {showSide ? (
        <View style={styles.side}>
          <Logo size={72} />
          <Text style={styles.brand}>SubShare</Text>
          <Text style={styles.tagline}>Подписки вскладчину — без таблиц и неловких напоминаний</Text>
          <View style={styles.points}>
            <Point text="Сам делит цену подписки на всех" />
            <Point text="Показывает, чьи доли уже оплачены" />
            <Point text="Счета со сроком оплаты — одной кнопкой" />
          </View>
          <Text style={styles.note}>Веб-версия мобильного приложения</Text>
        </View>
      ) : null}
      <View style={[styles.phone, { height: Math.min(880, height - 48) }]}>{children}</View>
    </LinearGradient>
  );
}

function Point({ text }) {
  return (
    <View style={styles.point}>
      <View style={styles.pointDot} />
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: colors.cloud },
  page: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 72,
    padding: 24,
  },
  side: { width: 380, gap: 14 },
  brand: { fontFamily: fonts.heading, fontSize: 44, color: colors.white, marginTop: 8 },
  tagline: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 28, color: colors.lavender },
  points: { gap: 10, marginTop: 12 },
  point: { flexDirection: "row", alignItems: "center", gap: 10 },
  pointDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mint },
  pointText: { fontFamily: fonts.regular, fontSize: 16, color: "#DCE2F7" },
  note: { fontFamily: fonts.regular, fontSize: 13, color: "#8D97BE", marginTop: 20 },
  phone: {
    width: 412,
    borderRadius: 44,
    borderWidth: 10,
    borderColor: "#05070D",
    overflow: "hidden",
    backgroundColor: colors.cloud,
    boxShadow: "0px 30px 80px rgba(0, 0, 0, 0.45)",
  },
});
