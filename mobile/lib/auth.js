// Кто сейчас вошёл в приложение.
// Пользователь запоминается в памяти устройства (AsyncStorage; в браузере это
// localStorage), чтобы не входить заново при каждом запуске.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";

import { api } from "./api";

const STORAGE_KEY = "subshare.user";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false); // прочитали ли уже сохранённого пользователя

  useEffect(() => {
    async function restore() {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const savedUser = JSON.parse(saved);
          setUser(savedUser);
          // В фоне сверяемся с сервером: базу могли очистить, и тогда под этим id
          // теперь другой человек (или никого нет) — просим войти заново
          api
            .getUser(savedUser.id)
            .then((fresh) => {
              if (fresh.phone === savedUser.phone) signIn(fresh);
              else signOut();
            })
            .catch((error) => {
              if (error.status === 404) signOut();
            });
        }
      } catch {
        // Не получилось прочитать — просто покажем экран входа
      }
      setReady(true);
    }
    restore();
  }, []);

  async function signIn(newUser) {
    setUser(newUser);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
  }

  async function signOut() {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

// В любом экране: const { user, signOut } = useAuth();
export function useAuth() {
  return useContext(AuthContext);
}
