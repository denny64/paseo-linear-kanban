// No imports: the test runs this file directly under Node's type stripping.

// The board has no storage of its own. A card is a Linear issue and its column
// is derived from the issue's workflow state: completed = done, a started state
// named like "In Review" = in review, any other started state = in progress,
// otherwise todo. Canceled issues aren't on the board.
export const COLUMNS = [
  { id: "todo", title: "To do" },
  { id: "in-progress", title: "In progress" },
  { id: "in-review", title: "In review" },
  { id: "done", title: "Done" },
] as const;

export type ColumnId = (typeof COLUMNS)[number]["id"];

export type WorkflowState = { id: string; name: string; type: string; position: number };

export function columnFor(state: { name: string; type: string }): ColumnId | null {
  if (state.type === "completed") return "done";
  if (state.type === "canceled") return null;
  if (state.type === "started") return /review/i.test(state.name) ? "in-review" : "in-progress";
  return "todo"; // triage, backlog, unstarted
}

// The team state a card moves to for `column`. Todo prefers "Todo" over
// "Backlog" over "Triage"; otherwise the first state in the team's order.
export function stateFor(states: readonly WorkflowState[], column: ColumnId | "canceled"): WorkflowState | undefined {
  const rank = (s: WorkflowState) => ["unstarted", "backlog", "triage"].indexOf(s.type);
  return states
    .filter((s) => (column === "canceled" ? s.type === "canceled" : columnFor(s) === column))
    .sort((a, b) => rank(a) - rank(b) || a.position - b.position)[0];
}
