// Экран «Изменить группу»: подписка, название, цена, день оплаты и лимит участников.
// Менять группу может только владелец. На сервер уходят только изменённые поля.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../../../components/Button";
import { Field } from "../../../components/Field";
import { Screen } from "../../../components/Screen";
import { ServiceIcon } from "../../../components/ServiceIcon";
import { EmptyState, ErrorView, Loading } from "../../../components/States";
import { Stepper } from "../../../components/Stepper";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useDialogs } from "../../../lib/dialogs";
import { formatMoney, plural, splitPrice } from "../../../lib/format";
import { findService, OTHER_SERVICE, SERVICES } from "../../../lib/services";
import { colors, fonts, radius } from "../../../lib/theme";
import { useLoad } from "../../../lib/useLoad";

const ALL_SERVICES = [...SERVICES, OTHER_SERVICE];
// Лимит для новой цены. Сервер разрешает до 10 000 000 ₸ (app/schemas.py), поэтому
// у группы может уже быть цена выше — её validate не трогает, если цену не меняли
const MAX_PRICE = 1000000;
// Лаванда из theme.js (#C3CEFA) с прозрачностью 30%: на светлом фоне экрана — нежно-голубой
const LAVENDER_SOFT = "rgba(195, 206, 250, 0.3)";

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { data: group, error, loading, reload } = useLoad(() => api.getGroup(id), [id]);

  if (!group && loading) return <Loading />;
  if (!group && error) return <ErrorView message={error} onRetry={reload} />;

  if (group.owner_id !== user?.id) {
    const owner = group.members.find((member) => member.is_owner);
    return (
      <Screen contentStyle={styles.centered}>
        <EmptyState
          icon="lock-closed-outline"
          title="Изменять группу может только владелец"
          text={`Цену, день оплаты и лимит участников меняет ${owner.name} — владелец группы.`}
          action={
            <Button
              title="Назад"
              icon="arrow-back"
              variant="secondary"
              small
              onPress={() => goBack(id)}
            />
          }
        />
      </Screen>
    );
  }

  // Форма появляется, когда группа уже загружена, — поэтому поля сразу заполнены.
  // key — чтобы для другой группы форма заполнилась заново.
  return <EditForm key={group.id} group={group} />;
}

function EditForm({ group }) {
  const { toast } = useDialogs();
  const navigation = useNavigation();
  // Подписка из списка — выделяем её «чип», иначе — «Другое» со своим названием
  const knownService = findService(group.service_name);

  const [choice, setChoice] = useState(knownService ? knownService.name : OTHER_SERVICE.name);
  const [customService, setCustomService] = useState(knownService ? "" : group.service_name);
  const [name, setName] = useState(group.name);
  const [price, setPrice] = useState(String(group.total_price)); // только цифры: "6000"
  const [billingDay, setBillingDay] = useState(group.billing_day);
  const [maxMembers, setMaxMembers] = useState(group.max_members);
  const [showErrors, setShowErrors] = useState(false); // ошибки видны после первого нажатия «Сохранить»
  const [serverError, setServerError] = useState(null);

  const isOther = choice === OTHER_SERVICE.name;
  const serviceName = isOther ? customService.trim() : choice;
  const priceNumber = Number(price);
  const minMembers = Math.max(2, group.members_count); // лимит не может быть меньше, чем людей в группе

  const errors = validate({ serviceName, name, price: priceNumber, oldPrice: group.total_price });
  const hasErrors = Object.keys(errors).length > 0;

  // Как изменятся доли участников, если поменять цену
  const priceChanged = !errors.price && priceNumber !== group.total_price;
  const oldShares = sharesText(group.members.map((member) => member.share));
  const newShares = priceChanged ? sharesText(splitPrice(priceNumber, group.members_count)) : oldShares;

  async function handleSave() {
    setShowErrors(true);
    setServerError(null);
    if (hasErrors) return;

    // Отправляем только то, что поменялось
    const changes = {};
    if (name.trim() !== group.name) changes.name = name.trim();
    if (serviceName !== group.service_name) changes.service_name = serviceName;
    if (priceNumber !== group.total_price) changes.total_price = priceNumber;
    if (billingDay !== group.billing_day) changes.billing_day = billingDay;
    if (maxMembers !== group.max_members) changes.max_members = maxMembers;

    if (Object.keys(changes).length === 0) {
      goBack(group.id);
      return;
    }

    try {
      await api.updateGroup(group.id, changes);
      toast("Изменения сохранены");
      // Пока ждали сервер, человек мог сам уйти с экрана — тогда «назад» закрыл бы уже другой экран
      if (navigation.isFocused()) goBack(group.id);
    } catch (e) {
      setServerError(e.message);
    }
  }

  return (
    <Screen>
      <Text style={styles.sectionTitle}>Какую подписку делим?</Text>
      <View style={styles.grid}>
        {ALL_SERVICES.map((service) => (
          <ServiceChip
            key={service.name}
            service={service}
            selected={service.name === choice}
            onPress={() => setChoice(service.name)}
          />
        ))}
      </View>

      {isOther ? (
        <Field
          label="Название сервиса"
          value={customService}
          onChangeText={setCustomService}
          placeholder="Например, Кинопоиск"
          maxLength={100}
          error={showErrors ? errors.service : null}
        />
      ) : null}

      <Text style={[styles.sectionTitle, styles.secondSection]}>Детали группы</Text>
      <Field
        label="Название группы"
        value={name}
        onChangeText={setName}
        placeholder="Например, Netflix вскладчину"
        maxLength={100}
        error={showErrors ? errors.name : null}
      />
      <Field
        label="Цена подписки в месяц, ₸"
        value={groupDigits(price)}
        onChangeText={(text) => setPrice(cleanDigits(text))}
        keyboardType="number-pad"
        placeholder="Например, 6 000"
        error={showErrors ? errors.price : null}
      />
      <Stepper
        label="Оплата до"
        value={billingDay}
        onChange={setBillingDay}
        min={1}
        max={28}
        suffix="числа"
        hint="Участники переводят долю до этого дня"
      />
      <Stepper
        label="Участников по тарифу"
        value={maxMembers}
        onChange={setMaxMembers}
        min={minMembers}
        max={10}
        suffix="чел."
        hint={`Сейчас в группе ${group.members_count} ${plural(group.members_count, "участник", "участника", "участников")}`}
      />

      <View style={styles.note}>
        <Ionicons name="information-circle" size={20} color={colors.sapphire} />
        <View style={styles.noteBody}>
          <Text style={styles.noteText}>
            Уже выставленные счета не изменятся — новая цена попадёт в следующие счета. Доли
            участников пересчитаются сразу.
          </Text>
          {/* Строку не показываем, если на вид ничего не меняется: «833–834 ₸ → 833–834 ₸» */}
          {newShares !== oldShares ? (
            <View style={styles.shareRow}>
              <Text style={styles.shareText}>Доля каждого:</Text>
              <Text style={styles.shareText}>{oldShares}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
              <Text style={[styles.shareText, styles.shareNew]}>{newShares}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Button title="Сохранить" icon="checkmark-circle" onPress={handleSave} />
      {showErrors && hasErrors ? <ErrorNote text="Проверьте поля выше" /> : null}
      {serverError ? <ErrorNote text={serverError} /> : null}
    </Screen>
  );
}

// Назад к группе. Если истории переходов нет (страницу в браузере обновили) — открываем группу.
function goBack(groupId) {
  if (router.canGoBack()) router.back();
  else router.replace(`/group/${groupId}`);
}

// Проверяет форму и возвращает тексты ошибок по полям. Пустой объект — всё верно.
function validate({ serviceName, name, price, oldPrice }) {
  const errors = {};
  if (!serviceName) errors.service = "Введите название сервиса";

  if (!name.trim()) errors.name = "Введите название группы";
  else if (name.trim().length > 100) errors.name = "Не длиннее 100 символов";

  if (!price) errors.price = "Укажите цену подписки";
  // Лимит — только для новой цены. Иначе группу с ценой выше лимита (её могли создать
  // через /docs) нельзя было бы даже переименовать.
  else if (price !== oldPrice && price > MAX_PRICE) errors.price = `Не больше ${formatMoney(MAX_PRICE)}`;

  return errors;
}

// Доли участников одной строкой: «2 000 ₸». Если остаток раздали по 1 ₸
// и доли разные — диапазон «833–834 ₸».
function sharesText(shares) {
  const min = Math.min(...shares);
  const max = Math.max(...shares);
  if (min === max) return formatMoney(min);
  return `${groupDigits(String(min))}–${formatMoney(max)}`;
}

// Оставляет только цифры и убирает нули в начале: «06 000 ₸» → «6000».
// До 8 цифр, а не 7: старая цена группы может быть до 10 000 000 ₸ (лимит сервера).
function cleanDigits(text) {
  return text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 8);
}

// «6000» → «6 000» — так в поле легче читать сумму
function groupDigits(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// «Чип» подписки: значок и название. Выбранный — с синей рамкой.
function ServiceChip({ service, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.chip,
        hovered && styles.chipHovered,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <ServiceIcon serviceName={service.name} size={28} />
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={2}>
        {service.name}
      </Text>
    </Pressable>
  );
}

function ErrorNote({ text }) {
  return (
    <View style={styles.errorNote}>
      <Ionicons name="alert-circle" size={18} color={colors.overdue} />
      <Text style={styles.errorNoteText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, justifyContent: "center" },
  sectionTitle: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.text },
  secondSection: { marginTop: 8 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    flexGrow: 1,
    flexBasis: "40%", // два «чипа» в ряд; последний растягивается на всю ширину
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.m,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipHovered: { borderColor: colors.lavender },
  chipSelected: { borderColor: colors.sapphire, backgroundColor: LAVENDER_SOFT },
  chipPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  chipText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 14.5, color: colors.text },
  chipTextSelected: { fontFamily: fonts.semibold, color: colors.sapphire },

  note: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: radius.m,
    backgroundColor: LAVENDER_SOFT,
  },
  noteBody: { flex: 1, gap: 8 },
  noteText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  // Части строки переносятся целиком, поэтому «833–834 ₸» не разорвётся посередине
  shareRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 },
  shareText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  shareNew: { fontFamily: fonts.bold, color: colors.sapphire },

  errorNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: -4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.m,
    backgroundColor: "rgba(255, 107, 107, 0.12)",
  },
  // Тёмный текст на розовом фоне читается лучше красного — так же сделано на экране входа
  errorNoteText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.text },
});
