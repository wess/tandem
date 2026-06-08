import { defineConfig, env } from "@atlas/config";

export const config = defineConfig({
  port: env("PORT", { parse: Number, default: "3000" }),
  databaseUrl: env("DATABASE_URL", { default: "postgres://tandem:tandem@localhost:5432/tandem" }),
  dbPoolSize: env("DB_POOL_SIZE", { parse: Number, default: "5" }),
  authSecret: env("AUTH_SECRET", { default: "dev-secret-change-me" }),
  // OIDC relying-party — when all three are set, the app mounts @atlas/sso
  // and the login screen surfaces "Sign in with Castle". Empty = SSO off.
  ssoIssuer: env("SSO_ISSUER", { default: "" }),
  ssoClientId: env("SSO_CLIENT_ID", { default: "" }),
  ssoClientSecret: env("SSO_CLIENT_SECRET", { default: "" }),
  anthropicKey: env("ANTHROPIC_API_KEY", { default: "" }),
  openaiKey: env("OPENAI_API_KEY", { default: "" }),
  ollamaUrl: env("OLLAMA_URL", { default: "http://127.0.0.1:11434" }),
  adminEmail: env("ADMIN_EMAIL", { default: "" }),
  adminPassword: env("ADMIN_PASSWORD", { default: "" }),
  // Outbound MCP servers an agent turn may consume tools from. Static for now,
  // sourced from env — a stopgap until the DB-backed mcp_servers table lands
  // (see src/domain/mcp/registry.ts). Format: comma-separated `name|url|token`
  // triples; the token segment is optional. e.g.
  //   MCP_SERVERS="search|https://mcp.example.com/rpc|sk-abc,docs|https://docs.example.com/rpc"
  mcpServers: env("MCP_SERVERS", { default: "" }),
  // Credential broker (the homelab machine-auth layer; see /Users/wess/Desktop/Dev/broker).
  // When BOTH are set, an agent's MCP tool call mints a scoped, short-lived child
  // token via the broker's `cred.issue` and uses THAT as the bearer for the
  // downstream call, instead of the static MCP_SERVERS token. Empty = broker off
  // and the static token is used exactly as before (parity). BROKER_URL points at
  // the broker's MCP endpoint (e.g. http://broker.local:3100/mcp); BROKER_TOKEN is
  // its single static access token (Bearer on POST /mcp).
  brokerUrl: env("BROKER_URL", { default: "" }),
  brokerToken: env("BROKER_TOKEN", { default: "" }),
  // Regex (case-insensitive) matching tool names that are destructive enough to
  // require human approval before they run. A matched tool is NOT executed on the
  // model's request — instead it posts a chat approval request and waits for a
  // human to resolve it (see src/domain/mcp/approvals.ts). Override to widen or
  // narrow the gate. The default matches the blast-radius verbs.
  destructiveTools: env("DESTRUCTIVE_TOOLS", { default: "deploy|delete|destroy|exec|remove" }),
  // Shared secret guarding the service-to-service inbound status hook
  // (POST /internal/project-event). External services — kettle deploy status, a
  // tangle push hook — present this as a Bearer token to report progress into a
  // project channel. There is NO user session on this route; the channel's
  // owner_id is resolved from the channel_projects row (see src/api/internal).
  // Empty (default) => the route is DISABLED and returns 404, so an unconfigured
  // install behaves exactly as before (parity). Set a strong random value when
  // wiring kettle/tangle to tandem.
  internalHookSecret: env("INTERNAL_HOOK_SECRET", { default: "" }),
});

// How many recent messages to feed an agent as context.
export const CONTEXT_LIMIT = 40;

// Total agent turns allowed per human-initiated cascade — bounds the WHOLE
// reply tree (depth AND fan-out) so two agents @mentioning each other can't
// detonate into an exponential run of paid calls.
export const MAX_CASCADE_TURNS = 8;

// Within a SINGLE agent turn, the max number of tool-call round-trips before we
// force a final answer. Bounds an agent that keeps calling tools without ever
// settling — orthogonal to MAX_CASCADE_TURNS (which bounds turns across agents).
export const MAX_TOOL_STEPS = 8;
