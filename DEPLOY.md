# Как разместить SubShare в интернете (Render + Neon + Telegram)

После этих шагов SubShare будет работать по ссылкам без вашего ноутбука:

| Что | Адрес |
|---|---|
| Сайт: описание, скачивание, создание аккаунта | https://subshare-kz.onrender.com |
| Приложение (веб-версия) | https://subshare-kz.onrender.com/app |
| Статистика для команды | https://subshare-kz.onrender.com/admin.html |
| API и его документация | https://subshare-kz-api.onrender.com/docs |
| Приложение для Android (APK) | https://github.com/Viperr-wq/Subshare/releases/latest/download/SubShare.apk |

Всё бесплатно: банковская карта обычно не нужна. Займёт 30–40 минут.

Как это устроено:

- **Neon** хранит базу данных PostgreSQL. Данные не пропадают.
- **Render** запускает два сервиса из файла `render.yaml`:
  - `subshare-kz-api` — сервер на FastAPI;
  - `subshare-kz` — сайт (папка `site/`) и по адресу `/app` — веб-версия мобильного приложения
    (сборка Expo). Адрес у них общий, поэтому вход на сайте сохраняется и в приложении.
- **Telegram-бот** — через него люди входят в приложение и получают напоминания об оплате.
- **Скрипт Google** — отправляет с Gmail письма с кодами тем, кто регистрируется по почте.
- **cron-job.org** — раз в день запускает выставление счетов и напоминания и не даёт серверу засыпать.
- **GitHub Releases** — там лежит файл APK для Android.

> Почему не SQLite: бесплатный Render стирает файлы при каждом «засыпании» сервера,
> поэтому файл `subshare.db` там терялся бы. Локально на компьютере SQLite остаётся.

---

## 1. База данных в Neon (5 минут)

1. Откройте https://neon.com → **Sign up** → войдите через GitHub.
2. **New Project**:
   - Project name: `subshare`;
   - Region: **AWS Europe Central 1 (Frankfurt)** — тот же город, где будет сервер Render;
   - остальное не меняйте → **Create project**.
3. Нажмите кнопку **Connect**. В открывшемся окне **выключите** переключатель
   **Connection pooling** (в адресе не должно быть слова `-pooler`).
4. Скопируйте строку подключения целиком. Она выглядит так:

   ```
   postgresql://neondb_owner:ПАРОЛЬ@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   ⚠️ В строке есть пароль. Не публикуйте её и не вставляйте в код или в GitHub —
   только в настройки Render (шаг 4).

## 2. Telegram-бот (3 минуты)

1. В Telegram откройте [@BotFather](https://t.me/BotFather) → **Start** → отправьте `/newbot`.
2. Имя бота (его видят люди): например, `SubShare`.
3. Адрес бота: латиницей и обязательно с `bot` на конце, например `SubShareKzBot`.
4. BotFather пришлёт ключ (token) вида `1234567890:AAH...`.

   ⚠️ Ключ — это полный доступ к боту. Никому его не присылайте и не кладите в код или в GitHub —
   только в настройки Render (шаг 4). Если ключ попал в чужие руки: @BotFather → `/revoke`.

Адрес для бота (webhook) сервер сообщает Telegram сам при каждом запуске — настраивать его не нужно.

## 2а. Письма с кодами (Gmail, 10 минут)

Тем, кто регистрируется по почте, сервер присылает письмо с кодом. Письма уходят с обычной
почты Gmail через маленький скрипт Google (Google Apps Script) — бесплатно, до 100 писем в день.
Подойдёт и личная Gmail, но лучше завести отдельную для проекта: её адрес увидят в письмах.

1. Придумайте секрет — длинную случайную строку (не короче 20 символов). Проще всего так,
   в терминале: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
2. Откройте https://script.google.com под этой Gmail → **New project** (Новый проект).
   Сотрите всё в редакторе и вставьте код из файла `app/mail_script.gs`. В строке
   `const SECRET = "";` вставьте секрет между кавычками и нажмите 💾 (**Save**).
3. **Deploy** (Начать развертывание) → **New deployment** (Новое развертывание) → ⚙ рядом
   с «Select type» → **Web app** (Веб-приложение). **Execute as: Me** (Запуск от имени: я),
   **Who has access: Anyone** (У кого есть доступ: все) → **Deploy**.
4. Google попросит доступ к почте: **Authorize access** → ваш аккаунт → на экране
   «Google hasn't verified this app» нажмите **Advanced** → **Go to … (unsafe)** → **Allow**.
   Это нормально: скрипт ваш, Google его просто не проверял.
5. Скопируйте **Web app URL** — адрес, который заканчивается на `/exec`.
6. В Render понадобятся две строки (шаг 4): `MAIL_SCRIPT_URL` — этот адрес, `MAIL_SECRET` — секрет.

⚠️ Зная секрет и адрес скрипта, кто угодно сможет слать письма с вашей Gmail. Никому их
не присылайте. Секрет вписывайте только в редакторе на script.google.com и в Render — не в файл
`app/mail_script.gs` в проекте (он попадёт в GitHub).

> Поменяли код или секрет в скрипте? **Deploy** → **Manage deployments** → ✏️ → Version:
> **New version** → **Deploy** — иначе Google продолжит выполнять старую версию. Адрес не изменится.
>
> Письма не приходят? Загляните в «Спам». Причину видно в Render → **Logs** (строка
> «Скрипт Google не отправил письмо») и на script.google.com → **Executions** (Выполнения).

## 3. Код на GitHub

Render берёт код из репозитория на GitHub. Убедитесь, что все изменения
закоммичены и отправлены (`git push`). В репозитории должны быть `render.yaml`,
`requirements.txt`, папки `app/` и `mobile/`.

## 4. Сервисы на Render (5–10 минут)

1. Откройте https://render.com → **Get Started** → войдите через GitHub.
2. В Dashboard нажмите **New** → **Blueprint**.
3. Выберите репозиторий SubShare → **Connect**. Если его нет в списке, нажмите
   **Configure GitHub** и дайте Render доступ к этому репозиторию.
4. Render прочитает `render.yaml` и покажет два сервиса: `subshare-kz-api` и `subshare-kz`.
   Заполните поля:
   - **DATABASE_URL** — строка из Neon (шаг 1);
   - **TELEGRAM_BOT_TOKEN** — ключ бота (шаг 2);
   - **ADMIN_PHONES** — номера команды через запятую, например `+77011234567,+77017654321`.
     Только эти люди увидят статистику на странице `/admin.html`;
   - **MAIL_SCRIPT_URL** и **MAIL_SECRET** — адрес скрипта Google и секрет (шаг 2а).

   `CRON_SECRET` Render придумает сам — он понадобится на шаге 6.
5. Нажмите **Deploy Blueprint**. Первая сборка займёт 5–10 минут: следить можно
   во вкладке **Logs** каждого сервиса.

**Если сервисы уже созданы раньше** (обновляете старую версию): Render → `subshare-kz-api` →
**Environment** → **Add Environment Variable** → `TELEGRAM_BOT_TOKEN` = ключ бота →
**Save, rebuild, and deploy**. Так же добавьте `ADMIN_PHONES` (номера команды через запятую),
`MAIL_SCRIPT_URL` и `MAIL_SECRET` (шаг 2а).
`CRON_SECRET` появится сам после синхронизации Blueprint;
если его нет — добавьте вручную: любая длинная случайная строка из латинских букв и цифр.

## 5. Проверка

1. Откройте https://subshare-kz-api.onrender.com/docs — должна открыться документация API.
   Первое открытие может занять до минуты: сервер просыпается.
2. Откройте https://subshare-kz.onrender.com → **Создать аккаунт** → **Открыть Telegram**
   (на компьютере можно навести камеру телефона на QR-код) → в боте нажмите
   **Поделиться номером** → вернитесь на сайт: вход произойдёт сам.
   Нажмите **Открыть веб-версию** — приложение откроется уже с вашим аккаунтом.
3. Создайте группу и добавьте в неё друга по номеру. Когда друг войдёт через Telegram
   с этим номером, он увидит группу.
4. Откройте https://subshare-kz.onrender.com/admin.html — с номера из `ADMIN_PHONES` видно,
   сколько аккаунтов и групп и кто зарегистрировался. Другим номерам страница ответит «нет доступа».

**Если адрес API отличается.** Render добавляет к имени суффикс, если имя уже занято
(например, `subshare-kz-api-ab12.onrender.com`). Точный адрес виден в шапке сервиса
`subshare-kz-api`. Тогда:

1. Замените `https://subshare-kz-api.onrender.com` на настоящий адрес во всём проекте:
   в `render.yaml`, `mobile/lib/api.js`, `mobile/eas.json`, `site/script.js`.
2. Закоммитьте и запушьте — сайт пересоберётся сам.

## 6. Расписание: счета, напоминания и сервер без сна (cron-job.org)

Бесплатный Render засыпает через 15 минут без запросов, а просыпается около минуты.
К тому же счета и напоминания запускает отдельный запрос раз в день. Оба запроса делает
бесплатный сервис https://cron-job.org (зарегистрируйтесь → **Create cronjob**).

**Задание 1 — чтобы сервер не засыпал**
- URL: `https://subshare-kz-api.onrender.com/`
- Execution schedule: **Every 10 minutes**.

Одному сервису хватает бесплатных часов Render (750 в месяц) даже без перерывов.

**Задание 2 — счета и напоминания**
- URL: `https://subshare-kz-api.onrender.com/tasks/daily`
- Execution schedule: каждый день в **10:00**, часовой пояс **Asia/Almaty**.
- Вкладка **Advanced**:
  - Request method: **POST**;
  - Headers → добавьте заголовок `X-Cron-Secret`, значение — `CRON_SECRET` из
    Render → `subshare-kz-api` → **Environment**.

Проверка: кнопка **Test run** → ответ `200` и текст вроде `{"invoices": 0, "reminders": 0}`.
Ответ `403` — значит, секрет в заголовке не совпадает с `CRON_SECRET`.

## 7. Как обновлять

Делайте `git push` в ветку `main`, и Render пересоберёт всё сам:

- API — если менялось что-то кроме папок `mobile/` и `site/`;
- сайт с веб-версией приложения — если менялись папки `mobile/`, `site/` или `render.yaml`.

Ручной перезапуск: сервис → **Manual Deploy** → **Deploy latest commit**.

## 8. Изменились таблицы

Миграций в проекте нет: при запуске таблицы только создаются, но не изменяются.
Поэтому после правок в `app/models.py` таблицы нужно создать заново:

1. Neon → ваш проект → **SQL Editor** → выполните:

   ```sql
   DROP TABLE IF EXISTS payments, memberships, tokens, login_requests, email_codes, subscription_groups, users;
   ```

   ⚠️ Это удалит **все** данные на хостинге — всех пользователей, группы и платежи.
   Когда у SubShare появятся настоящие пользователи, так делать уже нельзя:
   сначала нужно подключить миграции (Alembic).
2. Render → `subshare-kz-api` → **Manual Deploy** → **Restart service**.
   При запуске пустые таблицы создадутся заново. Демо-данных на хостинге нет.

**Если в таблицу только добавилось поле**, данные можно сохранить: вместо удаления таблиц
добавьте колонку командой `ALTER TABLE` — до того, как выкладывать новую версию.
Например, для регистрации по почте (ноябрь 2026):

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254) UNIQUE;
```

Новые таблицы (например, `email_codes`) сервер создаст сам при запуске.

## 9. Приложение для Android (APK)

Веб-версия по ссылке работает и на телефоне в браузере. Настоящее приложение для Android
ставится файлом APK со страницы выпусков (Releases) на GitHub — на сайте для этого есть
кнопка «Скачать приложение для Android». Новая версия: каждый раз так.

1. В `mobile/app.json` увеличьте `version` (например, `1.1.0` → `1.2.0`)
   и `android.versionCode` (на 1: `2` → `3`). Без этого телефон не поставит новую версию поверх старой.
2. Соберите APK в облаке Expo (бесплатно, до 15 сборок в месяц):

   ```
   cd mobile
   npx eas-cli@latest login
   npx eas-cli@latest build -p android --profile preview
   ```

   На вопросы при первой сборке отвечайте «да», в том числе на «Generate a new Android Keystore».
   Через 10–30 минут появится ссылка на файл `.apk` — скачайте его.
3. Переименуйте файл в **`SubShare.apk`** (точно так: на это имя ведёт ссылка на сайте).
4. GitHub → репозиторий → **Releases** → **Draft a new release**:
   - **Choose a tag** → впишите `v1.2.0` (та же версия, что в `app.json`, с буквой `v`) → **Create new tag**;
   - Release title: `SubShare 1.2.0`;
   - перетащите `SubShare.apk` в поле с файлами → **Publish release**.

Готово: кнопка на сайте скачивает новый файл, а установленное приложение при запуске
само предложит обновиться. Адрес API для APK указан в `mobile/eas.json`.

Установка на телефоне: открыть ссылку → скачать → открыть файл → разрешить установку
из этого источника (Android спросит один раз) → **Установить**.

## 10. Если что-то не работает

| Что видно | Что сделать |
|---|---|
| В приложении «Нет связи с сервером» | Подождите минуту (сервер просыпается) и нажмите «Повторить». Не помогло — проверьте адрес API (шаг 5) |
| «Вход через Telegram пока не настроен» | Нет `TELEGRAM_BOT_TOKEN`: Render → `subshare-kz-api` → **Environment** → добавьте ключ бота |
| Бот не отвечает в Telegram | Render → `subshare-kz-api` → **Manual Deploy** → **Restart service**: при запуске сервер заново сообщает Telegram свой адрес |
| В логах API: «Не задан DATABASE_URL» | Render → `subshare-kz-api` → **Environment** → добавьте `DATABASE_URL` → **Save and deploy** |
| В логах API: `password authentication failed` | Строка из Neon скопирована не полностью — скопируйте заново |
| В логах API: `column ... does not exist` | Таблицы остались от старой версии — шаг 8 |
| Сайт открывается, но показывает Not Found | Render → `subshare-kz` → **Settings**: Publish Directory должен быть `mobile/dist` |
| Сайт ходит на старый адрес API | Пересоберите сайт: `subshare-kz` → **Manual Deploy** → **Clear build cache & deploy** |
| Кнопка «Скачать приложение для Android» ведёт на «Not Found» | Нет выпуска на GitHub или файл назван не `SubShare.apk` — шаг 9 |
