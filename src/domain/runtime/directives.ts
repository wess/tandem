import type { ChannelRow } from "../../db/schema.ts";
import { parseDirectives } from "../../shared/directives.ts";
import type { Agent } from "../../shared/types.ts";
import { getAgentById, insertAgent, uniqueHandle, updateAgent } from "../agents.ts";
import { addMemberRow, listMembers } from "../channels.ts";
import { broadcast } from "../events.ts";
import { addMemory, toMemory } from "../memory.ts";
import { listSkills, saveSkill } from "../skills.ts";

const MAX_SPAWNS_PER_TURN = 4;
const titleCase = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

const spawnSubagent = async (head: Agent, channel: ChannelRow, handle: string, role: string): Promise<Agent> => {
  const assigned = await uniqueHandle(handle || "agent");
  const row = await insertAgent({
    handle: assigned,
    name: titleCase(assigned),
    blurb: role.slice(0, 80),
    avatar: "🧩",
    color: head.color || "#6366f1",
    providerKind: head.providerKind,
    model: head.model,
    systemPrompt: role || `You are a specialist working under ${head.name}. Be focused and concise.`,
    kind: "chat",
    parentId: head.id,
  });
  const sub = await getAgentById(row.id);
  if (sub) broadcast("agent:created", sub);
  await addMemberRow(channel.id, row.id);
  broadcast("members:changed", { channelId: channel.id, members: await listMembers(channel.id) });
  return sub ?? ((await getAgentById(row.id)) as Agent);
};

// Apply an agent's reply directives. Returns the reply with directive lines
// stripped, system-note strings to post, and spawned subagent ids. Spawning is
// head-only and capped + deduped per turn.
export const processDirectives = async (
  agent: Agent,
  channel: ChannelRow,
  content: string,
): Promise<{ clean: string; notes: string[]; spawnedIds: number[] }> => {
  const { clean, directives } = parseDirectives(content);
  const notes: string[] = [];
  const spawnedIds: number[] = [];
  const requestedHandles = new Set<string>();

  for (const d of directives) {
    if (d.kind === "rename" && d.value) {
      await updateAgent(agent.id, { name: d.value });
      const u = await getAgentById(agent.id);
      if (u) broadcast("agent:updated", u);
      notes.push(`${agent.name} is now “${d.value}”`);
      agent = { ...agent, name: d.value };
    } else if (d.kind === "avatar" && d.value) {
      await updateAgent(agent.id, { avatar: d.value });
      const u = await getAgentById(agent.id);
      if (u) broadcast("agent:updated", u);
    } else if (d.kind === "memory" && d.title) {
      const row = await addMemory({ scope: d.scope, channelId: channel.id, authorId: agent.id, title: d.title, body: d.body });
      broadcast("memory:added", toMemory(row));
      notes.push(`${agent.name} noted ${d.scope === "global" ? "(shared) " : ""}“${d.title}”`);
    } else if (d.kind === "spawn" && d.handle && channel.head_agent_id === agent.id) {
      const key = d.handle.toLowerCase();
      if (spawnedIds.length >= MAX_SPAWNS_PER_TURN || requestedHandles.has(key)) continue;
      requestedHandles.add(key);
      const sub = await spawnSubagent(agent, channel, d.handle, d.role);
      spawnedIds.push(sub.id);
      notes.push(`${agent.name} brought in @${sub.handle}`);
    } else if (d.kind === "skill" && d.name && d.steps) {
      const sk = await saveSkill({ name: d.name, steps: d.steps, authorId: agent.id });
      broadcast("skills:changed", { skills: await listSkills() });
      notes.push(`${agent.name} saved skill “${sk.name}”`);
    }
  }

  return { clean, notes, spawnedIds };
};
