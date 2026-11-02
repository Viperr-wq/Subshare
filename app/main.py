"""
Главный файл API SubShare.

Здесь описаны эндпоинты — адреса, к которым будет обращаться мобильное приложение.
После запуска сервера откройте http://127.0.0.1:8000/docs — там можно
посмотреть и попробовать все эндпоинты прямо в браузере.

Почти все эндпоинты работают только с ключом входа — см. get_current_user ниже.
Тексты ошибок — на языке приложения (ru, kk, en): см. tr в i18n.py.
"""

import hmac
import os
import threading
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from . import mail, models, schemas, telegram
from .database import Base, engine, get_db
from .i18n import LANGUAGES, current_language, pick_language, tr
from .logic import (
    check_password,
    due_date_for,
    format_tenge,
    hash_password,
    hash_token,
    is_valid_period,
    new_digit_code,
    new_token,
    normalize_email,
    normalize_phone,
    split_price,
    today_kz,
    utcnow,
)

# Адрес веб-версии приложения — бот даёт на неё ссылку
APP_URL = os.getenv("APP_URL", "https://subshare-kz.onrender.com")
# Секрет для ежедневных задач (POST /tasks/daily). На Render его создаёт сам Render
CRON_SECRET = os.getenv("CRON_SECRET", "")
# Сколько действует ссылка для входа через Telegram
LOGIN_CODE_TTL = timedelta(minutes=10)
# Код из письма: сколько действует и как часто можно просить новый
EMAIL_CODE_TTL = timedelta(minutes=15)
EMAIL_RESEND_AFTER = timedelta(minutes=1)
# Сколько раз можно ошибиться в коде из 6 цифр (из письма или от бота) — потом код сгорает
CODE_ATTEMPTS = 5
# Номера команды SubShare через запятую: им доступна статистика (GET /admin/stats,
# страница admin.html на сайте). На Render задаётся в Environment. Не задано — не видит никто
ADMIN_PHONES = {
    phone for phone in map(normalize_phone, os.getenv("ADMIN_PHONES", "").split(",")) if phone
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # При запуске сервера создаём таблицы, если их ещё нет, и подключаем бота.
    # Бота — в фоне: если Telegram отвечает медленно, сервер всё равно сразу начнёт работать
    Base.metadata.create_all(bind=engine)
    threading.Thread(target=telegram.setup, args=(os.getenv("RENDER_EXTERNAL_URL"),), daemon=True).start()
    yield


app = FastAPI(
    title="SubShare API",
    description=(
        "Сервис для совместной оплаты подписок: группы, доли, статусы оплаты.\n\n"
        "Люди входят через Telegram-бота. **Как попробовать здесь:** запустите `python seed.py`, "
        "выполните `POST /login` (демо: +77010000001, пароль demo2026), скопируйте `token` "
        "из ответа, нажмите **Authorize** и вставьте его."
    ),
    version="0.4.0",
    lifespan=lifespan,
)

# Веб-версия приложения открывается с другого адреса (домена), чем API.
# Без этой настройки браузер не даст ей обращаться к серверу (правило CORS).
# Ключ входа приходит в заголовке Authorization, а не в куки, поэтому запросы
# с любого адреса разрешать безопасно: без ключа чужие данные всё равно не отдадим.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def use_request_language(request: Request, call_next):
    # Приложение присылает язык в заголовке Accept-Language — на нём и отвечаем
    current_language.set(pick_language(request.headers.get("accept-language")))
    return await call_next(request)


@app.exception_handler(IntegrityError)
async def duplicate_error(_request, _exc):
    # Два одинаковых запроса пришли одновременно (двойное нажатие, повтор, пока сервер
    # «просыпается»), и база не дала создать дубликат. Отвечаем понятной ошибкой, а не 500.
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "detail": tr(
                "Эти данные уже сохранены — обновите экран",
                "Бұл деректер сақталып қойған — экранды жаңартыңыз",
                "This has already been saved — refresh the screen",
            )
        },
    )


# ---------- Вспомогательные функции ----------


# Ключ входа приложение присылает в заголовке «Authorization: Bearer <ключ>».
# Из-за этого в документации /docs появляется кнопка Authorize.
# auto_error=False: если ключа нет, отвечаем своим понятным текстом (см. find_token).
bearer = HTTPBearer(auto_error=False, description="Ключ входа (token) из ответа на вход")


def find_token(db: Session, credentials: HTTPAuthorizationCredentials | None) -> models.Token:
    """Находит в базе ключ входа из заголовка Authorization. Нет ключа или он неверный — 401."""
    if credentials is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            tr("Войдите в аккаунт", "Аккаунтқа кіріңіз", "Please sign in"),
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = db.scalar(
        select(models.Token).where(models.Token.token_hash == hash_token(credentials.credentials))
    )
    if token is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            tr(
                "Ключ входа недействителен — войдите снова",
                "Кіру кілті жарамсыз — қайта кіріңіз",
                "Your session has expired — please sign in again",
            ),
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> models.User:
    """
    Кто делает запрос — узнаём по ключу входа.
    Эндпоинт, которому это нужно, добавляет параметр user: models.User = Depends(get_current_user).
    """
    return find_token(db, credentials).user


def issue_token(db: Session, user: models.User) -> schemas.AuthOut:
    """Выдаёт новый ключ входа. В базу пишем только его хеш, а сам ключ — в ответ."""
    token = new_token()
    db.add(models.Token(user_id=user.id, token_hash=hash_token(token)))
    db.commit()
    db.refresh(user)
    return schemas.AuthOut(token=token, user=schemas.UserOut.model_validate(user))


def group_not_found(group_id: int) -> HTTPException:
    return HTTPException(
        status.HTTP_404_NOT_FOUND,
        tr(f"Группа {group_id} не найдена", f"{group_id} тобы табылмады", f"Group {group_id} not found"),
    )


def get_my_group(db: Session, group_id: int, user: models.User) -> models.SubscriptionGroup:
    """Группа, в которой состоит пользователь. Чужую группу не показываем — как будто её нет."""
    group = db.get(models.SubscriptionGroup, group_id)
    if group is None or not any(m.user_id == user.id for m in group.memberships):
        raise group_not_found(group_id)
    return group


def check_owner(group: models.SubscriptionGroup, user: models.User) -> None:
    if group.owner_id != user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            tr(
                "Это может только владелец группы",
                "Мұны тек топ иесі жасай алады",
                "Only the group owner can do this",
            ),
        )


def find_user_by_phone(db: Session, phone: str) -> models.User | None:
    return db.scalar(select(models.User).where(models.User.phone == phone))


def find_user_by_email(db: Session, email: str) -> models.User | None:
    return db.scalar(select(models.User).where(models.User.email == email))


def check_email_and_phone_free(db: Session, email: str, phone: str) -> None:
    """Регистрация по почте: почта и номер ещё не заняты. Иначе — 409."""
    if find_user_by_email(db, email):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            tr(
                "Эта почта уже зарегистрирована — войдите",
                "Бұл пошта тіркелген — кіріңіз",
                "This email is already registered — please sign in",
            ),
        )
    # Номер при регистрации по почте не проверяется. Если бы мы принимали занятый номер,
    # любой мог бы ввести чужой и получить чужие группы. Номер подтверждает только Telegram
    if find_user_by_phone(db, phone):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            tr(
                "Этот номер уже есть в SubShare — войдите через Telegram",
                "Бұл нөмір SubShare-де бар — Telegram арқылы кіріңіз",
                "This number is already in SubShare — please sign in with Telegram",
            ),
        )


def send_email_code(db: Session, email: str, purpose: str, **registration) -> schemas.EmailCodeOut:
    """
    Присылает на почту код из 6 цифр. purpose — "register" (подтвердить почту) или "reset"
    (сменить пароль). registration — имя, номер и хеш пароля: из них потом создадим аккаунт.
    """
    latest = db.scalar(
        select(models.EmailCode)
        .where(models.EmailCode.email == email, models.EmailCode.purpose == purpose)
        .order_by(models.EmailCode.id.desc())
    )
    # Новый код — не чаще раза в минуту: через Gmail можно отправить только 100 писем в день
    if latest and latest.expires_at - EMAIL_CODE_TTL + EMAIL_RESEND_AFTER > utcnow():
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            tr(
                "Письмо уже отправлено — новый код можно запросить через минуту",
                "Хат жіберілді — жаңа кодты бір минуттан кейін сұрауға болады",
                "We've just sent you an email — you can request a new code in a minute",
            ),
        )
    # Прежний код этой почты больше не нужен, а заодно убираем все устаревшие
    db.execute(
        delete(models.EmailCode).where(
            models.EmailCode.email == email, models.EmailCode.purpose == purpose
        )
    )
    db.execute(delete(models.EmailCode).where(models.EmailCode.expires_at < utcnow()))
    code = new_digit_code()
    db.add(
        models.EmailCode(
            email=email,
            purpose=purpose,
            code_hash=hash_token(code),
            expires_at=utcnow() + EMAIL_CODE_TTL,
            **registration,
        )
    )
    if purpose == "register":
        text = tr(
            f"Ваш код для регистрации в SubShare: {code}\n\nОн действует 15 минут. "
            "Если вы не регистрировались в SubShare, просто не обращайте внимания на это письмо.",
            f"SubShare-ге тіркелу коды: {code}\n\nОл 15 минут жарамды. "
            "Егер сіз SubShare-ге тіркелмеген болсаңыз, бұл хатқа мән бермеңіз.",
            f"Your SubShare sign-up code: {code}\n\nIt is valid for 15 minutes. "
            "If you didn't sign up for SubShare, just ignore this email.",
        )
    else:
        text = tr(
            f"Код для смены пароля в SubShare: {code}\n\nОн действует 15 минут. Если вы не просили "
            "сменить пароль, не обращайте внимания на это письмо — пароль останется прежним.",
            f"SubShare-де құпиясөзді ауыстыру коды: {code}\n\nОл 15 минут жарамды. Егер құпиясөзді "
            "ауыстыруды сұрамаған болсаңыз, бұл хатқа мән бермеңіз — құпиясөз өзгермейді.",
            f"Your SubShare password reset code: {code}\n\nIt is valid for 15 minutes. If you didn't "
            "ask to reset your password, ignore this email — your password will stay the same.",
        )
    subject = tr(f"Код SubShare: {code}", f"SubShare коды: {code}", f"SubShare code: {code}")
    if not mail.send(email, subject, text):
        db.rollback()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            tr(
                "Не получилось отправить письмо — попробуйте позже",
                "Хат жіберілмеді — кейінірек қайталап көріңіз",
                "Couldn't send the email — please try again later",
            ),
        )
    db.commit()
    return schemas.EmailCodeOut(expires_in=int(EMAIL_CODE_TTL.total_seconds()))


def check_email_code(db: Session, email: str, purpose: str, code: str) -> models.EmailCode:
    """Проверяет код из письма. Кода нет или он устарел — 410, неверный — 400."""
    request = db.scalar(
        select(models.EmailCode)
        .where(models.EmailCode.email == email, models.EmailCode.purpose == purpose)
        .where(models.EmailCode.expires_at >= utcnow())
        # Пока этот запрос проверяет код, другой с той же почтой ждёт: иначе одновременными
        # запросами можно было бы перебрать больше кодов, чем разрешено
        .with_for_update()
    )
    if request is None:
        raise HTTPException(
            status.HTTP_410_GONE,
            tr(
                "Код устарел — запросите новый",
                "Кодтың мерзімі өтті — жаңасын сұраңыз",
                "The code has expired — please request a new one",
            ),
        )
    if not hmac.compare_digest(request.code_hash, hash_token(code)):
        # Ошибиться можно только несколько раз — иначе 6 цифр можно было бы подобрать перебором
        request.attempts += 1
        if request.attempts >= CODE_ATTEMPTS:
            db.delete(request)
            db.commit()
            raise HTTPException(
                status.HTTP_410_GONE,
                tr(
                    "Слишком много неверных попыток — запросите новый код",
                    "Қате әрекеттер тым көп — жаңа код сұраңыз",
                    "Too many wrong attempts — please request a new code",
                ),
            )
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, tr("Неверный код", "Код қате", "Wrong code"))
    return request


def find_login_request(db: Session, code: str) -> models.LoginRequest | None:
    """
    Вход через Telegram по коду из ссылки. Устаревший код не находим. Пока запрос с этим
    кодом не закончился, другой такой же ждёт (FOR UPDATE): один вход — один ключ.
    """
    return db.scalar(
        select(models.LoginRequest)
        .where(models.LoginRequest.code_hash == hash_token(code))
        .where(models.LoginRequest.expires_at >= utcnow())
        .with_for_update()
    )


def add_member_to_group(group: models.SubscriptionGroup, user_id: int) -> None:
    """Добавляет пользователя в группу, если он ещё не в ней и есть свободное место."""
    if any(m.user_id == user_id for m in group.memberships):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            tr("Этот человек уже в группе", "Бұл адам топта бар", "This person is already in the group"),
        )
    if len(group.memberships) >= group.max_members:
        limit = group.max_members
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            tr(
                f"В группе уже максимум участников ({limit})",
                f"Топтағы қатысушылар саны шегіне жетті ({limit})",
                f"The group is full ({limit} members)",
            ),
        )
    group.memberships.append(models.Membership(user_id=user_id))


def check_period(period: str) -> None:
    if not is_valid_period(period):
        raise HTTPException(
            422,
            tr(
                "Месяц нужно указать в формате ГГГГ-ММ, например 2026-10",
                "Айды ЖЖЖЖ-АА пішімінде көрсетіңіз, мысалы 2026-10",
                "Use the YYYY-MM month format, for example 2026-10",
            ),
        )


def create_invoices(group: models.SubscriptionGroup, period: str) -> list[models.Payment]:
    """
    Выставляет счета за месяц тем участникам, у кого их ещё нет (владельцу — никогда:
    он сам платит сервису). Возвращает новые счета, чтобы бот сообщил о них.
    """
    existing = {p.user_id for p in group.payments if p.period == period}
    shares = split_price(group.total_price, len(group.memberships))
    due = due_date_for(period, group.billing_day)
    new_payments = []
    for membership, share in zip(group.memberships, shares):
        if membership.user_id == group.owner_id or membership.user_id in existing:
            continue
        payment = models.Payment(user_id=membership.user_id, period=period, amount=share, due_date=due)
        group.payments.append(payment)
        new_payments.append(payment)
    return new_payments


def get_payment(db: Session, payment_id: int, user: models.User) -> models.Payment:
    """Платёж, который касается пользователя: он плательщик или владелец группы."""
    payment = db.get(models.Payment, payment_id)
    if payment is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            tr(f"Платёж {payment_id} не найден", f"{payment_id} төлемі табылмады", f"Payment {payment_id} not found"),
        )
    if user.id not in (payment.user_id, payment.group.owner_id):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            tr(
                "Этот платёж может отметить только плательщик или владелец группы",
                "Бұл төлемді тек төлеуші немесе топ иесі белгілей алады",
                "Only the payer or the group owner can update this payment",
            ),
        )
    return payment


def check_not_paid(payment: models.Payment) -> None:
    if payment.status == models.PAYMENT_PAID:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            tr("Этот платёж уже оплачен", "Бұл төлем төленіп қойған", "This payment is already paid"),
        )


# Сообщения бота о платежах: {service}, {amount} и т.д. подставляются в payment_message
PAYMENT_MESSAGES = {
    "new": (
        "Новый счёт SubShare: {service} за {period} — {amount}, срок до {due}. "
        "Переведите владельцу {owner} ({phone}) и отметьте перевод в приложении.",
        "SubShare жаңа шоты: {service}, {period} — {amount}, мерзімі {due} дейін. "
        "Иесіне {owner} ({phone}) аударып, қосымшада белгілеңіз.",
        "New SubShare bill: {service} for {period} — {amount}, due {due}. "
        "Send it to the owner {owner} ({phone}) and mark it in the app.",
    ),
    "tomorrow": (
        "Напоминание SubShare: завтра срок оплаты {service} — {amount}. "
        "Переведите владельцу {owner} ({phone}) и отметьте перевод в приложении.",
        "SubShare еске салады: ертең {service} төлемінің мерзімі — {amount}. "
        "Иесіне {owner} ({phone}) аударып, қосымшада белгілеңіз.",
        "SubShare reminder: your {service} payment of {amount} is due tomorrow. "
        "Send it to {owner} ({phone}) and mark it in the app.",
    ),
    "overdue": (
        "SubShare: оплата {service} просрочена — {amount}, срок был {due}. "
        "Переведите владельцу {owner} ({phone}) и отметьте перевод в приложении.",
        "SubShare: {service} төлемінің мерзімі өтті — {amount}, мерзімі {due} болатын. "
        "Иесіне {owner} ({phone}) аударып, қосымшада белгілеңіз.",
        "SubShare: your {service} payment of {amount} is overdue (it was due {due}). "
        "Send it to {owner} ({phone}) and mark it in the app.",
    ),
    "sent": (
        "SubShare: {name} — перевод {amount} за {service} ({period}). "
        "Проверьте поступление и подтвердите в приложении.",
        "SubShare: {name} — {service} үшін {amount} аударым ({period}). "
        "Түскенін тексеріп, қосымшада растаңыз.",
        "SubShare: {name} sent {amount} for {service} ({period}). "
        "Check that it arrived and confirm it in the app.",
    ),
    "paid": (
        "SubShare: владелец подтвердил оплату {service} за {period} — {amount}. Спасибо!",
        "SubShare: иесі {service} төлемін растады ({period}) — {amount}. Рақмет!",
        "SubShare: the owner confirmed your {service} payment for {period} — {amount}. Thank you!",
    ),
    "not_received": (
        "SubShare: владелец не получил перевод {amount} за {service} ({period}). "
        "Проверьте перевод и отметьте его снова.",
        "SubShare: иесі {service} үшін {amount} аударымды алмады ({period}). "
        "Аударымды тексеріп, қайта белгілеңіз.",
        "SubShare: the owner didn't receive your {amount} for {service} ({period}). "
        "Please check the transfer and mark it again.",
    ),
}


def notify(tasks: BackgroundTasks, kind: str, payment: models.Payment) -> bool:
    """
    Сообщение в Telegram о платеже: о переводе — владельцу, остальное — плательщику.
    Текст собираем сразу, а отправляет его FastAPI уже после ответа (tasks) —
    так приложению не нужно ждать Telegram.
    """
    to = payment.group.owner if kind == "sent" else payment.user
    if not to.telegram_id:
        return False  # человек ещё ни разу не входил через Telegram — писать некуда
    text = tr(*PAYMENT_MESSAGES[kind], lang=to.language).format(
        service=payment.group.service_name,
        period=payment.period,
        amount=format_tenge(payment.amount),
        due=payment.due_date.strftime("%d.%m.%Y"),
        owner=payment.group.owner.name,
        phone=payment.group.owner.phone,
        name=payment.user.name,
    )
    tasks.add_task(telegram.send_message, to.telegram_id, text)
    return True


def group_to_schema(group: models.SubscriptionGroup) -> schemas.GroupOut:
    """Собирает ответ о группе и считает текущую долю каждого участника."""
    shares = split_price(group.total_price, len(group.memberships))
    members = [
        schemas.MemberShare(
            user_id=m.user_id,
            name=m.user.name,
            is_owner=m.user_id == group.owner_id,
            share=share,
        )
        for m, share in zip(group.memberships, shares)
    ]
    return schemas.GroupOut(
        id=group.id,
        name=group.name,
        service_name=group.service_name,
        total_price=group.total_price,
        currency=group.currency,
        billing_day=group.billing_day,
        max_members=group.max_members,
        owner_id=group.owner_id,
        members_count=len(members),
        members=members,
    )


def payment_to_schema(payment: models.Payment) -> schemas.PaymentOut:
    return schemas.PaymentOut(
        id=payment.id,
        group_id=payment.group_id,
        service_name=payment.group.service_name,
        user_id=payment.user_id,
        user_name=payment.user.name,
        period=payment.period,
        amount=payment.amount,
        due_date=payment.due_date,
        status=payment.status,
        # «Сегодня» — по времени Казахстана, а не по часам сервера (UTC)
        is_overdue=payment.status == models.PAYMENT_PENDING and payment.due_date < today_kz(),
        method=payment.method,
        paid_at=payment.paid_at,
        owner_name=payment.group.owner.name,
        owner_phone=payment.group.owner.phone,
    )


# ---------- Служебное ----------


@app.get("/", tags=["Служебное"], summary="Проверка, что сервер работает")
def root():
    return {"app": "SubShare API", "status": "ok", "docs": "/docs"}


@app.post(
    "/telegram/webhook",
    tags=["Служебное"],
    summary="Сообщения боту (их присылает Telegram)",
    description=(
        "Сюда Telegram присылает всё, что люди пишут боту. Ответ бота возвращаем прямо "
        "в ответе на запрос. Без секрета Telegram (заголовок X-Telegram-Bot-Api-Secret-Token) — 403."
    ),
)
def telegram_webhook(
    update_data: dict,
    x_telegram_bot_api_secret_token: str = Header(""),
    db: Session = Depends(get_db),
):
    if not telegram.BOT_TOKEN or not hmac.compare_digest(
        x_telegram_bot_api_secret_token, telegram.webhook_secret()
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, tr("Нет доступа", "Рұқсат жоқ", "Access denied"))

    message = update_data.get("message") or {}
    telegram_id = (message.get("from") or {}).get("id")
    if not telegram_id:
        return {}  # не сообщение от человека (например, бота добавили в чат) — молчим

    # Язык ответа: тот, что человек выбрал в SubShare, а если он новенький — язык его Telegram
    known = db.scalar(select(models.User).where(models.User.telegram_id == telegram_id))
    lang = known.language if known else (message["from"].get("language_code") or "")[:2]
    lang = lang if lang in LANGUAGES else "ru"

    def reply(ru: str, kk: str, en: str, keyboard: dict | None = None) -> dict:
        return {
            "method": "sendMessage",
            "chat_id": telegram_id,
            "text": tr(ru, kk, en, lang=lang),
            "reply_markup": keyboard or {"remove_keyboard": True},
        }

    if "contact" in message:
        return telegram_contact(db, message["contact"], telegram_id, lang, reply)

    text = message.get("text") or ""
    code = text.removeprefix("/start").strip() if text.startswith("/start") else ""
    request = find_login_request(db, code) if code else None
    if request is None or request.user_id is not None:
        if code:
            return reply(
                f"Ссылка для входа устарела. Начните вход в приложении заново: {APP_URL}",
                f"Кіру сілтемесінің мерзімі өтті. Қосымшада қайта бастаңыз: {APP_URL}",
                f"This sign-in link has expired. Please start again in the app: {APP_URL}",
            )
        return reply(
            f"Это бот SubShare. Чтобы войти, нажмите «Войти через Telegram» в приложении: {APP_URL}",
            f"Бұл — SubShare боты. Кіру үшін қосымшада «Telegram арқылы кіру» батырмасын басыңыз: {APP_URL}",
            f"This is the SubShare bot. To sign in, tap “Sign in with Telegram” in the app: {APP_URL}",
        )

    request.telegram_id = telegram_id  # ждём номер именно от этого человека
    db.commit()
    button = tr("📱 Поделиться номером", "📱 Нөмірмен бөлісу", "📱 Share phone number", lang=lang)
    return reply(
        "Вход в SubShare. Нажмите кнопку ниже, чтобы поделиться номером телефона, — "
        "бот пришлёт код для входа. Если вход начали не вы — ничего не нажимайте.",
        "SubShare-ге кіру. Телефон нөміріңізбен бөлісу үшін төмендегі батырманы басыңыз — "
        "бот кіру кодын жібереді. Кіруді сіз бастамасаңыз — ештеңе баспаңыз.",
        "Signing in to SubShare. Tap the button below to share your phone number — "
        "the bot will send you a sign-in code. If you didn't start this, don't tap anything.",
        {
            "keyboard": [[{"text": button, "request_contact": True}]],
            "resize_keyboard": True,
            "one_time_keyboard": True,
        },
    )


def telegram_contact(db: Session, contact: dict, telegram_id: int, lang: str, reply) -> dict:
    """Человек поделился номером в боте — подтверждаем вход, начатый в приложении."""
    # Можно прислать и чужой контакт — принимаем только свой: его номер проверил сам Telegram
    if contact.get("user_id") != telegram_id:
        return reply(
            "Отправьте свой номер кнопкой «Поделиться номером»",
            "Өз нөміріңізді «Нөмірмен бөлісу» батырмасымен жіберіңіз",
            "Please send your own number with the “Share phone number” button",
        )
    phone = normalize_phone(contact.get("phone_number") or "")
    if phone is None:
        return reply(
            "SubShare пока работает только с номерами +7",
            "SubShare әзірге тек +7 нөмірлерімен жұмыс істейді",
            "SubShare only supports +7 phone numbers for now",
        )
    request = db.scalar(
        select(models.LoginRequest)
        .where(models.LoginRequest.telegram_id == telegram_id)
        .where(models.LoginRequest.user_id.is_(None))
        .where(models.LoginRequest.expires_at >= utcnow())
        .order_by(models.LoginRequest.id.desc())
    )
    if request is None:
        return reply(
            f"Сначала нажмите «Войти через Telegram» в приложении: {APP_URL}",
            f"Алдымен қосымшада «Telegram арқылы кіру» батырмасын басыңыз: {APP_URL}",
            f"First tap “Sign in with Telegram” in the app: {APP_URL}",
        )

    name = " ".join(filter(None, [contact.get("first_name"), contact.get("last_name")])).strip()
    name = name[:100] or phone
    user = find_user_by_phone(db, phone)
    if user is None:
        user = models.User(phone=phone, name=name, language=lang)
        db.add(user)
    elif user.telegram_id is None:
        # Номер подтверждён впервые. Аккаунт с ним создал владелец группы, когда приглашал,
        # или кто-то при регистрации по почте — а там номер не проверяется: его мог вписать
        # и чужой человек. Теперь аккаунт — хозяина номера: имя из Telegram (поменять можно
        # в профиле), вход по почте отключаем, прежние входы завершаем
        user.name = name
        user.email = None
        user.password_hash = None
        db.execute(delete(models.Token).where(models.Token.user_id == user.id))
    # Этот Telegram мог раньше принадлежать другому номеру (человек сменил номер) — отвязываем
    db.execute(
        update(models.User)
        .where(models.User.telegram_id == telegram_id)
        .where(models.User.phone != phone)
        .values(telegram_id=None)
    )
    user.telegram_id = telegram_id
    db.flush()  # чтобы у нового пользователя появился id
    request.user_id = user.id
    # Ключ входа приложение получит только с этим кодом. Если человек открыл бота по чужой
    # ссылке, код останется у него — и в его аккаунт никто не войдёт
    pin = new_digit_code()
    request.pin_hash = hash_token(pin)
    db.commit()
    answer = reply(
        f"Код для входа в SubShare: <code>{pin}</code>\n\nВведите его в приложении. "
        "Никому не сообщайте этот код — даже если просят от имени SubShare.",
        f"SubShare-ге кіру коды: <code>{pin}</code>\n\nОны қосымшаға енгізіңіз. "
        "Бұл кодты ешкімге айтпаңыз — тіпті SubShare атынан сұраса да.",
        f"Your SubShare sign-in code: <code>{pin}</code>\n\nEnter it in the app. "
        "Don't share this code with anyone, even if they say they're from SubShare.",
    )
    answer["parse_mode"] = "HTML"  # код моноширинным шрифтом: в Telegram его копируют нажатием
    return answer


@app.post(
    "/tasks/daily",
    tags=["Служебное"],
    summary="Ежедневные задачи: счета за месяц и напоминания",
    description=(
        "Вызывается раз в день по расписанию (cron-job.org) с заголовком X-Cron-Secret. "
        "В начале месяца выставляет счета во всех группах, а должникам напоминает "
        "об оплате в Telegram: за день до срока и после срока каждые 3 дня."
    ),
)
def daily_tasks(
    tasks: BackgroundTasks, x_cron_secret: str = Header(""), db: Session = Depends(get_db)
):
    if not CRON_SECRET or not hmac.compare_digest(x_cron_secret, CRON_SECRET):
        raise HTTPException(status.HTTP_403_FORBIDDEN, tr("Нет доступа", "Рұқсат жоқ", "Access denied"))
    today = today_kz()
    period = today.strftime("%Y-%m")

    new_payments = []
    groups = db.scalars(
        select(models.SubscriptionGroup).options(
            selectinload(models.SubscriptionGroup.memberships),
            selectinload(models.SubscriptionGroup.payments),
        )
    ).all()
    for group in groups:
        already = any(p.period == period for p in group.payments)
        # Счета за месяц выставляем один раз и только пока срок оплаты не прошёл:
        # группа, созданная после срока, начнёт получать счета со следующего месяца
        if len(group.memberships) >= 2 and not already and today.day <= group.billing_day:
            new_payments += create_invoices(group, period)
    db.flush()  # новые счета — в базу, чтобы они попали в список ниже

    # Все неоплаченные счета (и только что выставленные) — сразу с плательщиками и владельцами,
    # а не отдельным запросом к базе на каждый счёт
    pending = db.scalars(
        select(models.Payment)
        .where(models.Payment.status == models.PAYMENT_PENDING)
        .options(
            selectinload(models.Payment.user),
            selectinload(models.Payment.group).selectinload(models.SubscriptionGroup.owner),
        )
    ).all()
    reminders = 0
    for payment in pending:
        days_left = (payment.due_date - today).days
        if payment.reminded_on == today:
            continue  # сегодня уже писали: например, задачу запустили второй раз
        if payment in new_payments:
            kind = "new"
        elif days_left == 1:
            kind = "tomorrow"
        elif days_left < 0 and -days_left % 3 == 1:  # на 1-й, 4-й, 7-й… день просрочки
            kind = "overdue"
        else:
            continue
        payment.reminded_on = today
        sent = notify(tasks, kind, payment)
        if kind != "new":
            reminders += sent
    db.commit()
    return {"invoices": len(new_payments), "reminders": reminders}


# ---------- Вход ----------


@app.post(
    "/login/telegram",
    response_model=schemas.TelegramLoginOut,
    tags=["Вход"],
    summary="Начать вход через Telegram",
    description=(
        "Выдаёт секретный код и ссылку на бота. Приложение открывает ссылку, человек "
        "делится в боте номером, бот присылает ему код из 6 цифр, а приложение отправляет "
        "этот код в POST /login/telegram/check."
    ),
)
def telegram_login_start(db: Session = Depends(get_db)):
    if telegram.BOT_TOKEN and not telegram.bot_username:
        telegram.setup(None)  # при запуске сервера Telegram не ответил — спрашиваем имя бота ещё раз
    if not (telegram.BOT_TOKEN and telegram.bot_username):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            tr(
                "Вход через Telegram пока не настроен",
                "Telegram арқылы кіру әлі бапталмаған",
                "Telegram sign-in is not set up yet",
            ),
        )
    # Устаревшие коды больше не нужны — заодно чистим их
    db.execute(delete(models.LoginRequest).where(models.LoginRequest.expires_at < utcnow()))
    code = new_token()
    db.add(models.LoginRequest(code_hash=hash_token(code), expires_at=utcnow() + LOGIN_CODE_TTL))
    db.commit()
    return schemas.TelegramLoginOut(
        code=code,
        url=f"https://t.me/{telegram.bot_username}?start={code}",
        expires_in=int(LOGIN_CODE_TTL.total_seconds()),
    )


@app.post(
    "/login/telegram/check",
    response_model=schemas.AuthOut,
    tags=["Вход"],
    summary="Вход через Telegram: ввести код из бота",
    description=(
        "code — секретный код из POST /login/telegram, pin — 6 цифр, которые бот прислал "
        "человеку. Верно — ключ входа (код одноразовый). Номер в боте ещё не подтвердили "
        "или код неверный — 400; вход устарел или 5 неверных попыток — 410."
    ),
)
def telegram_login_check(data: schemas.TelegramCheckIn, db: Session = Depends(get_db)):
    request = find_login_request(db, data.code)
    if request is None:
        raise HTTPException(
            status.HTTP_410_GONE,
            tr(
                "Вход устарел — начните заново",
                "Кіру мерзімі өтті — қайта бастаңыз",
                "This sign-in has expired — please start again",
            ),
        )
    if request.pin_hash is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            tr(
                "Сначала поделитесь номером в боте — он пришлёт код",
                "Алдымен боттағы нөміріңізбен бөлісіңіз — ол код жібереді",
                "First share your phone number in the bot — it will send you the code",
            ),
        )
    if not hmac.compare_digest(request.pin_hash, hash_token(data.pin)):
        # Ошибиться можно только несколько раз — иначе 6 цифр можно было бы подобрать перебором
        request.attempts += 1
        if request.attempts >= CODE_ATTEMPTS:
            db.delete(request)
            db.commit()
            raise HTTPException(
                status.HTTP_410_GONE,
                tr(
                    "Слишком много неверных попыток — начните вход заново",
                    "Қате әрекеттер тым көп — кіруді қайта бастаңыз",
                    "Too many wrong attempts — please start signing in again",
                ),
            )
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, tr("Неверный код", "Код қате", "Wrong code"))
    user = db.get(models.User, request.user_id)
    db.delete(request)
    return issue_token(db, user)  # здесь же db.commit()


@app.post(
    "/login",
    response_model=schemas.AuthOut,
    tags=["Вход"],
    summary="Войти по паролю (только демо)",
    description=(
        "Пароль есть только у демо-пользователей из seed.py — так удобно проверять API "
        "на своём компьютере без Telegram. Каждый вход выдаёт новый ключ."
    ),
)
def login(data: schemas.LoginIn, db: Session = Depends(get_db)):
    user = find_user_by_phone(db, data.phone)
    if user is None or user.password_hash is None or not check_password(
        data.password, user.password_hash
    ):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            tr("Неверный номер или пароль", "Нөмір немесе құпиясөз қате", "Wrong phone number or password"),
        )
    return issue_token(db, user)


@app.post(
    "/register/email",
    response_model=schemas.EmailCodeOut,
    tags=["Вход"],
    summary="Регистрация по почте: прислать код",
    description=(
        "Проверяет, что почта и номер свободны, и присылает на почту код из 6 цифр. "
        "Аккаунт появится после POST /register/email/confirm. Новый код — не чаще раза в минуту (429)."
    ),
)
def email_register_start(data: schemas.EmailRegisterIn, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    check_email_and_phone_free(db, email, data.phone)
    return send_email_code(
        db,
        email,
        "register",
        name=data.name,
        phone=data.phone,
        password_hash=hash_password(data.password),
    )


@app.post(
    "/register/email/confirm",
    response_model=schemas.AuthOut,
    status_code=status.HTTP_201_CREATED,
    tags=["Вход"],
    summary="Регистрация по почте: ввести код",
    description="Код верный — создаёт аккаунт и выдаёт ключ входа. Неверный — 400, устарел — 410.",
)
def email_register_confirm(data: schemas.EmailCodeIn, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    request = check_email_code(db, email, "register", data.code)
    # Пока человек ждал письмо, почту или номер мог занять кто-то другой
    check_email_and_phone_free(db, email, request.phone)
    user = models.User(
        name=request.name,
        phone=request.phone,
        email=email,
        password_hash=request.password_hash,
        language=current_language.get(),
    )
    db.add(user)
    db.delete(request)
    db.flush()  # чтобы у пользователя появился id
    return issue_token(db, user)


@app.post(
    "/login/email",
    response_model=schemas.AuthOut,
    tags=["Вход"],
    summary="Войти по почте и паролю",
    description="Для тех, кто зарегистрировался по почте. Каждый вход выдаёт новый ключ.",
)
def email_login(data: schemas.EmailLoginIn, db: Session = Depends(get_db)):
    user = find_user_by_email(db, normalize_email(data.email))
    if user is None or user.password_hash is None or not check_password(
        data.password, user.password_hash
    ):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            tr("Неверная почта или пароль", "Пошта немесе құпиясөз қате", "Wrong email or password"),
        )
    return issue_token(db, user)


def no_account_with_email() -> HTTPException:
    return HTTPException(
        status.HTTP_404_NOT_FOUND,
        tr("Аккаунта с такой почтой нет", "Мұндай поштамен аккаунт жоқ", "There's no account with this email"),
    )


@app.post(
    "/password/forgot",
    response_model=schemas.EmailCodeOut,
    tags=["Вход"],
    summary="Забыли пароль: прислать код на почту",
    description="Новый код — не чаще раза в минуту (429). Пароль меняется в POST /password/reset.",
)
def password_forgot(data: schemas.EmailIn, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    if find_user_by_email(db, email) is None:
        raise no_account_with_email()
    return send_email_code(db, email, "reset")


@app.post(
    "/password/reset",
    response_model=schemas.AuthOut,
    tags=["Вход"],
    summary="Забыли пароль: ввести код и новый пароль",
    description=(
        "Код верный — меняет пароль, завершает вход на всех устройствах (старый пароль мог "
        "узнать кто-то чужой) и выдаёт новый ключ входа."
    ),
)
def password_reset(data: schemas.PasswordResetIn, db: Session = Depends(get_db)):
    email = normalize_email(data.email)
    request = check_email_code(db, email, "reset", data.code)
    db.delete(request)
    user = find_user_by_email(db, email)
    if user is None:  # аккаунт успели удалить, пока шло письмо
        db.commit()
        raise no_account_with_email()
    user.password_hash = hash_password(data.password)
    db.execute(delete(models.Token).where(models.Token.user_id == user.id))
    return issue_token(db, user)


@app.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Вход"],
    summary="Выйти из аккаунта",
    description="Удаляет ключ входа, с которым пришёл запрос. На других устройствах вход сохранится.",
)
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
):
    db.delete(find_token(db, credentials))
    db.commit()


# ---------- Мой профиль ----------

# Списка всех пользователей (GET /users) нарочно нет: он показывал бы имена и телефоны
# всех людей в SubShare. Каждый видит только свой профиль — GET /me.


@app.get("/me", response_model=schemas.UserOut, tags=["Профиль"], summary="Мой профиль")
def get_me(user: models.User = Depends(get_current_user)):
    return user


@app.patch("/me", response_model=schemas.UserOut, tags=["Профиль"], summary="Изменить имя или язык")
def update_me(
    data: schemas.UserUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@app.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Профиль"],
    summary="Удалить мой аккаунт",
    description=(
        "Удаляет аккаунт насовсем: мои группы (вместе с их участниками и счетами), "
        "моё участие в чужих группах, мои счета и все ключи входа."
    ),
)
def delete_me(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    for group in db.scalars(
        select(models.SubscriptionGroup).where(models.SubscriptionGroup.owner_id == user.id)
    ).all():
        db.delete(group)
    db.flush()
    for table in (models.Payment, models.Membership, models.Token, models.LoginRequest):
        db.execute(delete(table).where(table.user_id == user.id))
    if user.email:
        db.execute(delete(models.EmailCode).where(models.EmailCode.email == user.email))
    db.execute(delete(models.User).where(models.User.id == user.id))
    db.commit()


@app.get(
    "/me/groups",
    response_model=list[schemas.GroupOut],
    tags=["Профиль"],
    summary="Мои группы",
)
def my_groups(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    groups = db.scalars(
        select(models.SubscriptionGroup)
        .join(models.Membership)
        .where(models.Membership.user_id == user.id)
        .order_by(models.SubscriptionGroup.id)
    ).all()
    return [group_to_schema(g) for g in groups]


@app.get(
    "/me/debts",
    response_model=list[schemas.PaymentOut],
    tags=["Профиль"],
    summary="Что я ещё должен оплатить (во всех группах)",
    description="И неоплаченные счета, и переводы, которые ещё не подтвердил владелец.",
)
def my_debts(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    payments = db.scalars(
        select(models.Payment)
        .where(models.Payment.user_id == user.id)
        .where(models.Payment.status.in_([models.PAYMENT_PENDING, models.PAYMENT_SENT]))
        .order_by(models.Payment.due_date)
    ).all()
    return [payment_to_schema(p) for p in payments]


# ---------- Группы подписок ----------


@app.post(
    "/groups",
    response_model=schemas.GroupOut,
    status_code=status.HTTP_201_CREATED,
    tags=["Группы"],
    summary="Создать группу подписки",
)
def create_group(
    data: schemas.GroupCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Владелец — тот, кто создаёт группу. Он же автоматически первый участник.
    group = models.SubscriptionGroup(**data.model_dump(), owner_id=user.id)
    group.memberships.append(models.Membership(user_id=user.id))
    db.add(group)
    db.commit()
    db.refresh(group)
    return group_to_schema(group)


@app.get(
    "/groups/{group_id}",
    response_model=schemas.GroupOut,
    tags=["Группы"],
    summary="Информация о группе и доля каждого участника",
)
def get_group(
    group_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return group_to_schema(get_my_group(db, group_id, user))


@app.patch(
    "/groups/{group_id}",
    response_model=schemas.GroupOut,
    tags=["Группы"],
    summary="Изменить группу (цена, день оплаты, лимит участников)",
    description=(
        "Меняет только переданные поля. Уже выставленные счета НЕ пересчитываются: "
        "их сумма зафиксирована в момент начисления. Новая цена влияет только на "
        "будущие начисления и на текущие доли участников."
    ),
)
def update_group(
    group_id: int,
    data: schemas.GroupUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = get_my_group(db, group_id, user)
    check_owner(group, user)
    # exclude_unset=True — берём только те поля, которые реально прислали в запросе.
    changes = data.model_dump(exclude_unset=True)

    # Нельзя сделать лимит меньше, чем уже есть участников в группе.
    new_max = changes.get("max_members")
    count = len(group.memberships)
    if new_max is not None and new_max < count:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            tr(
                f"В группе уже {count} участников — лимит не может быть меньше",
                f"Топта {count} қатысушы бар — шек одан аз бола алмайды",
                f"The group already has {count} members — the limit can't be lower",
            ),
        )

    for field, value in changes.items():
        setattr(group, field, value)
    db.commit()
    db.refresh(group)
    return group_to_schema(group)


# Добавлять участника по id нарочно нельзя: так владелец мог бы, перебирая номера id,
# добавить в свою группу кого угодно. Друга добавляют только по номеру телефона.


@app.post(
    "/groups/{group_id}/invite",
    response_model=schemas.GroupOut,
    tags=["Группы"],
    summary="Добавить участника по номеру телефона",
    description=(
        "Так владелец добавляет друга: по имени и номеру. Если человека с таким номером "
        "ещё нет в SubShare, для него создаётся аккаунт — друг получит его, когда сам "
        "войдёт через Telegram с этим номером."
    ),
)
def invite_member(
    group_id: int,
    data: schemas.InviteIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = get_my_group(db, group_id, user)
    check_owner(group, user)
    friend = find_user_by_phone(db, data.phone)
    if friend is None:
        friend = models.User(name=data.name, phone=data.phone, language=user.language)
        db.add(friend)
        db.flush()  # чтобы у нового пользователя появился id
    # Если добавить нельзя (группа полная или он уже в ней), здесь будет ошибка,
    # и новый пользователь не сохранится: db.commit() ниже не выполнится.
    add_member_to_group(group, friend.id)
    db.commit()
    db.refresh(group)
    return group_to_schema(group)


@app.delete(
    "/groups/{group_id}/members/{user_id}",
    response_model=schemas.GroupOut,
    tags=["Группы"],
    summary="Выйти из группы или убрать участника",
    description="Выйти может сам участник, а убрать другого участника — только владелец группы.",
)
def leave_group(
    group_id: int,
    user_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = get_my_group(db, group_id, user)
    if user_id != user.id:
        check_owner(group, user)  # убрать другого человека может только владелец
    if user_id == group.owner_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            tr(
                "Владелец не может выйти из своей группы",
                "Иесі өз тобынан шыға алмайды",
                "The owner can't leave their own group",
            ),
        )
    membership = next((m for m in group.memberships if m.user_id == user_id), None)
    if membership is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            tr("Этого человека нет в группе", "Бұл адам топта жоқ", "This person is not in the group"),
        )

    # Уже созданные начисления (история платежей) при выходе сохраняются.
    group.memberships.remove(membership)
    db.commit()
    db.refresh(group)
    return group_to_schema(group)


@app.delete(
    "/groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Группы"],
    summary="Удалить группу",
    description="Удаляет группу вместе со списком участников и историей платежей.",
)
def delete_group(
    group_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = get_my_group(db, group_id, user)
    check_owner(group, user)
    db.delete(group)
    db.commit()


# ---------- Платежи ----------


@app.post(
    "/groups/{group_id}/payments/{period}",
    response_model=schemas.PeriodStatus,
    tags=["Платежи"],
    summary="Выставить участникам счета за месяц",
    description=(
        "Считает долю каждого участника и создаёт начисления за указанный месяц "
        "(формат ГГГГ-ММ). Владельцу начисление не создаётся — он сам платит сервису. "
        "Повторный вызов безопасен: уже созданные начисления не дублируются. "
        "Обычно счета выставляются сами в начале месяца (POST /tasks/daily)."
    ),
)
def create_period_payments(
    group_id: int,
    period: str,
    tasks: BackgroundTasks,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_period(period)
    group = get_my_group(db, group_id, user)
    check_owner(group, user)
    if len(group.memberships) < 2:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            tr(
                "Сначала добавьте участников в группу",
                "Алдымен топқа қатысушыларды қосыңыз",
                "Add members to the group first",
            ),
        )
    new_payments = create_invoices(group, period)
    db.flush()  # новые счета — в базу, чтобы узнать их плательщиков (payment.user)
    for payment in new_payments:
        payment.reminded_on = today_kz()  # о счёте пишем сейчас — сегодня больше не напоминаем
        notify(tasks, "new", payment)
    db.commit()
    db.refresh(group)
    return period_status(group_id, period, user, db)


@app.get(
    "/groups/{group_id}/payments/{period}",
    response_model=schemas.PeriodStatus,
    tags=["Платежи"],
    summary="Кто оплатил, а кто ещё должен за месяц",
)
def period_status(
    group_id: int,
    period: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_period(period)
    group = get_my_group(db, group_id, user)
    payments = sorted(
        (p for p in group.payments if p.period == period), key=lambda p: p.id
    )
    total = sum(p.amount for p in payments)
    collected = sum(p.amount for p in payments if p.status == models.PAYMENT_PAID)
    return schemas.PeriodStatus(
        group_id=group.id,
        service_name=group.service_name,
        period=period,
        total_to_collect=total,
        collected=collected,
        outstanding=total - collected,
        payments=[payment_to_schema(p) for p in payments],
    )


@app.post(
    "/payments/{payment_id}/sent",
    response_model=schemas.PaymentOut,
    tags=["Платежи"],
    summary="Я перевёл деньги (отмечает плательщик)",
    description=(
        "Участник сам переводит деньги владельцу (например, через Kaspi) и отмечает это здесь. "
        "Владелец получит сообщение в Telegram и подтвердит, что деньги пришли."
    ),
)
def mark_sent(
    payment_id: int,
    tasks: BackgroundTasks,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payment = get_payment(db, payment_id, user)
    if payment.user_id != user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            tr(
                "Отметить перевод может только сам плательщик",
                "Аударымды тек төлеушінің өзі белгілей алады",
                "Only the payer can mark this payment as sent",
            ),
        )
    check_not_paid(payment)
    if payment.status == models.PAYMENT_SENT:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            tr(
                "Перевод уже отмечен — ждём подтверждения владельца",
                "Аударым белгіленген — иесінің растауын күтеміз",
                "Already marked as sent — waiting for the owner to confirm",
            ),
        )
    payment.status = models.PAYMENT_SENT
    db.commit()
    notify(tasks, "sent", payment)
    return payment_to_schema(payment)


@app.post(
    "/payments/{payment_id}/pay",
    response_model=schemas.PaymentOut,
    tags=["Платежи"],
    summary="Деньги получены (подтверждает владелец)",
    description=(
        "Владелец группы подтверждает, что получил перевод. Подтвердить можно и без отметки "
        "участника — например, если деньги отдали наличными."
    ),
)
def mark_paid(
    payment_id: int,
    tasks: BackgroundTasks,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payment = get_payment(db, payment_id, user)
    check_owner(payment.group, user)
    check_not_paid(payment)
    payment.status = models.PAYMENT_PAID
    payment.method = models.PAYMENT_METHOD_MANUAL
    payment.paid_at = utcnow()
    db.commit()
    notify(tasks, "paid", payment)
    return payment_to_schema(payment)


@app.post(
    "/payments/{payment_id}/not-received",
    response_model=schemas.PaymentOut,
    tags=["Платежи"],
    summary="Перевод не пришёл (отмечает владелец)",
    description="Возвращает отмеченный участником перевод в «не оплачено» и сообщает ему об этом.",
)
def mark_not_received(
    payment_id: int,
    tasks: BackgroundTasks,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payment = get_payment(db, payment_id, user)
    check_owner(payment.group, user)
    if payment.status != models.PAYMENT_SENT:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            tr(
                "Участник ещё не отметил этот перевод",
                "Қатысушы бұл аударымды әлі белгілемеген",
                "The member hasn't marked this payment as sent",
            ),
        )
    payment.status = models.PAYMENT_PENDING
    db.commit()
    notify(tasks, "not_received", payment)
    return payment_to_schema(payment)


# ---------- Команда SubShare ----------


@app.get(
    "/admin/stats",
    response_model=schemas.StatsOut,
    tags=["Команда"],
    summary="Статистика: аккаунты и группы",
    description=(
        "Для команды SubShare: сколько аккаунтов и групп, список аккаунтов. Доступно только "
        "номерам из переменной окружения ADMIN_PHONES, остальным — 403."
    ),
)
def admin_stats(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.phone not in ADMIN_PHONES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, tr("Нет доступа", "Рұқсат жоқ", "Access denied"))
    users = db.scalars(select(models.User).order_by(models.User.id.desc())).all()
    # Аккаунт — тот, кто сам входил (через Telegram; на компьютере — демо по паролю).
    # Остальных пока только добавили в группу по номеру
    accounts = [u for u in users if u.telegram_id is not None or u.password_hash is not None]
    # В скольких группах каждый — одним запросом, а не отдельным на каждого человека
    group_counts = dict(
        db.execute(
            select(models.Membership.user_id, func.count()).group_by(models.Membership.user_id)
        ).all()
    )
    return schemas.StatsOut(
        accounts=len(accounts),
        invited=len(users) - len(accounts),
        groups=db.scalar(select(func.count()).select_from(models.SubscriptionGroup)),
        clients=[
            schemas.ClientOut(
                name=u.name,
                phone=u.phone,
                email=u.email,
                language=u.language,
                groups=group_counts.get(u.id, 0),
            )
            for u in accounts
        ],
    )
