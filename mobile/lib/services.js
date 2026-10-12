// Популярные подписки — для быстрого создания группы и цветных значков.
// maxMembers — сколько человек обычно допускает семейный тариф (в форме можно поменять).
import { colors } from "./theme";

export const SERVICES = [
  { name: "Netflix", color: "#E50914", maxMembers: 4 },
  { name: "Spotify", color: "#1DB954", maxMembers: 6 },
  { name: "YouTube Premium", color: "#FF0033", maxMembers: 6 },
  { name: "Яндекс Плюс", color: "#7B3FE4", maxMembers: 4 },
  { name: "Apple Music", color: "#FA243C", maxMembers: 6 },
  { name: "Microsoft 365", color: "#D83B01", maxMembers: 6 },
];

// Значок для своей подписки, которой нет в списке
export const OTHER_SERVICE = { name: "Другое", color: colors.sapphire, maxMembers: 4 };

// Находит подписку из списка по названию (без учёта регистра). Нет в списке — null.
export function findService(serviceName) {
  const key = String(serviceName).trim().toLowerCase();
  return SERVICES.find((s) => s.name.toLowerCase() === key) || null;
}
