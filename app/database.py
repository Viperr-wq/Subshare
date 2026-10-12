"""
Подключение к базе данных.

На компьютере используется SQLite: вся база — это один файл subshare.db в папке
проекта. Ничего отдельно устанавливать не нужно.

На хостинге (Render) используется PostgreSQL в облаке Neon: его адрес приходит
через переменную окружения DATABASE_URL. Код моделей и эндпоинтов для этого
менять не нужно — SQLAlchemy работает с обеими базами одинаково.
"""

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Адрес базы данных. По умолчанию — файл subshare.db рядом с проектом.
# На хостинге (Render) сюда через переменную окружения приходит адрес базы PostgreSQL (Neon).
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./subshare.db")

# На Render (там всегда задана переменная RENDER) диск стирается при каждом перезапуске,
# поэтому без адреса Neon все данные бы пропадали. Лучше сразу остановиться с понятной ошибкой.
if os.getenv("RENDER") and not os.getenv("DATABASE_URL"):
    raise RuntimeError(
        "Не задан DATABASE_URL: добавьте адрес базы Neon в Render → Environment"
    )

# Neon и Render выдают адрес вида postgresql://... (или postgres://...).
# Дописываем, что работать с PostgreSQL нужно через драйвер psycopg (версии 3).
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.removeprefix("postgres://")
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.removeprefix("postgresql://")

# Для SQLite нужен этот флаг, чтобы веб-сервер мог работать с базой из разных потоков.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# engine — «двигатель», через который SQLAlchemy общается с базой.
# Бесплатная база Neon «засыпает» через 5 минут без запросов, и старые соединения обрываются:
#   pool_pre_ping=True — перед запросом проверяем, что соединение живое;
#   pool_recycle=300 — не держим одно соединение дольше 5 минут.
engine = create_engine(
    DATABASE_URL, connect_args=connect_args, pool_pre_ping=True, pool_recycle=300
)


@event.listens_for(engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
    """В SQLite проверка связей между таблицами по умолчанию выключена — включаем."""
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# SessionLocal создаёт «сессию» — одно рабочее подключение к базе на время запроса.
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    """Базовый класс для всех таблиц (моделей)."""


def get_db():
    """
    Выдаёт сессию базы данных одному API-запросу и закрывает её после ответа.
    FastAPI вызывает эту функцию автоматически через Depends(get_db).
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
