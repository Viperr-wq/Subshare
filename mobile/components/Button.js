// Кнопка в стиле SubShare.
//   variant: "primary" — синяя, "secondary" — светлая, "danger" — красная, "ghost" — без фона
//   icon: название иконки Ionicons (https://icons.expo.fyi), например "add"
// Если onPress — асинхронная функция (ждёт ответа сервера), кнопка сама покажет
// «крутилку» и не даст нажать второй раз, пока запрос не закончится.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts, radius } from "../lib/theme";

const VARIANTS = {
  primary: { background: colors.sapphire, text: colors.white },
  secondary: { background: "#E1E7FB", text: colors.sapphire },
  danger: { background: "#FFE9E9", text: "#D63C3C" },
  ghost: { background: "transparent", text: colors.sapphire },
  light: { background: colors.white, text: colors.midnight },
};

export function Button({ title, onPress, variant = "primary", icon, disabled, small, style }) {
  const [busy, setBusy] = useState(false);
  const theme = VARIANTS[variant];

  async function handlePress() {
    if (busy) return;
    setBusy(true);
    try {
      await onPress?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || busy}
      style={({ pressed, hovered }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: theme.background },
        hovered && styles.hovered,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={theme.text} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={small ? 16 : 19} color={theme.text} /> : null}
          <Text style={[styles.text, small && styles.smallText, { color: theme.text }]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: radius.m,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  small: { minHeight: 38, paddingHorizontal: 14, borderRadius: radius.s },
  text: { fontFamily: fonts.semibold, fontSize: 16 },
  smallText: { fontSize: 14 },
  hovered: { opacity: 0.92 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
});
