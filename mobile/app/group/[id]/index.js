// Экран группы — главный экран приложения: сколько платит каждый, чьи доли уже
// оплачены за выбранный месяц, список участников и управление группой.
// Владелец видит кнопки управления, участник — свою долю и кнопку «Выйти».
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Avatar } from "../../../components/Avatar";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { ProgressBar } from "../../../components/ProgressBar";
import { Screen } from "../../../components/Screen";
import { ServiceIcon } from "../../../components/ServiceIcon";
import { EmptyState, ErrorView, Loading } from "../../../components/States";
import { paymentState, StatusBadge } from "../../../components/StatusBadge";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useDialogs } from "../../../lib/dialogs";
import {
  currentPeriod,
  formatDate,
  formatMoney,
  formatPhone,
  periodLabel,
  plural,
  shiftPeriod,
} from "../../../lib/format";
import { colors, fonts, radius } from "../../../lib/theme";
import { useLoad } from "../../../lib/useLoad";

const NBSP = String.fromCharCode(160); // неразрывный пробел: в этом месте строка не переносится
const PER_MONTH = ` в${NBSP}месяц`; // «в месяц» переносится на новую строку только целиком
const MAX_MEMBERS = 10; // больше участников в одной группе сервер не разрешает

export default function GroupScreen() {
  const { id } = useLocalSearchParams();
  const groupId = Number(id);
  const { user } = useAuth();
  const { confirm, toast } = useDialogs();
  const [period, setPeriod] = useState(currentPeriod());
  const [refreshing, setRefreshing] = useState(false);

  // Если группы нет (её удалили или ссылка неверная), сервер ответит ошибкой 404.
  // Тогда вместо данных будет null — и мы покажем «Группа не найдена».
  const groupLoad = useLoad(
    () =>
      api.getGroup(groupId).catch((error) => {
        if (error.status === 404 || error.status === 422) return null;
        throw error;
      }),
    [groupId]
  );
  const statusLoad = useLoad(() => api.getPeriod(groupId, period), [groupId, period]);

  // Пока сервер отвечает на «Отметить оплату» и другие действия, человек может
  // переключить месяц. statusLoad.reload из старого рендера загрузил бы прежний месяц,
  // и «Платежи» крутились бы без конца. Поэтому храним в ref самую свежую функцию.
  const latestStatusReload = useRef(statusLoad.reload);
  useEffect(() => {
    latestStatusReload.current = statusLoad.reload;
  }, [statusLoad.reload]);

  // Обновить платежи за месяц, который выбран сейчас
  function reloadPayments() {
    return latestStatusReload.current();
  }

  // Группа и платежи загружаются отдельно — обновляем и то и другое
  function reloadAll() {
    return Promise.all([groupLoad.reload(), reloadPayments()]);
  }

  if (!groupLoad.data && groupLoad.loading) return <Loading />;
  if (!groupLoad.data && groupLoad.error) {
    return <ErrorView message={groupLoad.error} onRetry={reloadAll} />;
  }
  if (!groupLoad.data) return <NotFound />;

  const group = groupLoad.data;
  const isOwner = group.owner_id === user?.id;
  const me = group.members.find((m) => m.user_id === user?.id); // нет, если вы вышли из группы
  const owner = group.members.find((m) => m.is_owner);
  const isFull = group.members_count >= group.max_members;

  // Платежи за выбранный месяц. Пока грузится другой месяц, старые цифры не показываем.
  const status = statusLoad.data?.period === period ? statusLoad.data : null;
  const payments = status ? status.payments : [];
  const hasInvoices = payments.length > 0;
  const memberIds = group.members.map((m) => m.user_id);
  const formerPayments = payments.filter((p) => !memberIds.includes(p.user_id));
  // Участники без счёта за этот месяц — например, добавленные уже после выставления счетов
  const unbilled = group.members.filter(
    (m) => !m.is_owner && !payments.some((p) => p.user_id === m.user_id)
  );

  const thisMonth = currentPeriod();
  const canGoForward = period < shiftPeriod(thisMonth, 1); // не дальше следующего месяца
  // Счета — только за текущий и следующий месяц: за прошлый они сразу были бы просроченными
  const canBillPeriod = period >= thisMonth;
  const monthName = periodLabel(period).toLowerCase(); // «октябрь 2026» — для «за октябрь 2026»

  function openEdit() {
    router.push(`/group/${groupId}/edit`);
  }

  async function refresh() {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  }

  // Выставить счета за месяц target (обычно — за тот, что выбран на экране).
  // Повторный вызов безопасен: сервер создаёт только недостающие счета.
  async function createInvoices(target) {
    const due = dueDateFor(target, group.billing_day);
    const label = periodLabel(target).toLowerCase();

    // Срок оплаты уже прошёл — счета сразу станут просроченными, поэтому сначала спрашиваем
    if (due < todayISO()) {
      const ok = await confirm({
        title: "Срок оплаты уже прошёл",
        message: `Оплата за ${label} — до ${formatDate(due)}, поэтому счета сразу будут просроченными. Выставить всё равно?`,
        confirmText: "Выставить",
      });
      if (!ok) return;
    }

    try {
      await api.createInvoices(groupId, target);
    } catch (error) {
      toast(error.message);
      return;
    }
    toast(`Счета за ${label} выставлены`);
    if (target === period) {
      // await — кнопка «крутится», пока не придут свежие данные (нельзя нажать второй раз)
      await reloadPayments();
    } else {
      setPeriod(target); // переходим к этому месяцу — его счета загрузятся сами
    }
  }

  async function markPaid(payment) {
    const isMine = payment.user_id === user?.id;
    const amount = formatMoney(payment.amount);
    const month = periodLabel(payment.period).toLowerCase();
    const ok = await confirm({
      title: "Отметить оплату?",
      message: isMine
        ? `Подтвердите, что вы перевели ${amount} владельцу группы (${payment.owner_name}).`
        : `${payment.user_name}: ${amount} за ${month}. Подтвердите, что деньги пришли вам.`,
      confirmText: "Оплачено",
    });
    if (!ok) return;
    try {
      await api.markPaid(payment.id);
      toast("Оплата отмечена");
    } catch (error) {
      toast(error.message);
    }
    // Обновляем и после ошибки: вдруг платёж уже отметили с другого телефона
    await reloadPayments();
  }

  async function removeMember(member) {
    const ok = await confirm({
      title: "Удалить участника?",
      message: `${member.name} больше не будет в группе. История платежей сохранится.`,
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.removeMember(groupId, member.user_id);
      toast(`${member.name} больше не в группе`);
      await reloadAll();
    } catch (error) {
      toast(error.message);
    }
  }

  async function deleteGroup() {
    const ok = await confirm({
      title: "Удалить группу?",
      message: "Удалятся участники и история платежей. Это нельзя отменить.",
      confirmText: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteGroup(groupId);
      toast("Группа удалена");
      goBack();
    } catch (error) {
      toast(error.message);
    }
  }

  async function leaveGroup() {
    const ok = await confirm({
      title: "Выйти из группы?",
      message: "Ваши платежи останутся в истории группы. Вернуться можно, если владелец снова добавит вас.",
      confirmText: "Выйти",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.removeMember(groupId, user.id);
      toast("Вы вышли из группы");
      goBack();
    } catch (error) {
      toast(error.message);
    }
  }

  // Что показать под переключателем месяцев: загрузку, ошибку, «счетов нет» или сборы
  function renderPeriod() {
    if (!status) {
      if (statusLoad.error && !statusLoad.loading) {
        return (
          <View style={styles.periodCenter}>
            <Text style={styles.centerText}>{statusLoad.error}</Text>
            <Button
              title="Повторить"
              icon="refresh"
              variant="secondary"
              small
              onPress={reloadPayments}
            />
          </View>
        );
      }
      return <ActivityIndicator color={colors.sapphire} style={styles.periodLoading} />;
    }

    if (!hasInvoices) return renderNoInvoices();

    const hasOverdue = payments.some((p) => p.is_overdue);
    return (
      <View style={styles.collected}>
        <View style={styles.collectedTop}>
          <Text style={styles.collectedLabel}>Собрано</Text>
          <View style={styles.due}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={hasOverdue ? colors.overdue : colors.textMuted}
            />
            <Text style={[styles.dueText, hasOverdue && styles.dueLate]}>
              до {formatDate(payments[0].due_date)}
            </Text>
          </View>
        </View>
        <Text>
          <Text style={styles.collectedAmount}>{formatMoney(status.collected)}</Text>
          <Text style={styles.collectedTotal}> из {formatMoney(status.total_to_collect)}</Text>
        </Text>
        <ProgressBar value={status.collected / status.total_to_collect} />
        {status.outstanding > 0 ? (
          <Text style={styles.outstanding}>
            Осталось собрать{" "}
            <Text style={styles.outstandingAmount}>{formatMoney(status.outstanding)}</Text>
          </Text>
        ) : (
          <View style={styles.done}>
            <Ionicons name="checkmark-circle" size={18} color={colors.mint} />
            <Text style={styles.doneText}>Всё собрано — все доли оплачены</Text>
          </View>
        )}

        {/* Новичкам, добавленным после выставления счетов, счёт можно выставить отдельно */}
        {isOwner && canBillPeriod && unbilled.length > 0 ? (
          <View style={styles.unbilled}>
            <View style={styles.unbilledTop}>
              <Ionicons name="person-add-outline" size={18} color={colors.sapphire} />
              <Text style={styles.unbilledText}>
                Нет счёта за {monthName}: {unbilled.map((m) => m.name).join(", ")}
              </Text>
            </View>
            <Button
              title={unbilled.length > 1 ? "Выставить им счета" : "Выставить счёт"}
              icon="receipt-outline"
              variant="secondary"
              small
              onPress={() => createInvoices(period)}
              style={styles.unbilledButton}
            />
          </View>
        ) : null}
      </View>
    );
  }

  // Счетов за выбранный месяц ещё нет
  function renderNoInvoices() {
    const title = `Счета за ${monthName} ещё не выставлены`;

    if (!canBillPeriod) {
      return (
        <PeriodMessage
          title="В этом месяце счета не выставлялись"
          text={isOwner ? "Счета можно выставить за текущий или следующий месяц." : null}
        />
      );
    }

    if (!isOwner) {
      return (
        <PeriodMessage
          title={title}
          text="Когда счета будут выставлены, здесь появятся статусы оплаты."
        />
      );
    }

    // Счета выставляются участникам, не владельцу, — нужен хотя бы ещё один человек
    if (group.members_count < 2) {
      return (
        <PeriodMessage title={title}>
          <View style={styles.periodButtons}>
            <Button title="Выставить счета" icon="receipt-outline" disabled />
          </View>
          <Text style={styles.centerText}>Сначала добавьте участников</Text>
        </PeriodMessage>
      );
    }

    const due = dueDateFor(period, group.billing_day);

    // Срок оплаты в этом месяце уже прошёл: предлагаем начать со следующего месяца,
    // но оставляем и выставление за этот (с подтверждением в createInvoices)
    if (due < todayISO()) {
      const next = shiftPeriod(period, 1);
      return (
        <PeriodMessage title={title}>
          <View style={styles.due}>
            <Ionicons name="calendar-outline" size={15} color={colors.overdue} />
            <Text style={[styles.dueText, styles.dueLate]}>
              Срок оплаты был до {formatDate(due)}
            </Text>
          </View>
          <Text style={styles.centerText}>
            Если выставить счета сейчас, они сразу будут просроченными. Можно начать со
            следующего месяца.
          </Text>
          <View style={styles.periodButtons}>
            <Button
              title={`Выставить за ${monthOnly(next)}`}
              icon="receipt-outline"
              onPress={() => createInvoices(next)}
            />
            <Button
              title={`Выставить за ${monthOnly(period)}`}
              variant="secondary"
              onPress={() => createInvoices(period)}
            />
          </View>
        </PeriodMessage>
      );
    }

    return (
      <PeriodMessage title={title} text="Участники увидят свою долю и смогут отметить оплату.">
        <View style={styles.due}>
          <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
          <Text style={styles.dueText}>Срок оплаты — до {formatDate(due)}</Text>
        </View>
        <View style={styles.periodButtons}>
          <Button
            title="Выставить счета"
            icon="receipt-outline"
            onPress={() => createInvoices(period)}
          />
        </View>
      </PeriodMessage>
    );
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: group.service_name }} />

      {/* 1. Шапка: что за подписка и главные цифры */}
      <Card>
        <View style={styles.headerTop}>
          <ServiceIcon serviceName={group.service_name} size={56} />
          <View style={styles.headerText}>
            <Text style={styles.groupName}>{group.name}</Text>
            <Text style={styles.serviceName}>{group.service_name}</Text>
          </View>
        </View>
        <View style={styles.stats}>
          <Stat label="Цена" value={formatMoney(group.total_price)} sub="в месяц" />
          <View style={styles.statDivider} />
          <Stat
            label="Участники"
            value={`${group.members_count} из ${group.max_members}`}
            sub="человек"
          />
          <View style={styles.statDivider} />
          <Stat label="Оплата" value={`до ${group.billing_day}`} sub="числа" />
        </View>
      </Card>

      {/* 2. Сколько платите вы */}
      {me ? (
        <ShareCard
          group={group}
          share={me.share}
          isOwner={isOwner}
          owner={owner}
          ownerPhone={payments[0]?.owner_phone}
        />
      ) : (
        <Card style={styles.viewOnly}>
          <Ionicons name="eye-outline" size={20} color={colors.textMuted} />
          <Text style={styles.viewOnlyText}>
            Вы больше не в этой группе — доступен только просмотр.
          </Text>
        </Card>
      )}

      {/* 3. Платежи за выбранный месяц */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Платежи</Text>
        <Card>
          <View style={styles.monthRow}>
            <IconButton
              icon="chevron-back"
              label="Предыдущий месяц"
              onPress={() => setPeriod(shiftPeriod(period, -1))}
            />
            <View style={styles.monthCenter}>
              <Text style={styles.monthTitle}>{periodLabel(period)}</Text>
              {period === thisMonth ? (
                <Text style={styles.monthHint}>текущий месяц</Text>
              ) : (
                <Pressable onPress={() => setPeriod(thisMonth)} hitSlop={8}>
                  <Text style={styles.monthLink}>к текущему месяцу</Text>
                </Pressable>
              )}
            </View>
            <IconButton
              icon="chevron-forward"
              label="Следующий месяц"
              disabled={!canGoForward}
              onPress={() => setPeriod(shiftPeriod(period, 1))}
            />
          </View>
          <View style={styles.divider} />
          {renderPeriod()}
        </Card>
      </View>

      {/* 4. Участники и статус их оплаты за выбранный месяц.
          Пока счетов за месяц нет, статусы не показываем — об этом уже сказано в «Платежах». */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Участники</Text>
        <Card style={styles.membersCard}>
          {group.members.map((member, index) => {
            const payment = payments.find((p) => p.user_id === member.user_id);
            const isMe = member.user_id === user?.id;
            const canMark = payment?.status === "pending" && (isOwner || isMe);
            const canRemove = isOwner && !member.is_owner;
            return (
              <MemberRow
                key={member.user_id}
                member={member}
                payment={payment}
                isMe={isMe}
                showStatus={hasInvoices}
                first={index === 0}
                onMarkPaid={canMark ? () => markPaid(payment) : null}
                onRemove={canRemove ? () => removeMember(member) : null}
              />
            );
          })}

          {/* Кто уже вышел из группы, но счёт за этот месяц у него остался.
              Владелец может отметить оплату: деньги могли прийти и после выхода. */}
          {formerPayments.length > 0 ? (
            <View style={styles.formerHeader}>
              <Text style={styles.formerTitle}>Больше не в группе</Text>
            </View>
          ) : null}
          {formerPayments.map((p, index) => (
            <MemberRow
              key={p.id}
              member={{ user_id: p.user_id, name: p.user_name, is_owner: false }}
              payment={p}
              isMe={p.user_id === user?.id}
              showStatus
              first={index === 0}
              former
              onMarkPaid={isOwner && p.status === "pending" ? () => markPaid(p) : null}
            />
          ))}
        </Card>
      </View>

      {/* 5. Управление группой */}
      {isOwner ? (
        <View style={styles.actions}>
          <Button
            title="Добавить участника"
            icon="person-add"
            disabled={isFull}
            onPress={() => router.push(`/group/${groupId}/invite`)}
          />
          {/* Лимит можно поднять до 10 — дальше подсказка про «Изменить группу» не поможет.
              NBSP не даёт ссылке разорваться на две строки и оторваться от «в». */}
          {isFull && group.max_members < MAX_MEMBERS ? (
            <Text style={styles.hint}>
              Группа заполнена — увеличьте лимит в{NBSP}
              <Text style={styles.hintLink} onPress={openEdit}>
                «Изменить{NBSP}группу»
              </Text>
            </Text>
          ) : null}
          {isFull && group.max_members >= MAX_MEMBERS ? (
            <Text style={styles.hint}>
              Группа заполнена: {MAX_MEMBERS} участников — это максимум
            </Text>
          ) : null}
          <Button
            title="Изменить группу"
            icon="create-outline"
            variant="secondary"
            onPress={openEdit}
          />
          <Button title="Удалить группу" icon="trash-outline" variant="danger" onPress={deleteGroup} />
        </View>
      ) : null}
      {!isOwner && me ? (
        <Button title="Выйти из группы" icon="exit-outline" variant="danger" onPress={leaveGroup} />
      ) : null}

      {/* 6. Как устроены переводы */}
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
        <Text style={styles.noteText}>
          Деньги переводятся владельцу напрямую — например, через Kaspi. SubShare считает доли и
          показывает, чья доля уже оплачена.
        </Text>
      </View>
    </Screen>
  );
}

// Срок оплаты за месяц — так же, как на сервере (due_date_for в app/logic.py):
// «2026-10» и 5 → «2026-10-05»
function dueDateFor(period, billingDay) {
  return `${period}-${String(billingDay).padStart(2, "0")}`;
}

// Сегодняшняя дата в том же виде: «2026-10-12». Такие строки можно сравнивать обычным «<».
function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// «2026-11» → «ноябрь» (без года — для коротких подписей на кнопках)
function monthOnly(period) {
  return periodLabel(period).split(" ")[0].toLowerCase();
}

// Назад к предыдущему экрану. Если экран открыли по прямой ссылке в браузере,
// возвращаться некуда — тогда открываем список подписок.
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

// Группы нет: её удалили или ссылка неверная
function NotFound() {
  return (
    <Screen contentStyle={styles.notFound}>
      <EmptyState
        icon="search-outline"
        title="Группа не найдена"
        text="Возможно, её удалили. Вернитесь к списку подписок."
        action={<Button title="Назад" icon="arrow-back" small onPress={goBack} />}
      />
    </Screen>
  );
}

// Показатель в шапке: подпись, значение и пояснение под ним
function Stat({ label, value, sub }) {
  // Длинные суммы печатаем мельче, чтобы они влезли в колонку даже на экране шириной 360 px
  let fontSize = 15;
  if (value.length > 8) fontSize = 13; // «100 000 ₸»
  if (value.length > 9) fontSize = 11; // «1 000 000 ₸»
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      {/* adjustsFontSizeToFit: на телефоне шрифт уменьшится сам, если значение всё равно не влезет */}
      <Text style={[styles.statValue, { fontSize }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

// Сообщение в блоке «Платежи», когда счетов за месяц нет: значок, заголовок, пояснение, кнопки
function PeriodMessage({ title, text, children }) {
  return (
    <View style={styles.periodCenter}>
      <View style={styles.periodIcon}>
        <Ionicons name="receipt-outline" size={24} color={colors.sapphire} />
      </View>
      <Text style={styles.periodTitle}>{title}</Text>
      {text ? <Text style={styles.centerText}>{text}</Text> : null}
      {children}
    </View>
  );
}

// Градиентная карточка «сколько платите вы». У владельца и участника она разная.
function ShareCard({ group, share, isOwner, owner, ownerPhone }) {
  if (isOwner) {
    return (
      <GradientCard>
        <Text style={styles.shareLabel}>Вы платите сервису</Text>
        <Text style={styles.shareAmount}>
          {formatMoney(group.total_price)}
          <Text style={styles.sharePer}>{PER_MONTH}</Text>
        </Text>
        <View style={styles.shareBox}>
          {group.members_count > 1 ? (
            <>
              <ShareRow
                label="Участники возвращают вам"
                value={formatMoney(group.total_price - share)}
                mint
              />
              <ShareRow label="Ваша доля" value={formatMoney(share)} border />
            </>
          ) : (
            <Text style={styles.shareBoxText}>
              Пока вы платите всё сами. Добавьте участников — и цена разделится поровну.
            </Text>
          )}
        </View>
      </GradientCard>
    );
  }

  const people = plural(group.members_count, "человека", "человека", "человек");
  return (
    <GradientCard>
      <Text style={styles.shareLabel}>Ваша доля</Text>
      <Text style={styles.shareAmount}>
        {formatMoney(share)}
        <Text style={styles.sharePer}>{PER_MONTH}</Text>
      </Text>
      <View style={styles.savePill}>
        <Ionicons name="sparkles" size={14} color={colors.midnight} />
        <Text style={styles.savePillText}>
          Экономия {formatMoney(group.total_price - share)}
          {PER_MONTH}
        </Text>
      </View>
      <View style={styles.shareBox}>
        <ShareRow
          label={`Подписка на ${group.members_count} ${people}`}
          value={formatMoney(group.total_price)}
        />
        {/* Номер владельца приходит вместе со счетами, поэтому он есть не всегда */}
        <View style={[styles.shareRow, styles.shareRowBorder]}>
          <Text style={styles.shareRowLabel}>Кому переводить</Text>
          <View style={styles.contact}>
            <Text style={styles.contactName}>{owner?.name}</Text>
            {ownerPhone ? <Text style={styles.contactPhone}>{formatPhone(ownerPhone)}</Text> : null}
          </View>
        </View>
      </View>
    </GradientCard>
  );
}

function GradientCard({ children }) {
  return (
    <LinearGradient
      colors={[colors.sapphire, colors.violet]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.shareCard}
    >
      {children}
    </LinearGradient>
  );
}

// Строка в градиентной карточке: подпись слева, сумма справа
function ShareRow({ label, value, mint, border }) {
  return (
    <View style={[styles.shareRow, border && styles.shareRowBorder]}>
      <Text style={styles.shareRowLabel}>{label}</Text>
      <Text style={[styles.shareRowValue, mint && styles.mintText]}>{value}</Text>
    </View>
  );
}

// Строка участника: сверху имя и кнопка удаления, под ними сумма и статус оплаты,
// ещё ниже — «Отметить оплату». Имени отдана вся ширина: длинное («Александра
// Константиновна») переносится на вторую строку, а не обрезается до «Александр…».
// former — человек уже вышел из группы (его счёт остался в истории): аватар и имя бледнее.
function MemberRow({ member, payment, isMe, showStatus, first, former, onMarkPaid, onRemove }) {
  // Если счёт за месяц есть — показываем его сумму: она запомнена при выставлении счёта
  // и может отличаться от текущей доли (цена или состав группы могли измениться)
  let sub = `Доля ${formatMoney(member.share)}`;
  if (member.is_owner) sub = "Платит сервису";
  else if (payment) sub = `Счёт ${formatMoney(payment.amount)}`;

  let badge = null;
  if (member.is_owner) {
    badge = <StatusBadge state="owner" style={styles.badge} />;
  } else if (showStatus) {
    badge = (
      <StatusBadge
        state={paymentState(payment)}
        label={payment ? undefined : "Нет счёта"}
        style={styles.badge}
      />
    );
  }

  return (
    <View style={[styles.member, !first && styles.memberBorder]}>
      <View style={styles.memberRow}>
        <View style={former && styles.faded}>
          <Avatar name={member.name} id={member.user_id} size={42} />
        </View>
        <View style={styles.memberInfo}>
          <View style={styles.memberTop}>
            <Text style={[styles.memberName, former && styles.formerName]} numberOfLines={2}>
              {member.name}
              {isMe ? <Text style={styles.you}> (вы)</Text> : null}
            </Text>
            {onRemove ? (
              <IconButton
                icon="person-remove-outline"
                label="Удалить из группы"
                subtle
                onPress={onRemove}
              />
            ) : null}
          </View>
          <View style={styles.memberBottom}>
            <Text style={styles.memberSub}>{sub}</Text>
            {badge}
          </View>
        </View>
      </View>

      {onMarkPaid ? (
        <View style={styles.memberActions}>
          <Button
            title="Отметить оплату"
            icon="checkmark-done"
            variant="secondary"
            small
            onPress={onMarkPaid}
          />
        </View>
      ) : null}
    </View>
  );
}

// Кнопка с иконкой: круглая синяя (стрелки месяцев) или subtle — серая, без фона
// (удаление участника: чтобы в списке не пестрели красные кружки)
function IconButton({ icon, label, onPress, disabled, subtle }) {
  const [busy, setBusy] = useState(false);
  const color = subtle ? colors.textMuted : colors.sapphire;

  // Если onPress ждёт ответа сервера (вернул Promise) — показываем «крутилку», как у Button
  async function handlePress() {
    const result = onPress();
    if (!result?.then) return; // обычная функция — ждать нечего
    setBusy(true);
    try {
      await result;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={subtle ? 9 : 6}
      style={({ pressed, hovered }) => [
        styles.iconButton,
        subtle && styles.iconButtonSubtle,
        hovered && styles.hovered,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon} size={20} color={color} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 1. Шапка
  headerTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerText: { flex: 1, gap: 4 },
  groupName: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.text },
  serviceName: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted },
  stats: {
    flexDirection: "row",
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: radius.m,
    backgroundColor: colors.cloud,
  },
  stat: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: 4 },
  statDivider: { width: 1, marginVertical: 4, backgroundColor: colors.border },
  statLabel: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted },
  // lineHeight одинаковый при любом размере шрифта — подписи под значениями стоят на одной линии
  statValue: {
    fontFamily: fonts.heading,
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
    textAlign: "center",
  },
  statSub: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.textMuted },

  // 2. Градиентная карточка
  shareCard: {
    borderRadius: radius.l,
    padding: 20,
    gap: 4,
    boxShadow: "0px 10px 24px rgba(57, 89, 191, 0.3)",
  },
  shareLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.lavender },
  shareAmount: { fontFamily: fonts.heading, fontSize: 30, color: colors.white },
  sharePer: { fontFamily: fonts.medium, fontSize: 15, color: colors.lavender },
  savePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.round,
    backgroundColor: colors.mint,
  },
  savePillText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.midnight },
  shareBox: {
    marginTop: 14,
    paddingHorizontal: 14,
    borderRadius: radius.m,
    backgroundColor: "rgba(16, 23, 39, 0.22)",
  },
  shareBoxText: {
    paddingVertical: 12,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.white,
  },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  shareRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(255, 255, 255, 0.14)" },
  shareRowLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.lavender },
  shareRowValue: { fontFamily: fonts.heading, fontSize: 16, color: colors.white },
  mintText: { color: colors.mint },
  contact: { alignItems: "flex-end", gap: 2 },
  contactName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  contactPhone: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.lavender },

  viewOnly: { flexDirection: "row", alignItems: "center", gap: 10 },
  viewOnlyText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.textMuted,
  },

  // Заголовки секций
  section: { gap: 10 },
  sectionTitle: { fontFamily: fonts.headingSemi, fontSize: 17, color: colors.text, marginLeft: 4 },

  // 3. Месяц и сборы
  monthRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  monthCenter: { flex: 1, alignItems: "center", gap: 2 },
  monthTitle: { fontFamily: fonts.headingSemi, fontSize: 17, color: colors.text },
  monthHint: { fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted },
  monthLink: { fontFamily: fonts.semibold, fontSize: 13, color: colors.sapphire },
  divider: { height: 1, marginVertical: 14, backgroundColor: colors.border },
  periodLoading: { marginVertical: 28 },
  periodCenter: { alignItems: "center", gap: 10 },
  periodIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(57, 89, 191, 0.1)",
  },
  periodTitle: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    textAlign: "center",
  },
  centerText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: "center",
  },
  periodButtons: { alignSelf: "stretch", gap: 8, marginTop: 4 },
  collected: { gap: 10 },
  collectedTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  collectedLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
  due: { flexDirection: "row", alignItems: "center", gap: 4 },
  dueText: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.textMuted },
  dueLate: { fontFamily: fonts.semibold, color: colors.overdue },
  collectedAmount: { fontFamily: fonts.heading, fontSize: 24, color: colors.text },
  collectedTotal: { fontFamily: fonts.medium, fontSize: 15, color: colors.textMuted },
  outstanding: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },
  outstandingAmount: { fontFamily: fonts.semibold, color: colors.text },
  done: { flexDirection: "row", alignItems: "center", gap: 6 },
  doneText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  unbilled: {
    gap: 10,
    marginTop: 2,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  unbilledTop: { flexDirection: "row", gap: 8 },
  unbilledText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: colors.text,
  },
  unbilledButton: { alignSelf: "flex-start" },

  // 4. Участники
  membersCard: { paddingVertical: 4 },
  member: { paddingVertical: 12, gap: 10 },
  memberBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  memberInfo: { flex: 1, gap: 3 },
  memberTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  you: { fontFamily: fonts.regular, color: colors.textMuted },
  // Сумма слева, статус справа. Если вместе не влезут (очень узкий экран) — статус уйдёт ниже.
  memberBottom: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  memberSub: { fontFamily: fonts.regular, fontSize: 13.5, color: colors.textMuted },
  badge: { alignSelf: "center" },
  memberActions: { flexDirection: "row", marginLeft: 54 }, // 54 = аватар 42 + отступ 12
  faded: { opacity: 0.5 },
  formerName: { color: colors.textMuted },
  formerHeader: { paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  formerTitle: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textMuted },

  // 5. Действия
  actions: { gap: 10 },
  hint: {
    marginTop: -2,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: "center",
  },
  hintLink: { fontFamily: fonts.semibold, color: colors.sapphire },

  // 6. Подсказка внизу
  note: { flexDirection: "row", gap: 8, paddingHorizontal: 4 },
  noteText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },

  // Кнопка-иконка
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(57, 89, 191, 0.1)",
  },
  iconButtonSubtle: { width: 26, height: 26, backgroundColor: "transparent" },
  hovered: { opacity: 0.85 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },

  notFound: { flexGrow: 1, justifyContent: "center" },
});
