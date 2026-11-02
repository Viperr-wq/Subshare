// Настройки приложения — в app.json. Здесь только то, что зависит от сборки.
//
// На хостинге на главной странице — сайт (папка site/), а веб-версия приложения живёт
// по адресу /app. Поэтому сборка для Render задаёт EXPO_BASE_URL=/app (см. render.yaml).
// На компьютере и в APK этой переменной нет — приложение открывается с корня, как раньше.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, baseUrl: process.env.EXPO_BASE_URL || "" },
});
