// Сайт SubShare: языки, вход через Telegram и ссылки на приложение.
// Этот файл подключают обе страницы: index.html и admin.html.

// На своём компьютере сайт работает с локальным сервером (fastapi dev) и приложением (npx expo start)
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_URL = LOCAL ? "http://127.0.0.1:8000" : "https://subshare-kz-api.onrender.com";
// Веб-версия приложения. На хостинге она на том же адресе, что и сайт (/app/), поэтому
// вход на сайте сохраняется и в ней: у них общая память браузера (localStorage)
const APP_URL = LOCAL ? "http://localhost:8081/" : "/app/";
// Файл для Android из последнего выпуска на GitHub — как в mobile/lib/updates.js
const APK_URL = "https://github.com/Viperr-wq/Subshare/releases/latest/download/SubShare.apk";
// Ключи в памяти браузера — те же, что у приложения (mobile/lib/auth.js и mobile/lib/i18n.js)
const SESSION_KEY = "subshare.session"; // { token, user }
const LANGUAGE_KEY = "subshare.language";
const LANGUAGES = ["ru", "kk", "en"];
const CHECK_EVERY_MS = 2000;

// ---------- Языки ----------

let language = readStorage(LANGUAGE_KEY) || browserLanguage();
if (!LANGUAGES.includes(language)) language = "ru";

// Язык браузера, если это казахский или английский. Иначе — русский
function browserLanguage() {
  const code = (navigator.language || "").slice(0, 2).toLowerCase();
  return code === "kk" || code === "en" ? code : "ru";
}

// Как t() в приложении: русский текст → перевод из translations.js. Нет перевода — русский
function t(text, values) {
  const translation = language === "ru" ? null : TRANSLATIONS[text]?.[language === "kk" ? 0 : 1];
  let result = translation || text;
  for (const [key, value] of Object.entries(values || {})) {
    result = result.split(`{${key}}`).join(String(value));
  }
  return result;
}

// Запоминаем русский текст каждого элемента с data-t: он же — ключ перевода
const texts = [...document.querySelectorAll("[data-t]")].map((el) => [
  el,
  el.innerHTML.trim().replace(/\s+/g, " "),
]);

function setLanguage(code) {
  language = code;
  document.documentElement.lang = code;
  for (const [el, russian] of texts) el.innerHTML = t(russian);
  for (const button of document.querySelectorAll("[data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === code));
  }
}

for (const button of document.querySelectorAll("[data-lang]")) {
  button.addEventListener("click", () => {
    setLanguage(button.dataset.lang);
    writeStorage(LANGUAGE_KEY, button.dataset.lang); // приложение откроется на этом же языке
  });
}

// ---------- Память браузера и сервер ----------

// В приватном режиме браузер может запретить память — тогда просто ничего не запоминаем
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // не страшно
  }
}

function getSession() {
  try {
    return JSON.parse(readStorage(SESSION_KEY));
  } catch {
    return null;
  }
}

// Запрос к серверу SubShare. Ошибка — исключение с текстом от сервера (он пишет на языке сайта)
async function api(method, path, body, token) {
  const headers = { "Accept-Language": language };
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
    throw apiError(t("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз."), 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const text = typeof data.detail === "string" ? data.detail : t("Что-то пошло не так. Попробуйте ещё раз.");
    throw apiError(text, response.status);
  }
  return data;
}

function apiError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ---------- Ссылки и кнопки «Войти» ----------

for (const link of document.querySelectorAll("[data-app]")) link.href = APP_URL + link.dataset.app;
for (const link of document.querySelectorAll("[data-apk]")) link.href = APK_URL;

// Вошли — кнопки «Войти» и «Создать аккаунт» превращаются в «Открыть SubShare» (см. style.css)
function showSignedIn() {
  document.body.classList.toggle("signed-in", Boolean(getSession()));
}

for (const button of document.querySelectorAll("[data-login]")) {
  button.addEventListener("click", () => {
    if (getSession()) location.href = APP_URL;
    else openLogin();
  });
}

// ---------- Вход через Telegram ----------
// Как в приложении (mobile/app/welcome.js):
//   1. сервер выдаёт секретный код и ссылку на бота;
//   2. человек открывает бота и нажимает «Поделиться номером»;
//   3. сайт тем временем раз в 2 секунды спрашивает сервер, готово ли.

const dialog = document.getElementById("login");
let step = null; // loading | waiting | done | error
let attempt = 0; // номер попытки входа: ответы на старые попытки не нужны

function openLogin() {
  if (step !== "waiting") startLogin(); // ждём бота — показываем ту же ссылку
  dialog.showModal();
}

function showStep(name) {
  step = name;
  for (const part of dialog.querySelectorAll("[data-step]")) part.hidden = part.dataset.step !== name;
}

function showError(message) {
  document.getElementById("login-error").textContent = message;
  document.getElementById("login-demo").hidden = !LOCAL;
  showStep("error");
}

async function startLogin() {
  const current = ++attempt;
  showStep("loading");
  try {
    const login = await api("POST", "/login/telegram");
    if (current !== attempt) return;
    document.getElementById("login-link").href = login.url;
    showQr(login.url);
    showStep("waiting");
    waitForTelegram(login.code, current);
  } catch (e) {
    if (current === attempt) showError(e.message);
  }
}

// Спрашиваем сервер, подтвердил ли человек вход в боте. Окно можно закрыть — ждём и тогда
async function waitForTelegram(code, current) {
  while (current === attempt) {
    try {
      const result = await api("POST", "/login/telegram/check", { code });
      if (current !== attempt) return;
      if (result.done) {
        finishLogin(result);
        return;
      }
    } catch (e) {
      if (e.status === 410) {
        // Код устарел (прошло 10 минут) — начинать вход нужно заново
        if (current === attempt) showError(e.message);
        return;
      }
      // Нет связи — не страшно, спросим ещё раз
    }
    await new Promise((resolve) => setTimeout(resolve, CHECK_EVERY_MS));
  }
}

// Вход готов: запоминаем ключ там же, где его ищет веб-версия приложения
function finishLogin({ token, user }) {
  writeStorage(SESSION_KEY, JSON.stringify({ token, user }));
  showSignedIn();
  document.getElementById("login-name").textContent = user.name; // textContent: имя из Telegram — не HTML
  showStep("done");
  if (!dialog.open) dialog.showModal();
}

// QR-код со ссылкой на бота — для компьютера: навести камеру телефона, где установлен Telegram.
// На телефоне код не нужен. Библиотека qrcode-generator подключена в index.html
function showQr(url) {
  const figure = document.getElementById("login-qr");
  const desktop = matchMedia("(hover: hover) and (pointer: fine)").matches;
  figure.hidden = !(desktop && window.qrcode);
  if (figure.hidden) return;
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  document.getElementById("qr-image").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

if (dialog) {
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  // Щелчок по затемнению вокруг окна тоже закрывает его
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.getElementById("login-retry").addEventListener("click", startLogin);
  document.getElementById("login-demo").addEventListener("click", async () => {
    try {
      finishLogin(await api("POST", "/login", { phone: "+77010000001", password: "demo2026" }));
    } catch (e) {
      showError(e.message);
    }
  });
  // Ссылка …/#login сразу открывает окно входа (на неё ведёт страница статистики)
  if (location.hash === "#login" && !getSession()) openLogin();
}

setLanguage(language);
showSignedIn();
