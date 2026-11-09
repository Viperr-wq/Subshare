// Экран «Чат группы»: сообщения участников и поле ввода внизу.
// Пока чат открыт, новые сообщения подгружаются сами — раз в несколько секунд.
// Долгое нажатие на сообщение удаляет его: своё может удалить любой, чужое — владелец группы.
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, avatarColor } from "../../../components/Avatar";
import { Button } from "../../../components/Button";
import { EmptyState, ErrorView, Loading } from "../../../components/States";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useDialogs } from "../../../lib/dialogs";
import { dayLabel, formatTime, localDay } from "../../../lib/format";
import { t } from "../../../lib/i18n";
import { colors, fonts, radius, shadow } from "../../../lib/theme";
import { useLoad } from "../../../lib/useLoad";

const REFRESH_MS = 4000; // как часто спрашивать сервер о новых сообщениях
const MAX_LENGTH = 1000; // длиннее сообщение сервер не примет (app/schemas.py)
const INPUT_MIN = 44; // высота поля ввода: одна строка…
const INPUT_MAX = 120; // …и не больше пяти — дальше текст прокручивается

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const groupId = Number(id);
  const { user } = useAuth();
  const { confirm, toast } = useDialogs();
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardShown();
  // Группа нужна для заголовка и чтобы знать, кто владелец: он может удалять любые сообщения
  const { data: group } = useLoad(() => api.getGroup(groupId), [groupId]);

  const [messages, setMessages] = useState([]); // от старых к новым
  const [loaded, setLoaded] = useState(false); // сервер хотя бы раз прислал сообщения
  const [error, setError] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // Высота поля ввода в браузере: там оно само не растёт вместе с текстом (на телефоне — растёт)
  const [webInputHeight, setWebInputHeight] = useState(INPUT_MIN);
  // Значения, которые меняются без перерисовки экрана (useRef):
  const sendingNow = useRef(false); // двойное нажатие не отправит сообщение дважды
  const olderNow = useRef(false); // более ранние сообщения уже загружаются
  const reachedStart = useRef(false); // на экране уже самое первое сообщение чата

  // Ответы сервера могут прийти не по порядку. У каждого запроса свой номер,
  // и ответы на запросы с номером меньше freshFrom уже устарели — их не показываем
  const lastRequest = useRef(0);
  const freshFrom = useRef(0);

  // Последние сообщения с сервера. Они заменяют на экране то, что было за то же время:
  // так появляются новые сообщения и пропадают удалённые
  async function refresh() {
    const requestId = ++lastRequest.current;
    try {
      const page = await api.getMessages(groupId);
      if (requestId < freshFrom.current) return;
      freshFrom.current = requestId;
      setMessages((current) => {
        if (!page.has_more) return page.messages; // пришла вся переписка
        // Более ранние сообщения, загруженные прокруткой вверх, оставляем
        const oldest = page.messages[0].id;
        return [...current.filter((m) => m.id < oldest), ...page.messages];
      });
      if (!page.has_more) reachedStart.current = true;
      setLoaded(true);
      setError(null);
    } catch (e) {
      if (requestId >= freshFrom.current) setError(e);
    }
  }

  // Пока экран открыт — спрашиваем сервер о новых сообщениях. Следующий запрос уходит,
  // только когда пришёл ответ на прошлый, — даже при медленном интернете они не копятся
  useFocusEffect(
    useCallback(() => {
      let active = true;
      let timer = null;
      async function tick() {
        // Приложение свёрнуто (или вкладка браузера скрыта) — сервер зря не спрашиваем
        if (AppState.currentState !== "background") await refresh();
        if (active) timer = setTimeout(tick, REFRESH_MS);
      }
      tick();
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [groupId])
  );

  // Долистали до самого старого сообщения на экране — подгружаем более ранние
  async function loadOlder() {
    if (reachedStart.current || olderNow.current || messages.length === 0) return;
    olderNow.current = true;
    setLoadingOlder(true);
    try {
      const page = await api.getMessages(groupId, messages[0].id);
      setMessages((current) => {
        const known = new Set(current.map((m) => m.id));
        const older = page.messages.filter((m) => !known.has(m.id));
        return [...older, ...current].sort((a, b) => a.id - b.id);
      });
      if (!page.has_more) reachedStart.current = true;
    } catch (e) {
      toast(e.message);
    } finally {
      olderNow.current = false;
      setLoadingOlder(false);
    }
  }

  async function send() {
    const clean = text.trim();
    if (!clean || sendingNow.current) return;
    sendingNow.current = true;
    setSending(true);
    setText(""); // поле очищаем сразу, как в мессенджерах
    try {
      await api.sendMessage(groupId, clean);
      // Ответы на запросы, отправленные раньше, — ещё без этого сообщения
      freshFrom.current = lastRequest.current + 1;
      await refresh();
    } catch (e) {
      setText((current) => current || clean); // не отправилось — возвращаем текст в поле
      toast(e.message);
    } finally {
      sendingNow.current = false;
      setSending(false);
    }
  }

  // В браузере Enter отправляет сообщение, а Shift+Enter переносит строку
  function handleKeyPress(event) {
    const { key, shiftKey, isComposing } = event.nativeEvent;
    if (Platform.OS === "web" && key === "Enter" && !shiftKey && !isComposing) {
      event.preventDefault();
      send();
    }
  }

  function canDelete(message) {
    return message.user_id === user?.id || group?.owner_id === user?.id;
  }

  async function removeMessage(message) {
    const ok = await confirm({
      title: t("Удалить сообщение?"),
      message: t("Оно пропадёт у всех участников группы."),
      confirmText: t("Удалить"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteMessage(groupId, message.id);
      // Ответы на запросы, отправленные раньше, — ещё с этим сообщением
      freshFrom.current = lastRequest.current + 1;
      setMessages((current) => current.filter((m) => m.id !== message.id));
      toast(t("Сообщение удалено"));
    } catch (e) {
      toast(e.message);
    }
  }

  if (!loaded && !error) return <Loading />;
  if (!loaded) {
    // Группу удалили или вас из неё убрали — сервер ответил «не найдено»
    if (error.status === 404) return <NotFound />;
    return <ErrorView message={error.message} onRetry={refresh} />;
  }

  // Строки списка: сообщения, а над первым сообщением каждого дня — дата.
  // Список перевёрнут (inverted): новые сообщения внизу, у поля ввода, — поэтому
  // строки в нём идут от новых к старым
  const rows = [];
  messages.forEach((message, index) => {
    const previous = messages[index - 1];
    const day = localDay(message.created_at);
    const newDay = !previous || localDay(previous.created_at) !== day;
    if (newDay) rows.push({ key: `day-${day}`, day: message.created_at });
    // Имя и кружок — только у первого из нескольких сообщений подряд от одного человека
    const continued = !newDay && previous.user_id === message.user_id;
    rows.push({ key: `message-${message.id}`, message, continued });
  });
  rows.reverse();

  function renderRow({ item }) {
    if (item.day) return <DayLabel date={item.day} />;
    const { message } = item;
    return (
      <MessageBubble
        message={message}
        mine={message.user_id === user?.id}
        continued={item.continued}
        onLongPress={canDelete(message) ? () => removeMessage(message) : null}
      />
    );
  }

  // Над экраном — панель заголовка: клавиатуре нужно знать её высоту (как в components/Screen.js)
  const headerHeight = insets.top + (Platform.OS === "ios" ? 44 : 56);
  const canSend = text.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <Stack.Screen options={{ title: group?.name || t("Чат группы") }} />

      {/* Сообщения уже есть, но обновить их не получилось (например, пропала сеть) */}
      {error ? (
        <View style={styles.reloadError}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.overdue} />
          <Text style={styles.reloadErrorText}>
            {t("Не получилось обновить.")} {error.message}
          </Text>
        </View>
      ) : null}

      {messages.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon="chatbubbles-outline"
            title={t("Сообщений пока нет")}
            text={t("Напишите первым — сообщения увидят все участники группы.")}
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          inverted
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingOlder ? <ActivityIndicator color={colors.sapphire} style={styles.olderLoading} /> : null
          }
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Поле ввода. Когда клавиатура закрыта, снизу — место под «полоску домой» телефона */}
      <View style={[styles.inputBar, { paddingBottom: keyboardShown ? 10 : Math.max(insets.bottom, 10) }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t("Сообщение")}
          placeholderTextColor="#9AA2BC"
          accessibilityLabel={t("Сообщение")}
          multiline
          maxLength={MAX_LENGTH}
          onKeyPress={handleKeyPress}
          rows={Platform.OS === "web" ? 1 : undefined} // в браузере поле сначала в одну строку
          onContentSizeChange={(event) => {
            const height = event.nativeEvent.contentSize.height;
            setWebInputHeight(Math.min(INPUT_MAX, Math.max(INPUT_MIN, Math.ceil(height))));
          }}
          style={[styles.input, Platform.OS === "web" && { height: text ? webInputHeight : INPUT_MIN }]}
        />
        <Pressable
          onPress={send}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t("Отправить")}
          style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && styles.pressed]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="send" size={19} color={colors.white} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// Видна ли клавиатура телефона. В браузере — всегда «нет»
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, () => setShown(true));
    const onHide = Keyboard.addListener(hideEvent, () => setShown(false));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);
  return shown;
}

// Сообщение. Свои — справа и синие, чужие — слева, с именем и кружком автора.
// continued — это продолжение: прошлое сообщение того же человека, поэтому без имени и кружка
function MessageBubble({ message, mine, continued, onLongPress }) {
  return (
    <View style={[styles.row, mine && styles.rowMine, !continued && styles.rowFirst]}>
      {!mine ? (
        <View style={styles.avatarSlot}>
          {!continued ? <Avatar name={message.user_name} id={message.user_id} size={30} /> : null}
        </View>
      ) : null}
      <Pressable
        onLongPress={onLongPress}
        disabled={!onLongPress}
        delayLongPress={350}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
      >
        {!mine && !continued ? (
          <Text style={[styles.author, { color: avatarColor(message.user_id) }]} numberOfLines={1}>
            {message.user_name}
          </Text>
        ) : null}
        <Text style={[styles.text, mine && styles.textMine]}>{message.text}</Text>
        <Text style={[styles.time, mine && styles.timeMine]}>{formatTime(message.created_at)}</Text>
      </Pressable>
    </View>
  );
}

// Дата над сообщениями одного дня: «Сегодня», «Вчера», «5 ноября»
function DayLabel({ date }) {
  return (
    <View style={styles.day}>
      <Text style={styles.dayText}>{dayLabel(date)}</Text>
    </View>
  );
}

// Чата нет: группу удалили или вас из неё убрали
function NotFound() {
  return (
    <View style={styles.notFound}>
      <EmptyState
        icon="search-outline"
        title={t("Группа не найдена")}
        text={t("Возможно, её удалили. Вернитесь к списку подписок.")}
        action={
          <Button
            title={t("Назад")}
            icon="arrow-back"
            small
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cloud },
  list: { paddingHorizontal: 12, paddingVertical: 12 },
  olderLoading: { marginVertical: 12 },
  empty: { flex: 1, justifyContent: "center", padding: 20 },
  notFound: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: colors.cloud },

  reloadError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: radius.m,
    backgroundColor: "rgba(255, 107, 107, 0.12)",
  },
  reloadErrorText: { flex: 1, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, color: colors.text },

  // Сообщения
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 3 },
  rowFirst: { marginTop: 10 },
  rowMine: { justifyContent: "flex-end" },
  avatarSlot: { width: 30 }, // место под кружок есть и у продолжений — сообщения стоят ровно
  bubble: {
    maxWidth: "80%",
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  bubbleMine: { backgroundColor: colors.sapphire, borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: colors.white, borderBottomLeftRadius: 6, ...shadow },
  author: { fontFamily: fonts.semibold, fontSize: 13.5, marginBottom: 2 },
  text: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 21, color: colors.text },
  textMine: { color: colors.white },
  time: { alignSelf: "flex-end", marginTop: 2, fontFamily: fonts.regular, fontSize: 11.5, color: colors.textMuted },
  timeMine: { color: colors.lavender },

  day: {
    alignSelf: "center",
    marginTop: 14,
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.round,
    backgroundColor: "rgba(57, 89, 191, 0.1)",
  },
  dayText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted },

  // Поле ввода
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    minHeight: INPUT_MIN,
    maxHeight: INPUT_MAX,
    paddingTop: 11,
    paddingBottom: 11,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.cloud,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: "center",
    outlineStyle: "none", // убирает рамку браузера в веб-версии
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sapphire,
  },
  sendDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
