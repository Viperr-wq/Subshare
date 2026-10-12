// Вкладка «Профиль»: кто вошёл, немного статистики, как работает SubShare и выход.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useDialogs } from "../../lib/dialogs";
import { formatMoney, formatPhone, plural } from "../../lib/format";
import { colors, fonts, radius } from "../../lib/theme";
import { useLoad } from "../../lib/useLoad";

const STEPS = [
  "Владелец создаёт группу и добавляет друзей по номеру телефона",
  "Раз в месяц владелец выставляет счета, а SubShare сам считает долю каждого",
  "Участники переводят долю владельцу (например, через Kaspi) и отмечают оплату",
];

// Экономия в месяц: в каждой группе человек платит только свою долю, а не всю цену подписки
function monthlySavings(groups, userId) {
  let total = 0;
  for (const group of groups) {
    const me = group.members.find((member) => member.user_id === userId);
    if (me) total += group.total_price - me.share;
  }
  return total;
}

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { confirm } = useDialogs();
  // Группы нужны только для статистики, поэтому профиль показываем сразу, не дожидаясь их:
  // даже без связи с сервером из аккаунта можно выйти
  const { data: groups, error, reload } = useLoad(() => api.getUserGroups(user.id), [user?.id]);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  async function handleSignOut() {
    const ok = await confirm({
      title: "Выйти из аккаунта?",
      message: "Группы и платежи сохранятся. Чтобы вернуться, войдите по номеру телефона.",
      confirmText: "Выйти",
      danger: true,
    });
    if (ok) await signOut();
  }

  // На случай, если экран успеет отрисоваться уже после выхода из аккаунта
  if (!user) return null;

  return (
    <Screen safeTop refreshing={refreshing} onRefresh={refresh}>
      <Text style={styles.title}>Профиль</Text>

      <View style={styles.profileShadow}>
        <LinearGradient
          colors={[colors.sapphire, colors.violet]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profile}
        >
          {/* Полупрозрачные круги — просто украшение фона */}
          <View style={[styles.circle, styles.circleTop]} />
          <View style={[styles.circle, styles.circleBottom]} />

          <View style={styles.avatarRing}>
            <Avatar name={user.name} id={user.id} size={72} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.phone}>{formatPhone(user.phone)}</Text>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.stats}>
        <StatTile
          icon="albums"
          value={groups ? groups.length : "—"}
          label={groups ? plural(groups.length, "Группа", "Группы", "Групп") : "Групп"}
        />
        <StatTile
          accent
          icon="sparkles"
          value={groups ? formatMoney(monthlySavings(groups, user.id)) : "—"}
          label="Экономия в месяц"
        />
      </View>

      {error ? (
        <View style={styles.reloadError}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.overdue} />
          <Text style={styles.reloadErrorText}>Не получилось загрузить статистику. {error}</Text>
        </View>
      ) : null}

      <Card style={styles.how}>
        <Text style={styles.sectionTitle}>Как работает SubShare</Text>
        {STEPS.map((step, index) => (
          <View key={step} style={styles.step}>
            <LinearGradient
              colors={[colors.sapphire, colors.violet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.stepNumber}
            >
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </LinearGradient>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </Card>

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={22} color={colors.sapphire} />
        <Text style={styles.noteText}>
          Деньги через SubShare не проходят — приложение считает доли и показывает, какие из них уже оплачены.
          Оплата прямо в приложении появится после подключения платёжной системы.
        </Text>
      </View>

      <Button title="Выйти" variant="danger" icon="log-out-outline" onPress={handleSignOut} />

      <Text style={styles.version}>SubShare · версия 0.2</Text>
    </Screen>
  );
}

// Плитка статистики: значок, крупное значение и подпись.
// accent — тёмная и более широкая плитка с мятным числом (так выделена экономия)
function StatTile({ icon, value, label, accent }) {
  return (
    <Card style={[styles.stat, accent && styles.statAccent]}>
      <View style={[styles.statIcon, accent && styles.statIconAccent]}>
        <Ionicons name={icon} size={18} color={accent ? colors.mint : colors.sapphire} />
      </View>
      {/* Значение всегда в одну строку, размер шрифта подбирает valueFontSize.
          adjustsFontSizeToFit — запас для совсем узких телефонов (в браузере не работает) */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          styles.statValue,
          { fontSize: valueFontSize(value) },
          accent && styles.statValueAccent,
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.statLabel, accent && styles.statLabelAccent]}>{label}</Text>
    </Card>
  );
}

// Шрифт Unbounded широкий, и на узком экране (360 px) длинная сумма размером 22
// не помещается в плитку. Поэтому чем длиннее значение, тем мельче шрифт
function valueFontSize(value) {
  const length = String(value).length;
  if (length <= 8) return 22; // до «99 999 ₸»
  if (length <= 9) return 20; // до «999 999 ₸»
  return 16; // миллионы
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.text },

  // Тень — на внешнем блоке, потому что градиент обрезает всё за своими краями
  // (overflow: "hidden" — чтобы круги не вылезали)
  profileShadow: {
    borderRadius: radius.l,
    boxShadow: "0px 14px 30px rgba(57, 89, 191, 0.3)",
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    borderRadius: radius.l,
    overflow: "hidden",
  },
  circle: { position: "absolute", borderRadius: radius.round },
  circleTop: {
    width: 180,
    height: 180,
    top: -80,
    right: -50,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  circleBottom: {
    width: 110,
    height: 110,
    bottom: -50,
    right: 40,
    backgroundColor: "rgba(53, 218, 185, 0.2)",
  },
  avatarRing: { padding: 3, borderRadius: radius.round, backgroundColor: colors.white },
  profileInfo: { flex: 1, gap: 4 },
  // Имя — шрифтом Onest, а не Unbounded: в Unbounded нет казахских букв (Ә, Қ, Ұ…)
  name: { fontFamily: fonts.bold, fontSize: 22, color: colors.white },
  phone: { fontFamily: fonts.medium, fontSize: 15, color: colors.lavender },

  stats: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, gap: 4 },
  // Экономия шире плитки «Группы» (1,5 : 1) — в ней длинная сумма, а там одна цифра
  statAccent: { flex: 1.5, backgroundColor: colors.midnight },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    backgroundColor: "rgba(57, 89, 191, 0.1)",
  },
  statIconAccent: { backgroundColor: "rgba(53, 218, 185, 0.16)" },
  statValue: { fontFamily: fonts.heading, color: colors.text }, // размер — в valueFontSize
  statValueAccent: { color: colors.mint },
  statLabel: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  statLabelAccent: { color: colors.lavender },

  reloadError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.m,
    backgroundColor: "rgba(255, 107, 107, 0.12)",
  },
  reloadErrorText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.text,
  },

  how: { gap: 14 },
  sectionTitle: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.text },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: { fontFamily: fonts.heading, fontSize: 12, color: colors.white },
  stepText: {
    flex: 1,
    paddingTop: 3, // чтобы первая строка была на одном уровне с кружком
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },

  note: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: radius.l,
    backgroundColor: "rgba(195, 206, 250, 0.45)",
  },
  noteText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.text },

  version: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, textAlign: "center" },
});
