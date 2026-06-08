import { db, from, usagelog } from "../db/index.ts";
import type { UsageBucket, UsageStats } from "../shared/types.ts";
import { listAgents } from "./agents.ts";
import { listChannels } from "./channels.ts";
import { priceFor } from "./providers/catalog.ts";

const DAY_MS = 86_400_000;

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

// Durable ledger so cost survives discarded directive-only turns + compression.
export const recordUsage = async (
  ownerId: number,
  agentId: number | null,
  channelId: number,
  model: string,
  promptTokens: number,
  completionTokens: number,
): Promise<void> => {
  const price = priceFor(model);
  const costUsd = (promptTokens / 1e6) * price.in + (completionTokens / 1e6) * price.out;
  await db.execute(
    from(usagelog).insert({
      owner_id: ownerId,
      agent_id: agentId,
      channel_id: channelId,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: costUsd,
      created_at: Date.now(),
    }),
  );
};

export const channelSpend = async (ownerId: number, channelId: number, windowMs = DAY_MS): Promise<number> =>
  (
    await db.all<{ s: number }>({
      text: "SELECT COALESCE(SUM(cost_usd), 0)::float8 AS s FROM usagelog WHERE owner_id = $1 AND channel_id = $2 AND created_at >= $3",
      values: [ownerId, channelId, Date.now() - windowMs],
    })
  )[0]?.s ?? 0;

export const usageStats = async (ownerId: number): Promise<UsageStats> => {
  const rows = await db.all<{
    agent_id: number | null;
    channel_id: number;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd: number;
  }>({
    text: "SELECT agent_id, channel_id, prompt_tokens, completion_tokens, cost_usd FROM usagelog WHERE owner_id = $1",
    values: [ownerId],
  });

  const agentName = new Map((await listAgents(ownerId)).map((a) => [a.id, a.name]));
  const chanName = new Map((await listChannels(ownerId)).map((c) => [c.id, c.kind === "dm" ? c.name : `#${c.slug}`]));
  const byAgent = new Map<number, UsageBucket>();
  const byChannel = new Map<number, UsageBucket>();
  let totalCostUsd = 0;
  let totalTokens = 0;

  for (const r of rows) {
    const tokens = (r.prompt_tokens || 0) + (r.completion_tokens || 0);
    const cost = r.cost_usd || 0;
    totalTokens += tokens;
    totalCostUsd += cost;
    if (r.agent_id != null) {
      const b = byAgent.get(r.agent_id) ?? { id: r.agent_id, name: agentName.get(r.agent_id) ?? "—", tokens: 0, costUsd: 0 };
      b.tokens += tokens;
      b.costUsd += cost;
      byAgent.set(r.agent_id, b);
    }
    const cb = byChannel.get(r.channel_id) ?? { id: r.channel_id, name: chanName.get(r.channel_id) ?? "—", tokens: 0, costUsd: 0 };
    cb.tokens += tokens;
    cb.costUsd += cost;
    byChannel.set(r.channel_id, cb);
  }

  const sort = (m: Map<number, UsageBucket>): UsageBucket[] => [...m.values()].sort((a, b) => b.costUsd - a.costUsd);
  return { totalCostUsd, totalTokens, estimated: true, byAgent: sort(byAgent), byChannel: sort(byChannel) };
};
