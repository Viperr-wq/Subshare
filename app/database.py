"""
Подключение к базе данных.

Сейчас используется SQLite: вся база — это один файл subshare.db в папке
проекта. Ничего отдельно устанавливать не нужно.

Когда проект вырастет, можно перейти на PostgreSQL — для этого достаточно
поменять DATABASE_URL (например, через переменную окружения), код моделей
и эндпоинтов менять не придётся.
"""

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Адрес базы данных. По умолчанию — файл subshare.db рядом с проектом.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./subshare.db")

# Для SQLite нужен этот флаг, чтобы веб-сервер мог работать с базой из разных потоков.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# engine — «двигатель», через который SQLAlchemy общается с базой.
engine = create_engine(DATABASE_URL, connect_args=connect_args)


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
