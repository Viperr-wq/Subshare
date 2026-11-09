// Все обращения к серверу SubShare (бэкенд на FastAPI) собраны здесь.
// Экраны не пишут fetch сами, а вызывают готовые функции: api.getGroup(5) и т.д.
// Список эндпоинтов сервера — на странице <адрес сервера>/docs.
import { getLanguage, t } from "./i18n";

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

// Ключ входа (токен) того, кто вошёл. Его задаёт lib/auth.js после входа,
// а request() прикладывает к каждому запросу: заголовок «Authorization: Bearer <ключ>».
let authToken = null;
// Что делать, если сервер ответил «ключ недействителен» (401). Тоже задаёт lib/auth.js
let onUnauthorized = () => {};

export function setAuthToken(token) {
  authToken = token;
}

export function setOnUnauthorized(handler) {
  onUnauthorized = handler;
}

async function request(method, path, body) {
  const token = authToken; // с каким ключом ушёл запрос
  const headers = { "Accept-Language": getLanguage() }; // на этом языке сервер пишет ошибки
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(API_URL + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(t("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз."), 0);
  }

  // Ключ больше не действует (например, базу на сервере очистили) — просим войти заново.
  // Сверяем с текущим ключом: ответ мог прийти, когда человек уже вошёл по-новому
  if (response.status === 401 && token && token === authToken) onUnauthorized();

  if (response.status === 204) return null; // «успешно, ответа нет» (например, после удаления)

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Сервер присылает понятный текст ошибки (на языке приложения) в поле detail
    let message = t("Ошибка сервера ({status}). Попробуйте ещё раз.", { status: response.status });
    if (typeof data?.detail === "string") message = data.detail;
    else if (response.status === 422) message = t("Проверьте введённые данные");
    throw new ApiError(message, response.status);
  }
  return data;
}

export const api = {
  // Вход через Telegram: telegramStart → { code, url }, потом telegramCheck(code, pin)
  // с кодом из бота → { token, user }. login (по паролю) — только для демо.
  telegramStart: () => request("POST", "/login/telegram"),
  telegramCheck: (code, pin) => request("POST", "/login/telegram/check", { code, pin }),
  login: (phone, password) => request("POST", "/login", { phone, password }),
  // По почте: registerEmail({ name, email, phone, password }) → письмо с кодом → confirmEmail.
  // Забыли пароль: forgotPassword(email) → письмо с кодом → resetPassword. Все возвращают { token, user }
  registerEmail: (data) => request("POST", "/register/email", data),
  confirmEmail: (email, code) => request("POST", "/register/email/confirm", { email, code }),
  loginEmail: (email, password) => request("POST", "/login/email", { email, password }),
  forgotPassword: (email) => request("POST", "/password/forgot", { email }),
  resetPassword: (email, code, password) =>
    request("POST", "/password/reset", { email, code, password }),
  logout: () => request("POST", "/logout"),

  // Профиль
  getMe: () => request("GET", "/me"),
  updateMe: (changes) => request("PATCH", "/me", changes), // { name } или { language }
  deleteMe: () => request("DELETE", "/me"),
  getMyGroups: () => request("GET", "/me/groups"),
  getMyDebts: () => request("GET", "/me/debts"),
  getMyRating: () => request("GET", "/me/rating"), // { rating, ratings_count }

  // Группы
  createGroup: (data) => request("POST", "/groups", data),
  getGroup: (groupId) => request("GET", `/groups/${groupId}`),
  updateGroup: (groupId, changes) => request("PATCH", `/groups/${groupId}`, changes),
  deleteGroup: (groupId) => request("DELETE", `/groups/${groupId}`),
  inviteMember: (groupId, name, phone) =>
    request("POST", `/groups/${groupId}/invite`, { name, phone }),
  removeMember: (groupId, userId) => request("DELETE", `/groups/${groupId}/members/${userId}`),
  // Оценка участника: от 1 до 5 звёзд. Сервер вернёт группу с новыми средними оценками
  rateMember: (groupId, userId, stars) =>
    request("PUT", `/groups/${groupId}/members/${userId}/rating`, { stars }),

  // Чат группы. getMessages → { messages, has_more }: последние сообщения, а с before
  // (id самого старого из полученных) — более ранние
  getMessages: (groupId, before) =>
    request("GET", `/groups/${groupId}/messages${before ? `?before=${before}` : ""}`),
  sendMessage: (groupId, text) => request("POST", `/groups/${groupId}/messages`, { text }),
  deleteMessage: (groupId, messageId) =>
    request("DELETE", `/groups/${groupId}/messages/${messageId}`),

  // Платежи за месяц (period — строка «2026-10»)
  getPeriod: (groupId, period) => request("GET", `/groups/${groupId}/payments/${period}`),
  createInvoices: (groupId, period) => request("POST", `/groups/${groupId}/payments/${period}`),
  markSent: (paymentId) => request("POST", `/payments/${paymentId}/sent`), // участник: «Я перевёл»
  markPaid: (paymentId) => request("POST", `/payments/${paymentId}/pay`), // владелец: «Получил»
  markNotReceived: (paymentId) => request("POST", `/payments/${paymentId}/not-received`),
};
