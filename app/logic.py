"""
Бизнес-логика SubShare: расчёт долей и сроков оплаты.

Эти функции не зависят от базы данных и API — их легко проверить тестами.
"""

import re
from datetime import date

PERIOD_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


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
