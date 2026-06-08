import type {
  AgentKind,
  AgentTemplate,
  ChannelProject,
  ChannelProjectPatch,
  ProviderKind,
  SearchHit,
  TeamSuggestion,
} from "../../shared/types.ts";
import { invoke } from "../transport.ts";
import { getState, type Modal, patchChannelMessages, setState } from "./store.ts";

const ensureChannel = (ch: { id: number }): void => {
  setState((s) => (s.channels.some((c) => c.id === ch.id) ? s : { ...s, channels: [...s.channels, ch as never] }));
};

export const boot = async (): Promise<void> => {
  const data = await invoke("bootstrap", undefined);
  const general = data.channels.find((c) => c.slug === "general") ?? data.channels[0] ?? null;
  setState((s) => ({ ...s, ...data, ready: true }));
  if (general) await selectChannel(general.id);
};

export const selectChannel = async (channelId: number): Promise<void> => {
  setState({ activeChannelId: channelId, sidebarOpen: false, membersOpen: false });
  void hydrateProject(channelId);
  if (getState().messagesByChannel[channelId] !== undefined) return;

  // Mark loaded synchronously so events during the fetch aren't dropped, then merge.
  setState((s) => ({ ...s, messagesByChannel: { ...s.messagesByChannel, [channelId]: [] } }));

  const [history, members] = await Promise.all([
    invoke("messages:list", { channelId }),
    invoke("members:list", { channelId }),
  ]);

  setState((s) => {
    const live = s.messagesByChannel[channelId] ?? [];
    const seen = new Set(history.map((m) => m.id));
    const merged = [...history, ...live.filter((m) => !seen.has(m.id))].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id,
    );
    return {
      ...s,
      messagesByChannel: { ...s.messagesByChannel, [channelId]: merged },
      membersByChannel: { ...s.membersByChannel, [channelId]: members },
    };
  });
};

export const send = async (content: string): Promise<void> => {
  const channelId = getState().activeChannelId;
  if (channelId == null || !content.trim()) return;
  const msg = await invoke("messages:send", { channelId, content: content.trim() });
  patchChannelMessages(channelId, (m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
};

export const stop = (channelId: number): Promise<unknown> => invoke("agents:stop", { channelId });

export type AgentInput = {
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

export const createAgent = async (input: AgentInput): Promise<void> => {
  const agent = await invoke("agents:create", input);
  closeModal();
  await openAgentDm(agent.id);
};

export const addAgentFromTemplate = (t: AgentTemplate): Promise<void> =>
  createAgent({
    handle: t.handle,
    name: t.name,
    blurb: t.blurb,
    avatar: t.avatar,
    color: t.color,
    providerKind: t.providerKind,
    model: t.model,
    systemPrompt: t.systemPrompt,
    kind: t.kind,
  });

export const deleteAgent = (id: number): Promise<unknown> => invoke("agents:delete", { id });

export const openAgentDm = async (agentId: number): Promise<void> => {
  const ch = await invoke("dm:open", { agentId });
  ensureChannel(ch);
  await selectChannel(ch.id);
};

export const createProject = async (name: string, topic: string): Promise<void> => {
  if (!name.trim()) return;
  const ch = await invoke("projects:create", { name: name.trim(), topic });
  ensureChannel(ch);
  closeModal();
  await selectChannel(ch.id);
};

// Ask the model to propose a project + team from a goal (read-only preview).
export const suggestTeam = (goal: string): Promise<TeamSuggestion> => invoke("team:suggest", { goal });

// Create the reviewed team: a project channel with the lead + members (existing
// agents reused, new ones created). New agents arrive via WS too; we also fold
// them in directly so the member list renders without waiting on the socket.
export const createTeamFromSuggestion = async (suggestion: TeamSuggestion): Promise<void> => {
  const { channel, members } = await invoke("team:create", { suggestion });
  setState((s) => {
    const known = new Set(s.agents.map((a) => a.id));
    const added = members.filter((m) => !known.has(m.id));
    return added.length ? { ...s, agents: [...s.agents, ...added] } : s;
  });
  ensureChannel(channel);
  closeModal();
  await selectChannel(channel.id);
};

// M1.5 — a server-proposed team (from "team:suggested") landed on a channel.
// Dismiss just clears it; accept creates the team (a new project channel) from
// the suggestion and drops the prompt. The originating channel keeps its message
// either way — the suggestion is an additive offer, not a redirect.
export const dismissTeamSuggestion = (channelId: number): void => {
  setState((s) => {
    if (!(channelId in s.teamSuggestionByChannel)) return s;
    const teamSuggestionByChannel = { ...s.teamSuggestionByChannel };
    delete teamSuggestionByChannel[channelId];
    return { ...s, teamSuggestionByChannel };
  });
};

export const acceptTeamSuggestion = async (channelId: number): Promise<void> => {
  const pending = getState().teamSuggestionByChannel[channelId];
  if (!pending) return;
  dismissTeamSuggestion(channelId);
  await createTeamFromSuggestion(pending.suggestion);
};

// Task #15 — resolve a parked destructive MCP tool call. The server runs (on
// approve) or skips (on deny) the held call and posts the outcome as a system
// message; we optimistically drop the prompt from the channel either way.
export const resolveApproval = async (channelId: number, approvalId: string, approve: boolean): Promise<void> => {
  setState((s) => {
    const forChannel = s.approvalsByChannel[channelId];
    if (!forChannel || !(approvalId in forChannel)) return s;
    const next = { ...forChannel };
    delete next[approvalId];
    return { ...s, approvalsByChannel: { ...s.approvalsByChannel, [channelId]: next } };
  });
  await invoke("approvals:resolve", { approvalId, approve });
};

export const invite = (channelId: number, agentId: number): Promise<unknown> =>
  invoke("members:add", { channelId, agentId });
export const removeMember = (channelId: number, agentId: number): Promise<unknown> =>
  invoke("members:remove", { channelId, agentId });

export const setProviderKey = (kind: ProviderKind, apiKey: string): Promise<unknown> =>
  invoke("providers:setkey", { kind, apiKey });
export const setProviderConfig = (
  kind: ProviderKind,
  patch: { baseURL?: string; defaultModel?: string },
): Promise<unknown> => invoke("providers:setconfig", { kind, ...patch });

export const setHead = (channelId: number, agentId: number | null): Promise<unknown> =>
  invoke("channels:sethead", { channelId, agentId });

export const deleteMemory = (id: number): Promise<unknown> => invoke("memories:delete", { id });
export const pinMemory = (id: number, pinned: boolean): Promise<unknown> => invoke("memories:pin", { id, pinned });
export const compressChannel = (channelId: number) => invoke("channels:compress", { channelId });

export const runSearch = (query: string): Promise<SearchHit[]> => invoke("search", { query });

// M5.1 — the channel↔artifact project-state link. Read returns null until a row
// exists; set upserts and the server fans a "project:updated" event back out.
export const getChannelProject = (channelId: number): Promise<ChannelProject | null> =>
  invoke("project:get", { channelId });

// Pull a channel's project row into the store on select so the project panel
// renders without waiting on an event. Guards two ways: skips if we already hold
// the row (project:updated keeps it fresh after the first read), and skips for
// non-project channels so plain channels/DMs don't spend an RPC. A null result
// (no row) is left absent — the panel renders nothing, which is the parity case.
export const hydrateProject = async (channelId: number): Promise<void> => {
  const s = getState();
  if (s.projectByChannel[channelId]) return;
  if (s.channels.find((c) => c.id === channelId)?.kind !== "project") return;
  const project = await getChannelProject(channelId);
  if (project) setState((cur) => ({ ...cur, projectByChannel: { ...cur.projectByChannel, [channelId]: project } }));
};
export const setChannelProject = (channelId: number, patch: ChannelProjectPatch): Promise<ChannelProject> =>
  invoke("project:set", { channelId, patch });

export const saveSkill = (input: { name: string; description?: string; steps: string }): Promise<unknown> =>
  invoke("skills:save", input);
export const deleteSkill = (id: number): Promise<unknown> => invoke("skills:delete", { id });

export const createSchedule = (input: {
  channelId: number;
  agentId: number;
  prompt: string;
  intervalMinutes: number;
}): Promise<unknown> => invoke("schedules:create", input);
export const updateScheduleItem = (input: {
  id: number;
  enabled?: boolean;
  prompt?: string;
  intervalMinutes?: number;
}): Promise<unknown> => invoke("schedules:update", input);
export const deleteSchedule = (id: number): Promise<unknown> => invoke("schedules:delete", { id });

export const openModal = (modal: Modal): void => setState({ modal });
export const closeModal = (): void => setState({ modal: null });

// Mobile drawer toggles (sidebar nav + members aside slide-ins).
export const toggleSidebar = (): void => setState((s) => ({ ...s, sidebarOpen: !s.sidebarOpen }));
export const closeSidebar = (): void => setState({ sidebarOpen: false });
export const toggleMembers = (): void => setState((s) => ({ ...s, membersOpen: !s.membersOpen }));
export const closeMembers = (): void => setState({ membersOpen: false });
