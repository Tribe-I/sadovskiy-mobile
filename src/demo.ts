import type { Feature, Item, Workspace } from "./model";
const groups: Record<string, string[]> = {
  Продукт: [
    "Описать задачу пользователя",
    "Согласовать критерии успеха",
    "Проверить ограничения",
  ],
  Дизайн: [
    "Подготовить основной сценарий",
    "Проработать пустые состояния",
    "Проверить доступность",
  ],
  Аналитика: [
    "Описать события",
    "Проверить контракт API",
    "Согласовать пограничные случаи",
  ],
  Android: ["Собрать экран", "Подключить API", "Проверить ошибки сети"],
  iOS: ["Собрать экран", "Подключить API", "Проверить ошибки сети"],
  QA: [
    "Проверить основной сценарий",
    "Проверить маленький экран",
    "Провести регрессию",
  ],
};
export function makeDemoFeature(title: string, seeded = false): Feature {
  let n = 0;
  const items: Item[] = Object.entries(groups).flatMap(([competence, texts]) =>
    texts.map((text) => {
      const index = n++;
      return {
        id: `C-${index + 1}`,
        text,
        competence,
        stage: "Работа над фичей",
        required: "Обязательно",
        status:
          seeded && index < 11
            ? ("Выполнено" as const)
            : seeded && index < 14
              ? ("В работе" as const)
              : ("Не начато" as const),
        comment: "",
        version: 1,
      };
    }),
  );
  items.push(
    {
      id: "R-1",
      text: "Команда согласовала объём и критерии приёмки",
      competence: "Команда",
      stage: "Готовность",
      required: "Обязательно",
      status: seeded ? "Выполнено" : "Не начато",
      comment: "",
      version: 1,
      gate: "DoR",
    },
    {
      id: "D-1",
      text: "Результат принят и проверен на целевых платформах",
      competence: "Команда",
      stage: "Готовность",
      required: "Обязательно",
      status: "Не начато",
      comment: "",
      version: 1,
      gate: "DoD",
    },
  );
  return {
    id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    description: "Учебная фича. Все данные этого пространства вымышлены.",
    items,
    history: [],
  };
}
export function demoWorkspace(): Workspace {
  return {
    team: "Команда · демо",
    features: [
      makeDemoFeature("Быстрое повторение заказа", true),
      makeDemoFeature("Избранные адреса"),
    ],
  };
}
