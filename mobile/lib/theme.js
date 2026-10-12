// Цвета, шрифты и размеры бренда SubShare — их используют все экраны.
// Хотите поменять цвет кнопок или фона — меняйте здесь, а не в каждом экране.

export const colors = {
  midnight: "#101727", // тёмный фон, основной текст
  mint: "#35DAB9", // выгода, «оплачено»
  blue: "#499DFC",
  violet: "#9D70FC",
  lavender: "#C3CEFA",
  sapphire: "#3959BF", // кнопки
  cloud: "#EEF1FA", // светлый фон экранов
  white: "#FFFFFF",

  text: "#101727",
  textMuted: "#5F6784", // второстепенный текст
  border: "#DCE2F2",

  // Статусы платежей
  paid: "#35DAB9",
  pending: "#FFC857",
  overdue: "#FF6B6B",
};

// Названия шрифтов — такие же, как в useFonts в app/_layout.js
export const fonts = {
  heading: "Unbounded_700Bold", // заголовки
  headingSemi: "Unbounded_600SemiBold",
  regular: "Onest_400Regular", // обычный текст
  medium: "Onest_500Medium",
  semibold: "Onest_600SemiBold",
  bold: "Onest_700Bold",
};

export const radius = { s: 10, m: 16, l: 24, round: 999 };

// Мягкая тень для карточек (работает и на телефоне, и в браузере)
export const shadow = {
  boxShadow: "0px 6px 18px rgba(16, 23, 39, 0.08)",
};
