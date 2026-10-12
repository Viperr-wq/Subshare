// Все обращения к серверу SubShare (бэкенд на FastAPI) собраны здесь.
// Экраны не пишут fetch сами, а вызывают готовые функции: api.getGroup(5) и т.д.
// Список эндпоинтов сервера — на странице <адрес сервера>/docs.

// Адрес сервера задаётся переменной окружения EXPO_PUBLIC_API_URL при сборке
// (на Render — в render.yaml, для APK — в eas.json, на своём компьютере — в файле
// mobile/.env, образец — mobile/.env.example). Если её нет — работаем с сервером на Render.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://subshare-kz-api.onrender.com").replace(
  /\/+$/,
  ""
);

// Ошибка от сервера: текст для человека + HTTP-код (например, 404 — «не найдено»)
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(API_URL + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.", 0);
  }

  if (response.status === 204) return null; // «успешно, ответа нет» (например, после удаления)

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Сервер присылает понятный текст ошибки на русском в поле detail
    let message = `Ошибка сервера (${response.status}). Попробуйте ещё раз.`;
    if (typeof data?.detail === "string") message = data.detail;
    else if (response.status === 422) message = "Проверьте введённые данные";
    throw new ApiError(message, response.status);
  }
  return data;
}

export const api = {
  // Пользователи
  login: (phone) => request("POST", "/login", { phone }),
  register: (name, phone) => request("POST", "/users", { name, phone }),
  getUser: (userId) => request("GET", `/users/${userId}`),
  getUserGroups: (userId) => request("GET", `/users/${userId}/groups`),
  getUserDebts: (userId) => request("GET", `/users/${userId}/debts`),

  // Группы
  createGroup: (data) => request("POST", "/groups", data),
  getGroup: (groupId) => request("GET", `/groups/${groupId}`),
  updateGroup: (groupId, changes) => request("PATCH", `/groups/${groupId}`, changes),
  deleteGroup: (groupId) => request("DELETE", `/groups/${groupId}`),
  inviteMember: (groupId, name, phone) =>
    request("POST", `/groups/${groupId}/invite`, { name, phone }),
  removeMember: (groupId, userId) => request("DELETE", `/groups/${groupId}/members/${userId}`),

  // Платежи за месяц (period — строка «2026-10»)
  getPeriod: (groupId, period) => request("GET", `/groups/${groupId}/payments/${period}`),
  createInvoices: (groupId, period) => request("POST", `/groups/${groupId}/payments/${period}`),
  markPaid: (paymentId) => request("POST", `/payments/${paymentId}/pay`),
};
