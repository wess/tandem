import { MAX_CASCADE_TURNS } from "../../config.ts";
import type { ChannelRow, MessageRow } from "../../db/schema.ts";
import { parseMentions } from "../../shared/mentions.ts";
import type { Agent } from "../../shared/types.ts";
import { getAgentById } from "../agents.ts";
import { listMembers } from "../channels.ts";
import { enabledServers } from "../mcp/registry.ts";
import { buildAgentTools } from "../mcp/tools.ts";
import { currentEpoch } from "./inflight.ts";
import type { AgentTools } from "./run.ts";
import { runAgentTurn } from "./run.ts";
import { candidatesFor } from "./trigger.ts";

// A cascade is one human message and every agent turn it transitively causes.
// `remaining` bounds TOTAL turns (depth + fan-out + spawns + synthesis);
// `epoch` pins it to the channel's abort generation; `headSynthesized` allows a
// head one closing synthesis turn. `tools` is the MCP toolset, assembled at most
// once per cascade (lazily, only when servers are configured) and shared across
// every turn — see toolsFor.
export type Cascade = {
  epoch: number;
  remaining: number;
  headSynthesized: boolean;
  tools?: AgentTools;
  toolsResolved: boolean;
};

export const startCascade = (channelId: number): Cascade => ({
  epoch: currentEpoch(channelId),
  remaining: MAX_CASCADE_TURNS,
  headSynthesized: false,
  toolsResolved: false,
});

// Assemble the cascade's MCP tools at most once. Cost guard: when the owner has
// no enabled servers we never build (and never advertise) tools, so a turn takes
// the identical no-tools provider code path and parity holds. The result (even
// `undefined`) is memoized on the cascade so a fan-out doesn't re-initialize the
// same remote servers per turn.
const toolsFor = async (cascade: Cascade, ownerId: number, channelId: number): Promise<AgentTools | undefined> => {
  if (cascade.toolsResolved) return cascade.tools;
  cascade.toolsResolved = true;
  const servers = await enabledServers(ownerId);
  if (servers.length === 0) return undefined;
  cascade.tools = await buildAgentTools(ownerId, channelId);
  return cascade.tools;
};

const isReply = (m: MessageRow | null): m is MessageRow =>
  !!m && m.status === "complete" && (m.content.trim() !== "" || !!m.image);

const live = (channel: ChannelRow, cascade: Cascade): boolean =>
  cascade.epoch === currentEpoch(channel.id) && cascade.remaining > 0;

const runOne = async (channel: ChannelRow, agent: Agent, cascade: Cascade, tools?: AgentTools): Promise<void> => {
  if (cascade.epoch !== currentEpoch(channel.id)) return;

  const { message: reply, spawnedIds } = await runAgentTurn(channel, agent, tools);
  if (isReply(reply)) await dispatch(reply, cascade);

  const mentioned = reply ? new Set(parseMentions(reply.content)) : new Set<string>();

  let delegated = false;
  for (const id of spawnedIds) {
    if (!live(channel, cascade)) break;
    const sub = await getAgentById(channel.owner_id, id);
    if (!sub) continue;
    delegated = true;
    if (mentioned.has(sub.handle)) continue;
    cascade.remaining -= 1;
    await runOne(channel, sub, cascade, tools);
  }

  if (channel.head_agent_id != null && agent.id === channel.head_agent_id && !cascade.headSynthesized) {
    const members = await listMembers(channel.owner_id, channel.id);
    const delegatedByMention = [...mentioned].some((h) => members.some((m) => m.handle === h && m.id !== agent.id));
    if ((delegated || delegatedByMention) && live(channel, cascade)) {
      cascade.headSynthesized = true;
      cascade.remaining -= 1;
      await runOne(channel, agent, cascade, tools);
    }
  }
};

export const dispatch = async (message: MessageRow, cascade: Cascade): Promise<void> => {
  const resolved = await candidatesFor(message);
  if (!resolved) return;

  const { channel, agents } = resolved;
  if (cascade.epoch !== currentEpoch(channel.id)) return;
  if (cascade.remaining <= 0 || agents.length === 0) return;

  const toRun = agents.slice(0, cascade.remaining);
  cascade.remaining -= toRun.length;

  const tools = await toolsFor(cascade, channel.owner_id, channel.id);
  await Promise.all(toRun.map((agent) => runOne(channel, agent, cascade, tools)));
};

export { abortChannel } from "./inflight.ts";
