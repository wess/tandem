import type { ProviderKind } from "../../shared/types.ts";

type Spec = {
  label: string;
  needsKey: boolean;
  baseURL: string; // "" => use the adapter's built-in default endpoint
  defaultModel: string;
  models: string[];
};

export const PROVIDER_CATALOG: Record<ProviderKind, Spec> = {
  anthropic: {
    label: "Anthropic",
    needsKey: true,
    baseURL: "",
    defaultModel: "claude-opus-4-8",
    models: ["auto", "claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  },
  openai: {
    label: "OpenAI",
    needsKey: true,
    baseURL: "",
    models: ["auto", "gpt-4o", "gpt-4o-mini", "o4-mini"],
    defaultModel: "gpt-4o",
  },
  ollama: {
    label: "Ollama",
    needsKey: false,
    baseURL: "http://127.0.0.1:11434",
    defaultModel: "llama3.2",
    models: ["auto", "llama3.2", "qwen2.5", "mistral", "phi3"],
  },
};

export const PROVIDER_KINDS = Object.keys(PROVIDER_CATALOG) as ProviderKind[];

// Approximate USD per 1M tokens — used only for relative cost estimates.
export const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 0.8, out: 4 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "o4-mini": { in: 1.1, out: 4.4 },
};

export const priceFor = (model: string): { in: number; out: number } => PRICING[model] ?? { in: 0, out: 0 };

export const TIERS: Record<ProviderKind, { cheap: string; strong: string }> = {
  anthropic: { cheap: "claude-haiku-4-5-20251001", strong: "claude-opus-4-8" },
  openai: { cheap: "gpt-4o-mini", strong: "gpt-4o" },
  ollama: { cheap: "llama3.2", strong: "llama3.2" },
};
