// Сколько в чате группы новых сообщений: синяя «пилюля» со значком чата. Больше 99 — «99+».
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { t } from "../lib/i18n";
import { colors, fonts, radius } from "../lib/theme";

export function UnreadBadge({ count, style }) {
  return (
    <View style={[styles.badge, style]} accessibilityLabel={t("Новых сообщений: {count}", { count })}>
      <Ionicons name="chatbubble" size={12} color={colors.white} />
      <Text style={styles.text}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: radius.round,
    backgroundColor: colors.sapphire,
  },
  text: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
});
