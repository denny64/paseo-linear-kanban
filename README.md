# Linear Kanban for Paseo

A kanban board for [Paseo](https://paseo.sh) that stores everything in [Linear](https://linear.app) issues. It has no database and no extra service; the board is your Linear team's workflow.

Each card is an issue. Pick a card, choose an agent, and Paseo starts it in a new worktree with the issue attached.

## Install

```bash
paseo plugin add denny64/paseo-linear-kanban
```

Open **Kanban** in the Paseo sidebar and choose a project. The first time, paste a Linear personal API key (Linear → Settings → Security & access) and pick the Linear team whose issues belong to the project.

This plugin needs:

- Paseo 0.9.2 or later.
- A Linear personal API key. It's saved in the plugin's host settings on the machine running the Paseo daemon, which calls Linear with it.
- A git project in Paseo for each team you link, since agents run in worktrees of it.

## How the board maps to Linear

| Column      | Linear workflow state                                       |
| ----------- | ----------------------------------------------------------- |
| To do       | Triage, Backlog or Unstarted (such as **Todo**)              |
| In progress | Started, except review states                               |
| In review   | A started state whose name contains "review" (**In Review**) |
| Done        | Completed                                                   |

Canceled issues aren't on the board.

Drag a card to another column to move it. On touch screens, long-press it first, and on a phone drop it on the column tabs. You can also use the buttons in the card view. Moving a card sets the issue's state to the team's first state for that column, and To do prefers **Todo** over **Backlog**. Moving to In review needs a review state in the team's workflow. You can manage the same board from Linear or an agent.

In the card view, **Mark done** moves the issue to the team's completed state. **Archive** hides the card. An open issue moves to **Canceled**. A done issue is archived in Linear and stays completed. Reopen or unarchive it in Linear to bring it back.

To clear out Done, use the archive button on a done card or **Clear** in the Done column's heading.

**New card** creates an issue in the project's team. The board refreshes every minute and when you press refresh.

Choose **All projects** in the project picker to see every linked team's issues on one board. "New card" asks which project the issue belongs to. Projects linked to the same team appear once. The combined board refreshes every 5 minutes instead of every minute.

To change a project's team or replace the API key, open the project picker.

The toggle in the header switches between the board and a **list view**. The list shows every card on one page, grouped by column, with its labels, assignee and last update. Paseo remembers which view you chose.

## Starting an agent

Press the ▶ button on a card or list row, or open the card, choose an agent and edit the first message if you want, then press **Start agent**. The plugin:

1. Creates a workspace on a new worktree branched from the project.
2. Starts the agent there with the issue attached.
3. Moves the card to **In progress**.

By default the first message tells the agent to open a pull request that includes `Fixes ENG-12`. With Linear's [GitHub integration](https://linear.app/docs/github) turned on, the card then moves on its own:

- When the pull request opens, Linear moves the issue to **In Review**.
- When the pull request merges, Linear moves it to **Done**.

## Limitations

- The board shows up to 250 open issues and the 30 most recently completed ones per team.
- Dragging moves a card between columns but not within one. Cards are sorted by last update.

## Development

```bash
npm install
npm run typecheck
npm test
paseo plugin install "$PWD"      # then: paseo plugin reload paseo-linear-kanban
```

## License

MIT
