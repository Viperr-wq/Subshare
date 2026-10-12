// Обёртка для экрана: светлый фон, отступы, прокрутка и «потяните вниз, чтобы обновить».
//   safeTop — нужен на экранах без верхней панели (вкладки), чтобы текст
//             не залезал под «чёлку» и часы телефона.
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../lib/theme";

export function Screen({ children, safeTop = false, refreshing = false, onRefresh, contentStyle }) {
  return (
    <SafeAreaView style={styles.safe} edges={safeTop ? ["top"] : []}>
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.sapphire}
              colors={[colors.sapphire]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cloud },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
});
