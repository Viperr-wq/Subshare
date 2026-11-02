// Кто сейчас вошёл в приложение.
// Ключ входа (токен) и данные пользователя запоминаются в памяти устройства
// (AsyncStorage; в браузере это localStorage), чтобы не входить заново при каждом запуске.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";

import { api, setAuthToken, setOnUnauthorized } from "./api";

const STORAGE_KEY = "subshare.session"; // { token, user }
const OLD_STORAGE_KEY = "subshare.user"; // так вход хранила прошлая версия — без ключа
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false); // прочитали ли уже сохранённый вход

  useEffect(() => {
    // Сервер сказал, что ключ недействителен, — забываем вход, откроется экран входа
    setOnUnauthorized(forget);

    async function restore() {
      try {
        await AsyncStorage.removeItem(OLD_STORAGE_KEY);
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const session = JSON.parse(saved);
          setAuthToken(session.token);
          setUser(session.user);
          // В фоне проверяем, что ключ ещё действует. Если нет (например, базу очистили),
          // сработает setOnUnauthorized выше. Нет сети — не страшно, проверим в другой раз
          api.getMe().catch(() => {});
        }
      } catch {
        // Не получилось прочитать — просто покажем экран входа
      }
      setReady(true);
    }
    restore();
  }, []);

  // session — ответ сервера на вход или регистрацию: { token, user }
  async function signIn(session) {
    setAuthToken(session.token);
    setUser(session.user);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  // Забыть вход на этом устройстве
  async function forget() {
    setAuthToken(null);
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  // Кнопка «Выйти»: просим сервер удалить ключ и забываем вход. Запрос уходит сразу,
  // с текущим ключом, поэтому ждать ответа не нужно. Нет сети — не страшно:
  // на этом устройстве ключа всё равно не останется.
  async function signOut() {
    api.logout().catch(() => {});
    await forget();
  }

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

// В любом экране: const { user, signOut } = useAuth();
export function useAuth() {
  return useContext(AuthContext);
}
