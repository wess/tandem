import { channels, db, from } from "../../db/index.ts";
import { getAgentById, listAgents } from "../agents.ts";
import { getChannel } from "../channels.ts";
import { broadcast } from "../events.ts";
import { addMemory, setPinned, toMemory } from "../memory.ts";
import { listMessageRows } from "../messages.ts";
import { buildProvider, modelFor } from "../providers/index.ts";
import { estimateTokens, recordUsage } from "../usage.ts";

const KEEP_RECENT = 12;

// Summarize older history into a pinned memory and advance the channel's
// compression watermark so those messages drop out of agent context. The UI
// still shows the full history; only the context shrinks (token saving).
export const compressChannel = async (ownerId: number, channelId: number): Promise<boolean> => {
  const channel = await getChannel(ownerId, channelId);
  if (!channel) return false;

  const rows = (await listMessageRows(ownerId, channelId)).filter(
    (m) => m.id > channel.compressed_through && m.author_type !== "system" && m.status === "complete" && m.content.trim() !== "",
  );
  if (rows.length <= KEEP_RECENT + 4) return false;

  const toCompress = rows.slice(0, rows.length - KEEP_RECENT);
  const lastId = toCompress[toCompress.length - 1].id;
  const names = new Map((await listAgents(ownerId)).map((a) => [a.id, a.name]));
  const transcript = toCompress
    .map((m) => `${m.author_type === "human" ? "Human" : (names.get(m.author_id ?? -1) ?? "Agent")}: ${m.content}`)
    .join("\n");

  const headKind = channel.head_agent_id ? (await getAgentById(ownerId, channel.head_agent_id))?.providerKind : undefined;
  const kind = headKind ?? "anthropic";
  let summary = "";
  try {
    const provider = await buildProvider(ownerId, kind);
    const res = await provider.chat({
      messages: [
        {
          role: "system",
          content:
            "Summarize the conversation into a tight, factual brief that preserves decisions, facts, names, numbers, and open threads. Short bullet points. No preamble.",
        },
        { role: "user", content: transcript.slice(0, 24000) },
      ],
    });
    summary = res.content.trim();
    await recordUsage(
      ownerId,
      channel.head_agent_id ?? null,
      channelId,
      await modelFor(ownerId, kind),
      res.usage?.promptTokens ?? estimateTokens(transcript),
      res.usage?.completionTokens ?? estimateTokens(summary),
    );
  } catch {
    return false;
  }
  if (!summary) return false;

  const mem = await addMemory({
    ownerId,
    scope: "channel",
    channelId,
    authorId: channel.head_agent_id ?? null,
    title: `Summary through ${new Date().toLocaleString()}`,
    body: summary,
    confidence: 0.8,
  });
  const pinned = (await setPinned(ownerId, mem.id, true)) ?? mem;
  broadcast("memory:added", toMemory(pinned), ownerId);
  await db.execute(
    from(channels).where((q) => q("owner_id").equals(ownerId)).where((q) => q("id").equals(channelId)).update({ compressed_through: lastId }),
  );
  return true;
};
