"""
Схемы — описание того, какие данные API принимает и возвращает (в формате JSON).

Модели (models.py) описывают таблицы в базе, а схемы — «форму» запросов и ответов.
Pydantic автоматически проверяет входящие данные: если, например, цена
отрицательная или телефон в неверном формате, API сразу вернёт понятную ошибку.
"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

# ---------- Пользователи ----------


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100, examples=[" "])
    phone: str = Field(pattern=r"^\+7\d{10}$", examples=[" "])


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str


# ---------- Группы ----------


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100, examples=["Netflix с друзьями"])
    service_name: str = Field(min_length=1, max_length=100, examples=["Netflix"])
    total_price: int = Field(gt=0, description="Цена подписки в месяц, ₸", examples=[6000])
    billing_day: int = Field(
        ge=1, le=28, description="До какого числа месяца нужно заплатить", examples=[5]
    )
    max_members: int = Field(
        ge=2, le=10, description="Максимум участников по тарифу", examples=[4]
    )
    owner_id: int = Field(description="Кто оплачивает подписку сервису", examples=[1])


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


class AddMember(BaseModel):
    user_id: int = Field(examples=[2])


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
    status: str = Field(description="pending — не оплачено, paid — оплачено")
    is_overdue: bool = Field(description="Срок прошёл, а оплаты нет")
    method: str = Field(description="Способ оплаты. Сейчас: manual — перевод вручную")
    paid_at: datetime | None


class PeriodStatus(BaseModel):
    """Сводка по группе за месяц: кто оплатил, кто должен."""

    group_id: int
    service_name: str
    period: str
    total_to_collect: int = Field(description="Сколько владелец должен получить от участников")
    collected: int = Field(description="Сколько уже оплачено")
    outstanding: int = Field(description="Сколько ещё не оплачено")
    payments: list[PaymentOut]
