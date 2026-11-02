// Страница-документ: заголовок, вступление и разделы.
// Так показаны политика конфиденциальности (app/privacy.js) и условия (app/terms.js).
//   doc = { title, intro, sections: [[заголовок, текст], ...] }
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../lib/theme";
import { Screen } from "./Screen";

export function Document({ doc }) {
  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {doc.title}
      </Text>
      <Text style={styles.text}>{doc.intro}</Text>
      {doc.sections.map(([heading, body]) => (
        <View key={heading} style={styles.section}>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.text}>{body}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 30, color: colors.text },
  section: { gap: 6 },
  heading: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.textMuted },
});
