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
  // Hex colour without the "#".
  labels: z.array(z.object({ name: z.string(), color: z.string() })),
  assignees: z.array(z.string()),
  updatedAt: z.string(),
});
export type Card = z.infer<typeof cardSchema>;

export const teamSchema = z.object({ id: z.string(), key: z.string(), name: z.string() });
export type Team = z.infer<typeof teamSchema>;

export const listTeamsRpc = defineRpc({
  name: "teams.list",
  input: z.object({}),
  output: z.object({ teams: z.array(teamSchema) }),
});

export const loadBoardRpc = defineRpc({
  name: "board.load",
  input: z.object({ teamId: z.string() }),
  output: z.object({ team: teamSchema, cards: z.array(cardSchema) }),
});

export const createCardRpc = defineRpc({
  name: "card.create",
  input: z.object({
    teamId: z.string(),
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

export const boardSettings = defineSettings({
  id: "board",
  scope: "host",
  version: 1,
  schema: z.object({
    // Personal API key from Linear → Settings → Security & access. Read by the daemon.
    apiKey: z.string().nullable().default(null),
    // Paseo project id → Linear team id. A project's board is its team's issues.
    teams: z.record(z.string(), z.string()).default({}),
    // Last opened Paseo project, so the board reopens where you left it.
    projectId: z.string().nullable().default(null),
    // Every linked project's issues on one board instead of a single project.
    allProjects: z.boolean().default(false),
    // Last agent used from "Start agent": "profile:<id>" or "model:<provider>/<model>".
    agent: z.string().nullable().default(null),
    // Last thinking level picked for a model that offers them.
    thinking: z.string().nullable().default(null),
    view: z.enum(["board", "list"]).default("board"),
  }),
});
