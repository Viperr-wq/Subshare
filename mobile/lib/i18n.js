// Языки приложения: русский, казахский, английский.
//
// Тексты в коде пишутся по-русски и оборачиваются в t():
//   t("Мои подписки")
//   t("Оплата до {day} числа", { day: 5 })   — {day} заменится на значение
// Переводы на казахский и английский — в lib/translations.js, по русскому тексту.
// Нет перевода — покажется русский текст, так что новый текст экран не «сломает».
//
// Выбранный язык запоминается на устройстве, а при входе — и на сервере:
// на нём сервер пишет ошибки, а Telegram-бот — напоминания.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, Fragment, useContext, useEffect, useState } from "react";

import { TRANSLATIONS } from "./translations";

export const LANGUAGES = [
  { code: "ru", label: "Рус", name: "Русский" },
  { code: "kk", label: "Қаз", name: "Қазақша" },
  { code: "en", label: "Eng", name: "English" },
];

const STORAGE_KEY = "subshare.language";
let language = detectLanguage();

// Язык телефона или браузера, если это казахский или английский. Иначе — русский
function detectLanguage() {
  try {
    const code = Intl.DateTimeFormat().resolvedOptions().locale.slice(0, 2).toLowerCase();
    if (code === "kk" || code === "en") return code;
  } catch {
    // Нет данных о языке — значит, русский
  }
  return "ru";
}

export function getLanguage() {
  return language;
}

export function t(text, values) {
  const translation = language === "ru" ? null : TRANSLATIONS[text]?.[language === "kk" ? 0 : 1];
  let result = translation || text;
  for (const [key, value] of Object.entries(values || {})) {
    result = result.split(`{${key}}`).join(String(value));
  }
  return result;
}

const LanguageContext = createContext(null);

// Оборачивает всё приложение. При смене языка экраны рисуются заново (key={language}),
// и все t() отдают новый текст. Сервер о новом языке узнаёт в app/_layout.js.
export function LanguageProvider({ children }) {
  const [current, setCurrent] = useState(null); // null — ещё не прочитали сохранённый выбор

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (LANGUAGES.some((l) => l.code === saved)) language = saved;
      })
      .catch(() => {})
      .finally(() => setCurrent(language));
  }, []);

  async function setLanguage(code) {
    language = code;
    setCurrent(code);
    await AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  }

  if (!current) return null;
  return (
    <LanguageContext.Provider value={{ language: current, setLanguage }}>
      <Fragment key={current}>{children}</Fragment>
    </LanguageContext.Provider>
  );
}

// В любом экране: const { language, setLanguage } = useLanguage();
export function useLanguage() {
  return useContext(LanguageContext);
}
