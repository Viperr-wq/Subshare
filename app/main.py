"""
Главный файл API SubShare.

Здесь описаны эндпоинты — адреса, к которым будет обращаться мобильное приложение.
После запуска сервера откройте http://127.0.0.1:8000/docs — там можно
посмотреть и попробовать все эндпоинты прямо в браузере.
"""

from contextlib import asynccontextmanager
from datetime import date, datetime, timezone

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas
from .database import Base, engine, get_db
from .logic import due_date_for, is_valid_period, split_price


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # При запуске сервера создаём таблицы, если их ещё нет.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="SubShare API",
    description="Сервис для совместной оплаты подписок: группы, доли, статусы оплаты.",
    version="0.1.0",
    lifespan=lifespan,
)


# ---------- Вспомогательные функции ----------


def get_user_or_404(db: Session, user_id: int) -> models.User:
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Пользователь {user_id} не найден")
    return user


def get_group_or_404(db: Session, group_id: int) -> models.SubscriptionGroup:
    group = db.get(models.SubscriptionGroup, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Группа {group_id} не найдена")
    return group


def check_period(period: str) -> None:
    if not is_valid_period(period):
        raise HTTPException(
            422,
            "Месяц нужно указать в формате ГГГГ-ММ, например 2026-10",
        )


def group_to_schema(group: models.SubscriptionGroup) -> schemas.GroupOut:
    """Собирает ответ о группе и считает текущую долю каждого участника."""
    shares = split_price(group.total_price, len(group.memberships))
    members = [
        schemas.MemberShare(
            user_id=m.user_id,
            name=m.user.name,
            is_owner=m.user_id == group.owner_id,
            share=share,
        )
        for m, share in zip(group.memberships, shares)
    ]
    return schemas.GroupOut(
        id=group.id,
        name=group.name,
        service_name=group.service_name,
        total_price=group.total_price,
        currency=group.currency,
        billing_day=group.billing_day,
        max_members=group.max_members,
        owner_id=group.owner_id,
        members_count=len(members),
        members=members,
    )


def payment_to_schema(payment: models.Payment) -> schemas.PaymentOut:
    return schemas.PaymentOut(
        id=payment.id,
        group_id=payment.group_id,
        service_name=payment.group.service_name,
        user_id=payment.user_id,
        user_name=payment.user.name,
        period=payment.period,
        amount=payment.amount,
        due_date=payment.due_date,
        status=payment.status,
        is_overdue=payment.status == models.PAYMENT_PENDING and payment.due_date < date.today(),
        method=payment.method,
        paid_at=payment.paid_at,
    )


# ---------- Проверка, что сервер работает ----------


@app.get("/", tags=["Служебное"], summary="Проверка, что сервер работает")
def root():
    return {"app": "SubShare API", "status": "ok", "docs": "/docs"}


# ---------- Пользователи ----------


@app.post(
    "/users",
    response_model=schemas.UserOut,
    status_code=status.HTTP_201_CREATED,
    tags=["Пользователи"],
    summary="Зарегистрировать пользователя",
)
def create_user(data: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.scalar(select(models.User).where(models.User.phone == data.phone)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь с таким телефоном уже есть")
    user = models.User(name=data.name, phone=data.phone)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.get(
    "/users",
    response_model=list[schemas.UserOut],
    tags=["Пользователи"],
    summary="Список пользователей",
)
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(models.User).order_by(models.User.id)).all()


@app.get(
    "/users/{user_id}/debts",
    response_model=list[schemas.PaymentOut],
    tags=["Пользователи"],
    summary="Что пользователь ещё должен оплатить (во всех группах)",
)
def user_debts(user_id: int, db: Session = Depends(get_db)):
    get_user_or_404(db, user_id)
    payments = db.scalars(
        select(models.Payment)
        .where(models.Payment.user_id == user_id)
        .where(models.Payment.status == models.PAYMENT_PENDING)
        .order_by(models.Payment.due_date)
    ).all()
    return [payment_to_schema(p) for p in payments]


# ---------- Группы подписок ----------


@app.post(
    "/groups",
    response_model=schemas.GroupOut,
    status_code=status.HTTP_201_CREATED,
    tags=["Группы"],
    summary="Создать группу подписки",
)
def create_group(data: schemas.GroupCreate, db: Session = Depends(get_db)):
    get_user_or_404(db, data.owner_id)
    group = models.SubscriptionGroup(**data.model_dump())
    # Владелец автоматически становится первым участником группы.
    group.memberships.append(models.Membership(user_id=data.owner_id))
    db.add(group)
    db.commit()
    db.refresh(group)
    return group_to_schema(group)


@app.get(
    "/groups/{group_id}",
    response_model=schemas.GroupOut,
    tags=["Группы"],
    summary="Информация о группе и доля каждого участника",
)
def get_group(group_id: int, db: Session = Depends(get_db)):
    return group_to_schema(get_group_or_404(db, group_id))


@app.post(
    "/groups/{group_id}/members",
    response_model=schemas.GroupOut,
    tags=["Группы"],
    summary="Добавить участника в группу",
)
def add_member(group_id: int, data: schemas.AddMember, db: Session = Depends(get_db)):
    group = get_group_or_404(db, group_id)
    get_user_or_404(db, data.user_id)

    if any(m.user_id == data.user_id for m in group.memberships):
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь уже в группе")
    if len(group.memberships) >= group.max_members:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"В группе уже максимум участников ({group.max_members})",
        )

    group.memberships.append(models.Membership(user_id=data.user_id))
    db.commit()
    db.refresh(group)
    return group_to_schema(group)


@app.delete(
    "/groups/{group_id}/members/{user_id}",
    response_model=schemas.GroupOut,
    tags=["Группы"],
    summary="Выйти из группы",
)
def leave_group(group_id: int, user_id: int, db: Session = Depends(get_db)):
    group = get_group_or_404(db, group_id)
    if user_id == group.owner_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Владелец не может выйти из своей группы",
        )
    membership = next((m for m in group.memberships if m.user_id == user_id), None)
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Этого пользователя нет в группе")

    # Уже созданные начисления (история платежей) при выходе сохраняются.
    group.memberships.remove(membership)
    db.commit()
    db.refresh(group)
    return group_to_schema(group)


# ---------- Платежи ----------


@app.post(
    "/groups/{group_id}/payments/{period}",
    response_model=schemas.PeriodStatus,
    tags=["Платежи"],
    summary="Выставить участникам счета за месяц",
    description=(
        "Считает долю каждого участника и создаёт начисления за указанный месяц "
        "(формат ГГГГ-ММ). Владельцу начисление не создаётся — он сам платит сервису. "
        "Повторный вызов безопасен: уже созданные начисления не дублируются."
    ),
)
def create_period_payments(group_id: int, period: str, db: Session = Depends(get_db)):
    check_period(period)
    group = get_group_or_404(db, group_id)
    if len(group.memberships) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Сначала добавьте участников в группу")

    existing = {p.user_id for p in group.payments if p.period == period}
    shares = split_price(group.total_price, len(group.memberships))
    due = due_date_for(period, group.billing_day)

    for membership, share in zip(group.memberships, shares):
        if membership.user_id == group.owner_id or membership.user_id in existing:
            continue
        group.payments.append(
            models.Payment(user_id=membership.user_id, period=period, amount=share, due_date=due)
        )
    db.commit()
    db.refresh(group)
    return period_status(group_id, period, db)


@app.get(
    "/groups/{group_id}/payments/{period}",
    response_model=schemas.PeriodStatus,
    tags=["Платежи"],
    summary="Кто оплатил, а кто ещё должен за месяц",
)
def period_status(group_id: int, period: str, db: Session = Depends(get_db)):
    check_period(period)
    group = get_group_or_404(db, group_id)
    payments = sorted(
        (p for p in group.payments if p.period == period), key=lambda p: p.id
    )
    total = sum(p.amount for p in payments)
    collected = sum(p.amount for p in payments if p.status == models.PAYMENT_PAID)
    return schemas.PeriodStatus(
        group_id=group.id,
        service_name=group.service_name,
        period=period,
        total_to_collect=total,
        collected=collected,
        outstanding=total - collected,
        payments=[payment_to_schema(p) for p in payments],
    )


@app.post(
    "/payments/{payment_id}/pay",
    response_model=schemas.PaymentOut,
    tags=["Платежи"],
    summary="Отметить платёж как оплаченный",
    description=(
        "Пока платёжная система не подключена, участник переводит деньги владельцу сам "
        "(например, через Kaspi), а в SubShare платёж отмечается как оплаченный."
    ),
)
def mark_paid(payment_id: int, db: Session = Depends(get_db)):
    payment = db.get(models.Payment, payment_id)
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Платёж {payment_id} не найден")
    if payment.status == models.PAYMENT_PAID:
        raise HTTPException(status.HTTP_409_CONFLICT, "Этот платёж уже оплачен")

    payment.status = models.PAYMENT_PAID
    payment.method = models.PAYMENT_METHOD_MANUAL
    payment.paid_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(payment)
    return payment_to_schema(payment)
