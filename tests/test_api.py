"""
Автоматические тесты. Запуск: pytest

Каждый тест работает с отдельной временной базой в памяти,
поэтому настоящий файл subshare.db не затрагивается.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.logic import split_price
from app.main import app


@pytest.fixture
def client():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=test_engine)
    TestSession = sessionmaker(bind=test_engine, autoflush=False)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def make_user(client, name, phone):
    response = client.post("/users", json={"name": name, "phone": phone})
    assert response.status_code == 201
    return response.json()["id"]


def make_netflix_group(client):
    """Пример из описания идеи: Netflix 6000 ₸ на 4 человека."""
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
            "owner_id": owner,
        },
    ).json()
    for friend in friends:
        client.post(f"/groups/{group['id']}/members", json={"user_id": friend})
    return group["id"], owner, friends


# ---------- Логика расчёта ----------


def test_split_even():
    assert split_price(6000, 4) == [1500, 1500, 1500, 1500]


def test_split_with_remainder_keeps_total():
    shares = split_price(5000, 3)
    assert shares == [1667, 1667, 1666]
    assert sum(shares) == 5000


# ---------- API ----------


def test_server_is_alive(client):
    assert client.get("/").json()["status"] == "ok"


def test_group_shows_share_for_each_member(client):
    group_id, owner, _ = make_netflix_group(client)
    group = client.get(f"/groups/{group_id}").json()

    assert group["members_count"] == 4
    assert [m["share"] for m in group["members"]] == [1500, 1500, 1500, 1500]
    assert group["members"][0]["user_id"] == owner
    assert group["members"][0]["is_owner"] is True


def test_monthly_payments_flow(client):
    group_id, owner, friends = make_netflix_group(client)

    # Выставляем счета за октябрь: 3 начисления по 1500 ₸ (владельцу — нет)
    status = client.post(f"/groups/{group_id}/payments/2026-10").json()
    assert status["total_to_collect"] == 4500
    assert status["collected"] == 0
    assert len(status["payments"]) == 3
    assert all(p["amount"] == 1500 for p in status["payments"])
    assert owner not in [p["user_id"] for p in status["payments"]]
    assert status["payments"][0]["due_date"] == "2026-10-05"

    # Повторный вызов не создаёт дубликатов
    again = client.post(f"/groups/{group_id}/payments/2026-10").json()
    assert len(again["payments"]) == 3

    # Данияр оплатил
    first_payment = status["payments"][0]
    paid = client.post(f"/payments/{first_payment['id']}/pay").json()
    assert paid["status"] == "paid"
    assert paid["method"] == "manual"

    status = client.get(f"/groups/{group_id}/payments/2026-10").json()
    assert status["collected"] == 1500
    assert status["outstanding"] == 3000

    # Повторно оплатить тот же платёж нельзя
    assert client.post(f"/payments/{first_payment['id']}/pay").status_code == 409

    # У Данияра долгов нет, у Мадины — один
    assert client.get(f"/users/{friends[0]}/debts").json() == []
    debts = client.get(f"/users/{friends[1]}/debts").json()
    assert len(debts) == 1
    assert debts[0]["service_name"] == "Netflix"


def test_shares_recalculate_when_member_leaves(client):
    group_id, _, friends = make_netflix_group(client)

    response = client.delete(f"/groups/{group_id}/members/{friends[2]}")
    assert response.status_code == 200
    assert [m["share"] for m in response.json()["members"]] == [2000, 2000, 2000]


def test_owner_cannot_leave(client):
    group_id, owner, _ = make_netflix_group(client)
    assert client.delete(f"/groups/{group_id}/members/{owner}").status_code == 400


def test_edit_group_recalculates_shares_but_keeps_old_invoices(client):
    group_id, _, _ = make_netflix_group(client)

    # Выставляем счета за октябрь по старой цене: 6000 ₸ / 4 участника → по 1500 ₸
    before = client.post(f"/groups/{group_id}/payments/2026-10").json()
    assert all(p["amount"] == 1500 for p in before["payments"])

    # Поднимаем цену подписки 6000 → 8000 ₸
    response = client.patch(f"/groups/{group_id}", json={"total_price": 8000})
    assert response.status_code == 200
    group = response.json()
    assert group["total_price"] == 8000
    # Доли пересчитались сами: 8000 ₸ / 4 → по 2000 ₸
    assert [m["share"] for m in group["members"]] == [2000, 2000, 2000, 2000]

    # А уже выставленные счета остались прежними (сумма зафиксирована при начислении)
    after = client.get(f"/groups/{group_id}/payments/2026-10").json()
    assert all(p["amount"] == 1500 for p in after["payments"])


def test_edit_group_partial_update(client):
    group_id, _, _ = make_netflix_group(client)

    # Меняем только название и день оплаты — остальные поля не трогаем
    response = client.patch(
        f"/groups/{group_id}", json={"name": "Netflix с семьёй", "billing_day": 10}
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
    group_id, _, _ = make_netflix_group(client)  # в группе уже 4 участника

    # Нельзя поставить лимит меньше текущего числа участников
    response = client.patch(f"/groups/{group_id}", json={"max_members": 3})
    assert response.status_code == 400


def test_edit_group_bad_input_rejected(client):
    group_id, _, _ = make_netflix_group(client)

    # Цена должна быть больше нуля
    assert client.patch(f"/groups/{group_id}", json={"total_price": 0}).status_code == 422
    # День оплаты только 1–28
    assert client.patch(f"/groups/{group_id}", json={"billing_day": 40}).status_code == 422
    # Несуществующая группа
    assert client.patch("/groups/999", json={"name": "X"}).status_code == 404


def test_group_is_full(client):
    group_id, _, _ = make_netflix_group(client)
    extra = make_user(client, "Ерлан", "+77010000005")
    response = client.post(f"/groups/{group_id}/members", json={"user_id": extra})
    assert response.status_code == 400


def test_duplicate_phone_rejected(client):
    make_user(client, "Аружан", "+77010000001")
    response = client.post("/users", json={"name": "Кто-то", "phone": "+77010000001"})
    assert response.status_code == 409


def test_bad_input_rejected(client):
    # Телефон не в формате +7XXXXXXXXXX
    assert client.post("/users", json={"name": "A", "phone": "12345"}).status_code == 422
    # Неверный формат месяца
    group_id, _, _ = make_netflix_group(client)
    assert client.get(f"/groups/{group_id}/payments/2026-13").status_code == 422
    # Несуществующая группа
    assert client.get("/groups/999").status_code == 404


# ---------- Для мобильного приложения ----------


def test_login_by_phone(client):
    user_id = make_user(client, "Аружан", "+77010000001")

    response = client.post("/login", json={"phone": "+77010000001"})
    assert response.status_code == 200
    assert response.json()["id"] == user_id

    # Незнакомый номер — 404, номер не в формате +7XXXXXXXXXX — 422
    assert client.post("/login", json={"phone": "+77019999999"}).status_code == 404
    assert client.post("/login", json={"phone": "8701"}).status_code == 422


def test_get_user_profile(client):
    user_id = make_user(client, "Аружан", "+77010000001")
    assert client.get(f"/users/{user_id}").json()["name"] == "Аружан"
    assert client.get("/users/999").status_code == 404


def test_user_groups_lists_only_own_groups(client):
    group_id, owner, friends = make_netflix_group(client)
    # Ещё одна группа: её создал Данияр, Аружан в ней нет
    other_id = client.post(
        "/groups",
        json={
            "name": "Музыка",
            "service_name": "Spotify",
            "total_price": 3000,
            "billing_day": 10,
            "max_members": 6,
            "owner_id": friends[0],
        },
    ).json()["id"]

    assert [g["id"] for g in client.get(f"/users/{owner}/groups").json()] == [group_id]
    assert [g["id"] for g in client.get(f"/users/{friends[0]}/groups").json()] == [
        group_id,
        other_id,
    ]
    assert client.get("/users/999/groups").status_code == 404


def test_invite_by_phone(client):
    group_id, _, friends = make_netflix_group(client)
    # Освобождаем место: Тимур выходит из группы
    left = client.delete(f"/groups/{group_id}/members/{friends[2]}")
    assert left.status_code == 200
    assert left.json()["members_count"] == 3

    # Нового человека SubShare регистрирует сам — по имени и номеру
    response = client.post(
        f"/groups/{group_id}/invite", json={"name": "Ерлан", "phone": "+77010000005"}
    )
    assert response.status_code == 200
    assert response.json()["members"][-1]["name"] == "Ерлан"
    assert client.post("/login", json={"phone": "+77010000005"}).status_code == 200

    # Повторно добавить того же человека нельзя
    again = client.post(
        f"/groups/{group_id}/invite", json={"name": "Ерлан", "phone": "+77010000005"}
    )
    assert again.status_code == 409


def test_invite_existing_user_keeps_registered_name(client):
    group_id, _, friends = make_netflix_group(client)
    # Тимур вышел из группы
    assert client.delete(f"/groups/{group_id}/members/{friends[2]}").status_code == 200

    # Тимур уже зарегистрирован — находим его по номеру, нового пользователя не создаём
    group = client.post(
        f"/groups/{group_id}/invite", json={"name": "Тима", "phone": "+77010000004"}
    ).json()
    assert group["members"][-1]["user_id"] == friends[2]
    assert group["members"][-1]["name"] == "Тимур"
    assert len(client.get("/users").json()) == 4


def test_invite_to_full_group_does_not_create_user(client):
    group_id, _, _ = make_netflix_group(client)  # уже 4 из 4
    response = client.post(
        f"/groups/{group_id}/invite", json={"name": "Ерлан", "phone": "+77010000005"}
    )
    assert response.status_code == 400
    # После ошибки Ерлан не должен остаться в базе
    assert client.post("/login", json={"phone": "+77010000005"}).status_code == 404


def test_debt_shows_whom_to_pay(client):
    group_id, _, friends = make_netflix_group(client)
    client.post(f"/groups/{group_id}/payments/2026-10")

    debt = client.get(f"/users/{friends[1]}/debts").json()[0]
    assert debt["owner_name"] == "Аружан"
    assert debt["owner_phone"] == "+77010000001"


def test_delete_group(client):
    group_id, _, friends = make_netflix_group(client)
    client.post(f"/groups/{group_id}/payments/2026-10")

    assert client.delete(f"/groups/{group_id}").status_code == 204
    assert client.get(f"/groups/{group_id}").status_code == 404
    # Вместе с группой удалились и её счета
    assert client.get(f"/users/{friends[1]}/debts").json() == []
    assert client.delete(f"/groups/{group_id}").status_code == 404


def test_cors_allows_web_app(client):
    # Веб-версия приложения открыта на другом адресе — сервер должен разрешить ей запросы
    response = client.get("/", headers={"Origin": "https://subshare-app.onrender.com"})
    assert response.headers["access-control-allow-origin"] == "*"


def test_phone_only_with_usual_digits(client):
    # Номер из «полноширинных» цифр выглядит так же, но это другие символы — не принимаем
    odd_phone = "+7０７０１０００００１"
    assert client.post("/users", json={"name": "А", "phone": odd_phone}).status_code == 422
    assert client.post("/login", json={"phone": odd_phone}).status_code == 422


def test_too_big_price_rejected(client):
    group_id, owner, _ = make_netflix_group(client)
    # Лишние нули при вводе цены — понятная ошибка 422, а не сбой сервера
    too_big = {"total_price": 3_000_000_000}
    assert client.patch(f"/groups/{group_id}", json=too_big).status_code == 422
    new_group = {
        "name": "X",
        "service_name": "X",
        "billing_day": 1,
        "max_members": 2,
        "owner_id": owner,
        **too_big,
    }
    assert client.post("/groups", json=new_group).status_code == 422


def test_simultaneous_duplicate_gives_409(client, monkeypatch):
    make_user(client, "Аружан", "+77010000001")
    # Имитируем два одновременных запроса: проверка «такой номер уже есть?» не успела
    # увидеть первого пользователя, и дубликат остановила сама база данных.
    monkeypatch.setattr("app.main.find_user_by_phone", lambda db, phone: None)
    response = client.post("/users", json={"name": "Аружан", "phone": "+77010000001"})
    assert response.status_code == 409
    assert len(client.get("/users").json()) == 1
