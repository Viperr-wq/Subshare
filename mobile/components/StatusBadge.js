// Цветная плашка статуса: «Оплачено», «Ждём оплату», «Просрочено», «Владелец».
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius } from "../lib/theme";

const STATES = {
  paid: { label: "Оплачено", icon: "checkmark-circle", background: "#DDF8F2", text: "#0E8A72" },
  pending: { label: "Ждём оплату", icon: "time", background: "#FFF3D6", text: "#9A6A00" },
  overdue: { label: "Просрочено", icon: "alert-circle", background: "#FFE4E4", text: "#D63C3C" },
  owner: { label: "Владелец", icon: "star", background: "#E1E7FB", text: colors.sapphire },
  none: { label: "Счёт не выставлен", icon: "remove-circle-outline", background: "#EEF0F6", text: colors.textMuted },
};

// Статус платежа с сервера → ключ для плашки: "paid" | "pending" | "overdue"
export function paymentState(payment) {
  if (!payment) return "none";
  if (payment.status === "paid") return "paid";
  return payment.is_overdue ? "overdue" : "pending";
}

// state — ключ из STATES; label — свой текст вместо стандартного (необязательно)
export function StatusBadge({ state, label, style }) {
  const s = STATES[state] || STATES.none;
  return (
    <View style={[styles.badge, { backgroundColor: s.background }, style]}>
      <Ionicons name={s.icon} size={14} color={s.text} />
      <Text style={[styles.text, { color: s.text }]}>{label || s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.round,
  },
  text: { fontFamily: fonts.semibold, fontSize: 12.5 },
});
