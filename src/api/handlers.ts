import { deleteAgentRow, getAgentById, insertAgent, listAgents, uniqueHandle } from "../domain/agents.ts";
import {
  addMemberRow,
  channelsHeadedBy,
  createProjectRow,
  dmChannelsForAgent,
  ensureGeneral,
  getChannel,
  listChannels,
  listMembers,
  openDmRow,
  removeChannel,
  removeMembershipsForAgent,
  removeMemberRow,
  setHeadAgent,
  toChannel,
} from "../domain/channels.ts";
import { broadcast } from "../domain/events.ts";
import { listMemories, removeMemory, setPinned, toMemory } from "../domain/memory.ts";
import { insertMessage, listMessages, toMessage } from "../domain/messages.ts";
import { providerConfig, providerConfigs, setApiKey, setProviderOverride } from "../domain/providers/index.ts";
import { compressChannel } from "../domain/runtime/compress.ts";
import { abortChannel, dispatch, startCascade } from "../domain/runtime/index.ts";
import {
  createSchedule,
  getSchedule,
  listSchedules,
  removeSchedule,
  removeSchedulesForAgent,
  toSchedule,
  updateSchedule,
} from "../domain/schedules.ts";
import { search } from "../domain/search.ts";
import { AGENT_TEMPLATES } from "../domain/seeds.ts";
import { listSkills, removeSkill, saveSkill, toSkill } from "../domain/skills.ts";
import { usageStats } from "../domain/usage.ts";
import type { RpcMap, RpcMethod } from "../shared/rpc.ts";

// The authenticated caller. Injected by the rpc route from the session cookie,
// never trusted from the request body — it scopes every handler to one tenant.
export type Ctx = { userId: number };

type Handlers = { [M in RpcMethod]: (input: RpcMap[M]["input"], ctx: Ctx) => Promise<RpcMap[M]["output"]> };

// Ownership guards: a handler may only touch ids that belong to the caller.
const ownChannel = async (userId: number, channelId: number) => {
  const ch = await getChannel(userId, channelId);
  if (!ch) throw new Error("channel not found");
  return ch;
};
const ownAgent = async (userId: number, agentId: number) => {
  const agent = await getAgentById(userId, agentId);
  if (!agent) throw new Error("agent not found");
  return agent;
};

export const handlers: Handlers = {
  bootstrap: async (_input, { userId }) => {
    await ensureGeneral(userId);
    return {
      channels: await listChannels(userId),
      agents: await listAgents(userId),
      providers: await providerConfigs(userId),
      templates: AGENT_TEMPLATES,
    };
  },

  "messages:list": ({ channelId }, { userId }) => listMessages(userId, channelId),
  "members:list": ({ channelId }, { userId }) => listMembers(userId, channelId),

  "messages:send": async ({ channelId, content }, { userId }) => {
    await ownChannel(userId, channelId);
    const row = await insertMessage({ ownerId: userId, channelId, authorType: "human", content });
    void dispatch(row, startCascade(channelId));
    return toMessage(row);
  },

  "agents:stop": async ({ channelId }, { userId }) => {
    await ownChannel(userId, channelId);
    abortChannel(channelId);
    return { channelId };
  },

  "agents:create": async (input, { userId }) => {
    const row = await insertAgent(userId, {
      handle: await uniqueHandle(userId, input.handle || input.name),
      name: input.name,
      blurb: input.blurb ?? "",
      avatar: input.avatar || "🤖",
      color: input.color || "#6366f1",
      providerKind: input.providerKind,
      model: input.model,
      systemPrompt: input.systemPrompt ?? "",
      kind: input.kind ?? "chat",
    });
    const agent = await getAgentById(userId, row.id);
    if (!agent) throw new Error("Failed to create agent");
    broadcast("agent:created", agent, userId);

    const general = await ensureGeneral(userId);
    await addMemberRow(userId, general.id, row.id);
    broadcast("members:changed", { channelId: general.id, members: await listMembers(userId, general.id) }, userId);

    const dm = await openDmRow(userId, row.id);
    await addMemberRow(userId, dm.id, row.id);
    broadcast("channel:created", toChannel(dm), userId);

    return agent;
  },

  "agents:delete": async ({ id }, { userId }) => {
    for (const ch of await channelsHeadedBy(userId, id)) {
      const cleared = await setHeadAgent(userId, ch.id, null);
      if (cleared) broadcast("channel:updated", toChannel(cleared), userId);
    }
    const dms = await dmChannelsForAgent(userId, id);
    await removeMembershipsForAgent(userId, id);
    await removeSchedulesForAgent(userId, id);
    for (const dm of dms) await removeChannel(userId, dm.id);
    await deleteAgentRow(userId, id);
    broadcast("agent:deleted", { id }, userId);
    for (const dm of dms) broadcast("channel:deleted", { id: dm.id }, userId);
    return { id };
  },

  "projects:create": async ({ name, topic }, { userId }) => {
    const ch = toChannel(await createProjectRow(userId, name, topic ?? ""));
    broadcast("channel:created", ch, userId);
    return ch;
  },

  "dm:open": async ({ agentId }, { userId }) => {
    await ownAgent(userId, agentId);
    const row = await openDmRow(userId, agentId);
    await addMemberRow(userId, row.id, agentId);
    const ch = toChannel(row);
    broadcast("channel:created", ch, userId);
    return ch;
  },

  "members:add": async ({ channelId, agentId }, { userId }) => {
    await ownChannel(userId, channelId);
    await ownAgent(userId, agentId);
    await addMemberRow(userId, channelId, agentId);
    const members = await listMembers(userId, channelId);
    broadcast("members:changed", { channelId, members }, userId);
    return members;
  },

  "members:remove": async ({ channelId, agentId }, { userId }) => {
    const ch = await ownChannel(userId, channelId);
    await removeMemberRow(userId, channelId, agentId);
    if (ch.head_agent_id === agentId) {
      const cleared = await setHeadAgent(userId, channelId, null);
      if (cleared) broadcast("channel:updated", toChannel(cleared), userId);
    }
    const members = await listMembers(userId, channelId);
    broadcast("members:changed", { channelId, members }, userId);
    return members;
  },

  "channels:sethead": async ({ channelId, agentId }, { userId }) => {
    await ownChannel(userId, channelId);
    if (agentId != null) await ownAgent(userId, agentId);
    const row = await setHeadAgent(userId, channelId, agentId);
    if (!row) throw new Error("channel not found");
    const ch = toChannel(row);
    broadcast("channel:updated", ch, userId);
    return ch;
  },

  "channels:compress": async ({ channelId }, { userId }) => ({
    channelId,
    ok: await compressChannel(userId, channelId),
  }),

  "providers:setkey": async ({ kind, apiKey }, { userId }) => {
    await setApiKey(userId, kind, apiKey);
    const cfg = await providerConfig(userId, kind);
    broadcast("providers:changed", { providers: await providerConfigs(userId) }, userId);
    return cfg;
  },

  "providers:setconfig": async ({ kind, baseURL, defaultModel }, { userId }) => {
    await setProviderOverride(userId, kind, { baseURL, defaultModel });
    const cfg = await providerConfig(userId, kind);
    broadcast("providers:changed", { providers: await providerConfigs(userId) }, userId);
    return cfg;
  },

  "memories:list": ({ channelId }, { userId }) => listMemories(userId, channelId),

  "memories:delete": async ({ id }, { userId }) => {
    await removeMemory(userId, id);
    broadcast("memory:removed", { id }, userId);
    return { id };
  },

  "memories:pin": async ({ id, pinned }, { userId }) => {
    const row = await setPinned(userId, id, pinned);
    if (!row) throw new Error("memory not found");
    const memory = toMemory(row);
    broadcast("memory:updated", memory, userId);
    return memory;
  },

  search: ({ query }, { userId }) => search(userId, query),

  "skills:list": (_input, { userId }) => listSkills(userId),
  "skills:save": async ({ name, description, steps }, { userId }) => {
    const row = await saveSkill({ ownerId: userId, name, description, steps, authorId: null });
    broadcast("skills:changed", { skills: await listSkills(userId) }, userId);
    return toSkill(row);
  },
  "skills:delete": async ({ id }, { userId }) => {
    await removeSkill(userId, id);
    broadcast("skills:changed", { skills: await listSkills(userId) }, userId);
    return { id };
  },

  "schedules:list": ({ channelId }, { userId }) => listSchedules(userId, channelId),
  "schedules:create": async ({ channelId, agentId, prompt, intervalMinutes }, { userId }) => {
    await ownChannel(userId, channelId);
    await ownAgent(userId, agentId);
    const row = await createSchedule(userId, { channelId, agentId, prompt, intervalMinutes }, Date.now());
    broadcast("schedules:changed", { channelId }, userId);
    return toSchedule(row);
  },
  "schedules:update": async ({ id, enabled, prompt, intervalMinutes }, { userId }) => {
    const row = await updateSchedule(userId, id, { enabled, prompt, intervalMinutes }, Date.now());
    if (!row) throw new Error("schedule not found");
    broadcast("schedules:changed", { channelId: row.channel_id }, userId);
    return toSchedule(row);
  },
  "schedules:delete": async ({ id }, { userId }) => {
    const existing = await getSchedule(userId, id);
    await removeSchedule(userId, id);
    if (existing) broadcast("schedules:changed", { channelId: existing.channel_id }, userId);
    return { id };
  },

  "usage:stats": (_input, { userId }) => usageStats(userId),
};
