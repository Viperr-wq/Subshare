// Условия использования на трёх языках. Ссылки на них — на экране входа и в профиле.
// Меняете текст — поменяйте его во всех трёх языках и обновите дату.
import { Document } from "../components/Document";
import { getLanguage } from "../lib/i18n";

const TEXT = {
  ru: {
    title: "Условия использования SubShare",
    intro: "Действуют с 9 ноября 2026 года. Входя в SubShare, вы принимаете эти условия.",
    sections: [
      [
        "Что такое SubShare",
        "Приложение помогает делить стоимость подписки между участниками группы: считает доли, выставляет счета и напоминает об оплате. SubShare бесплатный.",
      ],
      [
        "Деньги",
        "Деньги через SubShare не проходят: участники сами переводят свою долю владельцу группы (например, через Kaspi), а в приложении это только отмечается. SubShare не отвечает за переводы между участниками.",
      ],
      [
        "Сервисы подписок",
        "SubShare не продаёт аккаунты и не связан с Netflix, Spotify, YouTube, Яндексом и другими сервисами; их названия принадлежат их владельцам. Соблюдайте правила сервиса о том, с кем можно делиться подпиской.",
      ],
      [
        "Ваши обязанности",
        "Указывайте верные данные, добавляйте в группы только тех, кто согласен, и не используйте SubShare, чтобы обманывать других людей. В чатах не оскорбляйте людей и не присылайте рекламу, а оценки ставьте честно. Владелец группы может удалять сообщения в её чате.",
      ],
      [
        "«Как есть»",
        "SubShare — учебный проект: приложение предоставляется «как есть», возможны ошибки и перерывы в работе. Мы стараемся быстро их исправлять.",
      ],
      [
        "Удаление аккаунта",
        "Вы можете в любой момент удалить аккаунт в профиле. Мы можем заблокировать аккаунт, если им пользуются для обмана.",
      ],
      ["Связь", "Вопросы — через «Написать в поддержку» в профиле."],
    ],
  },
  kk: {
    title: "SubShare пайдалану шарттары",
    intro:
      "2026 жылғы 9 қарашадан бастап қолданылады. SubShare-ге кіре отырып, сіз осы шарттарды қабылдайсыз.",
    sections: [
      [
        "SubShare деген не",
        "Қосымша жазылым құнын топ қатысушылары арасында бөлуге көмектеседі: үлестерді есептейді, шот шығарады және төлем туралы еске салады. SubShare тегін.",
      ],
      [
        "Ақша",
        "Ақша SubShare арқылы өтпейді: қатысушылар өз үлесін топ иесіне өздері аударады (мысалы, Kaspi арқылы), ал қосымшада бұл тек белгіленеді. SubShare қатысушылар арасындағы аударымдарға жауап бермейді.",
      ],
      [
        "Жазылым сервистері",
        "SubShare аккаунт сатпайды және Netflix, Spotify, YouTube, Яндекс және басқа сервистермен байланысты емес; олардың атаулары иелеріне тиесілі. Жазылыммен кіммен бөлісуге болатыны туралы сервис ережелерін сақтаңыз.",
      ],
      [
        "Сіздің міндеттеріңіз",
        "Дұрыс деректерді көрсетіңіз, топқа тек келісетін адамдарды қосыңыз және SubShare-ді басқаларды алдау үшін пайдаланбаңыз. Чаттарда адамдарды қорламаңыз және жарнама жібермеңіз, ал бағаларды әділ қойыңыз. Топ иесі оның чатындағы хабарламаларды өшіре алады.",
      ],
      [
        "«Қалай бар болса, солай»",
        "SubShare — оқу жобасы: қосымша «қалай бар болса, солай» ұсынылады, қателер мен үзілістер болуы мүмкін. Біз оларды тез түзетуге тырысамыз.",
      ],
      [
        "Аккаунтты өшіру",
        "Аккаунтты профильде кез келген уақытта өшіре аласыз. Аккаунт алдау үшін пайдаланылса, оны бұғаттауымыз мүмкін.",
      ],
      ["Байланыс", "Сұрақтар — профильдегі «Қолдау қызметіне жазу» арқылы."],
    ],
  },
  en: {
    title: "SubShare Terms of Use",
    intro: "Effective November 9, 2026. By signing in to SubShare, you accept these terms.",
    sections: [
      [
        "What SubShare is",
        "The app helps split the cost of a subscription among group members: it calculates shares, creates bills and reminds about payments. SubShare is free.",
      ],
      [
        "Money",
        "Money doesn't go through SubShare: members send their share to the group owner themselves (for example, via Kaspi), and the app only records it. SubShare isn't responsible for transfers between members.",
      ],
      [
        "Subscription services",
        "SubShare doesn't sell accounts and isn't affiliated with Netflix, Spotify, YouTube, Yandex or other services; their names belong to their owners. Follow each service's rules about whom you may share a subscription with.",
      ],
      [
        "Your responsibilities",
        "Provide accurate information, add only people who agree to be in a group, and don't use SubShare to deceive others. Don't insult people or send ads in chats, and rate others fairly. A group owner can delete messages in the group's chat.",
      ],
      [
        "“As is”",
        "SubShare is a student project provided “as is”; errors and interruptions are possible. We try to fix them quickly.",
      ],
      [
        "Deleting your account",
        "You can delete your account in your profile at any time. We may block an account that is used for fraud.",
      ],
      ["Contact", "Questions — via “Contact support” in your profile."],
    ],
  },
};

export default function TermsScreen() {
  return <Document doc={TEXT[getLanguage()]} />;
}
