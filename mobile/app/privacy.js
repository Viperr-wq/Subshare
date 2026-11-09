// Политика конфиденциальности на трёх языках. Ссылки на неё — на экране входа и в профиле.
// Меняете текст — поменяйте его во всех трёх языках и обновите дату.
import { Document } from "../components/Document";
import { getLanguage } from "../lib/i18n";

const TEXT = {
  ru: {
    title: "Политика конфиденциальности SubShare",
    intro:
      "Действует с 9 ноября 2026 года. SubShare — бесплатное приложение для учёта совместной оплаты подписок, учебный проект команды SubShare (Казахстан). Пользуясь приложением, вы соглашаетесь на обработку ваших данных так, как описано ниже.",
    sections: [
      [
        "Какие данные мы храним",
        "Имя и номер телефона из вашего Telegram (вы сами делитесь ими при входе) и id в Telegram — или, если вы регистрируетесь по почте, имя, номер, адрес почты и пароль (храним только его хеш — по нему пароль не узнать); выбранный язык; ваши группы, доли, счета и отметки об оплате; сообщения в чатах групп и оценки, которые участники ставят друг другу; имена и номера людей, которых вы добавляете в группы.",
      ],
      [
        "Зачем",
        "Чтобы вы могли войти, чтобы считать доли и выставлять счета, показывать участникам, кому и сколько переводить, присылать напоминания в Telegram и чтобы участники группы могли переписываться в её чате. Рекламы нет, данные мы не продаём.",
      ],
      [
        "Кто видит ваши данные",
        "Участники ваших групп видят ваше имя, долю, статус оплаты и ваши сообщения в чате группы. Номер владельца группы видят её участники — чтобы перевести деньги. Оценки анонимны: участники видят только среднюю оценку человека и число оценок, а кто сколько поставил — нет. Посторонние ваших данных не видят.",
      ],
      [
        "Друзья, которых вы добавляете",
        "Добавляя человека по номеру, вы подтверждаете, что он согласен быть в группе. Он может войти со своим номером и удалить аккаунт в любой момент.",
      ],
      [
        "Где хранятся данные",
        "На серверах хостинга Render и базы данных Neon в Германии (Франкфурт). Сообщения бота отправляются через Telegram, письма с кодами — через Gmail (Google). Деньги через SubShare не проходят, данные банковских карт мы не получаем.",
      ],
      [
        "Как удалить данные",
        "Своё сообщение в чате можно удалить, подержав на нём палец. Профиль → «Удалить аккаунт»: профиль, ваши группы со счетами и чатами, ваше участие в чужих группах, ваши сообщения и оценки удаляются сразу и навсегда.",
      ],
      [
        "Связь",
        "Вопросы и просьбы — через «Написать в поддержку» в профиле (GitHub Issues). Если политика изменится, новая версия появится в приложении.",
      ],
    ],
  },
  kk: {
    title: "SubShare құпиялылық саясаты",
    intro:
      "2026 жылғы 9 қарашадан бастап қолданылады. SubShare — жазылымдарды бірге төлеуді есепке алуға арналған тегін қосымша, SubShare командасының оқу жобасы (Қазақстан). Қосымшаны пайдалана отырып, сіз деректеріңіздің төменде сипатталғандай өңделуіне келісесіз.",
    sections: [
      [
        "Қандай деректерді сақтаймыз",
        "Telegram-дағы атыңыз бен телефон нөміріңіз (кіру кезінде өзіңіз бөлісесіз) және Telegram id — немесе пошта арқылы тіркелсеңіз, атыңыз, нөміріңіз, пошта мекенжайыңыз және құпиясөзіңіз (тек оның хешін сақтаймыз — одан құпиясөзді білу мүмкін емес); таңдалған тіл; топтарыңыз, үлестеріңіз, шоттарыңыз және төлем белгілері; топ чаттарындағы хабарламалар және қатысушылардың бір-біріне қойған бағалары; топқа қосқан адамдардың аттары мен нөмірлері.",
      ],
      [
        "Не үшін",
        "Кіру, үлестерді есептеу және шот шығару, қатысушыларға кімге және қанша аудару керегін көрсету, Telegram арқылы еске салу және топ қатысушылары топ чатында хат алмаса алуы үшін. Жарнама жоқ, деректерді сатпаймыз.",
      ],
      [
        "Деректеріңізді кім көреді",
        "Топтарыңыздың қатысушылары атыңызды, үлесіңізді, төлем мәртебесін және топ чатындағы хабарламаларыңызды көреді. Топ иесінің нөмірін ақша аудару үшін оның қатысушылары көреді. Бағалар жасырын: қатысушылар адамның тек орташа бағасы мен бағалар санын көреді, кім қанша қойғанын көрмейді. Бөтен адамдар деректеріңізді көрмейді.",
      ],
      [
        "Сіз қосатын достар",
        "Адамды нөмірі бойынша қосқанда, оның топта болуға келісетінін растайсыз. Ол өз нөмірімен кіріп, аккаунтын кез келген уақытта өшіре алады.",
      ],
      [
        "Деректер қайда сақталады",
        "Render хостингі мен Neon дерекқорының Германиядағы (Франкфурт) серверлерінде. Бот хабарламалары Telegram арқылы, кодтары бар хаттар Gmail (Google) арқылы жіберіледі. Ақша SubShare арқылы өтпейді, банк карталарының деректерін алмаймыз.",
      ],
      [
        "Деректерді қалай өшіруге болады",
        "Чаттағы өз хабарламаңызды оны басып тұру арқылы өшіруге болады. Профиль → «Аккаунтты өшіру»: профиль, шоттары мен чаттарымен бірге топтарыңыз, басқа топтардағы қатысуыңыз, хабарламаларыңыз бен бағаларыңыз бірден және біржола өшіріледі.",
      ],
      [
        "Байланыс",
        "Сұрақтар мен өтініштер — профильдегі «Қолдау қызметіне жазу» арқылы (GitHub Issues). Саясат өзгерсе, жаңа нұсқасы қосымшада пайда болады.",
      ],
    ],
  },
  en: {
    title: "SubShare Privacy Policy",
    intro:
      "Effective November 9, 2026. SubShare is a free app for tracking shared subscription payments, a student project by the SubShare team (Kazakhstan). By using the app, you agree to the processing of your data as described below.",
    sections: [
      [
        "What we store",
        "Your name and phone number from Telegram (you share them yourself when signing in) and your Telegram id — or, if you sign up with email, your name, number, email address and password (we only store its hash, which can't be turned back into the password); your chosen language; your groups, shares, bills and payment marks; messages in group chats and the ratings members give each other; names and numbers of the people you add to groups.",
      ],
      [
        "Why",
        "To sign you in, calculate shares and create bills, show members whom to pay and how much, send reminders in Telegram, and let group members talk in the group chat. There are no ads, and we don't sell data.",
      ],
      [
        "Who sees your data",
        "Members of your groups see your name, share, payment status and your messages in the group chat. Group members see the owner's phone number so they can send money. Ratings are anonymous: members see only a person's average rating and the number of ratings, not who gave what. Strangers can't see your data.",
      ],
      [
        "Friends you add",
        "When you add someone by phone number, you confirm that they agree to be in the group. They can sign in with their number and delete their account at any time.",
      ],
      [
        "Where data is stored",
        "On Render hosting and Neon database servers in Germany (Frankfurt). Bot messages are sent via Telegram, and emails with codes via Gmail (Google). Money doesn't go through SubShare, and we never receive bank card details.",
      ],
      [
        "How to delete your data",
        "To delete your message in a chat, press and hold it. Profile → “Delete account”: your profile, your groups with their bills and chats, your membership in other groups, and your messages and ratings are deleted immediately and permanently.",
      ],
      [
        "Contact",
        "Questions and requests — via “Contact support” in your profile (GitHub Issues). If this policy changes, the new version will appear in the app.",
      ],
    ],
  },
};

export default function PrivacyScreen() {
  return <Document doc={TEXT[getLanguage()]} />;
}
