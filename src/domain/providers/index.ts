import { type AiProvider, createProvider } from "@atlas/ai";
import { config } from "../../config.ts";
import type { ProviderConfig, ProviderKind } from "../../shared/types.ts";
import { getSetting, setSetting } from "../settings.ts";
import { PROVIDER_CATALOG, PROVIDER_KINDS } from "./catalog.ts";

// Keys are per-user: a user's own key (set in the UI) wins, otherwise the
// server's env var acts as a shared fallback so a fresh user works out of the
// box when the host has keys configured.
const envKey = (kind: ProviderKind): string =>
  kind === "anthropic" ? config.anthropicKey : kind === "openai" ? config.openaiKey : "";

export const apiKeyFor = async (ownerId: number, kind: ProviderKind): Promise<string | undefined> =>
  (await getSetting(ownerId, `${kind}.apiKey`)) || envKey(kind) || undefined;

export const setApiKey = (ownerId: number, kind: ProviderKind, key: string): Promise<void> =>
  setSetting(ownerId, `${kind}.apiKey`, key);

export const baseUrlFor = async (ownerId: number, kind: ProviderKind): Promise<string> => {
  const stored = await getSetting(ownerId, `${kind}.baseURL`);
  if (stored) return stored;
  if (kind === "ollama") return config.ollamaUrl || PROVIDER_CATALOG.ollama.baseURL;
  return PROVIDER_CATALOG[kind].baseURL;
};

export const modelFor = async (ownerId: number, kind: ProviderKind): Promise<string> =>
  (await getSetting(ownerId, `${kind}.defaultModel`)) || PROVIDER_CATALOG[kind].defaultModel;

export const setProviderOverride = async (
  ownerId: number,
  kind: ProviderKind,
  patch: { baseURL?: string; defaultModel?: string },
): Promise<void> => {
  if (patch.baseURL !== undefined) await setSetting(ownerId, `${kind}.baseURL`, patch.baseURL);
  if (patch.defaultModel !== undefined) await setSetting(ownerId, `${kind}.defaultModel`, patch.defaultModel);
};

export const providerConfig = async (ownerId: number, kind: ProviderKind): Promise<ProviderConfig> => {
  const spec = PROVIDER_CATALOG[kind];
  return {
    kind,
    label: spec.label,
    baseURL: await baseUrlFor(ownerId, kind),
    defaultModel: await modelFor(ownerId, kind),
    models: spec.models,
    needsKey: spec.needsKey,
    hasKey: spec.needsKey ? Boolean(await apiKeyFor(ownerId, kind)) : true,
  };
};

export const providerConfigs = (ownerId: number): Promise<ProviderConfig[]> =>
  Promise.all(PROVIDER_KINDS.map((kind) => providerConfig(ownerId, kind)));

export const buildProvider = async (ownerId: number, kind: ProviderKind): Promise<AiProvider> => {
  const baseUrl = (await baseUrlFor(ownerId, kind)) || undefined;
  if (kind === "ollama") return createProvider({ provider: "ollama", baseUrl });
  const key = await apiKeyFor(ownerId, kind);
  if (!key) throw new Error(`No API key set for ${PROVIDER_CATALOG[kind].label}. Add one in Settings.`);
  if (kind === "anthropic") return createProvider({ provider: "anthropic", key });
  return createProvider({ provider: "openai", key, baseUrl });
};
