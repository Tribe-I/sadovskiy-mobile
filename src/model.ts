export const statuses = ["Не начато", "В работе", "Выполнено", "N/A"] as const;
export type Status = (typeof statuses)[number];
export type Item = {
  id: string;
  text: string;
  competence: string;
  stage: string;
  required: string;
  status: Status;
  comment: string;
  version: number;
  gate?: "DoR" | "DoD";
};
export type Event = { actor: string; at: string; text: string };
export type Feature = {
  id: string;
  title: string;
  description: string;
  items: Item[];
  history: Event[];
};
export type Workspace = { team: string; features: Feature[] };
export function progress(items: Item[]) {
  const applicable = items.filter((i) => i.status !== "N/A");
  const done = applicable.filter((i) => i.status === "Выполнено").length;
  return {
    done,
    total: applicable.length,
    percent: applicable.length
      ? Math.round((done / applicable.length) * 100)
      : null,
  };
}
export function gate(items: Item[], name: "DoR" | "DoD") {
  const list = items.filter((i) => i.gate === name && i.status !== "N/A");
  return list.length > 0 && list.every((i) => i.status === "Выполнено");
}
export function competencies(items: Item[]) {
  return [...new Set(items.filter((i) => !i.gate).map((i) => i.competence))];
}
export function checklist(items: Item[]) {
  return items.filter((i) => !i.gate);
}
export function changeItem(
  feature: Feature,
  id: string,
  status: Status,
  comment: string,
  actor: string,
): Feature {
  if (status === "N/A" && !comment.trim()) throw new Error("Укажи причину N/A");
  return {
    ...feature,
    items: feature.items.map((i) =>
      i.id === id ? { ...i, status, comment, version: i.version + 1 } : i,
    ),
    history: [
      { actor, at: new Date().toISOString(), text: `${id}: ${status}` },
      ...feature.history,
    ],
  };
}
