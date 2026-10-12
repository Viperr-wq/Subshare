# Как разместить SubShare в интернете (Render + Neon)

После этих шагов SubShare будет работать по ссылкам без вашего ноутбука:

| Что | Адрес |
|---|---|
| Приложение (веб-версия) | https://subshare-kz.onrender.com |
| API и его документация | https://subshare-kz-api.onrender.com/docs |

Всё бесплатно: банковская карта обычно не нужна. Займёт 15–20 минут.

Как это устроено:

- **Neon** хранит базу данных PostgreSQL. Данные не пропадают.
- **Render** запускает два сервиса из файла `render.yaml`:
  - `subshare-kz-api` — сервер на FastAPI;
  - `subshare-kz` — веб-версия мобильного приложения (сборка Expo).

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
   только в настройки Render (шаг 3).

## 2. Код на GitHub

Render берёт код из репозитория на GitHub. Убедитесь, что все изменения
закоммичены и отправлены (`git push`). В репозитории должны быть `render.yaml`,
`requirements.txt`, папки `app/` и `mobile/`.

## 3. Сервисы на Render (5–10 минут)

1. Откройте https://render.com → **Get Started** → войдите через GitHub.
2. В Dashboard нажмите **New** → **Blueprint**.
3. Выберите репозиторий SubShare → **Connect**. Если его нет в списке, нажмите
   **Configure GitHub** и дайте Render доступ к этому репозиторию.
4. Render прочитает `render.yaml` и покажет два сервиса: `subshare-kz-api` и `subshare-kz`.
   В поле **DATABASE_URL** вставьте строку из Neon (шаг 1).
5. Нажмите **Deploy Blueprint**. Первая сборка займёт 5–10 минут: следить можно
   во вкладке **Logs** каждого сервиса.

## 4. Проверка

1. Откройте https://subshare-kz-api.onrender.com/docs — должна открыться документация API.
   Первое открытие может занять до минуты: сервер просыпается.
2. Откройте https://subshare-kz.onrender.com → **Посмотреть демо**.
   Должны появиться 4 группы Аружан (Netflix, Spotify, YouTube Premium, Яндекс Плюс).

**Если адрес API отличается.** Render добавляет к имени суффикс, если имя уже занято
(например, `subshare-kz-api-ab12.onrender.com`). Точный адрес виден в шапке сервиса
`subshare-kz-api`. Тогда:

1. Замените `https://subshare-kz-api.onrender.com` на настоящий адрес во всём проекте:
   в `render.yaml`, `mobile/lib/api.js`, `mobile/eas.json`.
2. Закоммитьте и запушьте — сайт пересоберётся сам.

## 5. Перед защитой

- Бесплатный сервер засыпает через 15 минут без запросов, а просыпается около минуты.
  **За 3–5 минут до выступления** откройте https://subshare-kz-api.onrender.com/docs,
  а потом само приложение.
- Если заснувший сервер не ответил сразу, приложение напишет «Сервер просыпается…».
  Подождите и нажмите «Повторить».
- Можно сделать так, чтобы в день защиты сервер вообще не засыпал. На https://cron-job.org
  создайте задание: запрос `GET https://subshare-kz-api.onrender.com/` каждые 10 минут.
  Одному сервису хватает бесплатных часов Render (750 в месяц) даже без перерывов.

## 6. Как обновлять

Делайте `git push` в ветку `main`, и Render пересоберёт всё сам:

- API — если менялось что-то кроме папки `mobile/`;
- сайт — если менялась папка `mobile/` или `render.yaml`.

Ручной перезапуск: сервис → **Manual Deploy** → **Deploy latest commit**.

## 7. Изменились таблицы или нужно вернуть демо-данные

Миграций в проекте нет: при запуске таблицы только создаются, но не изменяются.
Поэтому после правок в `app/models.py`, или если демо-данные испорчены, сделайте так:

1. Neon → ваш проект → **SQL Editor** → выполните:

   ```sql
   DROP TABLE payments, memberships, subscription_groups, users;
   ```

   ⚠️ Это удалит **все** данные на хостинге.
2. Render → `subshare-kz-api` → **Manual Deploy** → **Restart service**.
   При запуске таблицы и демо-данные создадутся заново.

## 8. Приложение на Android-телефоне (APK) — по желанию

Веб-версия по ссылке работает и на телефоне в браузере. Чтобы установить настоящее
приложение на Android, соберите APK в облаке Expo (бесплатно, 15 сборок в месяц):

```
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

1. Войдите в аккаунт Expo (зарегистрироваться можно на https://expo.dev).
2. На вопросы при первой сборке отвечайте «да», в том числе на «Generate a new Android Keystore».
3. Через 10–30 минут появится ссылка и QR-код на файл `.apk` — откройте их на телефоне
   и установите приложение.

Адрес API для APK указан в `mobile/eas.json`.

## 9. Если что-то не работает

| Что видно | Что сделать |
|---|---|
| В приложении «Нет связи с сервером» | Подождите минуту (сервер просыпается) и нажмите «Повторить». Не помогло — проверьте адрес API (шаг 4) |
| В логах API: «Не задан DATABASE_URL» | Render → `subshare-kz-api` → **Environment** → добавьте `DATABASE_URL` → **Save and deploy** |
| В логах API: `password authentication failed` | Строка из Neon скопирована не полностью — скопируйте заново |
| Сайт открывается, но показывает Not Found | Render → `subshare-kz` → **Settings**: Publish Directory должен быть `mobile/dist` |
| Сайт ходит на старый адрес API | Пересоберите сайт: `subshare-kz` → **Manual Deploy** → **Clear build cache & deploy** |
