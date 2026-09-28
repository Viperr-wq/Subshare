"""
Модели — это описание таблиц в базе данных.

Каждый класс ниже = одна таблица, каждое поле = одна колонка.

    users                 — пользователи
    subscription_groups   — группы подписок (например, «Netflix с друзьями»)
    memberships           — кто в какой группе состоит
    payments              — начисления: кто, сколько и за какой месяц должен заплатить

Все суммы хранятся в целых тенге (int), а не в дробных числах:
с дробями (float) в деньгах легко получить ошибки округления.
"""

from datetime import date, datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

# Статусы платежа
PAYMENT_PENDING = "pending"  # ещё не оплачено
PAYMENT_PAID = "paid"  # оплачено

# Способ оплаты. Платёжная система ещё выбирается, поэтому сейчас
# поддерживается только ручной перевод владельцу (Kaspi, перевод по номеру и т.п.).
# Когда подключим провайдера, добавятся значения вроде "halyk_epay" или "freedom_pay".
PAYMENT_METHOD_MANUAL = "manual"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(20), unique=True)  # +7XXXXXXXXXX
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user")


class SubscriptionGroup(Base):
    __tablename__ = "subscription_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))  # «Netflix с друзьями»
    service_name: Mapped[str] = mapped_column(String(100))  # «Netflix»
    total_price: Mapped[int]  # полная цена подписки в месяц, ₸
    currency: Mapped[str] = mapped_column(String(3), default="KZT")
    billing_day: Mapped[int]  # до какого числа месяца участники должны заплатить (1–28)
    max_members: Mapped[int]  # сколько человек допускает тариф
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    owner: Mapped["User"] = relationship()
    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="Membership.id",  # порядок вступления
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="group", cascade="all, delete-orphan"
    )


class Membership(Base):
    """Связь «пользователь состоит в группе». Владелец группы тоже участник."""

    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("group_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("subscription_groups.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    group: Mapped["SubscriptionGroup"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="memberships")


class Payment(Base):
    """
    Начисление за один месяц для одного участника.
    Владелец сам платит сервису, поэтому начисления создаются только для остальных.
    """

    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("group_id", "user_id", "period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("subscription_groups.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    period: Mapped[str] = mapped_column(String(7))  # месяц в формате "2026-10"
    amount: Mapped[int]  # сумма к оплате, ₸ (запоминается на момент начисления)
    due_date: Mapped[date]  # срок оплаты
    status: Mapped[str] = mapped_column(String(20), default=PAYMENT_PENDING)
    method: Mapped[str] = mapped_column(String(30), default=PAYMENT_METHOD_MANUAL)
    # Номер транзакции у платёжного провайдера. Пока пусто — заполнится,
    # когда будет подключена платёжная система (Halyk ePay, Freedom Pay и т.п.).
    external_id: Mapped[str | None] = mapped_column(String(100), default=None)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    group: Mapped["SubscriptionGroup"] = relationship(back_populates="payments")
    user: Mapped["User"] = relationship()
