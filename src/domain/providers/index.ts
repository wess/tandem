import { type AiProvider, createProvider } from "@atlas/ai";
import { config } from "../../config.ts";
import type { ProviderConfig, ProviderKind } from "../../shared/types.ts";
import { getSetting, setSetting } from "../settings.ts";
import { PROVIDER_CATALOG, PROVIDER_KINDS } from "./catalog.ts";

// Keys come from the settings table (set in the UI) or fall back to env vars.
const envKey = (kind: ProviderKind): string =>
  kind === "anthropic" ? config.anthropicKey : kind === "openai" ? config.openaiKey : "";

export const apiKeyFor = async (kind: ProviderKind): Promise<string | undefined> =>
  (await getSetting(`${kind}.apiKey`)) || envKey(kind) || undefined;

export const setApiKey = (kind: ProviderKind, key: string): Promise<void> => setSetting(`${kind}.apiKey`, key);

export const baseUrlFor = async (kind: ProviderKind): Promise<string> => {
  const stored = await getSetting(`${kind}.baseURL`);
  if (stored) return stored;
  if (kind === "ollama") return config.ollamaUrl || PROVIDER_CATALOG.ollama.baseURL;
  return PROVIDER_CATALOG[kind].baseURL;
};

export const modelFor = async (kind: ProviderKind): Promise<string> =>
  (await getSetting(`${kind}.defaultModel`)) || PROVIDER_CATALOG[kind].defaultModel;

export const setProviderOverride = async (
  kind: ProviderKind,
  patch: { baseURL?: string; defaultModel?: string },
): Promise<void> => {
  if (patch.baseURL !== undefined) await setSetting(`${kind}.baseURL`, patch.baseURL);
  if (patch.defaultModel !== undefined) await setSetting(`${kind}.defaultModel`, patch.defaultModel);
};

export const providerConfig = async (kind: ProviderKind): Promise<ProviderConfig> => {
  const spec = PROVIDER_CATALOG[kind];
  return {
    kind,
    label: spec.label,
    baseURL: await baseUrlFor(kind),
    defaultModel: await modelFor(kind),
    models: spec.models,
    needsKey: spec.needsKey,
    hasKey: spec.needsKey ? Boolean(await apiKeyFor(kind)) : true,
  };
};

export const providerConfigs = (): Promise<ProviderConfig[]> => Promise.all(PROVIDER_KINDS.map(providerConfig));

export const buildProvider = async (kind: ProviderKind): Promise<AiProvider> => {
  const baseUrl = (await baseUrlFor(kind)) || undefined;
  if (kind === "ollama") return createProvider({ provider: "ollama", baseUrl });
  const key = await apiKeyFor(kind);
  if (!key) throw new Error(`No API key set for ${PROVIDER_CATALOG[kind].label}. Add one in Settings.`);
  if (kind === "anthropic") return createProvider({ provider: "anthropic", key });
  return createProvider({ provider: "openai", key, baseUrl });
};
