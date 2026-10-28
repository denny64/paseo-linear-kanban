import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export { COLUMNS, type ColumnId } from "./columns";

export const columnIdSchema = z.enum(["todo", "in-progress", "in-review", "done"]);

export const cardSchema = z.object({
  id: z.string(),
  // Linear's reference, such as "ENG-12".
  identifier: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  column: columnIdSchema,
  team: z.object({ id: z.string(), key: z.string(), name: z.string() }),
  // The card's tag on the board. Colours are hex without the "#".
  project: z.object({ id: z.string(), name: z.string(), color: z.string() }).nullable(),
  labels: z.array(z.object({ name: z.string(), color: z.string() })),
  assignees: z.array(z.string()),
  updatedAt: z.string(),
});
export type Card = z.infer<typeof cardSchema>;

// Teams with their active projects, for "New card".
export const teamSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  projects: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type Team = z.infer<typeof teamSchema>;

export const listTeamsRpc = defineRpc({
  name: "teams.list",
  input: z.object({}),
  output: z.object({ teams: z.array(teamSchema) }),
});

// Every team's issues the API key can see, on one board.
export const loadBoardRpc = defineRpc({
  name: "board.load",
  input: z.object({}),
  output: z.object({ cards: z.array(cardSchema) }),
});

export const createCardRpc = defineRpc({
  name: "card.create",
  input: z.object({
    teamId: z.string(),
    projectId: z.string().nullable(),
    title: z.string().trim().min(1),
    body: z.string(),
  }),
  output: cardSchema,
});

export const moveCardRpc = defineRpc({
  name: "card.move",
  input: z.object({ id: z.string(), column: columnIdSchema }),
  output: cardSchema,
});

// Hide a card: an open issue moves to the team's canceled state; a done one is
// archived in Linear so its completed status stays. Both are hidden.
export const archiveCardRpc = defineRpc({
  name: "card.archive",
  input: z.object({ id: z.string() }),
  output: z.object({}),
});

// An agent start waiting for its time. The daemon runs it, so it happens with
// Paseo closed. `error` is set when the start failed; the card shows it.
export const scheduleSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  runAt: z.string(),
  error: z.string().nullable(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const createScheduleRpc = defineRpc({
  name: "schedule.create",
  input: z.object({
    card: cardSchema,
    runAt: z.string(),
    // The Paseo project the worktree branches from.
    project: z.object({ projectId: z.string(), projectRootPath: z.string() }),
    config: z.looseObject({ provider: z.string() }),
    prompt: z.string(),
  }),
  output: scheduleSchema,
});

export const listSchedulesRpc = defineRpc({
  name: "schedule.list",
  input: z.object({}),
  output: z.object({ schedules: z.array(scheduleSchema) }),
});

export const cancelScheduleRpc = defineRpc({
  name: "schedule.cancel",
  input: z.object({ id: z.string() }),
  output: z.object({}),
});

export const boardSettings = defineSettings({
  id: "board",
  scope: "host",
  version: 1,
  schema: z.object({
    // Personal API key from Linear → Settings → Security & access. Read by the daemon.
    apiKey: z.string().nullable().default(null),
    // Where agents run: Linear project id (or "team:<id>" for issues without
    // one) → the Paseo project last picked for it. `repo` is the last pick overall.
    repos: z.record(z.string(), z.string()).default({}),
    repo: z.string().nullable().default(null),
    // Last team and project used for "New card".
    newCard: z.object({ teamId: z.string(), projectId: z.string().nullable() }).nullable().default(null),
    // Last agent used from "Start agent": "profile:<id>" or "model:<provider>/<model>".
    agent: z.string().nullable().default(null),
    // Last thinking level picked for a model that offers them.
    thinking: z.string().nullable().default(null),
    view: z.enum(["board", "list"]).default("board"),
  }),
});
