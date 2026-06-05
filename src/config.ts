import { defineConfig, env } from "@atlas/config";

export const config = defineConfig({
  port: env("PORT", { parse: Number, default: "3000" }),
  databaseUrl: env("DATABASE_URL", { default: "postgres://tandem:tandem@localhost:5432/tandem" }),
  dbPoolSize: env("DB_POOL_SIZE", { parse: Number, default: "5" }),
  authSecret: env("AUTH_SECRET", { default: "dev-secret-change-me" }),
  anthropicKey: env("ANTHROPIC_API_KEY", { default: "" }),
  openaiKey: env("OPENAI_API_KEY", { default: "" }),
  ollamaUrl: env("OLLAMA_URL", { default: "http://127.0.0.1:11434" }),
  adminEmail: env("ADMIN_EMAIL", { default: "" }),
  adminPassword: env("ADMIN_PASSWORD", { default: "" }),
});

// How many recent messages to feed an agent as context.
export const CONTEXT_LIMIT = 40;

// Total agent turns allowed per human-initiated cascade — bounds the WHOLE
// reply tree (depth AND fan-out) so two agents @mentioning each other can't
// detonate into an exponential run of paid calls.
export const MAX_CASCADE_TURNS = 8;
