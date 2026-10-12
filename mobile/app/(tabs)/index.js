// Вкладка «Подписки» — главный экран: сколько стоят подписки, сколько человек
// экономит вскладчину и список его групп со статусом оплаты.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { ServiceIcon } from "../../components/ServiceIcon";
import { EmptyState, ErrorView, Loading } from "../../components/States";
import { paymentState, StatusBadge } from "../../components/StatusBadge";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { firstName, formatDate, formatMoney } from "../../lib/format";
import { colors, fonts, radius, shadow } from "../../lib/theme";
import { useLoad } from "../../lib/useLoad";

const NBSP = String.fromCharCode(160); // неразрывный пробел: в этом месте строка не переносится
const PER_MONTH = ` в${NBSP}месяц`; // «в месяц» переносится на новую строку только целиком

export default function SubscriptionsScreen() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useLoad(async () => {
    const [groups, debts] = await Promise.all([
      api.getUserGroups(user.id),
      api.getUserDebts(user.id),
    ]);
    return { groups, debts };
  }, [user?.id]);
  const [refreshing, setRefreshing] = useState(false);

  // «Потяните вниз, чтобы обновить». Отдельный флаг нужен, чтобы крутилка
  // не появлялась при каждом возвращении на вкладку — тогда данные обновляются незаметно.
  async function refresh() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  // После выхода из аккаунта user = null, а экран может успеть обновиться — тогда ничего не рисуем
  if (!user) return null;
  if (!data && loading) return <Loading />;
  if (!data && error) return <ErrorView message={error} onRetry={reload} />;

  const { groups, debts } = data;
  const monthlyCost = groups.reduce((sum, g) => sum + myShare(g, user.id), 0);
  const savings = groups.reduce((sum, g) => sum + g.total_price - myShare(g, user.id), 0);
  const toPay = debts.reduce((sum, d) => sum + d.amount, 0);

  return (
    <Screen safeTop refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.header}>
        {/* Имя — шрифтом Onest, а не Unbounded: в Unbounded нет казахских букв (Ә, Қ, Ұ и др.) */}
        <View style={styles.headerText}>
          <Text style={styles.title}>Подписки</Text>
          <Text style={styles.hello} numberOfLines={1}>
            Привет, <Text style={styles.helloName}>{firstName(user.name)}</Text>!
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/profile")}
          accessibilityLabel="Профиль"
          style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
        >
          <Avatar name={user.name} id={user.id} size={46} />
        </Pressable>
      </View>

      {/* Данные уже есть, но обновить их не получилось (например, пропала сеть) */}
      {error ? (
        <View style={styles.reloadError}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.overdue} />
          <Text style={styles.reloadErrorText}>Не получилось обновить. {error}</Text>
        </View>
      ) : null}

      {groups.length > 0 ? (
        <SummaryCard monthlyCost={monthlyCost} savings={savings} toPay={toPay} />
      ) : null}

      {/* Долг бывает и без групп: человек вышел из группы, не заплатив (или его исключили).
          Итог с «0 ₸ в месяц» тут выглядел бы как ошибка, поэтому показываем только долг */}
      {groups.length === 0 && debts.length > 0 ? <DebtBanner debts={debts} toPay={toPay} /> : null}

      {groups.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Мои группы</Text>
            <Button
              title="Создать"
              icon="add"
              variant="secondary"
              small
              onPress={() => router.push("/group/new")}
            />
          </View>
          <View style={styles.list}>
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} userId={user.id} debts={debts} />
            ))}
          </View>
        </>
      ) : (
        <Card>
          <EmptyState
            icon="albums-outline"
            title="Пока нет групп"
            text="Создайте группу для Netflix, Spotify или любой другой подписки — SubShare сам посчитает долю каждого"
            action={
              <Button
                title="Создать группу"
                icon="add"
                onPress={() => router.push("/group/new")}
                style={styles.emptyButton}
              />
            }
          />
        </Card>
      )}
    </Screen>
  );
}

// Сколько пользователь платит в месяц в этой группе
function myShare(group, userId) {
  const me = group.members.find((m) => m.user_id === userId);
  return me ? me.share : 0;
}

// Самый срочный из неоплаченных счетов: сначала просроченный, потом с ближайшим сроком
// (сервер присылает долги уже по порядку сроков)
function urgentDebt(debts) {
  return debts.find((d) => d.is_overdue) || debts[0];
}

// Карточка-итог с градиентом: сколько стоят все подписки, экономия и долги
function SummaryCard({ monthlyCost, savings, toPay }) {
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

        <Text style={styles.summaryLabel}>Подписки обходятся вам в</Text>
        <Text style={styles.summaryAmount}>
          {formatMoney(monthlyCost)}
          <Text style={styles.summaryPer}>{PER_MONTH}</Text>
        </Text>

        <View style={styles.pills}>
          <View style={[styles.pill, styles.savingsPill]}>
            <Ionicons name="sparkles" size={15} color={colors.midnight} />
            <Text style={styles.pillText}>
              Экономия <Text style={styles.pillAmount}>{formatMoney(savings)}</Text>
              {PER_MONTH}
            </Text>
          </View>

          {toPay > 0 ? (
            <Pressable
              onPress={() => router.push("/payments")}
              style={({ pressed }) => [styles.pill, styles.toPayPill, pressed && styles.pressed]}
            >
              <Ionicons name="wallet" size={15} color={colors.sapphire} />
              <Text style={styles.pillText}>
                К оплате <Text style={styles.pillAmount}>{formatMoney(toPay)}</Text>
              </Text>
              <Ionicons name="chevron-forward" size={15} color={colors.sapphire} />
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

// Плашка долга для того, у кого групп уже нет. Нажатие открывает «Платежи»:
// там видно, кому перевести деньги, и можно отметить оплату
function DebtBanner({ debts, toPay }) {
  const debt = urgentDebt(debts);
  return (
    <Card
      onPress={() => router.push("/payments")}
      style={[styles.debtBanner, debt.is_overdue && styles.debtBannerOverdue]}
    >
      <View style={styles.debtIcon}>
        <Ionicons name="wallet" size={22} color={colors.sapphire} />
      </View>
      <View style={styles.debtInfo}>
        <Text style={styles.debtLabel}>
          {debts.length === 1 ? "Остался неоплаченный счёт" : "Остались неоплаченные счета"}
        </Text>
        <Text style={styles.debtAmount}>{formatMoney(toPay)}</Text>
        <DebtBadge debt={debt} style={styles.debtBadge} />
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Card>
  );
}

// Карточка группы: значок, название, доля в месяц, статус оплаты и участники
function GroupCard({ group, userId, debts }) {
  return (
    <Card onPress={() => router.push(`/group/${group.id}`)}>
      <View style={styles.groupTop}>
        <ServiceIcon serviceName={group.service_name} size={48} />
        {/* Сумма стоит в строке с названием, а «в месяц» — в строке с сервисом:
            так тексту слева хватает места даже на узком телефоне.
            Длинное название переносится на вторую строку, а не обрезается сразу */}
        <View style={styles.groupInfo}>
          <View style={styles.infoRow}>
            <Text style={styles.groupName} numberOfLines={2}>
              {group.name}
            </Text>
            <Text style={styles.share}>{formatMoney(myShare(group, userId))}</Text>
          </View>
          <View style={styles.infoRow}>
            {/* Длинное название сервиса сокращается «…», а число участников видно всегда */}
            <View style={styles.metaRow}>
              <Text style={[styles.groupMeta, styles.serviceName]} numberOfLines={1}>
                {group.service_name}
              </Text>
              <Text style={[styles.groupMeta, styles.membersCount]}>
                {` · ${group.members_count} из ${group.max_members}`}
              </Text>
            </View>
            <Text style={styles.perMonth}>в месяц</Text>
          </View>
        </View>
      </View>

      <View style={styles.groupBottom}>
        <View style={styles.statusWrap}>
          <GroupStatus group={group} userId={userId} debts={debts} />
        </View>
        <MemberAvatars members={group.members} />
      </View>
    </Card>
  );
}

function GroupStatus({ group, userId, debts }) {
  if (group.owner_id === userId) {
    return <StatusBadge state="owner" label="Вы владелец" />;
  }
  const debt = urgentDebt(debts.filter((d) => d.group_id === group.id));
  if (!debt) {
    return <StatusBadge state="paid" label="Долгов нет" />;
  }
  return <DebtBadge debt={debt} />;
}

// Срок неоплаченного счёта: «Просрочено» или «Оплатить до 5 октября»
function DebtBadge({ debt, style }) {
  const state = paymentState(debt); // "pending" или "overdue"
  const label = state === "overdue" ? "Просрочено" : `Оплатить до ${formatDate(debt.due_date)}`;
  return <StatusBadge state={state} label={label} style={style} />;
}

// Кружки участников внахлёст. Если людей больше четырёх — три кружка и «+N»
function MemberAvatars({ members }) {
  const shown = members.length > 4 ? members.slice(0, 3) : members;
  const hidden = members.length - shown.length;
  return (
    <View style={styles.avatars}>
      {shown.map((member, index) => (
        <View key={member.user_id} style={[styles.avatarRing, index > 0 && styles.overlap]}>
          <Avatar name={member.name} id={member.user_id} size={22} />
        </View>
      ))}
      {hidden > 0 ? (
        <View style={[styles.avatarRing, styles.overlap]}>
          <View style={styles.moreCircle}>
            <Text style={styles.moreText}>+{hidden}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Шапка: заголовок вкладки (как на «Платежах» и в «Профиле») и приветствие
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerText: { flex: 1, gap: 4 },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.text },
  hello: { fontFamily: fonts.regular, fontSize: 15, color: colors.textMuted },
  helloName: { fontFamily: fonts.semibold, color: colors.text },
  avatarButton: {
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: colors.white,
    ...shadow,
  },
  pressed: { opacity: 0.75 },

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

  // Карточка-итог. Тень — на внешнем блоке, потому что внутренний обрезает
  // всё за своими краями (overflow: "hidden" — чтобы круги не вылезали)
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
  summaryPer: { fontFamily: fonts.medium, fontSize: 15, color: colors.lavender },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.round,
  },
  savingsPill: { backgroundColor: colors.mint },
  toPayPill: { backgroundColor: colors.white },
  pillText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.midnight },
  pillAmount: { fontFamily: fonts.bold },

  // Плашка долга (когда групп нет). Красная рамка у просроченного — как на «Платежах»
  debtBanner: { flexDirection: "row", alignItems: "center", gap: 12 },
  debtBannerOverdue: { borderWidth: 1.5, borderColor: "rgba(255, 107, 107, 0.5)" },
  debtIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(57, 89, 191, 0.1)",
  },
  debtInfo: { flex: 1, gap: 2 },
  debtLabel: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.textMuted },
  debtAmount: { fontFamily: fonts.heading, fontSize: 20, color: colors.text },
  debtBadge: { marginTop: 6 },

  // Список групп
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  sectionTitle: { fontFamily: fonts.headingSemi, fontSize: 17, color: colors.text },
  list: { gap: 12 },
  groupTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  groupInfo: { flex: 1, gap: 3 },
  // Прижимаем к низу строки: если название займёт две строки, сумма останется прямо над «в месяц»
  infoRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  groupName: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  metaRow: { flex: 1, flexDirection: "row" },
  groupMeta: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.textMuted },
  serviceName: { flexShrink: 1 },
  membersCount: { flexShrink: 0 },
  share: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  perMonth: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted },
  groupBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 14,
  },
  statusWrap: { flexShrink: 1 },
  avatars: { flexDirection: "row" },
  avatarRing: { borderRadius: radius.round, borderWidth: 2, borderColor: colors.white },
  overlap: { marginLeft: -8 },
  moreCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.cloud,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { fontFamily: fonts.semibold, fontSize: 10, color: colors.textMuted },

  emptyButton: { marginTop: 6 },
});
