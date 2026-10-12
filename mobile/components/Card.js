// Белая карточка со скруглёнными углами и мягкой тенью.
// Если передать onPress — карточку можно нажимать (например, открыть группу).
import { Pressable, StyleSheet, View } from "react-native";

import { colors, radius, shadow } from "../lib/theme";

export function Card({ children, onPress, style }) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.card,
        hovered && styles.hovered,
        pressed && styles.pressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.l,
    padding: 16,
    ...shadow,
  },
  hovered: { boxShadow: "0px 10px 24px rgba(16, 23, 39, 0.12)" },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.95 },
});
