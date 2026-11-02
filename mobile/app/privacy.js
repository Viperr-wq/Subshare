// Политика конфиденциальности на трёх языках. Ссылки на неё — на экране входа и в профиле.
// Меняете текст — поменяйте его во всех трёх языках и обновите дату.
import { Document } from "../components/Document";
import { getLanguage } from "../lib/i18n";

const TEXT = {
  ru: {
    title: "Политика конфиденциальности SubShare",
    intro:
      "Действует с 2 ноября 2026 года. SubShare — бесплатное приложение для учёта совместной оплаты подписок, учебный проект команды SubShare (Казахстан). Пользуясь приложением, вы соглашаетесь на обработку ваших данных так, как описано ниже.",
    sections: [
      [
        "Какие данные мы храним",
        "Имя и номер телефона из вашего Telegram (вы сами делитесь ими при входе), id в Telegram и выбранный язык; ваши группы, доли, счета и отметки об оплате; имена и номера людей, которых вы добавляете в группы.",
      ],
      [
        "Зачем",
        "Чтобы вы могли войти, чтобы считать доли и выставлять счета, показывать участникам, кому и сколько переводить, и присылать напоминания в Telegram. Рекламы нет, данные мы не продаём.",
      ],
      [
        "Кто видит ваши данные",
        "Участники ваших групп видят ваше имя, долю и статус оплаты. Номер владельца группы видят её участники — чтобы перевести деньги. Посторонние ваших данных не видят.",
      ],
      [
        "Друзья, которых вы добавляете",
        "Добавляя человека по номеру, вы подтверждаете, что он согласен быть в группе. Он может войти со своим номером и удалить аккаунт в любой момент.",
      ],
      [
        "Где хранятся данные",
        "На серверах хостинга Render и базы данных Neon в Германии (Франкфурт). Сообщения бота отправляются через Telegram. Деньги через SubShare не проходят, данные банковских карт мы не получаем.",
      ],
      [
        "Как удалить данные",
        "Профиль → «Удалить аккаунт»: профиль, ваши группы со счетами и ваше участие в чужих группах удаляются сразу и навсегда.",
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
      "2026 жылғы 2 қарашадан бастап қолданылады. SubShare — жазылымдарды бірге төлеуді есепке алуға арналған тегін қосымша, SubShare командасының оқу жобасы (Қазақстан). Қосымшаны пайдалана отырып, сіз деректеріңіздің төменде сипатталғандай өңделуіне келісесіз.",
    sections: [
      [
        "Қандай деректерді сақтаймыз",
        "Telegram-дағы атыңыз бен телефон нөміріңіз (кіру кезінде өзіңіз бөлісесіз), Telegram id және таңдалған тіл; топтарыңыз, үлестеріңіз, шоттарыңыз және төлем белгілері; топқа қосқан адамдардың аттары мен нөмірлері.",
      ],
      [
        "Не үшін",
        "Кіру, үлестерді есептеу және шот шығару, қатысушыларға кімге және қанша аудару керегін көрсету, Telegram арқылы еске салу үшін. Жарнама жоқ, деректерді сатпаймыз.",
      ],
      [
        "Деректеріңізді кім көреді",
        "Топтарыңыздың қатысушылары атыңызды, үлесіңізді және төлем мәртебесін көреді. Топ иесінің нөмірін ақша аудару үшін оның қатысушылары көреді. Бөтен адамдар деректеріңізді көрмейді.",
      ],
      [
        "Сіз қосатын достар",
        "Адамды нөмірі бойынша қосқанда, оның топта болуға келісетінін растайсыз. Ол өз нөмірімен кіріп, аккаунтын кез келген уақытта өшіре алады.",
      ],
      [
        "Деректер қайда сақталады",
        "Render хостингі мен Neon дерекқорының Германиядағы (Франкфурт) серверлерінде. Бот хабарламалары Telegram арқылы жіберіледі. Ақша SubShare арқылы өтпейді, банк карталарының деректерін алмаймыз.",
      ],
      [
        "Деректерді қалай өшіруге болады",
        "Профиль → «Аккаунтты өшіру»: профиль, шоттарымен бірге топтарыңыз және басқа топтардағы қатысуыңыз бірден және біржола өшіріледі.",
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
      "Effective November 2, 2026. SubShare is a free app for tracking shared subscription payments, a student project by the SubShare team (Kazakhstan). By using the app, you agree to the processing of your data as described below.",
    sections: [
      [
        "What we store",
        "Your name and phone number from Telegram (you share them yourself when signing in), your Telegram id and chosen language; your groups, shares, bills and payment marks; names and numbers of the people you add to groups.",
      ],
      [
        "Why",
        "To sign you in, calculate shares and create bills, show members whom to pay and how much, and send reminders in Telegram. There are no ads, and we don't sell data.",
      ],
      [
        "Who sees your data",
        "Members of your groups see your name, share and payment status. Group members see the owner's phone number so they can send money. Strangers can't see your data.",
      ],
      [
        "Friends you add",
        "When you add someone by phone number, you confirm that they agree to be in the group. They can sign in with their number and delete their account at any time.",
      ],
      [
        "Where data is stored",
        "On Render hosting and Neon database servers in Germany (Frankfurt). Bot messages are sent via Telegram. Money doesn't go through SubShare, and we never receive bank card details.",
      ],
      [
        "How to delete your data",
        "Profile → “Delete account”: your profile, your groups with their bills and your membership in other groups are deleted immediately and permanently.",
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
