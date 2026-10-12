// Вкладка «Платежи»: доли, которые пользователь ещё не перевёл владельцам групп.
// Деньги через SubShare не проходят: человек сам переводит долю (например, через Kaspi),
// а здесь отмечает, что оплата сделана.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { ServiceIcon } from "../../components/ServiceIcon";
import { EmptyState, ErrorView, Loading } from "../../components/States";
import { StatusBadge } from "../../components/StatusBadge";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useDialogs } from "../../lib/dialogs";
import { formatDate, formatMoney, formatPhone, periodLabel, plural } from "../../lib/format";
import { colors, fonts, radius } from "../../lib/theme";
import { useLoad } from "../../lib/useLoad";

export default function PaymentsScreen() {
  const { user } = useAuth();
  const { confirm, toast } = useDialogs();
  const { data, error, loading, reload } = useLoad(async () => {
    const [debts, groups] = await Promise.all([
      api.getUserDebts(user.id),
      // Группы нужны для цвета аватаров и текста на пустом экране.
      // Если они не загрузились, долги всё равно показываем
      api.getUserGroups(user.id).catch(() => []),
    ]);
    const ownerIds = await loadOwnerIds(debts, groups);
    return { debts, groups, ownerIds };
  }, [user?.id]);
  const [refreshing, setRefreshing] = useState(false);

  // «Потяните вниз, чтобы обновить». Отдельный флаг нужен, чтобы крутилка
  // не появлялась при каждом возвращении на вкладку — тогда данные обновляются незаметно.
  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  async function markPaid(payment) {
    const ok = await confirm({
      title: "Отметить оплату?",
      message: `Вы перевели ${formatMoney(payment.amount)} владельцу группы (${payment.owner_name})?`,
      confirmText: "Да, оплачено",
    });
    if (!ok) return;

    try {
      await api.markPaid(payment.id);
      toast("Оплата отмечена");
    } catch (e) {
      toast(e.message);
    }
    await reload(); // оплаченный счёт пропадёт из списка
  }

  // На случай, если экран успеет отрисоваться уже после выхода из аккаунта
  if (!user) return null;
  if (!data && loading) return <Loading />;
  if (!data && error) return <ErrorView message={error} onRetry={reload} />;

  const { debts, groups, ownerIds } = data;
  const total = debts.reduce((sum, payment) => sum + payment.amount, 0);
  const overdueCount = debts.filter((payment) => payment.is_overdue).length;
  // Счета выставляют только участникам: владелец платит за подписку сам.
  // Если человек не участник ни одной чужой группы, долей у него ещё не было
  const isMember = groups.some((group) => group.owner_id !== user.id);

  return (
    <Screen safeTop refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.header}>
        <Text style={styles.title}>Платежи</Text>
        <Text style={styles.subtitle}>Ваши доли в общих подписках</Text>
      </View>

      {/* Данные уже есть, но обновить их не получилось (например, пропала сеть) */}
      {error ? (
        <View style={styles.reloadError}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.overdue} />
          <Text style={styles.reloadErrorText}>Не получилось обновить. {error}</Text>
        </View>
      ) : null}

      {debts.length === 0 ? (
        <Card>
          {isMember ? (
            <EmptyState
              icon="checkmark-done-circle-outline"
              title="Долгов нет"
              text="Все ваши доли оплачены. Новые счета появятся здесь, когда владелец группы их выставит."
            />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title="Пока нет счетов"
              text="Когда вас добавят в группу и её владелец выставит счёт, он появится здесь."
            />
          )}
        </Card>
      ) : (
        <>
          <Summary total={total} count={debts.length} overdueCount={overdueCount} />
          {debts.map((payment) => (
            <DebtCard
              key={payment.id}
              payment={payment}
              ownerId={ownerIds[payment.group_id]}
              onMarkPaid={() => markPaid(payment)}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

// Цвет аватара выбирается по id человека, поэтому он одинаковый на всех экранах.
// В счёте есть имя и телефон владельца, но нет его id — берём id из группы.
// Обычно группа есть в списке групп пользователя. Если человек из неё уже вышел,
// а долг остался, загружаем группу отдельно. Результат: { id группы: id владельца }
async function loadOwnerIds(debts, groups) {
  const ownerIds = {};
  for (const group of groups) ownerIds[group.id] = group.owner_id;

  // Группы, которых нет в списке (каждую — один раз)
  const missing = [];
  for (const payment of debts) {
    const id = payment.group_id;
    if (ownerIds[id] === undefined && !missing.includes(id)) missing.push(id);
  }
  // Если группа не загрузилась, аватар просто будет цвета по умолчанию
  const loaded = await Promise.all(missing.map((id) => api.getGroup(id).catch(() => null)));
  for (const group of loaded) {
    if (group) ownerIds[group.id] = group.owner_id;
  }
  return ownerIds;
}

// Итог сверху: сколько всего нужно перевести и сколько счетов
function Summary({ total, count, overdueCount }) {
  return (
    <View style={styles.summaryShadow}>
      <LinearGradient
        colors={[colors.sapphire, colors.violet]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.summary}
      >
        {/* Полупрозрачные круги — просто украшение фона */}
        <View style={[styles.circle, styles.circleTop]} />
        <View style={[styles.circle, styles.circleBottom]} />

        <Text style={styles.summaryLabel}>К оплате</Text>
        <Text style={styles.summaryAmount}>{formatMoney(total)}</Text>

        <View style={styles.pills}>
          <View style={styles.pill}>
            <Ionicons name="receipt-outline" size={15} color={colors.sapphire} />
            <Text style={styles.pillText}>
              {count} {plural(count, "счёт", "счёта", "счетов")}
            </Text>
          </View>
          {overdueCount > 0 ? (
            <View style={[styles.pill, styles.overduePill]}>
              <Ionicons name="alert-circle" size={15} color={colors.white} />
              {/* «1 просрочен», «2 просрочено» — согласуем со словом «счёт» */}
              <Text style={[styles.pillText, styles.overduePillText]}>
                {overdueCount} {plural(overdueCount, "просрочен", "просрочено", "просрочено")}
              </Text>
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

// Карточка одного счёта: за что платить, сколько, до какого числа и кому переводить
function DebtCard({ payment, ownerId, onMarkPaid }) {
  return (
    <Card style={[styles.debt, payment.is_overdue && styles.debtOverdue]}>
      <View style={styles.debtTop}>
        <ServiceIcon serviceName={payment.service_name} size={44} />
        <View style={styles.debtInfo}>
          <Text style={styles.serviceName} numberOfLines={2}>
            {payment.service_name}
          </Text>
          <Text style={styles.period}>за {periodLabel(payment.period).toLowerCase()}</Text>
        </View>
      </View>

      {/* Сумма — отдельной строкой, а не справа от названия: так длинному
          названию подписки хватает места даже на узком телефоне */}
      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatMoney(payment.amount)}</Text>
        {payment.is_overdue ? (
          <StatusBadge state="overdue" label="Просрочено" style={styles.badge} />
        ) : (
          <StatusBadge
            state="pending"
            label={`До ${formatDate(payment.due_date)}`}
            style={styles.badge}
          />
        )}
      </View>

      <View style={styles.receiver}>
        <Text style={styles.receiverLabel}>Кому перевести</Text>
        <View style={styles.receiverRow}>
          <Avatar name={payment.owner_name} id={ownerId} size={40} />
          <View style={styles.receiverInfo}>
            <Text style={styles.receiverName}>{payment.owner_name}</Text>
            {/* selectable — номер можно выделить и скопировать */}
            <Text selectable style={styles.receiverPhone}>
              {formatPhone(payment.owner_phone)}
            </Text>
          </View>
        </View>
        <View style={styles.hintRow}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.hint}>Переведите через Kaspi по номеру телефона</Text>
        </View>
      </View>

      <Button title="Отметить оплату" icon="checkmark" onPress={onMarkPaid} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },

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

  // Тень — на внешнем блоке, потому что градиент обрезает всё за своими краями
  // (overflow: "hidden" — чтобы круги не вылезали)
  summaryShadow: {
    borderRadius: radius.l,
    boxShadow: "0px 14px 30px rgba(57, 89, 191, 0.3)",
  },
  summary: { borderRadius: radius.l, padding: 20, overflow: "hidden" },
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
  summaryLabel: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.lavender },
  summaryAmount: { fontFamily: fonts.heading, fontSize: 32, color: colors.white, marginTop: 6 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.round,
    backgroundColor: colors.white,
  },
  overduePill: { backgroundColor: colors.overdue },
  pillText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.midnight },
  overduePillText: { fontFamily: fonts.semibold, color: colors.white },

  debt: { gap: 14 },
  debtOverdue: { borderWidth: 1.5, borderColor: "rgba(255, 107, 107, 0.5)" },
  debtTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  debtInfo: { flex: 1, gap: 2 },
  serviceName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  period: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.textMuted },
  // Если огромная сумма и срок не поместятся в одну строку, срок перенесётся вниз
  amountRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  amount: { fontFamily: fonts.heading, fontSize: 20, color: colors.text },
  badge: { alignSelf: "center" }, // у плашки по умолчанию flex-start — ставим по центру строки

  receiver: { backgroundColor: colors.cloud, borderRadius: radius.m, padding: 12, gap: 10 },
  receiverLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  receiverRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  receiverInfo: { flex: 1, gap: 2 },
  receiverName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  receiverPhone: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.text },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  hint: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
});
