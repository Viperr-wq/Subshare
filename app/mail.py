"""
Письма SubShare: коды для подтверждения почты и смены пароля.

Письма уходят с почты Gmail через маленький скрипт Google (Google Apps Script) — бесплатно,
до 100 писем в день. Сервер присылает скрипту адрес, тему и текст, а скрипт отправляет письмо
от имени этой Gmail. Код скрипта — app/mail_script.gs, как его подключить — DEPLOY.md, шаг 2а.
Адрес скрипта задаётся переменной окружения MAIL_SCRIPT_URL, общий с ним секрет — MAIL_SECRET.
В код и в git секрет не класть!
Без адреса скрипта (на компьютере) письма не уходят, а печатаются в терминал сервера —
код из письма можно взять оттуда.
"""

import logging
import os

import httpx

MAIL_SCRIPT_URL = os.getenv("MAIL_SCRIPT_URL", "")
MAIL_SECRET = os.getenv("MAIL_SECRET", "")

log = logging.getLogger("subshare.mail")


def send(to: str, subject: str, text: str) -> bool:
    """Отправляет письмо. False — не получилось (ошибку не пробрасываем, решает тот, кто вызвал)."""
    if not MAIL_SCRIPT_URL:
        if os.getenv("RENDER"):  # на хостинге без скрипта письмо не дойдёт — честно отвечаем ошибкой
            log.warning("Не задан MAIL_SCRIPT_URL: письмо для %s не отправлено", to)
            return False
        print(f"\n[Письмо для {to}] {subject}\n{text}\n", flush=True)
        return True
    try:
        # Google отвечает переадресацией на страницу с ответом скрипта — follow_redirects идёт по ней
        response = httpx.post(
            MAIL_SCRIPT_URL,
            json={"secret": MAIL_SECRET, "to": to, "subject": subject, "text": text},
            follow_redirects=True,
            timeout=20,
        )
    except httpx.HTTPError as error:
        log.warning("Письмо для %s не отправлено: %s", to, error)
        return False
    if response.text.strip() != "ok":  # скрипт отвечает «ok» или описанием ошибки
        log.warning("Скрипт Google не отправил письмо (%s): %s", response.status_code, response.text[:300])
        return False
    return True
