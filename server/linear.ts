import type { PluginSettings } from "@getpaseo/plugin/server";
import type { boardSettings } from "../shared/board";

let settings: PluginSettings<(typeof boardSettings)["schema"]> | null = null;

export function connectSettings(registered: typeof settings) {
  settings = registered;
}

export async function linear<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const state = await settings?.read();
  const apiKey = state?.status === "ready" ? state.values.apiKey : null;
  if (!apiKey) throw new Error("Add a Linear API key to load the board.");

  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    // Personal API keys go in the header as-is, without "Bearer".
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 401) throw new Error("Linear rejected the API key. Paste a new one in the board's settings.");
  const result = (await response.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null;
  if (result?.errors?.length) throw new Error(result.errors.map((e) => e.message).join("; "));
  if (!response.ok || !result?.data) throw new Error(`Linear API request failed (${response.status}).`);
  return result.data;
}
