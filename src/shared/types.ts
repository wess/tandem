// Domain types shared across the host (Bun) and the webview (React).
// These are the wire types that cross IPC — keep them plain and serializable.

export type ProviderKind = "anthropic" | "openai" | "ollama";

export type AgentKind = "chat" | "image";

export type Agent = {
  id: number;
  handle: string; // unique, lowercase alnum — used for @mentions
  name: string; // display name
  blurb: string; // one-line description
  avatar: string; // emoji
  color: string; // hex accent
  providerKind: ProviderKind;
  model: string;
  systemPrompt: string;
  kind: AgentKind;
  parentId: number | null; // head agent that spawned this subagent, if any
  createdAt: string;
};

export type ChannelKind = "channel" | "project" | "dm";

export type Channel = {
  id: number;
  slug: string;
  name: string;
  kind: ChannelKind;
  topic: string;
  agentId: number | null; // the agent on the other end of a dm
  headAgentId: number | null; // orchestrator that leads this channel, if any
  archivedAt: string | null;
  createdAt: string;
};

export type MemoryScope = "global" | "channel";

export type Memory = {
  id: number;
  scope: MemoryScope;
  channelId: number | null; // set for channel-scoped memories
  authorId: number | null; // the agent that recorded it
  title: string;
  body: string;
  confidence: number;
  pinned: boolean; // pinned memories never expire
  expiresAt: string | null;
  createdAt: string;
};

export type Skill = {
  id: number;
  name: string;
  description: string;
  steps: string;
  authorId: number | null;
  useCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Schedule = {
  id: number;
  channelId: number;
  agentId: number;
  prompt: string;
  intervalMinutes: number;
  nextRunAt: number; // epoch ms
  lastRunAt: number | null;
  enabled: boolean;
  createdAt: string;
};

export type SearchHit = {
  kind: "message" | "memory";
  id: number;
  channelId: number | null;
  channelName: string;
  authorName: string;
  snippet: string;
  createdAt: string;
};

export type UsageBucket = { id: number; name: string; tokens: number; costUsd: number };

export type UsageStats = {
  totalCostUsd: number;
  totalTokens: number;
  estimated: boolean;
  byAgent: UsageBucket[];
  byChannel: UsageBucket[];
};

// M5.1 — the live artifacts a project channel is bound to: a git repo, a kettle
// deploy project, and the host it runs on. `status` tracks the link's lifecycle
// ("unlinked" until a repo is attached). One per channel, scoped to the owner.
export type ChannelProjectStatus = "unlinked" | "linked" | "deploying" | "live" | "error";

export type ChannelProject = {
  channelId: number;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  kettleProjectId: string;
  deployHost: string;
  lastSha: string;
  status: ChannelProjectStatus;
  createdAt: string;
  updatedAt: string;
};

// The fields a caller may set on project:set. All optional — only the provided
// keys are written; channelId selects the target row. Server-managed columns
// (timestamps, owner_id) are never accepted from the wire.
export type ChannelProjectPatch = {
  repoOwner?: string;
  repoName?: string;
  repoUrl?: string;
  kettleProjectId?: string;
  deployHost?: string;
  lastSha?: string;
  status?: ChannelProjectStatus;
};

export type AuthorType = "human" | "agent" | "system";
export type MessageStatus = "streaming" | "complete" | "error";

export type Message = {
  id: number;
  channelId: number;
  authorType: AuthorType;
  authorId: number | null; // agent id when authorType === "agent"
  content: string;
  image: string; // data URL or remote URL for image messages, else ""
  status: MessageStatus;
  createdAt: string;
};

// Non-secret view of a provider. The API key itself lives in the OS keychain
// and never crosses IPC — only `hasKey` reports whether one is set.
export type ProviderConfig = {
  kind: ProviderKind;
  label: string;
  baseURL: string; // "" => the provider's default endpoint
  defaultModel: string;
  models: string[];
  needsKey: boolean; // ollama runs locally and needs none
  hasKey: boolean;
};

// A predefined agent shown in the Add Agent modal — a template, not yet created.
export type AgentTemplate = {
  handle: string;
  name: string;
  blurb: string;
  avatar: string;
  color: string;
  providerKind: ProviderKind;
  model: string;
  systemPrompt: string;
  kind: AgentKind;
};

export type Bootstrap = {
  channels: Channel[];
  agents: Agent[];
  providers: ProviderConfig[];
  templates: AgentTemplate[];
};

// One proposed teammate. `reuse` means an existing agent (matched by handle)
// joins the team as-is; otherwise a new agent is created from these fields.
export type SuggestedMember = {
  reuse: boolean;
  lead: boolean;
  handle: string;
  name: string;
  role: string;
  blurb?: string;
  avatar?: string;
  color?: string;
  providerKind?: ProviderKind;
  model?: string;
  systemPrompt?: string;
};

// A proposed project + its team, generated from a plain-language goal. The user
// reviews/edits before it's created.
export type TeamSuggestion = {
  name: string;
  topic: string;
  rationale: string;
  members: SuggestedMember[];
};

// A destructive MCP tool call an agent requested that is paused pending a human
// decision. Fired as "approval:requested" when the runtime parks the call; the
// client renders an approve/deny prompt and resolves it via approvals:resolve.
// `args` is the tool's arguments, surfaced so the human can see what would run.
export type ApprovalRequested = {
  approvalId: string;
  channelId: number;
  tool: string;
  args: Record<string, unknown>;
};

// Server-originated team suggestion: fired when the first substantive human
// message lands in an agentless channel, so the client can offer to assemble a
// team without the user opening the create-project flow. `channelId` is the
// channel the goal was typed in; `goal` is the message that triggered it.
export type TeamSuggested = {
  channelId: number;
  goal: string;
  suggestion: TeamSuggestion;
};
