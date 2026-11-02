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
//   3. бот присылает код из 6 цифр — человек вводит его здесь и получает ключ входа.

const dialog = document.getElementById("login");
let step = null; // loading | waiting | done | error
let attempt = 0; // номер попытки входа: ответы на старые попытки не нужны
let loginCode = null; // секретный код входа: с ним и с кодом из бота сервер выдаст ключ

function openLogin() {
  // Ждём бота или вводят почту — продолжаем с того же места. Иначе — выбор способа
  if (!["waiting", "email", "code"].includes(step)) showStep("choose");
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
    loginCode = login.code;
    pinForm.reset();
    showFormError("pin-error", null);
    showStep("waiting");
  } catch (e) {
    if (current === attempt) showError(e.message);
  }
}

// Код из бота → ключ входа
const pinForm = document.getElementById("pin-form");
pinForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const pin = new FormData(pinForm).get("pin").replace(/\D/g, "");
  if (pin.length !== 6) {
    showFormError("pin-error", t("Введите 6 цифр из Telegram"));
    return;
  }
  whileBusy(event.submitter || pinForm.querySelector("[type=submit]"), async () => {
    try {
      finishLogin(await api("POST", "/login/telegram/check", { code: loginCode, pin }));
    } catch (e) {
      // Вход устарел (прошло 10 минут) или код 5 раз ввели неверно — начинать нужно заново
      if (e.status === 410) showError(e.message);
      else showFormError("pin-error", e.message);
    }
  });
});

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

// ---------- Регистрация по почте ----------
// Как в приложении (mobile/app/email.js): данные → сервер присылает на почту код →
// человек вводит код → аккаунт готов. Вход по почте и смена пароля — в приложении (/app/email).

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; // как на сервере (app/schemas.py)
const emailForm = document.getElementById("email-form");
const codeForm = document.getElementById("code-form");
let registration = null; // данные формы: с ними же просим код ещё раз

// «8 701 234 56 78», «+7 (701) 234-56-78» → «+77012345678». Не номер +7 — null
function normalizePhone(text) {
  let digits = String(text).replace(/\D/g, "");
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) digits = digits.slice(1);
  return digits.length === 10 ? `+7${digits}` : null;
}

function showFormError(id, message) {
  const element = document.getElementById(id);
  element.textContent = message || "";
  element.hidden = !message;
}

// Пока ждём сервер, кнопка неактивна — чтобы не отправить форму дважды
async function whileBusy(button, action) {
  button.disabled = true;
  try {
    await action();
  } finally {
    button.disabled = false;
  }
}

// Просит сервер прислать код на почту из registration. Ошибку показывает в errorId
async function sendCode(errorId) {
  showFormError(errorId, null);
  try {
    await api("POST", "/register/email", registration);
    return true;
  } catch (e) {
    showFormError(errorId, e.message);
    return false;
  }
}

if (emailForm) {
  document.getElementById("choose-telegram").addEventListener("click", startLogin);
  document.getElementById("choose-email").addEventListener("click", () => {
    showStep("email");
    emailForm.querySelector("input").focus();
  });

  emailForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(emailForm);
    const data = {
      name: form.get("name").trim(),
      email: form.get("email").trim(),
      phone: normalizePhone(form.get("phone")),
      password: form.get("password"),
    };
    let problem = null;
    if (!data.name) problem = t("Введите имя");
    else if (!EMAIL_PATTERN.test(data.email)) problem = t("Проверьте адрес почты");
    else if (!data.phone) problem = t("Номер — 10 цифр после +7");
    else if (data.password.length < 8) problem = t("Пароль — не короче 8 символов");
    if (problem) {
      showFormError("email-error", problem);
      return;
    }
    whileBusy(event.submitter || emailForm.querySelector("[type=submit]"), async () => {
      registration = data;
      if (!(await sendCode("email-error"))) return;
      const sent = t("Мы отправили код на {email}. Если письма нет, проверьте папку «Спам».", { email: data.email });
      document.getElementById("code-sent").textContent = sent;
      codeForm.reset();
      showFormError("code-error", null);
      showStep("code");
      codeForm.querySelector("input").focus();
    });
  });

  codeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = new FormData(codeForm).get("code").replace(/\D/g, "");
    if (code.length !== 6) {
      showFormError("code-error", t("Введите 6 цифр из письма"));
      return;
    }
    whileBusy(event.submitter || codeForm.querySelector("[type=submit]"), async () => {
      try {
        finishLogin(await api("POST", "/register/email/confirm", { email: registration.email, code }));
      } catch (e) {
        showFormError("code-error", e.message);
      }
    });
  });

  const resend = document.getElementById("code-resend");
  resend.addEventListener("click", () =>
    whileBusy(resend, async () => {
      if (!(await sendCode("code-error"))) return;
      const sent = t("Отправили новый код на {email}. Если письма нет, проверьте папку «Спам».", { email: registration.email });
      document.getElementById("code-sent").textContent = sent;
    })
  );
  document.getElementById("code-back").addEventListener("click", () => showStep("email"));
}

setLanguage(language);
showSignedIn();
