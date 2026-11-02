"""
Автоматические тесты. Запуск: pytest

Каждый тест работает с отдельной временной базой в памяти,
поэтому настоящий файл subshare.db не затрагивается.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import re
from datetime import date, timedelta

from app import mail, models, telegram
from app.database import Base, get_db
from app.logic import check_password, hash_password, normalize_phone, split_price, utcnow
from app.main import app

PASSWORD = "secret-123"  # пароль демо-пользователей в тестах


@pytest.fixture
def new_session():
    """Временная база в памяти. new_session() открывает сеанс работы с ней."""
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=test_engine)
    return sessionmaker(bind=test_engine, autoflush=False)


@pytest.fixture
def client(new_session):
    def override_get_db():
        db = new_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def bot(monkeypatch):
    """
    Ненастоящий Telegram: ключ бота «есть», а сообщения не уходят в интернет,
    а складываются в список bot — тест может проверить, что написал бот.
    """
    sent = []
    monkeypatch.setattr(telegram, "BOT_TOKEN", "test-token")
    monkeypatch.setattr(telegram, "bot_username", "SubShareTestBot")
    monkeypatch.setattr(telegram, "call", lambda method, **params: sent.append(params))
    return sent


@pytest.fixture(autouse=True)
def mails(monkeypatch):
    """Ненастоящая почта: письма не уходят в интернет, а складываются в список mails."""
    sent = []

    def send(to, subject, text):
        sent.append({"to": to, "subject": subject, "text": text})
        return True

    monkeypatch.setattr(mail, "send", send)
    return sent


EMAIL = "aruzhan@example.com"


def code_from(mails):
    """Код из последнего письма — 6 цифр."""
    return re.search(r"\d{6}", mails[-1]["text"]).group()


def other_code(code):
    """Заведомо неверный код."""
    return "111111" if code != "111111" else "222222"


def register_by_email(client, mails, email=EMAIL, phone="+77010000001", name="Аружан"):
    """Регистрация по почте, как в приложении: данные → код из письма → аккаунт."""
    data = {"name": name, "email": email, "phone": phone, "password": PASSWORD}
    assert client.post("/register/email", json=data).status_code == 200
    response = client.post("/register/email/confirm", json={"email": email, "code": code_from(mails)})
    assert response.status_code == 201
    return response.json()


def texts_to(bot, telegram_id):
    """Что бот написал человеку с этим id в Telegram."""
    return [m["text"] for m in bot if m.get("chat_id") == telegram_id]


def tg_id(phone):
    """id в Telegram для тестового пользователя — просто цифры его номера."""
    return int(phone[2:])


def tg(client, telegram_id, **message):
    """Сообщение боту от человека — так его присылает Telegram."""
    update = {"update_id": 1, "message": {"from": {"id": telegram_id, "language_code": "ru"}, **message}}
    headers = {"X-Telegram-Bot-Api-Secret-Token": telegram.webhook_secret()}
    return client.post("/telegram/webhook", json=update, headers=headers)


def share_contact(client, telegram_id, phone, name):
    contact = {"phone_number": phone.lstrip("+"), "first_name": name, "user_id": telegram_id}
    return tg(client, telegram_id, contact=contact)


def make_user(client, name, phone):
    """
    Входит через Telegram, как в приложении: код → бот по ссылке → «Поделиться номером».
    auth — заголовок с ключом входа для запросов.
    """
    code = client.post("/login/telegram").json()["code"]
    tg(client, tg_id(phone), text=f"/start {code}")
    share_contact(client, tg_id(phone), phone, name)
    data = client.post("/login/telegram/check", json={"code": code}).json()
    assert data["done"] is True
    return {
        "id": data["user"]["id"],
        "phone": phone,
        "token": data["token"],
        "auth": {"Authorization": f"Bearer {data['token']}"},
    }


def make_demo_user(new_session, phone="+77010000001"):
    """Демо-пользователь с паролем, как в seed.py."""
    with new_session() as db:
        db.add(models.User(name="Демо", phone=phone, password_hash=hash_password(PASSWORD)))
        db.commit()


def login(client, phone, password=PASSWORD):
    return client.post("/login", json={"phone": phone, "password": password})


def count_users(new_session):
    with new_session() as db:
        return db.scalar(select(func.count()).select_from(models.User))


def make_netflix_group(client):
    """Пример из описания идеи: Netflix 6000 ₸ на 4 человека. Владелец — Аружан."""
    owner = make_user(client, "Аружан", "+77010000001")
    friends = [
        make_user(client, "Данияр", "+77010000002"),
        make_user(client, "Мадина", "+77010000003"),
        make_user(client, "Тимур", "+77010000004"),
    ]
    group = client.post(
        "/groups",
        json={
            "name": "Netflix с друзьями",
            "service_name": "Netflix",
            "total_price": 6000,
            "billing_day": 5,
            "max_members": 4,
        },
        headers=owner["auth"],
    ).json()
    for friend in friends:
        response = client.post(
            f"/groups/{group['id']}/invite",
            json={"name": "Друг", "phone": friend["phone"]},
            headers=owner["auth"],
        )
        assert response.status_code == 200
    return group["id"], owner, friends


# ---------- Логика: доли и пароли ----------


def test_split_even():
    assert split_price(6000, 4) == [1500, 1500, 1500, 1500]


def test_split_with_remainder_keeps_total():
    shares = split_price(5000, 3)
    assert shares == [1667, 1667, 1666]
    assert sum(shares) == 5000


def test_password_hash():
    stored = hash_password(PASSWORD)
    assert PASSWORD not in stored
    assert check_password(PASSWORD, stored)
    assert not check_password("secret-124", stored)
    # Соль у каждого хеша своя: одинаковые пароли дают разные хеши
    assert hash_password(PASSWORD) != stored


# ---------- Группы и платежи ----------


def test_server_is_alive(client):
    assert client.get("/").json()["status"] == "ok"


def test_group_shows_share_for_each_member(client):
    group_id, owner, _ = make_netflix_group(client)
    group = client.get(f"/groups/{group_id}", headers=owner["auth"]).json()

    assert group["members_count"] == 4
    assert [m["share"] for m in group["members"]] == [1500, 1500, 1500, 1500]
    assert group["members"][0]["user_id"] == owner["id"]
    assert group["members"][0]["is_owner"] is True


def test_monthly_payments_flow(client):
    group_id, owner, friends = make_netflix_group(client)
    daniyar, madina = friends[0], friends[1]
    url = f"/groups/{group_id}/payments/2026-10"

    # Выставляем счета за октябрь: 3 начисления по 1500 ₸ (владельцу — нет)
    status = client.post(url, headers=owner["auth"]).json()
    assert status["total_to_collect"] == 4500
    assert status["collected"] == 0
    assert len(status["payments"]) == 3
    assert all(p["amount"] == 1500 for p in status["payments"])
    assert owner["id"] not in [p["user_id"] for p in status["payments"]]
    assert status["payments"][0]["due_date"] == "2026-10-05"

    # Повторный вызов не создаёт дубликатов
    again = client.post(url, headers=owner["auth"]).json()
    assert len(again["payments"]) == 3

    # Данияр перевёл деньги и отметил это — пока это ещё не «оплачено»
    first_payment = status["payments"][0]
    assert first_payment["user_id"] == daniyar["id"]
    payment_url = f"/payments/{first_payment['id']}"
    sent = client.post(f"{payment_url}/sent", headers=daniyar["auth"]).json()
    assert sent["status"] == "sent"
    assert client.get(url, headers=owner["auth"]).json()["collected"] == 0
    assert len(client.get("/me/debts", headers=daniyar["auth"]).json()) == 1

    # Владелец подтвердил, что деньги пришли
    pay_url = f"{payment_url}/pay"
    paid = client.post(pay_url, headers=owner["auth"]).json()
    assert paid["status"] == "paid"
    assert paid["method"] == "manual"

    status = client.get(url, headers=owner["auth"]).json()
    assert status["collected"] == 1500
    assert status["outstanding"] == 3000

    # Повторно оплатить тот же платёж нельзя
    assert client.post(pay_url, headers=owner["auth"]).status_code == 409

    # У Данияра долгов нет, у Мадины — один
    assert client.get("/me/debts", headers=daniyar["auth"]).json() == []
    debts = client.get("/me/debts", headers=madina["auth"]).json()
    assert len(debts) == 1
    assert debts[0]["service_name"] == "Netflix"


def test_shares_recalculate_when_member_leaves(client):
    group_id, _, friends = make_netflix_group(client)
    timur = friends[2]

    response = client.delete(f"/groups/{group_id}/members/{timur['id']}", headers=timur["auth"])
    assert response.status_code == 200
    assert [m["share"] for m in response.json()["members"]] == [2000, 2000, 2000]


def test_owner_cannot_leave(client):
    group_id, owner, _ = make_netflix_group(client)
    response = client.delete(f"/groups/{group_id}/members/{owner['id']}", headers=owner["auth"])
    assert response.status_code == 400


def test_edit_group_recalculates_shares_but_keeps_old_invoices(client):
    group_id, owner, _ = make_netflix_group(client)
    auth = owner["auth"]

    # Выставляем счета за октябрь по старой цене: 6000 ₸ / 4 участника → по 1500 ₸
    before = client.post(f"/groups/{group_id}/payments/2026-10", headers=auth).json()
    assert all(p["amount"] == 1500 for p in before["payments"])

    # Поднимаем цену подписки 6000 → 8000 ₸
    response = client.patch(f"/groups/{group_id}", json={"total_price": 8000}, headers=auth)
    assert response.status_code == 200
    group = response.json()
    assert group["total_price"] == 8000
    # Доли пересчитались сами: 8000 ₸ / 4 → по 2000 ₸
    assert [m["share"] for m in group["members"]] == [2000, 2000, 2000, 2000]

    # А уже выставленные счета остались прежними (сумма зафиксирована при начислении)
    after = client.get(f"/groups/{group_id}/payments/2026-10", headers=auth).json()
    assert all(p["amount"] == 1500 for p in after["payments"])


def test_edit_group_partial_update(client):
    group_id, owner, _ = make_netflix_group(client)

    # Меняем только название и день оплаты — остальные поля не трогаем
    response = client.patch(
        f"/groups/{group_id}",
        json={"name": "Netflix с семьёй", "billing_day": 10},
        headers=owner["auth"],
    )
    assert response.status_code == 200
    group = response.json()
    assert group["name"] == "Netflix с семьёй"
    assert group["billing_day"] == 10
    # Непереданные поля остались прежними
    assert group["service_name"] == "Netflix"
    assert group["total_price"] == 6000
    assert group["max_members"] == 4


def test_edit_group_max_members_not_below_current(client):
    group_id, owner, _ = make_netflix_group(client)  # в группе уже 4 участника

    # Нельзя поставить лимит меньше текущего числа участников
    response = client.patch(f"/groups/{group_id}", json={"max_members": 3}, headers=owner["auth"])
    assert response.status_code == 400


def test_edit_group_bad_input_rejected(client):
    group_id, owner, _ = make_netflix_group(client)
    auth = owner["auth"]
    url = f"/groups/{group_id}"

    # Цена должна быть больше нуля
    assert client.patch(url, json={"total_price": 0}, headers=auth).status_code == 422
    # День оплаты только 1–28
    assert client.patch(url, json={"billing_day": 40}, headers=auth).status_code == 422
    # Несуществующая группа
    assert client.patch("/groups/999", json={"name": "X"}, headers=auth).status_code == 404


def test_group_is_full(client):
    group_id, owner, _ = make_netflix_group(client)
    make_user(client, "Ерлан", "+77010000005")
    response = client.post(
        f"/groups/{group_id}/invite",
        json={"name": "Ерлан", "phone": "+77010000005"},
        headers=owner["auth"],
    )
    assert response.status_code == 400


def test_bad_input_rejected(client):
    group_id, owner, _ = make_netflix_group(client)
    # Телефон не в формате +7XXXXXXXXXX, имя из одних пробелов
    invite_url = f"/groups/{group_id}/invite"
    bad_phone = {"name": "A", "phone": "12345"}
    assert client.post(invite_url, json=bad_phone, headers=owner["auth"]).status_code == 422
    blank_name = {"name": "   ", "phone": "+77010000009"}
    assert client.post(invite_url, json=blank_name, headers=owner["auth"]).status_code == 422
    # Неверный формат месяца
    response = client.get(f"/groups/{group_id}/payments/2026-13", headers=owner["auth"])
    assert response.status_code == 422
    # Несуществующая группа
    assert client.get("/groups/999", headers=owner["auth"]).status_code == 404


# ---------- Регистрация, вход и профиль ----------


def test_telegram_login_step_by_step(client, bot):
    start = client.post("/login/telegram").json()
    code = start["code"]
    assert start["url"] == f"https://t.me/SubShareTestBot?start={code}"
    check = {"code": code}
    # Человек ещё не открыл бота
    assert client.post("/login/telegram/check", json=check).json() == {
        "done": False, "token": None, "user": None
    }

    # Открыл бота по ссылке — бот просит поделиться номером
    answer = tg(client, 555, text=f"/start {code}").json()
    assert answer["reply_markup"]["keyboard"][0][0]["request_contact"] is True

    # Чужой контакт не подходит: номер должен быть свой
    stranger = {"phone_number": "77010000002", "first_name": "Кто-то", "user_id": 777}
    tg(client, 555, contact=stranger)
    assert client.post("/login/telegram/check", json=check).json()["done"] is False

    # Свой номер — вход подтверждён, приложение получает ключ
    assert "Готово" in share_contact(client, 555, "+77010000001", "Аружан").json()["text"]
    data = client.post("/login/telegram/check", json=check).json()
    assert data["user"] == {
        "id": 1, "name": "Аружан", "phone": "+77010000001", "email": None, "language": "ru"
    }
    me = client.get("/me", headers={"Authorization": f"Bearer {data['token']}"})
    assert me.json() == data["user"]

    # Код одноразовый
    assert client.post("/login/telegram/check", json=check).status_code == 410


def test_telegram_login_again_gives_same_account(client, new_session):
    first = make_user(client, "Аружан", "+77010000001")
    again = make_user(client, "Аружан", "+77010000001")
    assert again["id"] == first["id"]
    assert again["token"] != first["token"]  # каждый вход — новый ключ
    assert count_users(new_session) == 1


def test_telegram_login_code_expires(client, monkeypatch):
    code = client.post("/login/telegram").json()["code"]
    monkeypatch.setattr("app.main.utcnow", lambda: utcnow() + timedelta(minutes=11))
    assert client.post("/login/telegram/check", json={"code": code}).status_code == 410
    assert "устарела" in tg(client, 555, text=f"/start {code}").json()["text"]


def test_bot_only_trusts_telegram(client):
    # Без секрета Telegram запрос к боту не принимаем — иначе любой мог бы «подтвердить» вход
    update = {"message": {"from": {"id": 1}, "text": "/start"}}
    response = client.post("/telegram/webhook", json=update)
    assert response.status_code == 403


def test_telegram_login_needs_bot(client, monkeypatch):
    monkeypatch.setattr(telegram, "BOT_TOKEN", "")
    assert client.post("/login/telegram").status_code == 503


def test_phone_from_telegram_normalized():
    assert normalize_phone("77011234567") == "+77011234567"
    assert normalize_phone("+7 701 123 45 67") == "+77011234567"
    assert normalize_phone("87011234567") == "+77011234567"
    assert normalize_phone("998901234567") is None  # не +7


def test_login_with_password(client, new_session):
    make_demo_user(new_session)

    response = login(client, "+77010000001")
    assert response.status_code == 200
    assert response.json()["user"]["name"] == "Демо"

    # Неверный пароль или незнакомый номер — 401, номер не в формате +7XXXXXXXXXX — 422
    assert login(client, "+77010000001", "wrong-password").status_code == 401
    assert login(client, "+77019999999").status_code == 401
    assert login(client, "8701").status_code == 422
    # У тех, кто входит через Telegram, пароля нет
    make_user(client, "Аружан", "+77010000002")
    assert login(client, "+77010000002").status_code == 401


def test_requests_without_token_rejected(client):
    group_id, _, _ = make_netflix_group(client)
    assert client.get("/me").status_code == 401
    assert client.get(f"/groups/{group_id}").status_code == 401
    fake = {"Authorization": "Bearer fake-token"}
    assert client.get("/me", headers=fake).status_code == 401


def test_logout_ends_only_this_login(client):
    site = make_user(client, "Аружан", "+77010000001")  # вход на сайте
    phone = make_user(client, "Аружан", "+77010000001")["auth"]  # и в приложении на телефоне

    assert client.post("/logout", headers=site["auth"]).status_code == 204
    assert client.get("/me", headers=site["auth"]).status_code == 401
    # На телефоне вход сохранился
    assert client.get("/me", headers=phone).status_code == 200


def test_password_and_token_not_stored_as_is(client, new_session):
    make_demo_user(new_session)
    token = login(client, "+77010000001").json()["token"]
    with new_session() as db:
        saved_user = db.scalar(select(models.User))
        saved_token = db.scalar(select(models.Token))
        assert PASSWORD not in saved_user.password_hash
        assert saved_token.token_hash != token


def test_user_groups_lists_only_own_groups(client):
    group_id, owner, friends = make_netflix_group(client)
    daniyar = friends[0]
    # Ещё одна группа: её создал Данияр, Аружан в ней нет
    other_id = client.post(
        "/groups",
        json={
            "name": "Музыка",
            "service_name": "Spotify",
            "total_price": 3000,
            "billing_day": 10,
            "max_members": 6,
        },
        headers=daniyar["auth"],
    ).json()["id"]

    owner_groups = client.get("/me/groups", headers=owner["auth"]).json()
    assert [g["id"] for g in owner_groups] == [group_id]
    daniyar_groups = client.get("/me/groups", headers=daniyar["auth"]).json()
    assert [g["id"] for g in daniyar_groups] == [group_id, other_id]


# ---------- Права доступа ----------


def test_stranger_cannot_see_group(client):
    group_id, _, _ = make_netflix_group(client)
    stranger = make_user(client, "Ерлан", "+77010000005")
    auth = stranger["auth"]
    # Чужую группу не видно — как будто её нет
    assert client.get(f"/groups/{group_id}", headers=auth).status_code == 404
    assert client.get(f"/groups/{group_id}/payments/2026-10", headers=auth).status_code == 404
    assert client.delete(f"/groups/{group_id}", headers=auth).status_code == 404


def test_only_owner_manages_group(client):
    group_id, owner, friends = make_netflix_group(client)
    member = friends[0]["auth"]
    url = f"/groups/{group_id}"
    madina_url = f"{url}/members/{friends[1]['id']}"
    erlan = {"name": "Ерлан", "phone": "+77010000005"}

    # Участник видит группу, но менять её не может
    assert client.get(url, headers=member).status_code == 200
    assert client.patch(url, json={"total_price": 1000}, headers=member).status_code == 403
    assert client.post(f"{url}/payments/2026-10", headers=member).status_code == 403
    assert client.post(f"{url}/invite", json=erlan, headers=member).status_code == 403
    assert client.delete(madina_url, headers=member).status_code == 403
    assert client.delete(url, headers=member).status_code == 403

    # А владелец может, например, убрать участника
    response = client.delete(madina_url, headers=owner["auth"])
    assert response.status_code == 200
    assert response.json()["members_count"] == 3


def test_who_can_mark_payment(client):
    group_id, owner, friends = make_netflix_group(client)
    daniyar, madina = friends[0]["auth"], friends[1]["auth"]
    payments = client.post(
        f"/groups/{group_id}/payments/2026-10", headers=owner["auth"]
    ).json()["payments"]
    url = f"/payments/{payments[0]['id']}"  # платёж Данияра

    # «Я перевёл» отмечает только сам плательщик
    assert client.post(f"{url}/sent", headers=madina).status_code == 403
    assert client.post(f"{url}/sent", headers=owner["auth"]).status_code == 403
    assert client.post(f"{url}/sent", headers=daniyar).status_code == 200
    assert client.post(f"{url}/sent", headers=daniyar).status_code == 409  # уже отмечено
    # «Деньги получены» подтверждает только владелец
    assert client.post(f"{url}/pay", headers=madina).status_code == 403
    assert client.post(f"{url}/pay", headers=daniyar).status_code == 403
    assert client.post(f"{url}/pay", headers=owner["auth"]).status_code == 200
    assert client.post(f"{url}/sent", headers=daniyar).status_code == 409  # уже оплачено


def test_owner_did_not_receive_money(client, bot):
    group_id, owner, friends = make_netflix_group(client)
    payment = client.post(
        f"/groups/{group_id}/payments/2026-10", headers=owner["auth"]
    ).json()["payments"][0]
    url = f"/payments/{payment['id']}"
    # Отменить можно только отмеченный перевод
    assert client.post(f"{url}/not-received", headers=owner["auth"]).status_code == 409

    client.post(f"{url}/sent", headers=friends[0]["auth"])
    # Владельцу пришло сообщение в Telegram
    assert any("Данияр" in t for t in texts_to(bot, tg_id(owner["phone"])))

    back = client.post(f"{url}/not-received", headers=owner["auth"]).json()
    assert back["status"] == "pending"
    assert any("не получил" in t for t in texts_to(bot, tg_id(friends[0]["phone"])))


# ---------- Приглашения ----------


def test_invite_by_phone(client):
    group_id, owner, friends = make_netflix_group(client)
    timur = friends[2]
    # Освобождаем место: Тимур выходит из группы
    left = client.delete(f"/groups/{group_id}/members/{timur['id']}", headers=timur["auth"])
    assert left.status_code == 200
    assert left.json()["members_count"] == 3

    # Нового человека добавляем по имени и номеру
    erlan = {"name": "Ерлан", "phone": "+77010000005"}
    response = client.post(f"/groups/{group_id}/invite", json=erlan, headers=owner["auth"])
    assert response.status_code == 200
    assert response.json()["members"][-1]["name"] == "Ерлан"

    # Повторно добавить того же человека нельзя
    again = client.post(f"/groups/{group_id}/invite", json=erlan, headers=owner["auth"])
    assert again.status_code == 409


def test_invited_friend_registers_and_gets_group(client):
    group_id, owner, friends = make_netflix_group(client)
    timur = friends[2]
    client.delete(f"/groups/{group_id}/members/{timur['id']}", headers=timur["auth"])
    client.post(
        f"/groups/{group_id}/invite",
        json={"name": "Ерлан", "phone": "+77010000005"},
        headers=owner["auth"],
    )

    # Ерлан входит через Telegram со своим номером
    erlan = make_user(client, "Ерлан Б.", "+77010000005")

    # Вход «забрал» аккаунт, созданный при приглашении, — вместе с группой и своим именем
    groups = client.get("/me/groups", headers=erlan["auth"]).json()
    assert [g["id"] for g in groups] == [group_id]
    assert groups[0]["members"][-1]["name"] == "Ерлан Б."


def test_invite_existing_user_keeps_registered_name(client, new_session):
    group_id, owner, friends = make_netflix_group(client)
    timur = friends[2]
    # Тимур вышел из группы
    left = client.delete(f"/groups/{group_id}/members/{timur['id']}", headers=timur["auth"])
    assert left.status_code == 200

    # Тимур уже зарегистрирован — находим его по номеру, нового пользователя не создаём
    group = client.post(
        f"/groups/{group_id}/invite",
        json={"name": "Тима", "phone": "+77010000004"},
        headers=owner["auth"],
    ).json()
    assert group["members"][-1]["user_id"] == timur["id"]
    assert group["members"][-1]["name"] == "Тимур"
    # Пользователей по-прежнему четверо
    assert count_users(new_session) == 4


def test_invite_to_full_group_does_not_create_user(client, new_session):
    group_id, owner, _ = make_netflix_group(client)  # уже 4 из 4
    response = client.post(
        f"/groups/{group_id}/invite",
        json={"name": "Ерлан", "phone": "+77010000005"},
        headers=owner["auth"],
    )
    assert response.status_code == 400
    # После ошибки Ерлан не должен остаться в базе
    assert count_users(new_session) == 4


# ---------- Разное ----------


def test_debt_shows_whom_to_pay(client):
    group_id, owner, friends = make_netflix_group(client)
    client.post(f"/groups/{group_id}/payments/2026-10", headers=owner["auth"])

    debt = client.get("/me/debts", headers=friends[1]["auth"]).json()[0]
    assert debt["owner_name"] == "Аружан"
    assert debt["owner_phone"] == "+77010000001"


def test_delete_group(client):
    group_id, owner, friends = make_netflix_group(client)
    auth = owner["auth"]
    client.post(f"/groups/{group_id}/payments/2026-10", headers=auth)

    assert client.delete(f"/groups/{group_id}", headers=auth).status_code == 204
    assert client.get(f"/groups/{group_id}", headers=auth).status_code == 404
    # Вместе с группой удалились и её счета
    assert client.get("/me/debts", headers=friends[1]["auth"]).json() == []
    assert client.delete(f"/groups/{group_id}", headers=auth).status_code == 404


def test_cors_allows_web_app(client):
    # Веб-версия приложения открыта на другом адресе — сервер должен разрешить ей запросы
    response = client.get("/", headers={"Origin": "https://subshare-app.onrender.com"})
    assert response.headers["access-control-allow-origin"] == "*"


def test_phone_only_with_usual_digits(client):
    # Номер из «полноширинных» цифр выглядит так же, но это другие символы — не принимаем
    group_id, owner, _ = make_netflix_group(client)
    odd_phone = "+7０７０１０００００１"
    invite = {"name": "А", "phone": odd_phone}
    response = client.post(f"/groups/{group_id}/invite", json=invite, headers=owner["auth"])
    assert response.status_code == 422
    assert login(client, odd_phone).status_code == 422


def test_too_big_price_rejected(client):
    group_id, owner, _ = make_netflix_group(client)
    auth = owner["auth"]
    # Лишние нули при вводе цены — понятная ошибка 422, а не сбой сервера
    too_big = {"total_price": 3_000_000_000}
    assert client.patch(f"/groups/{group_id}", json=too_big, headers=auth).status_code == 422
    new_group = {"name": "X", "service_name": "X", "billing_day": 1, "max_members": 2, **too_big}
    assert client.post("/groups", json=new_group, headers=auth).status_code == 422


def test_simultaneous_duplicate_gives_409(client, monkeypatch, new_session):
    owner = make_user(client, "Аружан", "+77010000001")
    make_user(client, "Данияр", "+77010000002")
    group = {"name": "X", "service_name": "X", "total_price": 1000, "billing_day": 1, "max_members": 4}
    group_id = client.post("/groups", json=group, headers=owner["auth"]).json()["id"]
    # Имитируем два одновременных запроса: проверка «такой номер уже есть?» не успела
    # увидеть Данияра, и дубликат остановила сама база данных.
    monkeypatch.setattr("app.main.find_user_by_phone", lambda db, phone: None)
    invite = {"name": "Данияр", "phone": "+77010000002"}
    response = client.post(f"/groups/{group_id}/invite", json=invite, headers=owner["auth"])
    assert response.status_code == 409
    # Дубликат в базу не попал
    assert count_users(new_session) == 2


def test_users_list_is_not_public(client):
    make_user(client, "Аружан", "+77010000001")
    # Списка всех пользователей с телефонами нет — его мог бы открыть кто угодно
    assert client.get("/users").status_code == 404


# ---------- Профиль, языки, удаление аккаунта ----------


def test_errors_in_three_languages(client):
    owner = make_user(client, "Аружан", "+77010000001")
    texts = {
        lang: client.get("/groups/999", headers={**owner["auth"], "Accept-Language": lang}).json()
        for lang in ("ru", "kk", "en-US,en;q=0.9")
    }
    assert texts["ru"]["detail"] == "Группа 999 не найдена"
    assert texts["kk"]["detail"] == "999 тобы табылмады"
    assert texts["en-US,en;q=0.9"]["detail"] == "Group 999 not found"


def test_change_name_and_language(client):
    user = make_user(client, "Аружан", "+77010000001")
    changed = client.patch("/me", json={"name": "Аружан К.", "language": "kk"}, headers=user["auth"])
    assert changed.json()["name"] == "Аружан К."
    assert changed.json()["language"] == "kk"
    assert client.patch("/me", json={"language": "de"}, headers=user["auth"]).status_code == 422
    assert client.patch("/me", json={"name": "  "}, headers=user["auth"]).status_code == 422


def test_delete_my_account(client, new_session):
    group_id, owner, friends = make_netflix_group(client)
    daniyar = friends[0]
    client.post(f"/groups/{group_id}/payments/2026-10", headers=owner["auth"])

    # Участник удаляет аккаунт: он пропадает из группы вместе со своими счетами
    assert client.delete("/me", headers=daniyar["auth"]).status_code == 204
    assert client.get("/me", headers=daniyar["auth"]).status_code == 401
    group = client.get(f"/groups/{group_id}", headers=owner["auth"]).json()
    assert daniyar["id"] not in [m["user_id"] for m in group["members"]]
    payments = client.get(f"/groups/{group_id}/payments/2026-10", headers=owner["auth"]).json()
    assert len(payments["payments"]) == 2

    # Владелец удаляет аккаунт — его группа удаляется целиком
    assert client.delete("/me", headers=owner["auth"]).status_code == 204
    assert client.get("/me/groups", headers=friends[1]["auth"]).json() == []
    assert count_users(new_session) == 2


# ---------- Ежедневные задачи: счета и напоминания ----------


def run_daily(client, monkeypatch, day, secret="cron-secret"):
    monkeypatch.setattr("app.main.CRON_SECRET", "cron-secret")
    monkeypatch.setattr("app.main.today_kz", lambda: day)
    return client.post("/tasks/daily", headers={"X-Cron-Secret": secret})


def test_daily_invoices_and_reminders(client, monkeypatch, bot):
    group_id, owner, friends = make_netflix_group(client)  # срок оплаты — 5-е число
    madina = tg_id(friends[1]["phone"])

    # 1 ноября счета выставились сами, участникам пришло сообщение
    assert run_daily(client, monkeypatch, date(2026, 11, 1)).json() == {"invoices": 3, "reminders": 0}
    assert "Новый счёт" in texts_to(bot, madina)[-1]
    payments = client.get(f"/groups/{group_id}/payments/2026-11", headers=owner["auth"]).json()
    assert len(payments["payments"]) == 3
    # Повторный запуск в тот же месяц ничего не дублирует
    assert run_daily(client, monkeypatch, date(2026, 11, 2)).json()["invoices"] == 0

    # Данияр перевёл — ему больше не напоминаем
    client.post(f"/payments/{payments['payments'][0]['id']}/sent", headers=friends[0]["auth"])
    # За день до срока — напоминание, в день срока — нет
    assert run_daily(client, monkeypatch, date(2026, 11, 4)).json()["reminders"] == 2
    assert "завтра" in texts_to(bot, madina)[-1]
    assert run_daily(client, monkeypatch, date(2026, 11, 5)).json()["reminders"] == 0
    # После срока — на 1-й, 4-й, 7-й… день просрочки
    assert run_daily(client, monkeypatch, date(2026, 11, 6)).json()["reminders"] == 2
    assert "просрочена" in texts_to(bot, madina)[-1]
    assert run_daily(client, monkeypatch, date(2026, 11, 7)).json()["reminders"] == 0
    assert run_daily(client, monkeypatch, date(2026, 11, 9)).json()["reminders"] == 2


def test_daily_skips_month_when_due_date_passed(client, monkeypatch):
    # Группу создали 20-го, а срок оплаты 5-го: счета начнутся со следующего месяца
    make_netflix_group(client)
    assert run_daily(client, monkeypatch, date(2026, 11, 20)).json()["invoices"] == 0
    assert run_daily(client, monkeypatch, date(2026, 12, 1)).json()["invoices"] == 3


def test_daily_needs_secret(client, monkeypatch):
    assert run_daily(client, monkeypatch, date(2026, 11, 1), secret="wrong").status_code == 403


def test_admin_stats_only_for_team(client, monkeypatch):
    """Статистику видят только номера команды (ADMIN_PHONES): аккаунты, приглашённые, группы."""
    owner = make_user(client, "Аружан", "+77010000001")
    stranger = make_user(client, "Данияр", "+77010000002")
    group = client.post(
        "/groups",
        json={
            "name": "Spotify",
            "service_name": "Spotify",
            "total_price": 3000,
            "billing_day": 5,
            "max_members": 3,
        },
        headers=owner["auth"],
    ).json()
    invite = {"name": "Мадина", "phone": "+77010000003"}  # приглашена, но ещё не входила
    client.post(f"/groups/{group['id']}/invite", json=invite, headers=owner["auth"])
    monkeypatch.setattr("app.main.ADMIN_PHONES", {"+77010000001"})

    assert client.get("/admin/stats").status_code == 401
    assert client.get("/admin/stats", headers=stranger["auth"]).status_code == 403
    stats = client.get("/admin/stats", headers=owner["auth"]).json()
    assert (stats["accounts"], stats["new_week"], stats["invited"], stats["groups"]) == (2, 2, 1, 1)
    assert [(c["name"], c["groups"]) for c in stats["clients"]] == [("Данияр", 0), ("Аружан", 1)]


# ---------- Регистрация по почте ----------


def test_register_by_email(client, mails):
    """Данные → код из письма → аккаунт. Потом вход по почте и паролю."""
    data = {"name": "Аружан", "email": " Aruzhan@Example.COM ", "phone": "+77010000001", "password": PASSWORD}
    assert client.post("/register/email", json=data).status_code == 200
    assert mails[-1]["to"] == EMAIL  # почту храним маленькими буквами
    code = code_from(mails)
    assert code in mails[-1]["subject"]

    confirm = {"email": EMAIL, "code": code}
    assert client.post("/register/email/confirm", json={**confirm, "code": other_code(code)}).status_code == 400
    response = client.post("/register/email/confirm", json=confirm)
    assert response.status_code == 201
    user = response.json()["user"]
    assert (user["name"], user["email"], user["phone"]) == ("Аружан", EMAIL, "+77010000001")
    assert client.post("/register/email/confirm", json=confirm).status_code == 410  # код одноразовый

    assert client.post("/login/email", json={"email": "ARUZHAN@example.com", "password": PASSWORD}).status_code == 200
    assert client.post("/login/email", json={"email": EMAIL, "password": "wrong-password"}).status_code == 401


def test_email_registration_needs_free_email_and_phone(client, mails):
    """Номер не проверяется, поэтому занятый номер (есть в SubShare) не принимаем — как и занятую почту."""
    make_user(client, "Данияр", "+77010000002")  # уже вошёл через Telegram
    taken_phone = {"name": "Кто-то", "email": "someone@example.com", "phone": "+77010000002", "password": PASSWORD}
    assert client.post("/register/email", json=taken_phone).status_code == 409

    register_by_email(client, mails)
    taken_email = {"name": "Аружан", "email": EMAIL, "phone": "+77010000009", "password": PASSWORD}
    assert client.post("/register/email", json=taken_email).status_code == 409
    short_password = {**taken_email, "email": "new@example.com", "password": "1234567"}
    assert client.post("/register/email", json=short_password).status_code == 422


def test_email_code_limits(client, mails):
    """Новый код — не чаще раза в минуту; после 5 неверных попыток код сгорает."""
    data = {"name": "Аружан", "email": EMAIL, "phone": "+77010000001", "password": PASSWORD}
    assert client.post("/register/email", json=data).status_code == 200
    assert client.post("/register/email", json=data).status_code == 429
    assert len(mails) == 1

    code = code_from(mails)
    wrong = {"email": EMAIL, "code": other_code(code)}
    for _ in range(4):
        assert client.post("/register/email/confirm", json=wrong).status_code == 400
    assert client.post("/register/email/confirm", json=wrong).status_code == 410
    assert client.post("/register/email/confirm", json={"email": EMAIL, "code": code}).status_code == 410


def test_reset_forgotten_password(client, mails):
    """Забыли пароль: код на почту → новый пароль. Старый пароль и старые входы больше не действуют."""
    old = register_by_email(client, mails)
    assert client.post("/password/forgot", json={"email": "nobody@example.com"}).status_code == 404
    assert client.post("/password/forgot", json={"email": EMAIL}).status_code == 200

    reset = {"email": EMAIL, "code": code_from(mails), "password": "new-secret-1"}
    response = client.post("/password/reset", json=reset)
    assert response.status_code == 200
    assert client.get("/me", headers={"Authorization": f"Bearer {old['token']}"}).status_code == 401
    assert client.get("/me", headers={"Authorization": f"Bearer {response.json()['token']}"}).status_code == 200
    assert client.post("/login/email", json={"email": EMAIL, "password": PASSWORD}).status_code == 401
    assert client.post("/login/email", json={"email": EMAIL, "password": "new-secret-1"}).status_code == 200
