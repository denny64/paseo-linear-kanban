import type { PaseoAgentConfig, PaseoApi, PaseoProject } from "./paseo-types";
import { usePaseo, useSettings } from "@getpaseo/plugin/client";
import { Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { ExternalLink, SettingsCard, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { boardSettings, type Card, COLUMNS, type ColumnId } from "../shared/board";
import { type AgentConfig, startAgent } from "../shared/start-agent";
import { runAtLabel, schedulePresets } from "../shared/time";
import { Button, errorMessage, inputStyle, LabelPill, ProjectTag, ScheduleBadge, type Theme } from "./controls";
import { ImageAttachments, useImages } from "./images";
import { repoKey, useScheduleActions, useSchedules } from "./use-boards";

const NOW = "now";

// "Fixes ENG-12" links the pull request in Linear, which moves the issue to
// In Review when it opens and Done when it merges (with the GitHub integration on).
export function agentPrompt(card: Card): string {
  return [
    `Work on Linear issue ${card.identifier}: ${card.title}`,
    "The issue is attached.",
    "",
    "When you're done:",
    `Commit your work and open a pull request whose description includes "Fixes ${card.identifier}".`,
  ].join("\n");
}

type Choice = { value: string; label: string };
type AgentOption = Choice & { config: PaseoAgentConfig; thinking: Choice[]; defaultThinking?: string };

// ponytail: hand-picked "provider/model", in menu order; edit when a new model ships.
const PINNED_MODELS = ["claude/claude-fable-5-1", "claude/claude-opus-5-5", "codex/gpt-6-astra", "codex/gpt-5.6-sol"];

type Model = NonNullable<Awaited<ReturnType<PaseoApi["providers"]["snapshot"]>>["entries"][number]["models"]>[number];

const thinkingOf = (model: Model | undefined) => ({
  thinking: (model?.thinkingOptions ?? []).map((option) => ({ value: option.id, label: option.label })),
  defaultThinking: model?.defaultThinkingOptionId ?? model?.thinkingOptions?.find((option) => option.isDefault)?.id,
});

// Your Paseo agent profiles (they carry mode and feature settings), then the
// pinned models no profile already covers, in PINNED_MODELS order.
async function loadAgentOptions(paseo: PaseoApi, cwd: string) {
  const [{ config }, { entries }] = await Promise.all([paseo.config.get(), paseo.providers.snapshot({ cwd })]);
  const ready = entries.filter((entry) => entry.enabled !== false && entry.status === "ready");
  const readyIds = new Set(ready.map((entry) => entry.provider));
  const models = new Map<string, { entry: (typeof ready)[number]; model: Model }>(
    ready.flatMap((entry) => (entry.models ?? []).map((model) => [`${entry.provider}/${model.id}`, { entry, model }])),
  );
  const profiles = (config.agentProfiles ?? [])
    .filter((profile) => readyIds.has(profile.provider))
    .map((profile) => {
      const key = profile.model ? `${profile.provider}/${profile.model}` : profile.provider;
      const { thinking, defaultThinking } = thinkingOf(models.get(key)?.model);
      return {
        key,
        value: `profile:${profile.id}`,
        label: profile.name,
        config: {
          provider: key,
          modeId: profile.modeId,
          thinkingOptionId: profile.thinkingOptionId,
          featureValues: profile.featureValues,
        },
        thinking,
        defaultThinking: profile.thinkingOptionId ?? defaultThinking,
      };
    });
  const pinned = PINNED_MODELS.filter((key) => models.has(key) && !profiles.some((p) => p.key === key)).map((key) => {
    const { entry, model } = models.get(key)!;
    return {
      key,
      value: `model:${key}`,
      label: `${entry.label ?? entry.provider} · ${model.label}`,
      config: { provider: key },
      ...thinkingOf(model),
    };
  });
  // Profiles for unpinned models go last.
  const rank = (key: string) => (PINNED_MODELS.includes(key) ? PINNED_MODELS.indexOf(key) : PINNED_MODELS.length);
  const options: AgentOption[] = [...profiles, ...pinned].sort((a, b) => rank(a.key) - rank(b.key));
  return { options, loading: entries.some((entry) => entry.status === "loading") };
}

// Paseo's git projects: where an agent's worktree can come from.
function useGitProjects() {
  const paseo = usePaseo();
  const queryClient = useQueryClient();
  useEffect(
    () => paseo.projects.subscribe(() => queryClient.invalidateQueries({ queryKey: ["projects"] })),
    [paseo, queryClient],
  );
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await paseo.projects.list()).projects.filter((p) => p.projectKind === "git"),
  });
}

// Repo, agent and thinking level for a new agent on issues under `linkKey`
// (see repoKey). Defaults to the repo last used for that key, then the last
// repo, agent and thinking level used at all.
export function useAgentPicker(linkKey: string) {
  const paseo = usePaseo();
  const settings = useSettings(boardSettings);
  const saved = settings.status === "ready" ? settings.values : null;
  const projects = useGitProjects();
  const [pickedRepo, setRepo] = useState<string | null>(null);
  const repos = projects.data ?? [];
  const project = repos.find((p) => p.projectId === (pickedRepo ?? saved?.repos[linkKey] ?? saved?.repo)) ?? repos[0];
  const cwd = project?.projectRootPath;

  const query = useQuery({
    queryKey: ["agents", cwd],
    queryFn: () => loadAgentOptions(paseo, cwd!),
    enabled: !!cwd,
    refetchInterval: (query) => (query.state.data?.loading ? 2_000 : false),
  });
  const [pickedAgent, setAgent] = useState<string | null>(null);
  const [pickedThinking, setThinking] = useState<string | null>(null);

  const options = query.data?.options ?? [];
  const agent = options.find((o) => o.value === (pickedAgent ?? saved?.agent)) ?? options[0];
  // A level the new model doesn't have falls back to its default.
  const thinking =
    agent?.thinking.find((t) => t.value === (pickedThinking ?? saved?.thinking))?.value ??
    agent?.defaultThinking ??
    agent?.thinking[0]?.value;
  const config = agent && (thinking ? { ...agent.config, thinkingOptionId: thinking } : agent.config);

  // One save for every choice: separate saves would race on the settings revision.
  const remember = (patch: Partial<NonNullable<typeof saved>> = {}) => {
    if (settings.status !== "ready" || !agent || !project) return;
    const { values } = settings;
    void settings.save(
      {
        ...values,
        agent: agent.value,
        thinking: thinking ?? values.thinking,
        repo: project.projectId,
        repos: { ...values.repos, [linkKey]: project.projectId },
        ...patch,
      },
      settings.revision,
    );
  };

  return { projects, project, setRepo, query, options, agent, thinking, config, setAgent, setThinking, remember };
}

export function AgentPicker({ theme, picker }: { theme: Theme; picker: ReturnType<typeof useAgentPicker> }) {
  const { projects, project, query, options, agent, thinking } = picker;
  const muted = { color: theme.colors.foregroundMuted, fontSize: 13 };
  if (!project) {
    return (
      <Text style={muted}>
        {projects.isError ? errorMessage(projects.error) : projects.isLoading ? "Loading projects…" : "Add a git project in Paseo to start agents."}
      </Text>
    );
  }
  return (
    <SettingsCard>
      <SettingsSelect
        label="Project"
        hint="The agent works in a new worktree of it, with this issue attached."
        value={project.projectId}
        options={projects.data!.map((p) => ({ value: p.projectId, label: p.projectDisplayName }))}
        onValueChange={picker.setRepo}
      />
      {agent ? (
        <SettingsSelect label="Agent" value={agent.value} options={options} onValueChange={picker.setAgent} />
      ) : (
        <Text style={[muted, { padding: 12 }]}>
          {query.isError ? errorMessage(query.error) : query.isLoading || query.data?.loading ? "Loading agents…" : "No agents are ready on this host."}
        </Text>
      )}
      {agent && thinking ? (
        <SettingsSelect label="Thinking" value={thinking} options={agent.thinking} onValueChange={picker.setThinking} />
      ) : null}
    </SettingsCard>
  );
}

export function CardModal({
  theme,
  card,
  reference,
  onClose,
  onMove,
  onArchive,
  onAgentStarted,
}: {
  theme: Theme;
  card: Card;
  reference: string;
  onClose(): void;
  onMove(column: ColumnId): void;
  onArchive(): void;
  onAgentStarted(agentId: string): void;
}) {
  const heading = { color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const };
  return (
    <Modal title={reference} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "600", lineHeight: 24 }} selectable>
          {card.title}
        </Text>
        {card.project || card.labels.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            {card.project ? <ProjectTag theme={theme} name={card.project.name} color={card.project.color} /> : null}
            {card.labels.map((label) => (
              <LabelPill key={label.name} theme={theme} name={label.name} color={label.color} />
            ))}
          </View>
        ) : null}
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 14, lineHeight: 20 }} selectable>
          {card.body.trim() || "No description."}
        </Text>
        <ExternalLink href={card.url}>Open in Linear</ExternalLink>

        <View style={{ gap: 8 }}>
          <Text style={heading}>COLUMN</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {COLUMNS.map((column) => (
              <Button
                key={column.id}
                theme={theme}
                label={column.title}
                primary={column.id === card.column}
                accessibilityLabel={`Move to ${column.title}`}
                onPress={() => column.id !== card.column && onMove(column.id)}
              />
            ))}
          </View>
        </View>

        {card.column !== "done" ? (
          <StartAgent theme={theme} card={card} onStarted={onAgentStarted} onClose={onClose} />
        ) : null}

        <View style={{ gap: 8 }}>
          <Text style={heading}>ISSUE</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {card.column !== "done" ? (
              <Button theme={theme} label="Mark done" icon="CircleCheck" onPress={() => onMove("done")} />
            ) : null}
            <Button theme={theme} label="Archive" icon="Archive" onPress={onArchive} />
          </View>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {card.column === "done"
              ? "Archive archives the issue in Linear; it stays completed. Unarchive it in Linear to bring it back."
              : "Archive moves the issue to Canceled and hides it. Reopen it in Linear to bring it back."}
          </Text>
        </View>
      </Modal.Content>
    </Modal>
  );
}

// "Start agent" straight from a card tile or list row, without the card view.
export function StartAgentModal({
  theme,
  card,
  reference,
  onClose,
  onStarted,
}: {
  theme: Theme;
  card: Card;
  reference: string;
  onClose(): void;
  onStarted(agentId: string): void;
}) {
  return (
    <Modal title={`Start agent on ${reference}`} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600", lineHeight: 22 }}>{card.title}</Text>
        <StartAgent theme={theme} card={card} onStarted={onStarted} onClose={onClose} showHeading={false} />
      </Modal.Content>
    </Modal>
  );
}

function StartAgent({
  theme,
  card,
  onStarted,
  onClose,
  showHeading = true,
}: {
  theme: Theme;
  card: Card;
  onStarted(agentId: string): void;
  onClose(): void;
  showHeading?: boolean;
}) {
  const paseo = usePaseo();
  const toast = useToast();
  const picker = useAgentPicker(repoKey(card.project?.id, card.team.id));
  const [prompt, setPrompt] = useState(() => agentPrompt(card));
  const images = useImages(true, toast.error);
  const scheduled = useSchedules().get(card.id);
  const schedules = useScheduleActions((error) => toast.error(`Couldn't update the schedule: ${errorMessage(error)}`));
  // Fixed when the view opens, so "In 1 hour" doesn't drift while you type.
  const [presets] = useState(() => schedulePresets());
  const [when, setWhen] = useState(NOW);
  const runAt = presets.find((p) => p.at === when)?.at;

  const start = useMutation({
    mutationFn: ({ project, config }: { project: PaseoProject; config: AgentConfig }) =>
      startAgent(paseo, { card, project, config, prompt, images: images.images }),
    onSuccess: (agentId) => {
      picker.remember();
      if (scheduled) schedules.cancel.mutate(scheduled);
      onStarted(agentId);
    },
    onError: (error) => toast.error(`Couldn't start the agent: ${errorMessage(error)}`),
  });
  const schedule = (config: AgentConfig, at: string) => {
    const { project } = picker;
    if (!project) return;
    const { projectId, projectRootPath } = project;
    schedules.create.mutate(
      { card, runAt: at, project: { projectId, projectRootPath }, config: { ...config }, prompt },
      {
        onSuccess: () => {
          picker.remember();
          toast.show(`${card.identifier} starts at ${runAtLabel(at)}.`);
          onClose();
        },
      },
    );
  };
  const { project, config } = picker;
  const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };

  return (
    <View style={{ gap: 8 }}>
      {showHeading ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" }}>START AN AGENT</Text>
      ) : null}
      {scheduled ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ScheduleBadge theme={theme} schedule={scheduled} long />
          <View style={{ flex: 1 }} />
          <Button
            theme={theme}
            label={scheduled.error ? "Dismiss" : "Cancel"}
            accessibilityLabel={scheduled.error ? "Dismiss the failed schedule" : "Cancel the scheduled start"}
            disabled={schedules.cancel.isPending}
            onPress={() => schedules.cancel.mutate(scheduled)}
          />
        </View>
      ) : null}
      <AgentPicker theme={theme} picker={picker} />
      <TextInput
        accessibilityLabel="First message"
        value={prompt}
        onChangeText={setPrompt}
        multiline
        style={inputStyle(theme, true)}
        placeholderTextColor={theme.colors.foregroundMuted}
      />
      <ImageAttachments theme={theme} images={images} />
      <SettingsCard>
        <SettingsSelect
          label="When"
          hint={runAt ? "Paseo starts the agent then, even with the app closed." : undefined}
          value={when}
          options={[{ value: NOW, label: "Now" }, ...presets.map((p) => ({ value: p.at, label: p.label }))]}
          onValueChange={setWhen}
        />
      </SettingsCard>
      {runAt && images.images.length > 0 ? <Text style={muted}>Images aren't kept for scheduled starts.</Text> : null}
      <View style={{ flexDirection: "row" }}>
        {runAt ? (
          <Button
            theme={theme}
            label={schedules.create.isPending ? "Scheduling…" : scheduled ? "Reschedule" : "Schedule"}
            icon="Clock"
            primary
            disabled={!project || !config || !prompt.trim() || schedules.create.isPending}
            onPress={() => project && config && schedule(config, runAt)}
          />
        ) : (
          <Button
            theme={theme}
            label={start.isPending ? "Starting…" : "Start agent"}
            icon="Play"
            primary
            disabled={!project || !config || !prompt.trim() || start.isPending}
            onPress={() => project && config && start.mutate({ project, config })}
          />
        )}
      </View>
    </View>
  );
}
