// Скрипт Google для писем SubShare (Google Apps Script). На нашем сервере он не запускается:
// код целиком вставляют на https://script.google.com под Gmail, с которой пойдут письма,
// и разворачивают как веб-приложение — по шагам в DEPLOY.md, шаг 2а.
// Сервер (app/mail.py) присылает адрес, тему и текст — скрипт отправляет письмо от имени этой Gmail.
// Бесплатно, до 100 писем в день.

// Секрет — то же значение, что MAIL_SECRET в Render (не короче 20 символов). Вставьте его между
// кавычками в редакторе на script.google.com. В этот файл в проекте не вписывать — он попадёт в git!
const SECRET = "";

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  if (SECRET.length < 20 || data.secret !== SECRET) { // без секрета или с чужим — не отправляем
    return ContentService.createTextOutput("wrong secret");
  }
  try {
    MailApp.sendEmail({ to: data.to, subject: data.subject, body: data.text, name: "SubShare" });
  } catch (error) {
    return ContentService.createTextOutput("error: " + error.message); // например, кончился лимит на день
  }
  return ContentService.createTextOutput("ok");
}
