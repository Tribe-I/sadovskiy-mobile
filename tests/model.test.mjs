import { test } from "node:test";
import assert from "node:assert/strict";
import { progress, gate, checklist, changeItem } from "../src/model.ts";
const item = (status, extra = {}) => ({
  id: "1",
  text: "Задача",
  competence: "QA",
  stage: "Проверка",
  required: "Обязательно",
  status,
  comment: "",
  version: 1,
  ...extra,
});
test("N/A excludes denominator; no applicable items has no percentage", () => {
  assert.deepEqual(
    progress([item("Выполнено"), item("Не начато"), item("N/A")]),
    { done: 1, total: 2, percent: 50 },
  );
  assert.equal(progress([item("N/A")]).percent, null);
  assert.equal(progress([]).percent, null);
});
test("overall completion does not imply readiness; empty gate is not ready", () => {
  const items = [
    item("Выполнено"),
    item("Не начато", { id: "R", gate: "DoR" }),
  ];
  assert.equal(progress(checklist(items)).percent, 100);
  assert.equal(gate(items, "DoR"), false);
  assert.equal(gate(items, "DoD"), false);
});
test("N/A requires reason; change is immutable and creates history", () => {
  const feature = {
    id: "a",
    title: "Фича",
    description: "",
    items: [item("Не начато")],
    history: [],
  };
  assert.throws(() => changeItem(feature, "1", "N/A", "  ", "Участник"));
  const next = changeItem(feature, "1", "Выполнено", "Проверено", "Участник");
  assert.equal(feature.items[0].status, "Не начато");
  assert.equal(next.items[0].version, 2);
  assert.equal(next.history[0].actor, "Участник");
});
