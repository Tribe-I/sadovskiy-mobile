import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { api, ApiError, configured, session } from "./src/api";
import { demoWorkspace, makeDemoFeature } from "./src/demo";
import {
  changeItem,
  checklist,
  competencies,
  gate,
  progress,
  statuses,
} from "./src/model";
import type { Feature, Item, Status, Workspace } from "./src/model";

const C = {
  bg: "#F4F5F9",
  paper: "#FFFFFF",
  ink: "#20223A",
  muted: "#62667D",
  line: "#E4E6EF",
  accent: "#5553D8",
  soft: "#EEEDFF",
  mint: "#D9F4E7",
  green: "#206447",
};
type Screen = "home" | "feature" | "create" | "about";
function Button({
  label,
  onPress,
  quiet = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  quiet?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        quiet && s.quiet,
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      <Text style={[s.buttonText, quiet && { color: C.accent }]}>{label}</Text>
    </Pressable>
  );
}
function Bar({ items }: { items: Item[] }) {
  const p = progress(items);
  return (
    <View
      accessible
      accessibilityLabel={
        p.percent === null
          ? "Нет применимых пунктов"
          : `${p.done} из ${p.total}, ${p.percent} процентов`
      }
      style={s.track}
    >
      <View style={[s.fill, { width: `${p.percent || 0}%` }]} />
    </View>
  );
}
function Pill({
  children,
  ready = false,
}: {
  children: React.ReactNode;
  ready?: boolean;
}) {
  return (
    <View style={[s.pill, ready && { backgroundColor: C.mint }]}>
      <Text style={[s.pillText, ready && { color: C.green }]}>{children}</Text>
    </View>
  );
}
function FeatureCard({
  feature,
  onPress,
}: {
  feature: Feature;
  onPress: () => void;
}) {
  const p = progress(checklist(feature.items));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${feature.title}, ${p.percent ?? 0} процентов`}
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}
    >
      <View style={s.row}>
        <Pill>ФИЧА</Pill>
        <Text style={s.arrow}>↗</Text>
      </View>
      <Text style={s.cardTitle}>{feature.title}</Text>
      <View style={s.row}>
        <Text style={s.muted}>Чеклист фичи</Text>
        <Text style={s.percent}>
          {p.percent === null ? "—" : `${p.percent}%`}
        </Text>
      </View>
      <Bar items={checklist(feature.items)} />
      <View style={s.wrap}>
        <Pill ready={gate(feature.items, "DoR")}>
          DoR {gate(feature.items, "DoR") ? "✓" : "· не готово"}
        </Pill>
        <Pill ready={gate(feature.items, "DoD")}>
          DoD {gate(feature.items, "DoD") ? "✓" : "· не готово"}
        </Pill>
        <Text style={s.small}>
          {p.done} из {p.total} пунктов
        </Text>
      </View>
      <View style={s.competencies}>
        {competencies(feature.items).map((name) => {
          const list = feature.items.filter((i) => i.competence === name);
          const value = progress(list);
          return (
            <View key={name} style={s.miniRole}>
              <View style={s.row}>
                <Text style={s.small}>{name}</Text>
                <Text style={s.small}>
                  {value.percent ?? "—"}
                  {value.percent !== null && "%"}
                </Text>
              </View>
              <Bar items={list} />
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState("Все");
  const [editing, setEditing] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<Status>("Не начато");
  const [comment, setComment] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["Android", "iOS"]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const writing = useRef(false);
  const reading = useRef(false);
  const feature = workspace?.features.find((f) => f.id === selected);
  useEffect(() => {
    mounted.current = true;
    const g = generation.current;
    session
      .read()
      .then(async (saved) => {
        if (!saved || !configured) return;
        const data = await api.workspace(saved);
        if (mounted.current && generation.current === g) {
          setToken(saved);
          setWorkspace(data);
          setSynced(new Date().toLocaleTimeString());
        }
      })
      .catch(async (e) => {
        if (e instanceof ApiError && e.status === 401) await session.clear();
        if (mounted.current && generation.current === g)
          setError("Сессию не удалось восстановить. Войди снова.");
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  async function refresh() {
    if (!token || writing.current || reading.current || editing) return;
    const g = generation.current;
    reading.current = true;
    try {
      const data = await api.workspace(token);
      if (g === generation.current && mounted.current && !writing.current) {
        setWorkspace(data);
        setSynced(new Date().toLocaleTimeString());
        setError("");
      }
    } catch (e) {
      if (g === generation.current)
        setError(e instanceof Error ? e.message : "Нет связи с сервером");
    } finally {
      reading.current = false;
    }
  }
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      void refresh();
    }, 15000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  });
  async function work(task: () => Promise<void>) {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError("");
    generation.current += 1;
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Что-то пошло не так");
      if (e instanceof ApiError && e.status === 409 && token) {
        try {
          setWorkspace(await api.workspace(token));
          setEditing(null);
        } catch {
          setError(
            "Конфликт статусов. Обнови данные после восстановления связи.",
          );
        }
      }
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  function enterDemo() {
    generation.current += 1;
    setDemo(true);
    setWorkspace(demoWorkspace());
    setError("");
  }
  async function signIn() {
    await work(async () => {
      const result = await api.login(login.trim(), password);
      const data = await api.workspace(result.token);
      await session.save(result.token);
      setToken(result.token);
      setDemo(false);
      setWorkspace(data);
      setPassword("");
      setSynced(new Date().toLocaleTimeString());
    });
  }
  async function leave() {
    await work(async () => {
      try {
        if (token) await api.logout(token);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
      } finally {
        await session.clear();
        setToken(null);
        setWorkspace(null);
        setDemo(false);
        setScreen("home");
        setSelected("");
        setEditing(null);
      }
    });
  }
  function open(f: Feature) {
    setSelected(f.id);
    setFilter("Все");
    setEditing(null);
    setScreen("feature");
  }
  async function saveItem() {
    if (!feature || !editing) return;
    const item = feature.items.find((i) => i.id === editing)!;
    if (draftStatus === "N/A" && !comment.trim()) {
      setError("Для N/A нужна причина");
      return;
    }
    await work(async () => {
      if (demo)
        setWorkspace(
          (w) =>
            w && {
              ...w,
              features: w.features.map((f) =>
                f.id === feature.id
                  ? changeItem(
                      f,
                      editing,
                      draftStatus,
                      comment.trim(),
                      "Ты · демо",
                    )
                  : f,
              ),
            },
        );
      else if (token) {
        setWorkspace(
          await api.update(
            token,
            feature.id,
            editing,
            draftStatus,
            comment.trim(),
            item.version,
          ),
        );
        setSynced(new Date().toLocaleTimeString());
      }
      setEditing(null);
    });
  }
  async function create() {
    if (!title.trim()) {
      setError("Добавь название фичи");
      return;
    }
    await work(async () => {
      if (demo) {
        const f = makeDemoFeature(title.trim());
        f.description = description.trim();
        setWorkspace((w) => w && { ...w, features: [f, ...w.features] });
        open(f);
      } else if (token) {
        const data = await api.create(
          token,
          title.trim(),
          description.trim(),
          platforms,
        );
        setWorkspace(data);
        open(data.features[0]);
      }
      setTitle("");
      setDescription("");
    });
  }
  return (
    <View style={s.shell}>
      <StatusBar style="dark" />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={s.brand}>
          <View style={s.logo}>
            <Text style={s.logoText}>f.</Text>
          </View>
          <Text style={s.brandText}>featureflow</Text>
          <Text style={s.brandMeta}>TEAM SPACE</Text>
        </View>
        {error ? (
          <View accessibilityRole="alert" style={s.error}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}
        {!workspace ? (
          <View style={s.welcome}>
            <Text style={s.eyebrow}>ОТ ИДЕИ ДО РЕЛИЗА</Text>
            <Text style={s.heroTitle}>Команда в одном{"\n"}ритме.</Text>
            <Text style={s.intro}>
              Весь путь фичи: задачи, компетенции и готовность к следующему
              шагу.
            </Text>
            <View style={s.card}>
              <Text style={s.cardTitle}>Пространство команды</Text>
              <Text style={s.label}>Логин</Text>
              <TextInput
                accessibilityLabel="Логин"
                value={login}
                onChangeText={setLogin}
                autoCapitalize="none"
                autoCorrect={false}
                style={s.input}
              />
              <Text style={s.label}>Пароль</Text>
              <TextInput
                accessibilityLabel="Пароль"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                style={s.input}
                onSubmitEditing={() => void signIn()}
              />
              <Button
                label={busy ? "Подключаемся…" : "Войти в команду →"}
                disabled={busy || !configured || !login || !password}
                onPress={() => void signIn()}
              />
              {!configured && (
                <Text style={s.small}>
                  Сервер ещё не подключён. Демо позволяет примерить интерфейс на
                  вымышленных фичах.
                </Text>
              )}
            </View>
            <Button
              label="Посмотреть демо"
              quiet
              disabled={busy}
              onPress={enterDemo}
            />
          </View>
        ) : (
          <>
            <View style={s.row}>
              <Text style={s.eyebrow}>{workspace.team}</Text>
              <Text style={s.small}>
                {demo
                  ? "Демо · без сохранения"
                  : synced
                    ? `Обновлено ${synced}`
                    : "Подключено"}
              </Text>
            </View>
            {screen === "home" && (
              <>
                <View style={s.heading}>
                  <Text style={s.heroTitle}>Фичи в работе</Text>
                  <Text style={s.intro}>
                    Большая картина.{"\n"}Каждый маленький шаг.
                  </Text>
                </View>
                <View style={s.row}>
                  <Text style={s.sectionTitle}>
                    {workspace.features.length} фичи
                  </Text>
                  <Button
                    label="+ Новая"
                    onPress={() => setScreen("create")}
                    disabled={busy}
                  />
                </View>
                {!demo && (
                  <Button
                    label="Обновить с сервера"
                    quiet
                    onPress={() => void refresh()}
                    disabled={busy}
                  />
                )}
                {workspace.features.map((f) => (
                  <FeatureCard key={f.id} feature={f} onPress={() => open(f)} />
                ))}
                {!workspace.features.length && (
                  <Text style={s.intro}>
                    Создай первую фичу — чеклист появится из шаблона команды.
                  </Text>
                )}
              </>
            )}
            {screen === "feature" && feature && (
              <>
                <Button
                  label="← Все фичи"
                  quiet
                  onPress={() => {
                    setEditing(null);
                    setScreen("home");
                  }}
                />
                <Text style={s.heroTitle}>{feature.title}</Text>
                {feature.description ? (
                  <Text style={s.intro}>{feature.description}</Text>
                ) : null}
                <View style={s.summary}>
                  <Text style={s.eyebrow}>ОБЩИЙ ЧЕКЛИСТ</Text>
                  <View style={s.row}>
                    <Text style={s.bigPercent}>
                      {progress(checklist(feature.items)).percent ?? "—"}
                      <Text style={s.percent}> %</Text>
                    </Text>
                    <Text style={s.muted}>
                      {progress(checklist(feature.items)).done} /{" "}
                      {progress(checklist(feature.items)).total} выполнено
                    </Text>
                  </View>
                  <Bar items={checklist(feature.items)} />
                  <View style={s.wrap}>
                    <Pill ready={gate(feature.items, "DoR")}>
                      DoR{" "}
                      {gate(feature.items, "DoR") ? "готово ✓" : "не готово"}
                    </Pill>
                    <Pill ready={gate(feature.items, "DoD")}>
                      DoD{" "}
                      {gate(feature.items, "DoD") ? "готово ✓" : "не готово"}
                    </Pill>
                  </View>
                </View>
                <Text style={s.sectionTitle}>Компетенции</Text>
                <View style={s.card}>
                  {competencies(feature.items).map((name) => {
                    const items = feature.items.filter(
                      (i) => i.competence === name,
                    );
                    const p = progress(items);
                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={name}
                        onPress={() => {
                          setFilter(name);
                          setEditing(null);
                        }}
                        style={s.roleRow}
                      >
                        <View style={s.row}>
                          <Text style={s.itemTitle}>{name}</Text>
                          <Text style={s.muted}>
                            {p.percent === null
                              ? "нет применимых"
                              : `${p.percent}%`}{" "}
                            ›
                          </Text>
                        </View>
                        <Bar items={items} />
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={s.sectionTitle}>Чеклист</Text>
                <View style={s.wrap}>
                  {["Все", ...competencies(feature.items), "DoR", "DoD"].map(
                    (name) => (
                      <Pressable
                        key={name}
                        accessibilityRole="button"
                        accessibilityState={{ selected: filter === name }}
                        onPress={() => {
                          setFilter(name);
                          setEditing(null);
                        }}
                        style={[s.chip, filter === name && s.selectedChip]}
                      >
                        <Text
                          style={[
                            s.chipText,
                            filter === name && { color: C.paper },
                          ]}
                        >
                          {name}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </View>
                {feature.items
                  .filter(
                    (i) =>
                      filter === "Все" ||
                      i.competence === filter ||
                      i.gate === filter,
                  )
                  .map((item) => (
                    <View style={s.card} key={item.id}>
                      <View style={s.row}>
                        <Text style={s.small}>
                          {item.gate || item.competence} · {item.stage}
                        </Text>
                        <Text style={s.small}>{item.id}</Text>
                      </View>
                      <Text style={s.itemTitle}>{item.text}</Text>
                      <View style={s.row}>
                        <Text style={s.small}>{item.required}</Text>
                        <Pill ready={item.status === "Выполнено"}>
                          {item.status}
                        </Pill>
                      </View>
                      {item.comment ? (
                        <Text style={s.muted}>{item.comment}</Text>
                      ) : null}
                      {editing !== item.id ? (
                        <Button
                          label="Обновить статус"
                          quiet
                          disabled={busy}
                          onPress={() => {
                            setEditing(item.id);
                            setDraftStatus(item.status);
                            setComment(item.comment);
                            setError("");
                          }}
                        />
                      ) : (
                        <>
                          <View style={s.wrap}>
                            {statuses.map((status) => (
                              <Pressable
                                key={status}
                                accessibilityRole="button"
                                accessibilityState={{
                                  selected: draftStatus === status,
                                }}
                                onPress={() => setDraftStatus(status)}
                                style={[
                                  s.chip,
                                  status === draftStatus && s.selectedChip,
                                ]}
                              >
                                <Text
                                  style={[
                                    s.chipText,
                                    status === draftStatus && {
                                      color: C.paper,
                                    },
                                  ]}
                                >
                                  {status}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                          <TextInput
                            accessibilityLabel="Комментарий или ссылка"
                            placeholder={
                              draftStatus === "N/A"
                                ? "Почему неприменимо? Обязательно"
                                : "Комментарий или ссылка"
                            }
                            placeholderTextColor={C.muted}
                            value={comment}
                            onChangeText={setComment}
                            style={[s.input, { minHeight: 84 }]}
                            multiline
                            maxLength={2000}
                          />
                          <View style={s.wrap}>
                            <Button
                              label={busy ? "Сохраняем…" : "Сохранить"}
                              disabled={busy}
                              onPress={() => void saveItem()}
                            />
                            <Button
                              label="Отмена"
                              quiet
                              disabled={busy}
                              onPress={() => setEditing(null)}
                            />
                          </View>
                        </>
                      )}
                    </View>
                  ))}
                <Text style={s.sectionTitle}>История изменений</Text>
                {feature.history.length ? (
                  feature.history.slice(0, 30).map((event, n) => (
                    <View style={s.history} key={`${event.at}-${n}`}>
                      <Text style={s.itemTitle}>{event.text}</Text>
                      <Text style={s.small}>
                        {event.actor} · {new Date(event.at).toLocaleString()}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={s.muted}>Здесь появятся изменения команды.</Text>
                )}
              </>
            )}
            {screen === "create" && (
              <>
                <Button
                  label="← Все фичи"
                  quiet
                  onPress={() => setScreen("home")}
                />
                <Text style={s.heroTitle}>Новая фича</Text>
                <Text style={s.intro}>
                  Начни с задачи. Командный чеклист уже рядом.
                </Text>
                <Text style={s.label}>Название</Text>
                <TextInput
                  accessibilityLabel="Название фичи"
                  value={title}
                  onChangeText={setTitle}
                  style={s.input}
                  maxLength={120}
                />
                <Text style={s.label}>Что делаем и зачем</Text>
                <TextInput
                  accessibilityLabel="Описание фичи"
                  value={description}
                  onChangeText={setDescription}
                  style={[s.input, { minHeight: 100 }]}
                  maxLength={2000}
                  multiline
                />
                <Text style={s.label}>Применимые платформы</Text>
                <View style={s.wrap}>
                  {["Android", "iOS", "PWA", "SDUI", "Middle"].map((name) => (
                    <Pressable
                      key={name}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: platforms.includes(name) }}
                      onPress={() =>
                        setPlatforms((p) =>
                          p.includes(name)
                            ? p.filter((n) => n !== name)
                            : [...p, name],
                        )
                      }
                      style={[
                        s.chip,
                        platforms.includes(name) && s.selectedChip,
                      ]}
                    >
                      <Text
                        style={[
                          s.chipText,
                          platforms.includes(name) && { color: C.paper },
                        ]}
                      >
                        {name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.small}>
                  В рабочем пространстве остальные платформы получат N/A с
                  причиной «не входит в объём фичи». В демо используется
                  компактный учебный шаблон.
                </Text>
                <Button
                  label={busy ? "Создаём…" : "Создать фичу →"}
                  disabled={busy || !title.trim()}
                  onPress={() => void create()}
                />
              </>
            )}
            {screen === "about" && (
              <>
                <Text style={s.heroTitle}>Ритм команды.{"\n"}В кармане.</Text>
                <Text style={s.intro}>
                  Featureflow объединяет чеклист фичи, прогресс компетенций и
                  историю решений.
                </Text>
                <View style={s.card}>
                  <Text style={s.sectionTitle}>Как считаем готовность</Text>
                  <Text style={s.muted}>
                    Выполненные пункты делим на применимые. N/A исключается из
                    знаменателя и требует причины. DoR и DoD проверяются
                    отдельно от общего процента.
                  </Text>
                  <Text style={s.itemTitle}>
                    Версия:{" "}
                    {process.env.EXPO_PUBLIC_COMMIT?.slice(0, 7) || "dev"}
                  </Text>
                  <Text style={s.small}>
                    {demo
                      ? "Демо: изменения живут только до выхода."
                      : "Данные хранятся на сервере команды. Обновление каждые 15 секунд и при возвращении в приложение. При конфликте статусов загружается актуальная версия."}
                  </Text>
                  <Button
                    label="Репозиторий ↗"
                    quiet
                    onPress={() => {
                      void Linking.openURL(
                        "https://github.com/Tribe-I/sadovskiy-mobile",
                      ).catch(() => setError("Не удалось открыть ссылку"));
                    }}
                  />
                </View>
                <Button
                  label={demo ? "Выйти из демо" : "Выйти из команды"}
                  quiet
                  disabled={busy}
                  onPress={() => void leave()}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
      {workspace && (
        <View style={s.nav}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setScreen("home")}
            style={s.navButton}
          >
            <Text
              style={[s.navText, screen !== "about" && { color: C.accent }]}
            >
              ▦ Фичи
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setScreen("about")}
            style={s.navButton}
          >
            <Text
              style={[s.navText, screen === "about" && { color: C.accent }]}
            >
              ⓘ О приложении
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: Platform.OS === "ios" ? 58 : 38,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 18,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: C.paper, fontWeight: "800", fontSize: 25 },
  brandText: {
    fontSize: 21,
    fontWeight: "700",
    color: C.ink,
    letterSpacing: -0.7,
  },
  brandMeta: {
    fontSize: 10,
    color: C.muted,
    letterSpacing: 1.4,
    marginLeft: "auto",
  },
  welcome: { gap: 22, paddingTop: 24 },
  heading: { gap: 12, marginVertical: 6 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: C.muted,
  },
  heroTitle: {
    fontSize: 35,
    lineHeight: 40,
    letterSpacing: -1.4,
    color: C.ink,
    fontWeight: "700",
  },
  intro: { fontSize: 16, lineHeight: 24, color: C.muted },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  wrap: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  card: { backgroundColor: C.paper, borderRadius: 24, padding: 20, gap: 16 },
  cardTitle: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "600",
    letterSpacing: -0.5,
    color: C.ink,
  },
  arrow: { fontSize: 26, color: C.accent },
  muted: { color: C.muted, fontSize: 14, lineHeight: 21 },
  small: { color: C.muted, fontSize: 12, lineHeight: 18 },
  percent: { fontSize: 21, fontWeight: "600", color: C.ink },
  track: {
    height: 6,
    backgroundColor: C.line,
    borderRadius: 6,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: C.accent, borderRadius: 6 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: C.soft,
    borderRadius: 8,
  },
  pillText: { color: C.accent, fontSize: 11, fontWeight: "600" },
  competencies: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: C.line,
  },
  miniRole: { width: "46%", gap: 6 },
  button: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  quiet: { backgroundColor: C.soft },
  buttonText: { color: C.paper, fontSize: 14, fontWeight: "600" },
  input: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 15,
    fontSize: 16,
    color: C.ink,
  },
  label: { color: C.ink, fontSize: 14, fontWeight: "600" },
  nav: {
    flexDirection: "row",
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderColor: C.line,
    paddingBottom: Platform.OS === "ios" ? 30 : 22,
    paddingTop: 8,
  },
  navButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  navText: { fontSize: 14, color: C.muted, fontWeight: "600" },
  sectionTitle: { color: C.ink, fontSize: 19, fontWeight: "600" },
  summary: { gap: 18, paddingVertical: 10 },
  bigPercent: {
    fontSize: 64,
    fontWeight: "600",
    letterSpacing: -3,
    color: C.ink,
  },
  roleRow: { gap: 10, paddingVertical: 6 },
  itemTitle: { color: C.ink, fontSize: 16, fontWeight: "500", lineHeight: 23 },
  chip: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: C.paper,
    borderRadius: 12,
    justifyContent: "center",
  },
  selectedChip: { backgroundColor: C.accent },
  chipText: { color: C.muted, fontSize: 13, fontWeight: "500" },
  history: {
    borderLeftWidth: 2,
    borderColor: C.line,
    paddingLeft: 16,
    gap: 4,
    paddingVertical: 8,
  },
  error: { padding: 16, backgroundColor: "#FFE7EB", borderRadius: 14 },
  errorText: { color: "#AB3045", fontSize: 14, lineHeight: 21 },
});
