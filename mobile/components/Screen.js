// Обёртка для экрана: светлый фон, отступы, прокрутка и «потяните вниз, чтобы обновить».
//   safeTop — нужен на экранах без верхней панели (вкладки), чтобы текст
//             не залезал под «чёлку» и часы телефона.
// Когда открывается клавиатура, экран прокручивается к полю, в котором печатают,
// чтобы клавиатура его не закрыла (например, поле цены в форме группы).
import { useEffect, useRef } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../lib/theme";

export function Screen({ children, safeTop = false, refreshing = false, onRefresh, contentStyle }) {
  const scrollRef = useRef(null);
  const insets = useSafeAreaInsets();
  // Над экраном с заголовком — панель заголовка; клавиатуре нужно знать её высоту
  const headerHeight = safeTop ? 0 : insets.top + (Platform.OS === "ios" ? 44 : 56);

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      // Пауза — чтобы экран успел подвинуться над клавиатурой
      setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput();
        const content = scrollRef.current?.getInnerViewRef?.();
        if (!input || !content) return;
        input.measureLayout(
          content,
          (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }),
          () => {}
        );
      }, 150);
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={safeTop ? ["top"] : []}>
      <KeyboardAvoidingView style={styles.safe} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView
        ref={scrollRef}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cloud },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
});
