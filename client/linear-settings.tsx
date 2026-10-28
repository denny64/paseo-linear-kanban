import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { ExternalLink, SettingsCard, SettingsInput, type SettingsInputHandle, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { boardSettings, listTeamsRpc } from "../shared/board";
import { Button, errorMessage, type Theme } from "./controls";

export function useTeams(enabled: boolean) {
  const listTeams = useRpc(listTeamsRpc);
  return useQuery({ queryKey: ["teams"], queryFn: () => listTeams({}), enabled, staleTime: 300_000 });
}

// The key lives in host settings so the daemon can call Linear with it.
export function ApiKeyForm({ theme, intro }: { theme: Theme; intro?: string }) {
  const settings = useSettings(boardSettings);
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const input = useRef<SettingsInputHandle>(null);
  const save = async () => {
    if (settings.status !== "ready") return;
    if (!(await settings.save({ ...settings.values, apiKey: key.trim() }, settings.revision))) return;
    input.current?.replaceText("");
    setKey("");
    void queryClient.invalidateQueries();
  };
  return (
    <View style={{ gap: 8, alignSelf: "stretch" }}>
      {intro ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 14 }}>{intro}</Text> : null}
      <SettingsCard>
        <SettingsInput
          label="Linear API key"
          hint={settings.status === "ready" && settings.values.apiKey ? "A key is saved. Paste a new one to replace it." : undefined}
          placeholder="lin_api_…"
          secureTextEntry
          ref={input}
          onChangeText={setKey}
        />
      </SettingsCard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Button theme={theme} label="Save key" primary disabled={!key.trim()} onPress={() => void save()} />
        <ExternalLink href="https://linear.app/settings/account/security">Create a key in Linear</ExternalLink>
      </View>
    </View>
  );
}

export function TeamSelect({ theme, projectId }: { theme: Theme; projectId: string }) {
  const settings = useSettings(boardSettings);
  const ready = settings.status === "ready" ? settings : null;
  const teams = useTeams(!!ready?.values.apiKey);
  if (!ready) return null;
  const { values } = ready;
  if (!teams.data) {
    return (
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
        {teams.isError ? errorMessage(teams.error) : "Loading Linear teams…"}
      </Text>
    );
  }
  return (
    <SettingsCard>
      <SettingsSelect
        label="Linear team"
        hint="This project's board shows the team's issues."
        value={values.teams[projectId] ?? ""}
        options={teams.data.teams.map((t) => ({ value: t.id, label: `${t.name} (${t.key})` }))}
        onValueChange={(teamId) =>
          void settings.save({ ...values, teams: { ...values.teams, [projectId]: teamId } }, ready.revision)
        }
      />
    </SettingsCard>
  );
}
