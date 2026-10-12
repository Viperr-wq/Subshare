"""
Заполняет базу демонстрационными данными.

Запуск:  python seed.py

Демо-вход в приложение: Аружан, телефон +7 701 000 00 01.

Создаётся пример из описания идеи — Netflix за 6000 ₸ на 4 человека — и ещё
несколько групп, чтобы в приложении были видны все ситуации:
  - Netflix и Яндекс Плюс — Аружан владелец (в Яндекс Плюс счета ещё не выставлены);
  - Spotify — Аружан участник, доля ещё не оплачена;
  - YouTube Premium — Аружан участник, доля уже оплачена.

Если в базе уже есть пользователи, скрипт ничего не делает. Поэтому его можно
запускать при каждом старте сервера на хостинге: демо-данные появятся только
в пустой базе.
"""

from datetime import date, datetime, timezone

from app import models
from app.database import Base, SessionLocal, engine
from app.logic import due_date_for, split_price


def make_group(db, name, service_name, total_price, billing_day, max_members, owner, members):
    """Создаёт группу: владелец — первый участник, остальные — в порядке списка."""
    group = models.SubscriptionGroup(
        name=name,
        service_name=service_name,
        total_price=total_price,
        billing_day=billing_day,
        max_members=max_members,
        owner_id=owner.id,
    )
    for user in [owner, *members]:
        group.memberships.append(models.Membership(user_id=user.id))
    db.add(group)
    db.flush()  # чтобы у группы появился id
    return group


def bill(group, period, paid_by=()):
    """Выставляет счета за месяц всем, кроме владельца. paid_by — кто уже оплатил."""
    shares = split_price(group.total_price, len(group.memberships))
    due = due_date_for(period, group.billing_day)
    paid_ids = {user.id for user in paid_by}
    for membership, share in zip(group.memberships, shares):
        if membership.user_id == group.owner_id:
            continue
        payment = models.Payment(
            user_id=membership.user_id, period=period, amount=share, due_date=due
        )
        if membership.user_id in paid_ids:
            payment.status = models.PAYMENT_PAID
            payment.paid_at = datetime.now(timezone.utc)
        group.payments.append(payment)


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    if db.query(models.User).count() > 0:
        print("В базе уже есть данные — демо-данные не добавляю.")
        print("Чтобы начать заново на компьютере, удалите файл subshare.db.")
        db.close()
        return

    aruzhan = models.User(name="Артем", phone="+77010000001")
    daniyar = models.User(name="1", phone="+77010000002")
    madina = models.User(name="2", phone="+77010000003")
    timur = models.User(name="3", phone="+77010000004")
    aliya = models.User(name="4", phone="+77010000005")
    erlan = models.User(name="5", phone="+77010000006")
    db.add_all([aruzhan, daniyar, madina, timur, aliya, erlan])
    db.flush()  # чтобы у пользователей появились id

    period = date.today().strftime("%Y-%m")

    # Цены — как в Казахстане на октябрь 2026 года (примерно, сервисы их меняют).
    # Пример из описания идеи: Netflix 6000 ₸ на 4 человека — по 1500 ₸. Данияр уже оплатил.
    netflix = make_group(
        db,
        name="Netflix с друзьями",
        service_name="Netflix",
        total_price=6000,
        billing_day=5,
        max_members=4,
        owner=aruzhan,
        members=[daniyar, madina, timur],
    )
    bill(netflix, period, paid_by=[daniyar])

    spotify = make_group(
        db,
        name="Музыка на всех",
        service_name="Spotify",
        total_price=3630,  # Spotify Family: $7,99 ≈ 3 630 ₸, до 6 человек
        billing_day=15,
        max_members=6,
        owner=daniyar,
        members=[aruzhan, madina, aliya, erlan],
    )
    bill(spotify, period, paid_by=[madina, aliya])

    youtube = make_group(
        db,
        name="YouTube без рекламы",
        service_name="YouTube Premium",
        total_price=5000,  # семейная подписка: 5 000 ₸, до 6 человек
        billing_day=20,
        max_members=6,
        owner=madina,
        members=[aruzhan, timur],
    )
    bill(youtube, period, paid_by=[aruzhan])

    # Здесь счета за месяц ещё не выставлены — это можно показать в приложении
    make_group(
        db,
        name="Плюс для семьи",
        service_name="Яндекс Плюс",
        total_price=2499,  # до 4 человек
        billing_day=10,
        max_members=4,
        owner=aruzhan,
        members=[timur, aliya],
    )

    db.commit()
    print(f"Готово! Демо-данные созданы, счета выставлены за {period}.")
    print("Вход в приложение: телефон +7 701 000 00 01 (Аружан).")
    print(f"Проверить API: http://127.0.0.1:8000/groups/{netflix.id}/payments/{period}")
    db.close()


if __name__ == "__main__":
    main()
