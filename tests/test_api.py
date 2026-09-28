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
