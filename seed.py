"""
Заполняет базу демонстрационными данными.

Запуск:  python seed.py

Создаёт пример из описания идеи: Netflix за 6000 ₸ на 4 человека,
выставляет счета за текущий месяц и отмечает одну оплату.
"""

from datetime import date, datetime, timezone

from app import models
from app.database import Base, SessionLocal, engine
from app.logic import due_date_for, split_price


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    if db.query(models.User).count() > 0:
        print("В базе уже есть данные. Чтобы начать заново, удалите файл subshare.db.")
        db.close()
        return

    owner = models.User(name="Аружан", phone="+77010000001")
    friends = [
        models.User(name="Данияр", phone="+77010000002"),
        models.User(name="Мадина", phone="+77010000003"),
        models.User(name="Тимур", phone="+77010000004"),
    ]
    db.add_all([owner, *friends])
    db.flush()  # чтобы у пользователей появились id

    group = models.SubscriptionGroup(
        name="Netflix с друзьями",
        service_name="Netflix",
        total_price=6000,
        billing_day=5,
        max_members=4,
        owner_id=owner.id,
    )
    for user in [owner, *friends]:
        group.memberships.append(models.Membership(user_id=user.id))
    db.add(group)
    db.flush()

    period = date.today().strftime("%Y-%m")
    shares = split_price(group.total_price, len(group.memberships))
    due = due_date_for(period, group.billing_day)
    for user, share in zip([owner, *friends], shares):
        if user.id == owner.id:
            continue
        group.payments.append(
            models.Payment(user_id=user.id, period=period, amount=share, due_date=due)
        )
    db.flush()

    # Данияр уже оплатил
    group.payments[0].status = models.PAYMENT_PAID
    group.payments[0].paid_at = datetime.now(timezone.utc)

    db.commit()
    print(f"Готово! Создана группа «{group.name}» (id={group.id}) и счета за {period}.")
    print(f"Откройте http://127.0.0.1:8000/groups/{group.id}/payments/{period}")
    db.close()


if __name__ == "__main__":
    main()
