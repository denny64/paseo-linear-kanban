import assert from "node:assert/strict";
import { test } from "node:test";
import { columnFor, stateFor } from "../shared/columns.ts";

const states = [
  { id: "triage", name: "Triage", type: "triage", position: -1 },
  { id: "backlog", name: "Backlog", type: "backlog", position: 0 },
  { id: "todo", name: "Todo", type: "unstarted", position: 1 },
  { id: "progress", name: "In Progress", type: "started", position: 2 },
  { id: "review", name: "In Review", type: "started", position: 3 },
  { id: "done", name: "Done", type: "completed", position: 4 },
  { id: "canceled", name: "Canceled", type: "canceled", position: 5 },
  { id: "duplicate", name: "Duplicate", type: "canceled", position: 6 },
];

test("columnFor derives the column from the workflow state", () => {
  assert.equal(columnFor({ name: "Backlog", type: "backlog" }), "todo");
  assert.equal(columnFor({ name: "Triage", type: "triage" }), "todo");
  assert.equal(columnFor({ name: "Todo", type: "unstarted" }), "todo");
  assert.equal(columnFor({ name: "In Progress", type: "started" }), "in-progress");
  assert.equal(columnFor({ name: "Code review", type: "started" }), "in-review");
  assert.equal(columnFor({ name: "Done", type: "completed" }), "done");
  assert.equal(columnFor({ name: "Canceled", type: "canceled" }), null);
});

test("stateFor picks the team state a column moves to", () => {
  assert.equal(stateFor(states, "todo")?.id, "todo");
  assert.equal(stateFor(states.filter((s) => s.id !== "todo"), "todo")?.id, "backlog");
  assert.equal(stateFor(states, "in-progress")?.id, "progress");
  assert.equal(stateFor(states, "in-review")?.id, "review");
  assert.equal(stateFor(states, "done")?.id, "done");
  assert.equal(stateFor(states, "canceled")?.id, "canceled");
  assert.equal(stateFor(states.filter((s) => s.id !== "review"), "in-review"), undefined);
});
