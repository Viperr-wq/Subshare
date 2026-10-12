// Полоска прогресса: сколько из нужной суммы уже собрано.
//   value — от 0 до 1 (0.5 = половина)
import { StyleSheet, View } from "react-native";

import { colors, radius } from "../lib/theme";

export function ProgressBar({ value, color = colors.mint, track = "#E1E7FB", height = 10 }) {
  const percent = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <View style={[styles.track, { backgroundColor: track, height }]}>
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderRadius: radius.round, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.round },
});
