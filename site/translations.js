// Переводы сайта: русский текст (как в index.html или в t() в script.js) → [қазақша, English].
// Как в приложении (mobile/lib/translations.js): нет строки — покажется русский текст.
const TRANSLATIONS = {
  // Шапка и первый экран
  "SubShare — делите подписки с друзьями": ["SubShare — жазылымдарды достармен бөлісіңіз", "SubShare — share subscriptions with friends"],
  "Как это работает": ["Бұл қалай жұмыс істейді", "How it works"],
  "Скачать": ["Жүктеу", "Download"],
  "Вопросы": ["Сұрақтар", "FAQ"],
  "Войти": ["Кіру", "Sign in"],
  "Открыть SubShare": ["SubShare-ді ашу", "Open SubShare"],
  "Бесплатно · Android и браузер · Рус, Қаз, Eng": ["Тегін · Android және браузер · Рус, Қаз, Eng", "Free · Android and browser · Рус, Қаз, Eng"],
  "Делите подписки, а не нервы": ["Жазылымды бөлісіңіз, жүйкені емес", "Share subscriptions, not stress"],
  "SubShare считает доли в семейных тарифах Netflix, Spotify, YouTube и других подписок, каждый месяц выставляет счета и сам напоминает друзьям об оплате в Telegram.": [
    "SubShare Netflix, Spotify, YouTube және басқа жазылымдардың отбасылық тарифтеріндегі үлестерді есептейді, ай сайын шот шығарады және достарыңызға төлемді Telegram-да өзі еске салады.",
    "SubShare splits family plans for Netflix, Spotify, YouTube and other subscriptions, sends bills every month and reminds your friends to pay in Telegram.",
  ],
  "Создать аккаунт": ["Аккаунт ашу", "Create an account"],
  "Скачать приложение": ["Қосымшаны жүктеу", "Download the app"],

  // Картинка с телефоном
  "Netflix вскладчину": ["Netflix бірге", "Shared Netflix"],
  "6 000 ₸ в месяц · 4 человека": ["Айына 6 000 ₸ · 4 адам", "6 000 ₸ a month · 4 people"],
  "Доля каждого": ["Әркімнің үлесі", "Each person's share"],
  "Айгерим": ["Айгерім", "Aigerim"],
  "Данияр": ["Данияр", "Daniyar"],
  "Мадина": ["Мадина", "Madina"],
  "Оплачено": ["Төленді", "Paid"],
  "Ждёт подтверждения": ["Растауды күтуде", "Awaiting confirmation"],
  "Ждём оплату": ["Төлемді күтеміз", "Awaiting payment"],
  "Мадина, напоминаем: 1 500 ₸ за Netflix до 5 числа": ["Мадина, еске саламыз: Netflix үшін 1 500 ₸ айдың 5-іне дейін", "Madina, a reminder: 1 500 ₸ for Netflix by the 5th"],

  // Как это работает
  "Создайте группу": ["Топ құрыңыз", "Create a group"],
  "Выберите подписку, укажите цену и день оплаты — SubShare сразу посчитает долю каждого.": [
    "Жазылымды таңдап, бағасы мен төлем күнін көрсетіңіз — SubShare әркімнің үлесін бірден есептейді.",
    "Pick a subscription, enter its price and payment day — SubShare instantly works out everyone's share.",
  ],
  "Добавьте друзей": ["Достарыңызды қосыңыз", "Add your friends"],
  "По номеру телефона. Когда друг войдёт в SubShare с этим номером, группа уже будет у него.": [
    "Телефон нөмірі бойынша. Досыңыз осы нөмірмен SubShare-ге кіргенде, топ оның өзінде болады.",
    "By phone number. When a friend signs in to SubShare with that number, the group will already be there.",
  ],
  "Получайте доли": ["Үлестерді алыңыз", "Collect the shares"],
  "Друзья переводят долю вам напрямую — через Kaspi или любой банк — и отмечают перевод, а вы подтверждаете. Счета и напоминания SubShare присылает сам.": [
    "Достарыңыз үлесін сізге тікелей аударады — Kaspi немесе кез келген банк арқылы — және аударымды белгілейді, ал сіз растайсыз. Шоттар мен еске салуларды SubShare өзі жібереді.",
    "Friends send their share straight to you — via Kaspi or any bank — and mark it as sent, and you confirm. SubShare sends the bills and reminders itself.",
  ],

  // Почему SubShare
  "Почему SubShare": ["Неліктен SubShare", "Why SubShare"],
  "Честный расчёт": ["Әділ есеп", "Fair split"],
  "Цена делится поровну в целых тенге, а если не делится ровно — лишние тенге раздаются по одному.": [
    "Баға бүтін теңгемен тең бөлінеді, ал тең бөлінбесе — артық теңгелер бір-бірден таратылады.",
    "The price is split equally in whole tenge; if it doesn't divide evenly, the extra tenge are handed out one by one.",
  ],
  "Видно, кто оплатил": ["Кім төлегені көрінеді", "See who has paid"],
  "У каждого участника — свой статус оплаты. Не нужно листать переписку и выписки.": [
    "Әр қатысушының өз төлем мәртебесі бар. Хат алмасу мен үзінділерді ақтарудың қажеті жоқ.",
    "Every member has a payment status. No more scrolling through chats and bank statements.",
  ],
  "Напоминания в Telegram": ["Telegram-да еске салу", "Reminders in Telegram"],
  "Бот напомнит о сроке оплаты — больше не нужно неловко писать друзьям самому.": [
    "Бот төлем мерзімін еске салады — достарыңызға өзіңіз ыңғайсызданып жазудың қажеті жоқ.",
    "The bot reminds everyone when payment is due, so you don't have to awkwardly chase friends yourself.",
  ],
  "Без комиссий": ["Комиссиясыз", "No fees"],
  "Деньги не проходят через SubShare: друзья переводят их вам напрямую. Данных карт мы не получаем.": [
    "Ақша SubShare арқылы өтпейді: достарыңыз оны сізге тікелей аударады. Карта деректерін біз алмаймыз.",
    "Money never goes through SubShare: friends send it straight to you. We never see card details.",
  ],

  // Скачать
  "Скачайте SubShare": ["SubShare-ді жүктеп алыңыз", "Get SubShare"],
  "Приложения пока нет в Google Play — скачайте установочный файл (APK) здесь.": [
    "Қосымша әзірге Google Play-де жоқ — орнату файлын (APK) осы жерден жүктеңіз.",
    "The app isn't on Google Play yet — download the installation file (APK) here.",
  ],
  "Скачать APK": ["APK жүктеу", "Download APK"],
  "Откройте скачанный файл SubShare.apk": ["Жүктелген SubShare.apk файлын ашыңыз", "Open the downloaded SubShare.apk file"],
  "Если Android спросит — разрешите установку из браузера": ["Android сұраса — браузерден орнатуға рұқсат беріңіз", "If Android asks, allow installing from your browser"],
  "Войдите через Telegram": ["Telegram арқылы кіріңіз", "Sign in with Telegram"],
  "iPhone и компьютер": ["iPhone және компьютер", "iPhone and computer"],
  "Веб-версия работает прямо в браузере — всё то же, что в приложении. На iPhone её можно добавить на экран «Домой»: Safari → «Поделиться» → «На экран „Домой“».": [
    "Веб-нұсқа тікелей браузерде жұмыс істейді — қосымшадағының бәрі бар. iPhone-да оны басты экранға қосуға болады: Safari → «Бөлісу» → «На экран „Домой“».",
    "The web version works right in your browser and does everything the app does. On iPhone you can add it to the Home Screen: Safari → Share → Add to Home Screen.",
  ],
  "Открыть веб-версию": ["Веб-нұсқаны ашу", "Open the web version"],

  // Вопросы и ответы
  "Вопросы и ответы": ["Сұрақтар мен жауаптар", "Questions and answers"],
  "Это бесплатно?": ["Бұл тегін бе?", "Is it free?"],
  "Да. SubShare бесплатный: без рекламы, подписок и комиссий.": ["Иә. SubShare тегін: жарнамасыз, жазылымсыз және комиссиясыз.", "Yes. SubShare is free: no ads, no fees, no commissions."],
  "Деньги проходят через SubShare?": ["Ақша SubShare арқылы өте ме?", "Does money go through SubShare?"],
  "Нет. Участники переводят свою долю владельцу группы напрямую — через Kaspi или любой банк по номеру телефона. В SubShare перевод только отмечается.": [
    "Жоқ. Қатысушылар өз үлесін топ иесіне тікелей аударады — Kaspi немесе кез келген банк арқылы телефон нөмірі бойынша. SubShare-де аударым тек белгіленеді.",
    "No. Members send their share directly to the group owner — via Kaspi or any bank by phone number. SubShare only records the transfer.",
  ],
  "Друзьям тоже нужно регистрироваться?": ["Достарға да тіркелу керек пе?", "Do my friends need to sign up too?"],
  "Добавить друга в группу можно по номеру сразу. Чтобы видеть свои счета и отмечать переводы, он входит в SubShare с этим номером — и группа уже будет у него.": [
    "Досыңызды топқа нөмірі бойынша бірден қосуға болады. Өз шоттарын көріп, аударымдарды белгілеу үшін ол SubShare-ге осы нөмірмен кіреді — топ оның өзінде болады.",
    "You can add a friend to a group by number right away. To see their bills and mark payments, they sign in to SubShare with that number, and the group will already be there.",
  ],
  "Вы продаёте аккаунты Netflix или Spotify?": ["Netflix немесе Spotify аккаунттарын сатасыздар ма?", "Do you sell Netflix or Spotify accounts?"],
  "Нет. SubShare не продаёт и не перепродаёт аккаунты сервисов — только помогает вести учёт оплаты внутри вашей группы.": [
    "Жоқ. SubShare сервис аккаунттарын сатпайды және қайта сатпайды — тек тобыңыздағы төлемдерді есепке алуға көмектеседі.",
    "No. SubShare doesn't sell or resell service accounts — it only helps you keep track of payments within your group.",
  ],
  "Как удалить аккаунт?": ["Аккаунтты қалай өшіруге болады?", "How do I delete my account?"],
  "В приложении: Профиль → «Удалить аккаунт». Данные удаляются сразу и навсегда.": [
    "Қосымшада: Профиль → «Аккаунтты өшіру». Деректер бірден және біржола өшіріледі.",
    "In the app: Profile → “Delete account”. Your data is deleted immediately and permanently.",
  ],

  // Подвал
  "Учебный проект команды SubShare · Казахстан, 2026": ["SubShare командасының оқу жобасы · Қазақстан, 2026", "A student project by the SubShare team · Kazakhstan, 2026"],
  "Политика конфиденциальности": ["Құпиялылық саясаты", "Privacy policy"],
  "Условия использования": ["Пайдалану шарттары", "Terms of use"],
  "Поддержка": ["Қолдау", "Support"],

  // Окно входа
  "Аккаунт SubShare": ["SubShare аккаунты", "SubShare account"],
  "Готовим ссылку для входа…": ["Кіру сілтемесін дайындап жатырмыз…", "Preparing your sign-in link…"],
  "Вход через Telegram": ["Telegram арқылы кіру", "Sign in with Telegram"],
  "Аккаунт создастся сам: Telegram подтвердит ваш номер, пароль не нужен.": [
    "Аккаунт өздігінен ашылады: Telegram нөміріңізді растайды, құпиясөз керек емес.",
    "Your account is created automatically: Telegram confirms your number, no password needed.",
  ],
  "Открыть Telegram": ["Telegram-ды ашу", "Open Telegram"],
  "Или наведите камеру телефона на код": ["Немесе телефон камерасын кодқа бағыттаңыз", "Or point your phone camera at the code"],
  "В боте SubShare нажмите «Поделиться номером», а потом вернитесь сюда — вход произойдёт сам.": [
    "SubShare ботында «Нөмірмен бөлісу» батырмасын басып, осында оралыңыз — кіру өздігінен орындалады.",
    "In the SubShare bot, tap “Share phone number”, then come back here — you'll be signed in automatically.",
  ],
  "Ждём подтверждения…": ["Растауды күтудеміз…", "Waiting for confirmation…"],
  "Продолжая, вы принимаете документы SubShare:": ["Жалғастыра отырып, сіз SubShare құжаттарын қабылдайсыз:", "By continuing, you accept the SubShare documents:"],
  "Готово!": ["Дайын!", "Done!"],
  "Аккаунт SubShare готов. Пользуйтесь им в браузере или в приложении для Android.": [
    "SubShare аккаунты дайын. Оны браузерде немесе Android қосымшасында пайдаланыңыз.",
    "Your SubShare account is ready. Use it in your browser or in the Android app.",
  ],
  "Скачать для Android": ["Android-ке жүктеу", "Download for Android"],
  "Не получилось": ["Болмады", "Something went wrong"],
  "Попробовать ещё раз": ["Қайталап көру", "Try again"],

  // Ошибки (script.js)
  "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.": [
    "Сервермен байланыс жоқ. Интернетті тексеріп, қайталап көріңіз.",
    "Can't reach the server. Check your internet and try again.",
  ],
  "Что-то пошло не так. Попробуйте ещё раз.": ["Бірдеңе дұрыс болмады. Қайталап көріңіз.", "Something went wrong. Please try again."],

  // Регистрация по почте
  "Как удобнее зарегистрироваться?": ["Қалай тіркелген ыңғайлы?", "How would you like to sign up?"],
  "Через Telegram": ["Telegram арқылы", "With Telegram"],
  "По почте": ["Пошта арқылы", "With email"],
  "Уже зарегистрированы по почте?": ["Пошта арқылы тіркелгенсіз бе?", "Already signed up with email?"],
  "Регистрация по почте": ["Пошта арқылы тіркелу", "Sign up with email"],
  "Имя": ["Аты", "Name"],
  "Почта": ["Пошта", "Email"],
  "Номер телефона": ["Телефон нөмірі", "Phone number"],
  "По этому номеру друзья добавят вас в группу": ["Достарыңыз сізді топқа осы нөмір бойынша қосады", "Friends will add you to groups by this number"],
  "Придумайте пароль": ["Құпиясөз ойлап табыңыз", "Create a password"],
  "Не короче 8 символов": ["Кемінде 8 таңба", "At least 8 characters"],
  "Получить код": ["Код алу", "Get a code"],
  "Код из письма": ["Хаттағы код", "Code from the email"],
  "Подтвердить": ["Растау", "Confirm"],
  "Отправить код ещё раз": ["Кодты қайта жіберу", "Send the code again"],
  "Изменить данные": ["Деректерді өзгерту", "Change details"],
  "Введите имя": ["Атыңызды енгізіңіз", "Enter your name"],
  "Проверьте адрес почты": ["Пошта мекенжайын тексеріңіз", "Check the email address"],
  "Номер — 10 цифр после +7": ["Нөмір — +7-ден кейін 10 цифр", "The number is 10 digits after +7"],
  "Пароль — не короче 8 символов": ["Құпиясөз — кемінде 8 таңба", "The password must be at least 8 characters"],
  "Введите 6 цифр из письма": ["Хаттағы 6 цифрды енгізіңіз", "Enter the 6 digits from the email"],
  "Мы отправили код на {email}. Если письма нет, проверьте папку «Спам».": ["Кодты {email} поштасына жібердік. Хат келмесе, «Спам» қалтасын тексеріңіз.", "We've sent a code to {email}. If you can't find it, check your spam folder."],
  "Отправили новый код на {email}. Если письма нет, проверьте папку «Спам».": ["Жаңа кодты {email} поштасына жібердік. Хат келмесе, «Спам» қалтасын тексеріңіз.", "We've sent a new code to {email}. If you can't find it, check your spam folder."],
  "Регистрация за минуту — через Telegram или по почте": ["Бір минутта тіркелу — Telegram немесе пошта арқылы", "Sign up in a minute — with Telegram or email"],
  "Как зарегистрироваться?": ["Қалай тіркелуге болады?", "How do I sign up?"],
  "Через Telegram: он сам подтвердит ваш номер, пароль не нужен, а бот будет напоминать об оплате. Или по почте: придёт письмо с кодом, а входить вы будете по почте и паролю.": ["Telegram арқылы: ол нөміріңізді өзі растайды, құпиясөз керек емес, ал бот төлем туралы еске салып отырады. Немесе пошта арқылы: кодпен хат келеді, ал кейін пошта мен құпиясөз арқылы кіресіз.", "With Telegram: it confirms your number itself, no password needed, and the bot will remind you about payments. Or with email: you'll get a code by email and then sign in with your email and password."],
};
