import type { AgentKind, AgentTemplate, ProviderKind, SearchHit } from "../../shared/types.ts";
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
  setState({ activeChannelId: channelId });
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
