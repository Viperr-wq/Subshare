// Как показывать на экране деньги, телефоны, даты и месяцы.

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];
const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

// 6000 → «6 000 ₸». Пробелы неразрывные, чтобы сумма не переносилась на другую строку.
export function formatMoney(amount) {
  const digits = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${digits} ₸`;
}

// Превращает то, что ввёл человек («8 701 000 00 01», «+7 (701) 000-00-01»,
// «7010000001»), в формат сервера «+77010000001». Если цифр не хватает — null.
export function normalizePhone(text) {
  let digits = String(text).replace(/\D/g, "");
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) {
    digits = digits.slice(1);
  }
  return digits.length === 10 ? `+7${digits}` : null;
}

// «7010000001» → «701 000 00 01» (для поля ввода, где «+7» уже стоит слева)
export function formatPhoneDigits(digits) {
  const d = digits.slice(0, 10);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)];
  return parts.filter(Boolean).join(" ");
}

// «+77010000001» → «+7 701 000 00 01»
export function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return phone;
  return `+7 ${formatPhoneDigits(digits)}`;
}

// «2026-10-05» → «5 октября»
export function formatDate(isoDate) {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS_GENITIVE[month - 1]}`;
}

// Текущий месяц в формате сервера: «2026-10»
export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Соседний месяц: shiftPeriod("2026-01", -1) → «2025-12»
export function shiftPeriod(period, delta) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// «2026-10» → «Октябрь 2026»
export function periodLabel(period) {
  const [year, month] = period.split("-").map(Number);
  const name = MONTHS[month - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}

// plural(3, "участник", "участника", "участников") → «участника»
export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// «Аружан Сериккызы» → «Аружан»
export function firstName(name) {
  return String(name).trim().split(/\s+/)[0];
}

// «Аружан Сериккызы» → «АС», «Тимур» → «Т»
export function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  const letters = (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
  return letters.toUpperCase() || "?";
}

// Та же формула, что split_price на сервере (app/logic.py): цена делится поровну,
// остаток раздаётся по 1 ₸ первым участникам. Нужна для подсказки «каждый платит…»
// ещё до того, как группа создана.
export function splitPrice(total, count) {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => (i < remainder ? base + 1 : base));
}
