"""
Telegram-бот SubShare: вход в приложение и напоминания об оплате.

Бот создаётся в @BotFather, а его ключ задаётся переменной окружения TELEGRAM_BOT_TOKEN:
на Render — в настройках сервиса. В код и в git ключ не класть!
Без ключа (на компьютере и в тестах) бот выключен: входа через Telegram нет, а сообщения
не отправляются. На компьютере можно войти демо-пользователем с паролем (seed.py).
"""

import hashlib
import logging
import os

import httpx

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
bot_username = ""  # имя бота без @ — узнаём у Telegram при запуске сервера

log = logging.getLogger("subshare.telegram")


def webhook_secret() -> str:
    """
    Секрет, который Telegram присылает вместе с каждым сообщением боту:
    так сервер отличает настоящий Telegram от чужих запросов. Получаем его из ключа бота.
    """
    return hashlib.sha256(f"webhook:{BOT_TOKEN}".encode()).hexdigest()


def call(method: str, **params) -> dict | None:
    """Вызывает метод Telegram Bot API. Ошибку не пробрасываем: бот не должен ронять сервер."""
    if not BOT_TOKEN:
        return None
    try:
        response = httpx.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/{method}", json=params, timeout=10
        )
        return response.json().get("result")
    except (httpx.HTTPError, ValueError) as error:
        log.warning("Telegram %s не удался: %s", method, error)
        return None


def send_message(telegram_id: int | None, text: str) -> None:
    if telegram_id:
        call("sendMessage", chat_id=telegram_id, text=text)


def setup(public_url: str | None) -> None:
    """
    При запуске сервера: узнаём имя бота и сообщаем Telegram адрес, куда присылать
    сообщения боту (webhook). public_url на Render приходит сам — RENDER_EXTERNAL_URL.
    """
    global bot_username
    me = call("getMe")
    if me:
        bot_username = me["username"]
    if public_url:
        call(
            "setWebhook",
            url=f"{public_url}/telegram/webhook",
            secret_token=webhook_secret(),
            allowed_updates=["message"],
        )
