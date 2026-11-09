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

# Почта: что-то@что-то.домен. Подробнее не проверяем: настоящая ли она, покажет код из письма
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
EMAIL_CODE_PATTERN = r"^[0-9]{6}$"

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
    email: str | None = Field(default=None, description="Почта — если человек регистрировался по почте")
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


# Вход по почте. Пробелы по краям убираем во всех полях (и в пароле — одинаково
# при регистрации и при входе)


class EmailRegisterIn(BaseModel):
    """Регистрация по почте. Аккаунт появится, когда человек введёт код из письма."""

    model_config = STRIP

    name: str = Field(min_length=1, max_length=100, examples=["Аружан"])
    email: str = Field(max_length=254, pattern=EMAIL_PATTERN, examples=["aruzhan@example.com"])
    phone: str = Field(pattern=PHONE_PATTERN, examples=["+77011234567"])
    password: str = Field(min_length=8, max_length=128, description="Не короче 8 символов")


class EmailCodeIn(BaseModel):
    model_config = STRIP

    email: str = Field(max_length=254, pattern=EMAIL_PATTERN, examples=["aruzhan@example.com"])
    code: str = Field(pattern=EMAIL_CODE_PATTERN, examples=["123456"])


class EmailLoginIn(BaseModel):
    model_config = STRIP

    email: str = Field(max_length=254, pattern=EMAIL_PATTERN, examples=["aruzhan@example.com"])
    password: str = Field(min_length=1, max_length=128)


class EmailIn(BaseModel):
    model_config = STRIP

    email: str = Field(max_length=254, pattern=EMAIL_PATTERN, examples=["aruzhan@example.com"])


class PasswordResetIn(BaseModel):
    model_config = STRIP

    email: str = Field(max_length=254, pattern=EMAIL_PATTERN, examples=["aruzhan@example.com"])
    code: str = Field(pattern=EMAIL_CODE_PATTERN, examples=["123456"])
    password: str = Field(min_length=8, max_length=128, description="Новый пароль, не короче 8 символов")


class EmailCodeOut(BaseModel):
    """Письмо с кодом отправлено."""

    expires_in: int = Field(description="Сколько секунд действует код")


class TelegramLoginOut(BaseModel):
    code: str = Field(description="Секретный код этого входа: с ним приложение потом получит ключ")
    url: str = Field(description="Ссылка на бота — её открывает приложение")
    expires_in: int = Field(description="Сколько секунд действует код")


class TelegramCheckIn(BaseModel):
    """Вход через Telegram: секретный код входа и 6 цифр, которые прислал бот."""

    code: str = Field(min_length=1, max_length=100)
    pin: str = Field(pattern=r"^[0-9]{6}$", examples=["123456"])


# ---------- Команда SubShare ----------


class ClientOut(BaseModel):
    """Аккаунт в списке для команды."""

    name: str
    phone: str
    email: str | None
    language: str
    groups: int = Field(description="В скольких группах состоит")


class StatsOut(BaseModel):
    """Статистика для команды SubShare (страница admin.html на сайте)."""

    accounts: int = Field(description="Аккаунтов: людей, которые сами входили в SubShare")
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
    rating: float | None = Field(
        description="Средняя оценка участника от 1 до 5 звёзд. None — его ещё никто не оценил"
    )
    ratings_count: int = Field(description="Сколько человек его оценили")
    my_stars: int | None = Field(
        description="Сколько звёзд ему поставили вы. None — вы его ещё не оценивали"
    )


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
    unread_messages: int = Field(description="Новых сообщений в чате группы: вы их ещё не видели")


# ---------- Чат группы ----------


class MessageIn(BaseModel):
    model_config = STRIP

    text: str = Field(min_length=1, max_length=1000, examples=["Всем привет!"])


class MessageOut(BaseModel):
    id: int
    user_id: int = Field(description="Кто написал")
    user_name: str = Field(description="Имя автора")
    text: str
    created_at: datetime = Field(description="Когда написано (время UTC)")


class MessagesOut(BaseModel):
    messages: list[MessageOut] = Field(description="Сообщения — от старых к новым")
    has_more: bool = Field(description="Есть ли сообщения ещё раньше: их отдаст запрос с before")


# ---------- Оценки ----------


class RatingIn(BaseModel):
    stars: int = Field(ge=1, le=5, description="Сколько звёзд: от 1 до 5", examples=[5])


class RatingOut(BaseModel):
    """Мой рейтинг: средняя оценка от участников моих групп."""

    rating: float | None = Field(description="Средняя оценка от 1 до 5. None — вас ещё никто не оценил")
    ratings_count: int = Field(description="Сколько человек вас оценили")


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
