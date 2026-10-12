// Значок подписки: цветной квадрат с первой буквой названия
// (красный «N» для Netflix, зелёный «S» для Spotify и т.д.).
import { StyleSheet, Text, View } from "react-native";

import { findService, OTHER_SERVICE } from "../lib/services";
import { colors, fonts } from "../lib/theme";

export function ServiceIcon({ serviceName, size = 48 }) {
  const service = findService(serviceName) || OTHER_SERVICE;
  const letter = String(serviceName).trim()[0]?.toUpperCase() || "?";
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: service.color,
        },
      ]}
    >
      <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
  letter: { fontFamily: fonts.heading, color: colors.white },
});
