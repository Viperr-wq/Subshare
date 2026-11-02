"""
Бизнес-логика SubShare: расчёт долей и сроков оплаты, пароли и ключи входа.

Эти функции не зависят от базы данных и API — их легко проверить тестами.
"""

import hashlib
import hmac
import re
import secrets
from datetime import date, datetime, timedelta, timezone

PERIOD_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Время в Казахстане: с 1 марта 2024 года по всей стране UTC+5, без перевода часов.
# Сервер на хостинге живёт по UTC, поэтому «сегодня» считаем по казахстанскому времени:
# иначе с 00:00 до 05:00 счёт ещё не считался бы просроченным, а месяц — наступившим.
KZ_TIMEZONE = timezone(timedelta(hours=5))


def today_kz() -> date:
    return datetime.now(KZ_TIMEZONE).date()


def current_period() -> str:
    """Текущий месяц в Казахстане в формате ГГГГ-ММ."""
    return today_kz().strftime("%Y-%m")


def utcnow() -> datetime:
    """Текущее время UTC без часового пояса — в таком виде время хранится в базе."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def normalize_email(raw: str) -> str:
    """Почта в одном виде: без пробелов по краям и маленькими буквами («Aru@Mail.KZ» → «aru@mail.kz»)."""
    return raw.strip().lower()


def new_digit_code() -> str:
    """Код из 6 случайных цифр, например «042917»: его присылают в письме или в боте."""
    return f"{secrets.randbelow(10**6):06d}"


def normalize_phone(raw: str) -> str | None:
    """
    Номер в формат +7XXXXXXXXXX. Telegram присылает его по-разному: «77011234567»,
    «+77011234567». Если это не номер +7 — возвращает None.
    """
    digits = "".join(ch for ch in raw if ch in "0123456789")
    if len(digits) == 11 and digits[0] in "78":
        return "+7" + digits[1:]
    return None


def format_tenge(amount: int) -> str:
    """1500 -> «1 500 ₸» — для сообщений бота."""
    return f"{amount:,}".replace(",", " ") + " ₸"


def split_price(total: int, count: int) -> list[int]:
    """
    Делит цену подписки на count участников в целых тенге.

    Если сумма не делится ровно, лишние тенге достаются первым участникам
    (первым в группе всегда стоит владелец).

        split_price(6000, 4) -> [1500, 1500, 1500, 1500]
        split_price(5000, 3) -> [1667, 1667, 1666]
    """
    if count <= 0:
        raise ValueError("В группе должен быть хотя бы один участник")
    base, remainder = divmod(total, count)
    return [base + 1 if i < remainder else base for i in range(count)]


def is_valid_period(period: str) -> bool:
    """Проверяет, что месяц записан в формате ГГГГ-ММ, например 2026-10."""
    return bool(PERIOD_PATTERN.match(period))


def due_date_for(period: str, billing_day: int) -> date:
    """Срок оплаты: число billing_day в указанном месяце. '2026-10', 5 -> 2026-10-05."""
    year, month = map(int, period.split("-"))
    return date(year, month, billing_day)


# ---------- Пароли и ключи входа ----------

# Насколько «тяжело» считать хеш пароля (алгоритм scrypt из стандартной библиотеки Python).
# Один вход занимает доли секунды, а перебор миллионов паролей занял бы очень много времени.
SCRYPT_PARAMS = {"n": 2**14, "r": 8, "p": 1}


def hash_password(password: str) -> str:
    """
    Превращает пароль в строку для хранения в базе: «соль$хеш».

    Соль — случайные байты, свои для каждого пароля: у двух людей с одинаковым
    паролем хеши всё равно разные. Из хеша сам пароль обратно не получить.
    """
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT_PARAMS)
    return f"{salt.hex()}${digest.hex()}"


def check_password(password: str, password_hash: str) -> bool:
    """Подходит ли пароль к хешу, который сохранила hash_password."""
    salt, digest = password_hash.split("$")
    attempt = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **SCRYPT_PARAMS)
    # compare_digest сравнивает за одинаковое время: по скорости ответа хеш не угадать
    return hmac.compare_digest(attempt.hex(), digest)


def new_token() -> str:
    """Новый ключ входа — длинная случайная строка, угадать её невозможно."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Хеш ключа входа: в базе хранится он, а не сам ключ."""
    return hashlib.sha256(token.encode()).hexdigest()
