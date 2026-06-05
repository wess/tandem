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
import { abortChannel, dispatch, startCascade } from "../domain/runtime/index.ts";
import { compressChannel } from "../domain/runtime/compress.ts";
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

type Handlers = { [M in RpcMethod]: (input: RpcMap[M]["input"]) => Promise<RpcMap[M]["output"]> };

export const handlers: Handlers = {
  bootstrap: async () => ({
    channels: await listChannels(),
    agents: await listAgents(),
    providers: await providerConfigs(),
    templates: AGENT_TEMPLATES,
  }),

  "messages:list": ({ channelId }) => listMessages(channelId),
  "members:list": ({ channelId }) => listMembers(channelId),

  "messages:send": async ({ channelId, content }) => {
    const row = await insertMessage({ channelId, authorType: "human", content });
    void dispatch(row, startCascade(channelId));
    return toMessage(row);
  },

  "agents:stop": async ({ channelId }) => {
    abortChannel(channelId);
    return { channelId };
  },

  "agents:create": async (input) => {
    const row = await insertAgent({
      handle: await uniqueHandle(input.handle || input.name),
      name: input.name,
      blurb: input.blurb ?? "",
      avatar: input.avatar || "🤖",
      color: input.color || "#6366f1",
      providerKind: input.providerKind,
      model: input.model,
      systemPrompt: input.systemPrompt ?? "",
      kind: input.kind ?? "chat",
    });
    const agent = await getAgentById(row.id);
    if (!agent) throw new Error("Failed to create agent");
    broadcast("agent:created", agent);

    const general = await ensureGeneral();
    await addMemberRow(general.id, row.id);
    broadcast("members:changed", { channelId: general.id, members: await listMembers(general.id) });

    const dm = await openDmRow(row.id);
    await addMemberRow(dm.id, row.id);
    broadcast("channel:created", toChannel(dm));

    return agent;
  },

  "agents:delete": async ({ id }) => {
    for (const ch of await channelsHeadedBy(id)) {
      const cleared = await setHeadAgent(ch.id, null);
      if (cleared) broadcast("channel:updated", toChannel(cleared));
    }
    const dms = await dmChannelsForAgent(id);
    await removeMembershipsForAgent(id);
    await removeSchedulesForAgent(id);
    for (const dm of dms) await removeChannel(dm.id);
    await deleteAgentRow(id);
    broadcast("agent:deleted", { id });
    for (const dm of dms) broadcast("channel:deleted", { id: dm.id });
    return { id };
  },

  "projects:create": async ({ name, topic }) => {
    const ch = toChannel(await createProjectRow(name, topic ?? ""));
    broadcast("channel:created", ch);
    return ch;
  },

  "dm:open": async ({ agentId }) => {
    const row = await openDmRow(agentId);
    await addMemberRow(row.id, agentId);
    const ch = toChannel(row);
    broadcast("channel:created", ch);
    return ch;
  },

  "members:add": async ({ channelId, agentId }) => {
    await addMemberRow(channelId, agentId);
    const members = await listMembers(channelId);
    broadcast("members:changed", { channelId, members });
    return members;
  },

  "members:remove": async ({ channelId, agentId }) => {
    await removeMemberRow(channelId, agentId);
    const ch = await getChannel(channelId);
    if (ch?.head_agent_id === agentId) {
      const cleared = await setHeadAgent(channelId, null);
      if (cleared) broadcast("channel:updated", toChannel(cleared));
    }
    const members = await listMembers(channelId);
    broadcast("members:changed", { channelId, members });
    return members;
  },

  "channels:sethead": async ({ channelId, agentId }) => {
    const row = await setHeadAgent(channelId, agentId);
    if (!row) throw new Error("channel not found");
    const ch = toChannel(row);
    broadcast("channel:updated", ch);
    return ch;
  },

  "channels:compress": async ({ channelId }) => ({ channelId, ok: await compressChannel(channelId) }),

  "providers:setkey": async ({ kind, apiKey }) => {
    await setApiKey(kind, apiKey);
    const cfg = await providerConfig(kind);
    broadcast("providers:changed", { providers: await providerConfigs() });
    return cfg;
  },

  "providers:setconfig": async ({ kind, baseURL, defaultModel }) => {
    await setProviderOverride(kind, { baseURL, defaultModel });
    const cfg = await providerConfig(kind);
    broadcast("providers:changed", { providers: await providerConfigs() });
    return cfg;
  },

  "memories:list": ({ channelId }) => listMemories(channelId),

  "memories:delete": async ({ id }) => {
    await removeMemory(id);
    broadcast("memory:removed", { id });
    return { id };
  },

  "memories:pin": async ({ id, pinned }) => {
    const row = await setPinned(id, pinned);
    if (!row) throw new Error("memory not found");
    const memory = toMemory(row);
    broadcast("memory:updated", memory);
    return memory;
  },

  search: ({ query }) => search(query),

  "skills:list": () => listSkills(),
  "skills:save": async ({ name, description, steps }) => {
    const row = await saveSkill({ name, description, steps, authorId: null });
    broadcast("skills:changed", { skills: await listSkills() });
    return toSkill(row);
  },
  "skills:delete": async ({ id }) => {
    await removeSkill(id);
    broadcast("skills:changed", { skills: await listSkills() });
    return { id };
  },

  "schedules:list": ({ channelId }) => listSchedules(channelId),
  "schedules:create": async ({ channelId, agentId, prompt, intervalMinutes }) => {
    const row = await createSchedule({ channelId, agentId, prompt, intervalMinutes }, Date.now());
    broadcast("schedules:changed", { channelId });
    return toSchedule(row);
  },
  "schedules:update": async ({ id, enabled, prompt, intervalMinutes }) => {
    const row = await updateSchedule(id, { enabled, prompt, intervalMinutes }, Date.now());
    if (!row) throw new Error("schedule not found");
    broadcast("schedules:changed", { channelId: row.channel_id });
    return toSchedule(row);
  },
  "schedules:delete": async ({ id }) => {
    const existing = await getSchedule(id);
    await removeSchedule(id);
    if (existing) broadcast("schedules:changed", { channelId: existing.channel_id });
    return { id };
  },

  "usage:stats": () => usageStats(),
};
