import type { PaseoProject } from "./paseo-types";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { Modal, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { SettingsCard, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { type Card, createCardRpc, type Team } from "../shared/board";
import { AgentPicker, agentPrompt, startAgentOn, useAgentPicker } from "./card-modal";
import { Button, errorMessage, inputStyle, type Theme } from "./controls";
import { ImageAttachments, useImages } from "./images";
import { type BoardCard, boardCard } from "./use-boards";

export function NewCardModal({
  theme,
  open,
  targets,
  defaultProjectId,
  onOpenChange,
  onCreated,
  onAgentStarted,
}: {
  theme: Theme;
  open: boolean;
  // Teams the new issue can go to: one on a project board, all of them on "All projects".
  targets: { project: PaseoProject; team: Team }[];
  defaultProjectId?: string;
  onOpenChange(open: boolean): void;
  onCreated(team: Team, card: Card): void;
  onAgentStarted(card: BoardCard, agentId: string): void;
}) {
  const paseo = usePaseo();
  const toast = useToast();
  const createCard = useRpc(createCardRpc);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const target =
    targets.find((t) => t.project.projectId === (picked ?? defaultProjectId)) ?? targets[0];
  const picker = useAgentPicker(target.project.projectRootPath);
  const images = useImages(open, toast.error);
  const create = useMutation({
    mutationFn: async (withAgent: boolean) => {
      const card = boardCard(await createCard({ teamId: target.team.id, title, body }), target.team, target.project);
      onCreated(target.team, card);
      setTitle("");
      setBody("");
      if (withAgent && picker.config) {
        // The issue exists either way, so a failed start only costs the agent.
        try {
          const agentId = await startAgentOn(paseo, card, picker.config, agentPrompt(card), images.images);
          picker.remember();
          onAgentStarted(card, agentId);
        } catch (error) {
          toast.error(`Created ${card.identifier}, but couldn't start the agent: ${errorMessage(error)}`);
        }
      }
      images.clear();
      onOpenChange(false);
    },
    onError: (error) => toast.error(`Couldn't create the card: ${errorMessage(error)}`),
  });
  const submit = (withAgent: boolean) => title.trim() && !create.isPending && create.mutate(withAgent);

  return (
    <Modal title="New card" open={open} onOpenChange={onOpenChange}>
      <Modal.Content>
        {targets.length > 1 ? (
          <SettingsCard>
            <SettingsSelect
              label="Project"
              value={target.project.projectId}
              options={targets.map((t) => ({ label: t.project.projectDisplayName, value: t.project.projectId }))}
              onValueChange={setPicked}
            />
          </SettingsCard>
        ) : null}
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
          Creates an issue in {target.team.name} ({target.team.key}).
        </Text>
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
            disabled={!title.trim() || create.isPending}
            onPress={() => submit(false)}
          />
          <Button
            theme={theme}
            label={create.isPending && create.variables ? "Starting…" : "Create and start agent"}
            icon="Play"
            disabled={!title.trim() || !picker.config || create.isPending}
            onPress={() => submit(true)}
          />
        </View>
      </Modal.Content>
    </Modal>
  );
}
