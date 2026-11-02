// Версия приложения и скачивание APK для Android.
//
// Приложение ставят не из Google Play, а файлом APK с сайта, поэтому само оно
// не обновится. При запуске сверяемся с последним выпуском (Release) на GitHub:
// если там версия новее — предлагаем скачать. Как выпустить новую версию — DEPLOY.md.
import Constants from "expo-constants";
import { Platform } from "react-native";

const REPO = "Viperr-wq/Subshare";

// Ссылка всегда ведёт на APK из последнего выпуска — файл в выпуске должен называться SubShare.apk
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/SubShare.apk`;

// Куда писать о проблемах и вопросах: раздел Issues репозитория на GitHub
export const SUPPORT_URL = `https://github.com/${REPO}/issues`;

export const APP_VERSION = Constants.expoConfig?.version || "1.0.0";

// «1.10.0» новее «1.9.2»? Сравниваем числа по очереди: 1 = 1, потом 10 > 9
function isNewer(latest, current) {
  const a = latest.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

// Номер новой версии («1.2.0») или null. Только в Android-приложении: сайт и так всегда свежий
export async function checkForUpdate() {
  if (Platform.OS !== "android") return null;
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    const release = await response.json();
    const latest = String(release.tag_name || "").replace(/^v/, "");
    return latest && isNewer(latest, APP_VERSION) ? latest : null;
  } catch {
    return null; // нет сети или выпусков ещё нет — проверим при следующем запуске
  }
}
