// Экран «Добавить участника»: имя и номер телефона. Если этого номера ещё нет
// в SubShare, сервер сам создаст по нему аккаунт.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "../../../components/Avatar";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Field, PhoneField } from "../../../components/Field";
import { Screen } from "../../../components/Screen";
import { ServiceIcon } from "../../../components/ServiceIcon";
import { EmptyState, ErrorView, Loading } from "../../../components/States";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useDialogs } from "../../../lib/dialogs";
import { formatMoney, initials, plural, splitPrice } from "../../../lib/format";
import { colors, fonts, radius } from "../../../lib/theme";
import { useLoad } from "../../../lib/useLoad";

const MAX_MEMBERS = 10; // больше участников в одной группе сервер не разрешает
// Лаванда из theme.js (#C3CEFA) с прозрачностью 30%: на светлом фоне экрана — нежно-голубой
const LAVENDER_SOFT = "rgba(195, 206, 250, 0.3)";
const NBSP = String.fromCharCode(160); // неразрывный пробел: в этом месте строка не переносится

export default function InviteScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const { toast } = useDialogs();
  const navigation = useNavigation();
  const { data: group, error, loading, reload } = useLoad(() => api.getGroup(id), [id]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState(""); // 10 цифр без +7: "7010000002"
  const [showErrors, setShowErrors] = useState(false); // ошибки видны после первого нажатия «Добавить»
  const [serverError, setServerError] = useState(null);

  if (!group && loading) return <Loading />;
  if (!group && error) return <ErrorView message={error} onRetry={reload} />;

  if (group.members_count >= group.max_members) {
    const isOwner = group.owner_id === user?.id;
    const canRaise = isOwner && group.max_members < MAX_MEMBERS;
    let text = `В группе уже ${group.members_count} из ${group.max_members} участников.`;
    if (canRaise) text += " Если тариф позволяет больше — увеличьте лимит.";
    if (!isOwner) text += " Увеличить лимит может владелец группы.";
    return (
      <Screen contentStyle={styles.centered}>
        <EmptyState
          icon="people-outline"
          title="Группа заполнена"
          text={text}
          action={
            canRaise ? (
              <Button
                title="Изменить лимит"
                icon="create-outline"
                small
                onPress={() => router.replace(`/group/${id}/edit`)}
              />
            ) : null
          }
        />
      </Screen>
    );
  }

  const cleanName = name.trim();
  const errors = {};
  if (!cleanName) errors.name = "Введите имя";
  if (phone.length !== 10) {
    errors.phone = phone ? "В номере должно быть 10 цифр после +7" : "Введите номер телефона";
  }

  const freePlaces = group.max_members - group.members_count;
  // «свободно 1 место» не разрывается при переносе строки
  const freeText = `свободно${NBSP}${freePlaces}${NBSP}${plural(freePlaces, "место", "места", "мест")}`;
  // Доля последнего участника — самая маленькая (лишние тенге достаются первым)
  const shareNow = group.members[group.members.length - 1].share;
  const sharesAfter = splitPrice(group.total_price, group.members_count + 1);
  const shareAfter = sharesAfter[sharesAfter.length - 1];
  const saving = `ещё${NBSP}${formatMoney(shareNow - shareAfter)}`; // «ещё» не оторвётся от суммы
  const nowText = formatMoney(shareNow);
  const afterText = formatMoney(shareAfter);
  // Суммы до «9 999 ₸» (7 знаков) печатаем крупно, длинные — пропорционально мельче.
  // Так обе суммы и стрелка всегда помещаются в одну строку, даже на телефоне шириной 360.
  const scale = Math.min(1, 7 / Math.max(nowText.length, afterText.length));

  async function handleInvite() {
    setShowErrors(true);
    setServerError(null);
    if (Object.keys(errors).length > 0) return;
    try {
      const updated = await api.inviteMember(group.id, cleanName, `+7${phone}`);
      // Новый участник — последний в списке. Если человек уже был в SubShare,
      // сервер оставит его прежнее имя — поэтому берём имя из ответа.
      const added = updated.members[updated.members.length - 1];
      toast(`${added?.name || cleanName} теперь в группе`);
      // Пока ждали сервер, человек мог сам уйти с экрана — тогда «назад» закрыл бы уже другой экран
      if (navigation.isFocused()) {
        if (router.canGoBack()) router.back();
        else router.replace(`/group/${group.id}`); // страницу в браузере обновили — истории нет
      }
    } catch (e) {
      setServerError(e.message); // например, «Пользователь уже в группе»
    }
  }

  return (
    <Screen>
      <Card style={styles.groupCard}>
        <ServiceIcon serviceName={group.service_name} size={44} />
        <View style={styles.groupInfo}>
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={styles.groupMeta}>
            {group.members_count} из {group.max_members} участников · {freeText}
          </Text>
        </View>
      </Card>

      <Field
        label="Имя"
        value={name}
        onChangeText={setName}
        placeholder="Например, Тимур"
        autoCapitalize="words"
        maxLength={100}
        error={showErrors ? errors.name : null}
      />
      <PhoneField value={phone} onChangeText={setPhone} error={showErrors ? errors.phone : null} />

      <View style={styles.tip}>
        <Ionicons name="information-circle" size={20} color={colors.sapphire} />
        <Text style={styles.tipText}>
          Если этого номера ещё нет в SubShare, по нему будет создан аккаунт — потом с этим
          номером можно войти самостоятельно.
        </Text>
      </View>

      <LinearGradient
        colors={[colors.sapphire, colors.violet]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.preview}
      >
        {/* Кто сейчас в группе + кружок нового участника */}
        <View style={styles.avatars}>
          {group.members.map((member, index) => (
            <View key={member.user_id} style={[styles.avatarRing, index > 0 && styles.shifted]}>
              <Avatar name={member.name} id={member.user_id} size={32} />
            </View>
          ))}
          <View style={[styles.newAvatar, cleanName ? styles.newAvatarFilled : null]}>
            {cleanName ? (
              <Text style={styles.newInitials}>{initials(cleanName)}</Text>
            ) : (
              <Ionicons name="add" size={18} color={colors.white} />
            )}
          </View>
        </View>

        <View style={styles.shareRow}>
          <View style={styles.shareColumn}>
            <Text style={styles.shareLabel}>Сейчас доля</Text>
            <Text style={[styles.shareNow, { fontSize: Math.round(18 * scale) }]}>{nowText}</Text>
          </View>
          <View style={styles.arrow}>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </View>
          <View style={[styles.shareColumn, styles.shareColumnRight]}>
            <Text style={styles.shareLabel}>После добавления</Text>
            <Text style={[styles.shareAfter, { fontSize: Math.round(22 * scale) }]}>{afterText}</Text>
          </View>
        </View>

        {shareNow > shareAfter ? (
          <View style={styles.savingsPill}>
            <Ionicons name="sparkles" size={14} color={colors.midnight} />
            <Text style={styles.savingsPillText}>Экономия на человека — {saving}</Text>
          </View>
        ) : null}
      </LinearGradient>

      <Button title="Добавить в группу" icon="person-add" onPress={handleInvite} />
      {serverError ? (
        <View style={styles.errorNote}>
          <Ionicons name="alert-circle" size={18} color={colors.overdue} />
          <Text style={styles.errorNoteText}>{serverError}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, justifyContent: "center" },
  groupCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  groupInfo: { flex: 1, gap: 2 },
  groupName: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.text },
  groupMeta: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted },

  tip: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: radius.m,
    backgroundColor: LAVENDER_SOFT,
  },
  tipText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted },

  preview: {
    borderRadius: radius.l,
    padding: 20,
    gap: 18,
    boxShadow: "0px 12px 28px rgba(57, 89, 191, 0.3)",
  },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatarRing: { borderWidth: 2, borderColor: colors.white, borderRadius: radius.round },
  shifted: { marginLeft: -12 }, // кружки заходят друг на друга
  newAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginLeft: 6, // новый участник — чуть в стороне от остальных
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(255, 255, 255, 0.8)",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  newAvatarFilled: { borderStyle: "solid", borderColor: colors.white, backgroundColor: colors.mint },
  newInitials: { fontFamily: fonts.semibold, fontSize: 13, color: colors.midnight },

  shareRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  shareColumn: { flexShrink: 1, gap: 4 },
  shareColumnRight: { alignItems: "flex-end" },
  shareLabel: { fontFamily: fonts.medium, fontSize: 13, color: "rgba(255, 255, 255, 0.75)" },
  // Размер шрифта сумм задаётся в коде экрана: он зависит от длины суммы
  shareNow: { fontFamily: fonts.heading, color: "rgba(255, 255, 255, 0.85)" },
  shareAfter: { fontFamily: fonts.heading, color: colors.white },
  arrow: {
    flexShrink: 0, // стрелка не сжимается и не наезжает на суммы
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  savingsPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: -4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.m,
    backgroundColor: colors.mint,
  },
  savingsPillText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.midnight },

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
