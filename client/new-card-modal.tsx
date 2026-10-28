import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { SettingsCard, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { boardSettings, type Card, createCardRpc } from "../shared/board";
import { AgentPicker, agentPrompt, startAgentOn, useAgentPicker } from "./card-modal";
import { Button, errorMessage, inputStyle, type Theme } from "./controls";
import { ImageAttachments, useImages } from "./images";
import { useTeams } from "./linear-settings";
import { repoKey } from "./use-boards";

const NO_PROJECT = "";

export function NewCardModal({
  theme,
  open,
  onOpenChange,
  onCreated,
  onAgentStarted,
}: {
  theme: Theme;
  open: boolean;
  onOpenChange(open: boolean): void;
  onCreated(card: Card): void;
  onAgentStarted(card: Card, agentId: string): void;
}) {
  const paseo = usePaseo();
  const toast = useToast();
  const settings = useSettings(boardSettings);
  const saved = settings.status === "ready" ? settings.values.newCard : null;
  const createCard = useRpc(createCardRpc);
  const teams = useTeams(open);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<{ teamId: string; projectId: string | null } | null>(null);

  // Defaults to the team and project of the last card you created.
  const choice = picked ?? saved;
  const team = teams.data?.teams.find((t) => t.id === choice?.teamId) ?? teams.data?.teams[0];
  const projectId = team?.projects.some((p) => p.id === choice?.projectId) ? choice!.projectId : null;
  const picker = useAgentPicker(repoKey(projectId, team?.id));
  const images = useImages(open, toast.error);

  const create = useMutation({
    mutationFn: async (withAgent: boolean) => {
      if (!team) return;
      const card = await createCard({ teamId: team.id, projectId, title, body });
      onCreated(card);
      setTitle("");
      setBody("");
      const newCard = { teamId: team.id, projectId };
      if (withAgent && picker.project && picker.config) {
        // The issue exists either way, so a failed start only costs the agent.
        try {
          const agentId = await startAgentOn(paseo, card, picker.project, picker.config, agentPrompt(card), images.images);
          picker.remember({ newCard });
          onAgentStarted(card, agentId);
        } catch (error) {
          toast.error(`Created ${card.identifier}, but couldn't start the agent: ${errorMessage(error)}`);
        }
      } else if (settings.status === "ready") {
        void settings.save({ ...settings.values, newCard }, settings.revision);
      }
      images.clear();
      onOpenChange(false);
    },
    onError: (error) => toast.error(`Couldn't create the card: ${errorMessage(error)}`),
  });
  const submit = (withAgent: boolean) => title.trim() && team && !create.isPending && create.mutate(withAgent);

  return (
    <Modal title="New card" open={open} onOpenChange={onOpenChange}>
      <Modal.Content>
        {team ? (
          <SettingsCard>
            <SettingsSelect
              label="Team"
              value={team.id}
              options={teams.data!.teams.map((t) => ({ value: t.id, label: `${t.name} (${t.key})` }))}
              onValueChange={(teamId) => setPicked({ teamId, projectId: null })}
            />
            <SettingsSelect
              label="Linear project"
              value={projectId ?? NO_PROJECT}
              options={[
                { value: NO_PROJECT, label: "No project" },
                ...team.projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
              onValueChange={(id) => setPicked({ teamId: team.id, projectId: id || null })}
            />
          </SettingsCard>
        ) : (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
            {teams.isError ? errorMessage(teams.error) : "Loading Linear teams…"}
          </Text>
        )}
        <TextInput
          accessibilityLabel="Title"
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={() => submit(false)}
          placeholder="Title"
          placeholderTextColor={theme.colors.foregroundMuted}
          autoFocus
          style={inputStyle(theme)}
        />
        <TextInput
          accessibilityLabel="Description"
          value={body}
          onChangeText={setBody}
          placeholder="Description (Markdown, optional)"
          placeholderTextColor={theme.colors.foregroundMuted}
          multiline
          style={inputStyle(theme, true)}
        />
        <AgentPicker theme={theme} picker={picker} />
        <ImageAttachments theme={theme} images={images} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button
            theme={theme}
            label={create.isPending && !create.variables ? "Creating…" : "Create card"}
            icon="Plus"
            primary
            disabled={!title.trim() || !team || create.isPending}
            onPress={() => submit(false)}
          />
          <Button
            theme={theme}
            label={create.isPending && create.variables ? "Starting…" : "Create and start agent"}
            icon="Play"
            disabled={!title.trim() || !team || !picker.config || create.isPending}
            onPress={() => submit(true)}
          />
        </View>
      </Modal.Content>
    </Modal>
  );
}
