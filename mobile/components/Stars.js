// Пять звёзд — оценка от 1 до 5: закрашено столько звёзд, сколько value.
// С onSelect звёзды можно нажимать — так выбирают оценку (окно оценки в lib/dialogs.js).
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { t } from "../lib/i18n";
import { colors } from "../lib/theme";

const NUMBERS = [1, 2, 3, 4, 5];

export function Stars({ value = 0, size = 16, onSelect, style }) {
  return (
    <View
      style={[styles.row, { gap: Math.round(size / 5) }, style]}
      accessibilityLabel={onSelect ? undefined : t("{count} из 5", { count: value })}
    >
      {NUMBERS.map((n) => {
        const star = (
          <Ionicons
            name={n <= value ? "star" : "star-outline"}
            size={size}
            color={n <= value ? colors.star : colors.lavender}
          />
        );
        if (!onSelect) return <View key={n}>{star}</View>;
        return (
          <Pressable
            key={n}
            onPress={() => onSelect(n)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t("{count} из 5", { count: n })}
            style={({ pressed }) => pressed && styles.pressed}
          >
            {star}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  pressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
});
