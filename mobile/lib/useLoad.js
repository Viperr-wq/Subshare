// Загружает данные с сервера, когда экран открывается, и каждый раз, когда
// пользователь на него возвращается (например, после создания группы).
//
//   const { data, error, loading, reload } = useLoad(() => api.getGroup(id), [id]);
//
// deps — значения, при изменении которых данные надо загрузить заново.
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

export function useLoad(loader, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastRequest = useRef(0); // чтобы старый медленный ответ не затёр новый

  const reload = useCallback(async () => {
    const requestId = ++lastRequest.current;
    setLoading(true);
    try {
      const result = await loader();
      if (requestId === lastRequest.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (requestId === lastRequest.current) setError(e.message);
    } finally {
      if (requestId === lastRequest.current) setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { data, error, loading, reload };
}
