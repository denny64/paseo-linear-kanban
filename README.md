# Linear Kanban for Paseo

A kanban board for [Paseo](https://paseo.sh) that stores everything in [Linear](https://linear.app) issues. It has no database and no extra service. Every team's issues are on one board, and each card is tagged with its Linear project.

Pick a card, choose a project and an agent, and Paseo starts the agent in a new worktree with the issue attached.

## Install

```bash
paseo plugin add denny64/paseo-linear-kanban
```

Open **Kanban** in the Paseo sidebar. The first time, paste a Linear personal API key (Linear → Settings → Security & access). To replace the key later, use the settings button in the board's header.

This plugin needs:

- Paseo 0.9.2 or later.
- A Linear personal API key. It's saved in the plugin's host settings on the machine running the Paseo daemon, which calls Linear with it.
- At least one git project in Paseo for agents to work in.

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

**New card** creates an issue in the team and Linear project you choose, and remembers them for next time. The board refreshes every minute and when you press refresh.

The toggle in the header switches between the board and a **list view**. The list shows every card on one page, grouped by column, with its project, labels, assignee and last update. Paseo remembers which view you chose.

## Starting an agent

Press the ▶ button on a card or list row, or open the card. Choose the Paseo project the agent works in, choose an agent and edit the first message if you want, then press **Start agent**. The plugin remembers which Paseo project you picked for each Linear project, or for each team when an issue has no project, and picks it next time. Then it:

1. Creates a workspace on a new worktree branched from that project.
2. Starts the agent there with the issue attached.
3. Moves the card to **In progress**.

By default the first message tells the agent to open a pull request that includes `Fixes ENG-12`. With Linear's [GitHub integration](https://linear.app/docs/github) turned on, the card then moves on its own:

- When the pull request opens, Linear moves the issue to **In Review**.
- When the pull request merges, Linear moves it to **Done**.

## Scheduling an agent

To start an agent later, for example overnight, choose a time under **When** instead of **Now**, then press **Schedule**. The choices are in 1 or 3 hours, or the next 11 pm, 2 am or 9 am. The card shows a clock with the start time.

The Paseo daemon starts the agent at that time, even if the app is closed, using the agent, thinking level and first message you chose. Then it moves the issue to **In progress**. Images aren't kept for scheduled starts.

Open the card to reschedule or cancel. Starting the agent by hand also cancels the schedule. If a scheduled start fails, the card shows why until you dismiss it.

After the daemon restarts, a due start waits until the board loads or any agent does something, so it can run a few minutes late.

## Limitations

- The board shows up to 250 open issues and the 30 most recently completed ones, across every team the API key can see.
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
