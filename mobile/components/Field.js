// Поля ввода с подписью сверху и текстом ошибки снизу.
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { formatPhoneDigits } from "../lib/format";
import { colors, fonts, radius } from "../lib/theme";

// Обычное поле. Все остальные свойства (value, onChangeText, keyboardType…)
// передаются прямо в TextInput.
export function Field({ label, error, hint, style, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor="#9AA2BC"
        {...inputProps}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.focused, error && styles.invalid]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

// Поле телефона: «+7» уже стоит слева, человек вводит только 10 цифр.
// value и onChangeText работают с цифрами без пробелов: «7010000001».
export function PhoneField({ label = "Номер телефона", value, onChangeText, error, hint, ...rest }) {
  const [focused, setFocused] = useState(false);

  function handleChange(text) {
    let digits = text.replace(/\D/g, "");
    const pasted = digits.length - (value || "").length > 1; // появилось сразу несколько цифр
    // Номер с кодом страны: «8 701…» или вставленный целиком «+7 701…» — первая цифра лишняя
    if (digits.length === 11 && (digits[0] === "8" || (digits[0] === "7" && pasted))) {
      digits = digits.slice(1);
    }
    // После +7 в номере ровно 10 цифр: лишнюю цифру не принимаем
    if (digits.length > 10) return;
    onChangeText(digits);
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.phoneRow, focused && styles.focused, error && styles.invalid]}>
        <Text style={styles.prefix}>+7</Text>
        <TextInput
          value={formatPhoneDigits(value)}
          onChangeText={handleChange}
          keyboardType="phone-pad"
          placeholder="701 234 56 78"
          placeholderTextColor="#9AA2BC"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.phoneInput}
          {...rest}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
  input: {
    minHeight: 52,
    borderRadius: radius.m,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    outlineStyle: "none", // убирает рамку браузера в веб-версии
  },
  phoneRow: {
    minHeight: 52,
    borderRadius: radius.m,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
  },
  prefix: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, marginRight: 8 },
  phoneInput: {
    flex: 1,
    minHeight: 50,
    paddingRight: 16,
    fontFamily: fonts.regular,
    fontSize: 16,
    letterSpacing: 0.5,
    color: colors.text,
    outlineStyle: "none",
  },
  focused: { borderColor: colors.sapphire },
  invalid: { borderColor: colors.overdue },
  error: { fontFamily: fonts.regular, fontSize: 13, color: "#D63C3C" },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
});
