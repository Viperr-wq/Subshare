// Выбор числа кнопками «−» и «+» (например, день оплаты 1–28 или число участников).
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius } from "../lib/theme";

export function Stepper({ label, value, onChange, min, max, suffix, hint }) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <RoundButton icon="remove" disabled={value <= min} onPress={() => onChange(value - 1)} />
        <Text style={styles.value}>
          {value}
          {suffix ? <Text style={styles.suffix}> {suffix}</Text> : null}
        </Text>
        <RoundButton icon="add" disabled={value >= max} onPress={() => onChange(value + 1)} />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function RoundButton({ icon, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Ionicons name={icon} size={22} color={colors.sapphire} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.white,
    borderRadius: radius.m,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 6,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.s,
    backgroundColor: "#E1E7FB",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  value: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text },
  suffix: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
});
