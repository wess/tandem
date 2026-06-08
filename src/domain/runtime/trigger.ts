import type { ChannelRow, MessageRow } from "../../db/schema.ts";
import { parseMentions } from "../../shared/mentions.ts";
import type { Agent } from "../../shared/types.ts";
import { getChannel, listMembers } from "../channels.ts";

// Which agents a message directly triggers. Pure of cascade state — head
// synthesis + spawned-agent running live in dispatch, so a teammate's reply can
// never re-summon the head here.
//
// Invariants: (1) system messages never trigger (anti-loop guard); (2) an agent
// never replies to itself; (3) plain channel = @mentioned members only, dm = the
// partner always; (4) head-led channel = the head is routed every human message.
export const candidatesFor = async (
  message: MessageRow,
): Promise<{ channel: ChannelRow; agents: Agent[] } | null> => {
  if (message.author_type === "system") return null;

  const channel = await getChannel(message.owner_id, message.channel_id);
  if (!channel) return null;

  const members = await listMembers(channel.owner_id, channel.id);
  const isSelf = (a: Agent): boolean => message.author_type === "agent" && message.author_id === a.id;
  const mentioned = new Set(parseMentions(message.content));
  const byMention = members.filter((a) => mentioned.has(a.handle) && !isSelf(a));

  const head =
    channel.kind !== "dm" && channel.head_agent_id != null
      ? members.find((a) => a.id === channel.head_agent_id)
      : undefined;

  if (head) {
    if (isSelf(head)) return { channel, agents: byMention };
    if (message.author_type === "human") {
      const set = new Map(byMention.map((a) => [a.id, a]));
      set.set(head.id, head);
      return { channel, agents: [...set.values()] };
    }
    return { channel, agents: byMention.filter((a) => a.id !== head.id) };
  }

  if (channel.kind === "dm") {
    const partner = members.find((a) => a.id === channel.agent_id);
    if (!partner || isSelf(partner)) return { channel, agents: [] };
    return { channel, agents: [partner] };
  }

  return { channel, agents: byMention };
};
