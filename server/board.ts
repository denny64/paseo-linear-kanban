import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import {
  archiveCardRpc,
  type Card,
  createCardRpc,
  listTeamsRpc,
  loadBoardRpc,
  moveCardRpc,
} from "../shared/board";
import { columnFor, stateFor, type WorkflowState } from "../shared/columns";
import { linear } from "./linear";

const CARD_FIELDS = `
  fragment Card on Issue {
    id identifier title description url updatedAt
    state { name type }
    team { id key name }
    project { id name color }
    labels { nodes { name color } }
    assignee { displayName }
  }
`;

type RawIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  updatedAt: string;
  state: { name: string; type: string };
  team: { id: string; key: string; name: string };
  project: { id: string; name: string; color: string } | null;
  labels: { nodes: { name: string; color: string }[] };
  assignee: { displayName: string } | null;
};

const hex = (color: string) => color.replace(/^#/, "");

function toCard(raw: RawIssue): Card {
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    body: raw.description ?? "",
    url: raw.url,
    // Only reached for canceled issues right after a move, which can't target canceled.
    column: columnFor(raw.state) ?? "todo",
    team: raw.team,
    project: raw.project && { ...raw.project, color: hex(raw.project.color) },
    labels: raw.labels.nodes.map(({ name, color }) => ({ name, color: hex(color) })),
    assignees: raw.assignee ? [raw.assignee.displayName] : [],
    updatedAt: raw.updatedAt,
  };
}

export async function listTeams(): Promise<RpcOutput<typeof listTeamsRpc>> {
  const data = await linear<{
    teams: { nodes: { id: string; key: string; name: string; projects: { nodes: { id: string; name: string }[] } }[] };
  }>(
    `query {
      teams(first: 250) {
        nodes {
          id key name
          projects(first: 250, filter: { status: { type: { nin: ["completed", "canceled"] } } }) { nodes { id name } }
        }
      }
    }`,
  );
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    teams: data.teams.nodes
      .map((team) => ({ ...team, projects: team.projects.nodes.sort(byName) }))
      .sort(byName),
  };
}

export async function loadBoard(): Promise<RpcOutput<typeof loadBoardRpc>> {
  // ponytail: capped at 250 open + 30 done issues across the workspace (one page
  // each); paginate or filter by team if a workspace outgrows that.
  const data = await linear<{ open: { nodes: RawIssue[] }; done: { nodes: RawIssue[] } }>(
    `query Board {
      open: issues(first: 250, orderBy: updatedAt, filter: { state: { type: { in: ["triage", "backlog", "unstarted", "started"] } } }) { nodes { ...Card } }
      done: issues(first: 30, orderBy: updatedAt, filter: { state: { type: { eq: "completed" } } }) { nodes { ...Card } }
    }
    ${CARD_FIELDS}`,
  );
  const cards = [...data.open.nodes, ...data.done.nodes]
    .map(toCard)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { cards };
}

export async function createCard(
  { teamId, projectId, title, body }: RpcInput<typeof createCardRpc>,
): Promise<RpcOutput<typeof createCardRpc>> {
  const { issueCreate } = await linear<{ issueCreate: { issue: RawIssue } }>(
    `mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { issue { ...Card } } }
    ${CARD_FIELDS}`,
    { input: { teamId, projectId: projectId ?? undefined, title, description: body || undefined } },
  );
  return toCard(issueCreate.issue);
}

async function issueState(id: string) {
  const { issue } = await linear<{
    issue: { state: { type: string }; team: { name: string; states: { nodes: WorkflowState[] } } };
  }>(
    `query State($id: String!) {
      issue(id: $id) { state { type } team { name states { nodes { id name type position } } } }
    }`,
    { id },
  );
  return issue;
}

async function setState(id: string, stateId: string): Promise<RawIssue> {
  const { issueUpdate } = await linear<{ issueUpdate: { issue: RawIssue } }>(
    `mutation Move($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) { issue { ...Card } }
    }
    ${CARD_FIELDS}`,
    { id, stateId },
  );
  return issueUpdate.issue;
}

export async function moveCard({ id, column }: RpcInput<typeof moveCardRpc>): Promise<RpcOutput<typeof moveCardRpc>> {
  const { team } = await issueState(id);
  const state = stateFor(team.states.nodes, column);
  if (!state) {
    throw new Error(
      column === "in-review"
        ? `${team.name} has no review state. Add a started state named "In Review" to its workflow in Linear.`
        : `${team.name} has no workflow state for that column.`,
    );
  }
  return toCard(await setState(id, state.id));
}

export async function archiveCard({ id }: RpcInput<typeof archiveCardRpc>): Promise<RpcOutput<typeof archiveCardRpc>> {
  const issue = await issueState(id);
  if (issue.state.type === "completed") {
    // Already done: archive it so Linear still says it was completed.
    await linear(`mutation Archive($id: String!) { issueArchive(id: $id) { success } }`, { id });
  } else {
    const canceled = stateFor(issue.team.states.nodes, "canceled");
    if (!canceled) throw new Error(`${issue.team.name} has no canceled state in Linear.`);
    await setState(id, canceled.id);
  }
  return {};
}
