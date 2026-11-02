// Страница статистики (admin.html). Вход и запросы к серверу — из script.js.
// Сервер (GET /admin/stats) отдаёт данные только номерам из ADMIN_PHONES — настройка на Render.

const statusText = document.getElementById("status");
const LANGUAGE_NAMES = { ru: "Рус", kk: "Қаз", en: "Eng" };

// Сообщение со ссылкой на вход на главной странице (index.html#login сразу открывает окно входа)
function askToSignIn(text) {
  statusText.textContent = `${text} `;
  const link = document.createElement("a");
  link.href = "index.html#login";
  link.textContent = "Войти через Telegram";
  statusText.append(link);
}

async function loadStats() {
  const session = getSession();
  if (!session) {
    askToSignIn("Войдите на сайте со своим номером, затем откройте эту страницу снова.");
    return;
  }
  let stats;
  try {
    stats = await api("GET", "/admin/stats", null, session.token);
  } catch (e) {
    if (e.status === 401) {
      writeStorage(SESSION_KEY, null); // ключ входа больше не действует
      askToSignIn(e.message);
    } else if (e.status === 403) {
      statusText.textContent =
        `Номера ${session.user.phone} нет в списке команды. ` +
        "Добавьте его в ADMIN_PHONES в настройках сервера на Render (см. DEPLOY.md).";
    } else {
      statusText.textContent = e.message;
    }
    return;
  }

  statusText.textContent = `Вы вошли как ${session.user.name}. Данные на ${new Date().toLocaleString("ru-RU")}.`;
  document.getElementById("accounts").textContent = stats.accounts;
  document.getElementById("new-week").textContent = stats.new_week;
  document.getElementById("invited").textContent = stats.invited;
  document.getElementById("groups").textContent = stats.groups;

  // textContent, а не innerHTML: имена приходят из Telegram, в них может быть что угодно
  const rows = document.getElementById("clients");
  for (const client of stats.clients) {
    const row = rows.insertRow();
    for (const value of [
      client.name,
      formatPhone(client.phone),
      LANGUAGE_NAMES[client.language] || client.language,
      client.groups,
      client.created.split("-").reverse().join("."), // 2026-11-02 → 02.11.2026
    ]) {
      row.insertCell().textContent = value;
    }
  }
  document.getElementById("stats").hidden = false;
}

// +77011234567 → +7 701 123 45 67
function formatPhone(phone) {
  return phone.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, "+7 $1 $2 $3 $4");
}

loadStats();
