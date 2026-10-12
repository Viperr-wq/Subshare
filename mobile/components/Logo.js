// Логотип SubShare: квадрат с градиентом (сапфир → фиолет), буква «S»
// и мятная точка — «ещё один участник подписки».
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../lib/theme";

export function Logo({ size = 56 }) {
  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient
        colors={[colors.sapphire, colors.violet]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.box, { borderRadius: size * 0.3 }]}
      >
        <Text style={[styles.letter, { fontSize: size * 0.52 }]}>S</Text>
      </LinearGradient>
      <View
        style={[
          styles.dot,
          {
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: size * 0.15,
            borderWidth: size * 0.05,
            top: -size * 0.06,
            right: -size * 0.06,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: "center", justifyContent: "center" },
  letter: { fontFamily: fonts.heading, color: colors.white, marginTop: -2 },
  dot: { position: "absolute", backgroundColor: colors.mint, borderColor: colors.midnight },
});
