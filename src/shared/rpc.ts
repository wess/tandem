import type {
  Agent,
  AgentKind,
  Bootstrap,
  Channel,
  Memory,
  Message,
  ProviderConfig,
  ProviderKind,
  Schedule,
  SearchHit,
  Skill,
  TeamSuggestion,
  UsageStats,
} from "./types.ts";

// The RPC surface — one POST /api/rpc/<method>. Shared by server + client for
// end-to-end types.
export type RpcMap = {
  bootstrap: { input: void; output: Bootstrap };
  "messages:list": { input: { channelId: number }; output: Message[] };
  "members:list": { input: { channelId: number }; output: Agent[] };
  "messages:send": { input: { channelId: number; content: string }; output: Message };
  "agents:stop": { input: { channelId: number }; output: { channelId: number } };
  "agents:create": {
    input: {
      handle: string;
      name: string;
      blurb?: string;
      avatar?: string;
      color?: string;
      providerKind: ProviderKind;
      model: string;
      systemPrompt?: string;
      kind?: AgentKind;
    };
    output: Agent;
  };
  "agents:delete": { input: { id: number }; output: { id: number } };
  "projects:create": { input: { name: string; topic?: string }; output: Channel };
  "dm:open": { input: { agentId: number }; output: Channel };
  "members:add": { input: { channelId: number; agentId: number }; output: Agent[] };
  "members:remove": { input: { channelId: number; agentId: number }; output: Agent[] };
  "channels:sethead": { input: { channelId: number; agentId: number | null }; output: Channel };
  "channels:compress": { input: { channelId: number }; output: { channelId: number; ok: boolean } };
  "providers:setkey": { input: { kind: ProviderKind; apiKey: string }; output: ProviderConfig };
  "providers:setconfig": {
    input: { kind: ProviderKind; baseURL?: string; defaultModel?: string };
    output: ProviderConfig;
  };
  "memories:list": { input: { channelId: number }; output: Memory[] };
  "memories:delete": { input: { id: number }; output: { id: number } };
  "memories:pin": { input: { id: number; pinned: boolean }; output: Memory };
  search: { input: { query: string }; output: SearchHit[] };
  "skills:list": { input: void; output: Skill[] };
  "skills:save": { input: { name: string; description?: string; steps: string }; output: Skill };
  "skills:delete": { input: { id: number }; output: { id: number } };
  "schedules:list": { input: { channelId: number }; output: Schedule[] };
  "schedules:create": {
    input: { channelId: number; agentId: number; prompt: string; intervalMinutes: number };
    output: Schedule;
  };
  "schedules:update": {
    input: { id: number; enabled?: boolean; prompt?: string; intervalMinutes?: number };
    output: Schedule;
  };
  "schedules:delete": { input: { id: number }; output: { id: number } };
  "usage:stats": { input: void; output: UsageStats };
  "team:suggest": { input: { goal: string }; output: TeamSuggestion };
  "team:create": { input: { suggestion: TeamSuggestion }; output: { channel: Channel; members: Agent[] } };
};

export type RpcMethod = keyof RpcMap;

// WebSocket events (server → all clients). The client filters by channelId.
export type EventMap = {
  "message:created": Message;
  "message:delta": { id: number; channelId: number; delta: string };
  "message:updated": Message;
  "message:removed": { id: number; channelId: number };
  "channel:created": Channel;
  "channel:updated": Channel;
  "channel:deleted": { id: number };
  "agent:created": Agent;
  "agent:updated": Agent;
  "agent:deleted": { id: number };
  "members:changed": { channelId: number; members: Agent[] };
  "providers:changed": { providers: ProviderConfig[] };
  "agent:typing": { channelId: number; agentId: number; active: boolean };
  "memory:added": Memory;
  "memory:updated": Memory;
  "memory:removed": { id: number };
  "skills:changed": { skills: Skill[] };
  "schedules:changed": { channelId: number };
};

export type EventName = keyof EventMap;
