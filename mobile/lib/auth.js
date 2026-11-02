// Кто сейчас вошёл в приложение.
// Ключ входа (токен) и данные пользователя запоминаются в памяти устройства
// (AsyncStorage; в браузере это localStorage), чтобы не входить заново при каждом запуске.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { api, setAuthToken, setOnUnauthorized } from "./api";

const STORAGE_KEY = "subshare.session"; // { token, user }
const OLD_STORAGE_KEY = "subshare.user"; // так вход хранила прошлая версия — без ключа
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false); // прочитали ли уже сохранённый вход
  const session = useRef(null); // { token, user } — то же, что лежит в памяти устройства

  useEffect(() => {
    // Сервер сказал, что ключ недействителен, — забываем вход, откроется экран входа
    setOnUnauthorized(forget);

    async function restore() {
      try {
        await AsyncStorage.removeItem(OLD_STORAGE_KEY);
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          session.current = JSON.parse(saved);
          setAuthToken(session.current.token);
          setUser(session.current.user);
          // В фоне проверяем, что ключ ещё действует, и берём свежие имя и язык (их могли
          // поменять на другом устройстве). Ключ недействителен (например, базу очистили) —
          // сработает setOnUnauthorized выше. Нет сети — не страшно, проверим в другой раз
          api.getMe().then(updateUser).catch(() => {});
        }
      } catch {
        // Не получилось прочитать — просто покажем экран входа
      }
      setReady(true);
    }
    restore();
  }, []);

  // newSession — ответ сервера на вход или регистрацию: { token, user }
  async function signIn(newSession) {
    session.current = newSession;
    setAuthToken(newSession.token);
    setUser(newSession.user);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
  }

  // Сервер прислал свежие данные пользователя (после GET или PATCH /me) — запоминаем их.
  // Если, пока ждали ответ, из аккаунта вышли или вошли в другой, — ничего не меняем
  async function updateUser(fresh) {
    if (session.current?.user.id !== fresh.id) return;
    session.current = { ...session.current, user: fresh };
    setUser(fresh);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session.current));
  }

  // Забыть вход на этом устройстве
  async function forget() {
    session.current = null;
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
    <AuthContext.Provider value={{ user, ready, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// В любом экране: const { user, signOut } = useAuth();
export function useAuth() {
  return useContext(AuthContext);
}
