// Экран «Новая группа»: выбор подписки, цена, день оплаты и число участников.
// Внизу — подсказка, сколько заплатит каждый и сколько получится сэкономить.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Screen } from "../../components/Screen";
import { ServiceIcon } from "../../components/ServiceIcon";
import { Stepper } from "../../components/Stepper";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useDialogs } from "../../lib/dialogs";
import { formatMoney, splitPrice } from "../../lib/format";
import { OTHER_SERVICE, SERVICES } from "../../lib/services";
import { colors, fonts, radius } from "../../lib/theme";

const ALL_SERVICES = [...SERVICES, OTHER_SERVICE];
const MAX_PRICE = 1000000;
// Лаванда из theme.js (#C3CEFA) с прозрачностью 30%: на светлом фоне экрана — нежно-голубой
const LAVENDER_SOFT = "rgba(195, 206, 250, 0.3)";
const NBSP = String.fromCharCode(160); // неразрывный пробел: в этом месте строка не переносится

export default function NewGroupScreen() {
  const { user } = useAuth();
  const { toast } = useDialogs();
  const navigation = useNavigation();

  const [choice, setChoice] = useState(null); // выбранный «чип»: "Netflix", …, "Другое"
  const [customService, setCustomService] = useState(""); // название сервиса для «Другое»
  const [customName, setCustomName] = useState(null); // null — название группы не меняли
  const [price, setPrice] = useState(""); // только цифры: "6000"
  // По умолчанию — сегодняшнее число: подписку обычно продлевают в тот же день месяца
  const [billingDay, setBillingDay] = useState(Math.min(new Date().getDate(), 28));
  const [maxMembers, setMaxMembers] = useState(OTHER_SERVICE.maxMembers);
  const [showErrors, setShowErrors] = useState(false); // ошибки видны после первого нажатия «Создать»
  const [serverError, setServerError] = useState(null);

  const isOther = choice === OTHER_SERVICE.name;
  const serviceName = isOther ? customService.trim() : choice || "";
  // Пока название не меняли вручную, оно составляется само: «Netflix вскладчину»
  const name = customName ?? (serviceName ? `${serviceName} вскладчину` : "");
  const priceNumber = Number(price);

  const errors = validate({ choice, serviceName, name, price: priceNumber });
  const hasErrors = Object.keys(errors).length > 0;

  function selectService(service) {
    setChoice(service.name);
    setMaxMembers(service.maxMembers);
    // Поле названия очистили — снова подставляем название автоматически
    if (!customName?.trim()) setCustomName(null);
  }

  async function handleCreate() {
    setShowErrors(true);
    setServerError(null);
    if (hasErrors) return;
    try {
      const group = await api.createGroup({
        name: name.trim(),
        service_name: serviceName,
        total_price: priceNumber,
        billing_day: billingDay,
        max_members: maxMembers,
        owner_id: user.id,
      });
      toast("Группа создана");
      // Пока ждали сервер, человек мог уйти с этого экрана. Тогда никуда не переходим:
      // replace заменил бы уже другой экран (например, вкладки)
      if (navigation.isFocused()) router.replace(`/group/${group.id}`);
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
            onPress={() => selectService(service)}
          />
        ))}
      </View>
      {showErrors && !choice ? <Text style={styles.errorText}>{errors.service}</Text> : null}

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
        onChangeText={setCustomName}
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
        min={2}
        max={10}
        suffix="чел."
      />

      {/* Подсказку считаем только по правильной цене: не пустой и не больше лимита */}
      {!errors.price ? <SavingsCard price={priceNumber} members={maxMembers} /> : null}

      <Button title="Создать группу" icon="checkmark-circle" onPress={handleCreate} />
      {showErrors && hasErrors ? <ErrorNote text="Проверьте поля выше" /> : null}
      {serverError ? <ErrorNote text={serverError} /> : null}
      <Text style={styles.footnote}>Участников добавите на следующем шаге</Text>
    </Screen>
  );
}

// Проверяет форму и возвращает тексты ошибок по полям. Пустой объект — всё верно.
function validate({ choice, serviceName, name, price }) {
  const errors = {};
  if (!choice) errors.service = "Выберите подписку";
  else if (!serviceName) errors.service = "Введите название сервиса";

  if (!name.trim()) errors.name = "Введите название группы";
  else if (name.trim().length > 100) errors.name = "Не длиннее 100 символов";

  if (!price) errors.price = "Укажите цену подписки";
  else if (price > MAX_PRICE) errors.price = `Не больше ${formatMoney(MAX_PRICE)}`;

  return errors;
}

// Оставляет только цифры и убирает нули в начале: «06 000 ₸» → «6000»
function cleanDigits(text) {
  return text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 7);
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

// Подсказка: сколько заплатит каждый, если группа соберётся полностью
function SavingsCard({ price, members }) {
  const share = Math.min(...splitPrice(price, members));
  const saving = `${formatMoney(price - share)}${NBSP}в${NBSP}месяц`; // «в месяц» не оторвётся от суммы
  return (
    <LinearGradient
      colors={[colors.sapphire, colors.violet]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.savings}
    >
      <View style={styles.people}>
        {Array.from({ length: members }, (_, i) => (
          <Ionicons
            key={i}
            name="person"
            size={16}
            color={i === 0 ? colors.mint : "rgba(255, 255, 255, 0.6)"}
          />
        ))}
      </View>
      <Text style={styles.savingsText}>Если вас будет {members}, каждый заплатит около</Text>
      <Text style={styles.savingsAmount}>{formatMoney(share)}</Text>
      <View style={styles.savingsPill}>
        <Ionicons name="sparkles" size={15} color={colors.midnight} />
        <Text style={styles.savingsPillText}>Экономия на человека — {saving}</Text>
      </View>
    </LinearGradient>
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
  // Как текст ошибок под полями (components/Field.js): тёмно-красный читается лучше colors.overdue
  errorText: { marginTop: -6, fontFamily: fonts.regular, fontSize: 13, color: "#D63C3C" },

  savings: {
    borderRadius: radius.l,
    padding: 20,
    gap: 6,
    boxShadow: "0px 12px 28px rgba(57, 89, 191, 0.3)",
  },
  people: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 6 },
  savingsText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 21,
    color: "rgba(255, 255, 255, 0.85)",
  },
  savingsAmount: { fontFamily: fonts.heading, fontSize: 30, color: colors.white },
  savingsPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.m, // на узком экране текст переносится — тогда это скруглённый прямоугольник
    backgroundColor: colors.mint,
  },
  savingsPillText: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.midnight,
  },

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
  footnote: {
    marginTop: -4,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: "center",
  },
});
