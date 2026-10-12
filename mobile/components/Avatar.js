// Кружок с инициалами человека. Цвет зависит от id, поэтому у каждого он свой
// и не меняется между экранами.
import { StyleSheet, Text, View } from "react-native";

import { initials } from "../lib/format";
import { colors, fonts } from "../lib/theme";

const PALETTE = [colors.sapphire, colors.violet, colors.blue, "#1FB89A", "#E58A3A", "#D9568B"];

export function Avatar({ name, id = 0, size = 40 }) {
  const background = PALETTE[Math.abs(id) % PALETTE.length];
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center" },
  text: { fontFamily: fonts.semibold, color: colors.white },
});
