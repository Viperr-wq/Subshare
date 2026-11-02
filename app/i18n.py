"""
Языки SubShare: русский, казахский и английский.

Приложение присылает язык в заголовке Accept-Language (ru, kk или en), и сервер
отвечает текстами ошибок на этом языке. Тексты пишутся сразу на трёх языках:

    raise HTTPException(404, tr("Группа не найдена", "Топ табылмады", "Group not found"))
"""

from contextvars import ContextVar

LANGUAGES = ("ru", "kk", "en")

# Язык текущего запроса. Его выставляет main.py в начале каждого запроса.
current_language: ContextVar[str] = ContextVar("current_language", default="ru")


def pick_language(header: str | None) -> str:
    """Из заголовка Accept-Language («kk», «en-US,en;q=0.9» и т.п.) берёт первый знакомый язык."""
    for part in (header or "").split(","):
        code = part.split(";")[0].strip().lower()[:2]
        if code in LANGUAGES:
            return code
    return "ru"


def tr(ru: str, kk: str, en: str, lang: str | None = None) -> str:
    """Текст на языке текущего запроса. lang — явно указанный язык (для сообщений бота)."""
    return {"kk": kk, "en": en}.get(lang or current_language.get(), ru)
