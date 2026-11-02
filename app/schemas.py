"""
Схемы — описание того, какие данные API принимает и возвращает (в формате JSON).

Модели (models.py) описывают таблицы в базе, а схемы — «форму» запросов и ответов.
Pydantic автоматически проверяет входящие данные: если, например, цена
отрицательная или телефон в неверном формате, API сразу вернёт понятную ошибку.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Казахстанский номер: +7 и 10 цифр. Именно [0-9], а не \d: \d пропускает и «экзотические»
# цифры (например, полноширинные ０-９), и тогда один номер мог бы записаться двумя способами.
PHONE_PATTERN = r"^\+7[0-9]{10}$"

# Верхняя граница цены подписки — защита от лишних нулей при вводе
MAX_PRICE = 10_000_000

# Входные данные: пробелы по краям текста убираем, поэтому имя из одних пробелов не пройдёт
STRIP = ConfigDict(str_strip_whitespace=True)

# ---------- Пользователи ----------


class InviteIn(BaseModel):
    """Добавить друга в группу по имени и номеру. Аккаунт друг получит, когда сам войдёт."""

    model_config = STRIP

    name: str = Field(min_length=1, max_length=100, examples=[" "])
    phone: str = Field(pattern=PHONE_PATTERN, examples=[" "])


class LoginIn(BaseModel):
    """Вход по паролю — только для демо-пользователей из seed.py."""

    phone: str = Field(pattern=PHONE_PATTERN, examples=["+77010000001"])
    password: str = Field(min_length=1, max_length=128, examples=["demo2026"])


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    language: str = Field(description="Язык уведомлений: ru, kk или en")


class UserUpdate(BaseModel):
    """Изменение профиля: передаются только нужные поля."""

    model_config = STRIP

    name: str | None = Field(default=None, min_length=1, max_length=100, examples=["Аружан"])
    language: Literal["ru", "kk", "en"] | None = Field(default=None, examples=["kk"])


class AuthOut(BaseModel):
    """Ответ на вход."""

    token: str = Field(description="Ключ входа: заголовок Authorization: Bearer <ключ>")
    user: UserOut


class TelegramLoginOut(BaseModel):
    code: str = Field(description="Секретный код этого входа: с ним приложение спрашивает, готово ли")
    url: str = Field(description="Ссылка на бота — её открывает приложение")
    expires_in: int = Field(description="Сколько секунд действует код")


class TelegramCheckIn(BaseModel):
    code: str = Field(min_length=1, max_length=100)


class TelegramCheckOut(BaseModel):
    """Пока человек не поделился номером в боте — done=false. Потом — ключ входа."""

    done: bool
    token: str | None = None
    user: UserOut | None = None


# ---------- Команда SubShare ----------


class ClientOut(BaseModel):
    """Аккаунт в списке для команды."""

    name: str
    phone: str
    language: str
    created: date = Field(description="Когда появился аккаунт (дата по времени Казахстана)")
    groups: int = Field(description="В скольких группах состоит")


class StatsOut(BaseModel):
    """Статистика для команды SubShare (страница admin.html на сайте)."""

    accounts: int = Field(description="Аккаунтов: людей, которые сами входили в SubShare")
    new_week: int = Field(description="Из них появились за последние 7 дней")
    invited: int = Field(description="Добавлены в группу по номеру, но ещё ни разу не входили")
    groups: int = Field(description="Групп подписок")
    clients: list[ClientOut] = Field(description="Аккаунты, новые сверху")


# ---------- Группы ----------


class GroupCreate(BaseModel):
    """Новая группа. Владельцем становится тот, кто её создаёт: его узнаём по ключу входа."""

    model_config = STRIP

    name: str = Field(min_length=1, max_length=100, examples=["Netflix с друзьями"])
    service_name: str = Field(min_length=1, max_length=100, examples=["Netflix"])
    total_price: int = Field(
        gt=0, le=MAX_PRICE, description="Цена подписки в месяц, ₸", examples=[6000]
    )
    billing_day: int = Field(
        ge=1, le=28, description="До какого числа месяца нужно заплатить", examples=[5]
    )
    max_members: int = Field(
        ge=2, le=10, description="Максимум участников по тарифу", examples=[4]
    )


class GroupUpdate(BaseModel):
    """
    Изменение группы. Передаются только те поля, которые нужно поменять, —
    остальные останутся прежними. Владельца группы (owner_id) и валюту менять нельзя.
    """

    model_config = STRIP

    name: str | None = Field(default=None, min_length=1, max_length=100, examples=["Netflix с семьёй"])
    service_name: str | None = Field(default=None, min_length=1, max_length=100, examples=["Netflix"])
    total_price: int | None = Field(
        default=None, gt=0, le=MAX_PRICE, description="Цена подписки в месяц, ₸", examples=[8000]
    )
    billing_day: int | None = Field(
        default=None, ge=1, le=28, description="До какого числа месяца нужно заплатить", examples=[10]
    )
    max_members: int | None = Field(
        default=None, ge=2, le=10, description="Максимум участников по тарифу", examples=[6]
    )


class MemberShare(BaseModel):
    user_id: int
    name: str
    is_owner: bool
    share: int = Field(description="Доля участника в месяц, ₸")


class GroupOut(BaseModel):
    id: int
    name: str
    service_name: str
    total_price: int
    currency: str
    billing_day: int
    max_members: int
    owner_id: int
    members_count: int
    members: list[MemberShare]


# ---------- Платежи ----------


class PaymentOut(BaseModel):
    id: int
    group_id: int
    service_name: str
    user_id: int
    user_name: str
    period: str
    amount: int
    due_date: date
    status: str = Field(
        description="pending — не оплачено, sent — участник перевёл и ждёт подтверждения, "
        "paid — владелец подтвердил оплату"
    )
    is_overdue: bool = Field(description="Срок прошёл, а оплаты нет")
    method: str = Field(description="Способ оплаты. Сейчас: manual — перевод вручную")
    paid_at: datetime | None
    owner_name: str = Field(description="Кому переводить деньги — владелец группы")
    owner_phone: str = Field(description="Номер владельца для перевода (например, через Kaspi)")


class PeriodStatus(BaseModel):
    """Сводка по группе за месяц: кто оплатил, кто должен."""

    group_id: int
    service_name: str
    period: str
    total_to_collect: int = Field(description="Сколько владелец должен получить от участников")
    collected: int = Field(description="Сколько уже оплачено")
    outstanding: int = Field(description="Сколько ещё не оплачено")
    payments: list[PaymentOut]
