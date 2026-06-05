import type { Message as AiMessage } from "@atlas/ai";
import { CONTEXT_LIMIT } from "../../config.ts";
import type { ChannelRow, MessageRow } from "../../db/schema.ts";
import { parseDirectives } from "../../shared/directives.ts";
import { MENTION_RE } from "../../shared/mentions.ts";
import type { Agent } from "../../shared/types.ts";
import { listAgents } from "../agents.ts";
import { listMembers } from "../channels.ts";
import { broadcast } from "../events.ts";
import { memoryCount, memoryDigest } from "../memory.ts";
import { insertMessage, listMessageRows, removeMessage, toMessage, updateMessageRow } from "../messages.ts";
import { TIERS } from "../providers/catalog.ts";
import { generateImage } from "../providers/images.ts";
import { buildProvider } from "../providers/index.ts";
import { recall } from "../search.ts";
import { skillsDigest } from "../skills.ts";
import { channelSpend, estimateTokens, recordUsage } from "../usage.ts";
import { processDirectives } from "./directives.ts";
import { currentEpoch, register, unregister } from "./inflight.ts";

const CHANNEL_BUDGET_USD = 0.5;
const COMPLEX = /\b(why|explain|design|architect|debug|refactor|plan|analy[sz]e|compare|prove|derive|optimi[sz]e|reason|strateg|implement|review)/i;

type Names = Map<number, string>;
const speaker = (m: MessageRow, names: Names): string => {
  if (m.author_type === "human") return "Human";
  if (m.author_type === "agent") return names.get(m.author_id ?? -1) ?? "Agent";
  return "System";
};

const recentRows = (rows: MessageRow[]): MessageRow[] =>
  rows.filter((m) => m.author_type !== "system" && m.status === "complete" && m.content.trim() !== "").slice(-CONTEXT_LIMIT);

const contextFrom = (rows: MessageRow[], agent: Agent, names: Names): AiMessage[] =>
  recentRows(rows).map((m): AiMessage =>
    m.author_type === "agent" && m.author_id === agent.id
      ? { role: "assistant", content: m.content }
      : { role: "user", content: `${speaker(m, names)}: ${m.content}` },
  );

const lastIncoming = (rows: MessageRow[], agent: Agent): string => {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const m = rows[i];
    if (m.author_type === "system") continue;
    if (m.author_type === "agent" && m.author_id === agent.id) continue;
    if (m.content.trim()) return m.content;
  }
  return "";
};

const resolveModel = async (agent: Agent, channel: ChannelRow, rows: MessageRow[]): Promise<string> => {
  if (agent.model !== "auto") return agent.model;
  const tier = TIERS[agent.providerKind];
  const prompt = lastIncoming(rows, agent);
  const complex = prompt.length > 280 || COMPLEX.test(prompt);
  const overBudget = (await channelSpend(channel.id)) > CHANNEL_BUDGET_USD;
  return complex && !overBudget ? tier.strong : tier.cheap;
};

const buildSystem = async (rows: MessageRow[], channel: ChannelRow, agent: Agent, members: Agent[]): Promise<string> => {
  const recent = recentRows(rows);
  const earliestId = recent[0]?.id ?? Number.MAX_SAFE_INTEGER;
  const roster = members.filter((a) => a.id !== agent.id).map((a) => `@${a.handle} (${a.name})`).join(", ");
  const place = channel.kind === "dm" ? "a private direct message" : `the #${channel.slug} ${channel.kind}`;
  const [digest, skills, recalled, memCount] = await Promise.all([
    memoryDigest(channel.id),
    skillsDigest(),
    recall(channel.id, lastIncoming(rows, agent), earliestId, 4, channel.compressed_through),
    memoryCount(channel.id),
  ]);

  const lines = [
    agent.systemPrompt.trim(),
    "",
    `You are ${agent.name} (@${agent.handle}), an AI participant in ${place} inside Tandem — a group chat between one human and several AI agents.`,
    roster ? `Other participants you can @mention: ${roster}.` : "",
    "Each incoming line is prefixed with the speaker's name. Reply only as yourself; never prefix your reply with your own name.",
    "",
    "Act on yourself and shared knowledge by writing any of these on their own line:",
    "  RENAME: <name>             — change your display name",
    "  AVATAR: <emoji>            — set your avatar",
    "  MEMORY: <title> :: <fact>  — save a fact to this channel's memory",
    "  SHARED: <title> :: <fact>  — save a fact to the workspace-wide memory",
    "  SKILL: <name> :: <steps>   — save or refine a reusable procedure",
    "Record durable facts as memory and trust the Collective memory below instead of re-deriving context — it saves tokens.",
  ];
  if (channel.head_agent_id === agent.id) {
    lines.push(
      "",
      "You are the HEAD of this channel. Orchestrate: answer directly when you can, or delegate by @mentioning teammates. Add a specialist with `SPAWN: <handle> :: <what they do>` then @mention them. After teammates reply you get one turn to synthesize.",
    );
  }
  if (skills) lines.push("", "Skills you can follow:", skills);
  if (digest) lines.push("", "Collective memory:", digest);
  if (recalled.length) lines.push("", "Relevant earlier in this channel:", ...recalled.map((r) => `- ${r}`));
  if (recent.length >= 12 && memCount < Math.floor(recent.length / 4)) {
    lines.push("", "If anything here is worth keeping, record it with MEMORY before it scrolls off.");
  }
  return lines.filter(Boolean).join("\n");
};

const lastHumanPrompt = async (channelId: number): Promise<string> => {
  const humans = (await listMessageRows(channelId)).filter((m) => m.author_type === "human");
  const text = humans[humans.length - 1]?.content ?? "";
  return text.replace(MENTION_RE, "").trim() || "an evocative abstract artwork";
};

const reason = (err: unknown): string => {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 240 ? `${msg.slice(0, 240)}…` : msg;
};

export type TurnResult = { message: MessageRow | null; spawnedIds: number[] };

export const runAgentTurn = async (channel: ChannelRow, agent: Agent): Promise<TurnResult> => {
  const placeholder = await insertMessage({
    channelId: channel.id,
    authorType: "agent",
    authorId: agent.id,
    status: "streaming",
  });
  broadcast("message:created", toMessage(placeholder));
  broadcast("agent:typing", { channelId: channel.id, agentId: agent.id, active: true });

  const controller = new AbortController();
  register(channel.id, controller);
  const myEpoch = currentEpoch(channel.id);
  const stopped = (): boolean => controller.signal.aborted || currentEpoch(channel.id) !== myEpoch;
  let content = "";

  const discard = async (): Promise<null> => {
    await removeMessage(placeholder.id);
    broadcast("message:removed", { id: placeholder.id, channelId: channel.id });
    return null;
  };
  const finish = async (patch: Record<string, unknown>): Promise<MessageRow | null> => {
    const done = await updateMessageRow(placeholder.id, patch);
    if (done) broadcast("message:updated", toMessage(done));
    return done ?? null;
  };
  const postSystem = async (text: string): Promise<void> => {
    const sys = await insertMessage({ channelId: channel.id, authorType: "system", content: text });
    broadcast("message:created", toMessage(sys));
  };

  try {
    if (agent.kind === "image") {
      const src = await generateImage(agent.model, await lastHumanPrompt(channel.id), controller.signal);
      return { message: await finish({ image: src, status: "complete" }), spawnedIds: [] };
    }

    const names: Names = new Map((await listAgents()).map((a) => [a.id, a.name]));
    const members = await listMembers(channel.id);
    const rows = (await listMessageRows(channel.id)).filter((m) => m.id > channel.compressed_through);
    const model = await resolveModel(agent, channel, rows);
    const system = await buildSystem(rows, channel, agent, members);
    const context = contextFrom(rows, agent, names);

    const provider = await buildProvider(agent.providerKind);
    // No temperature — Opus rejects sampling params. system is the first message.
    const messages: AiMessage[] = [{ role: "system", content: system }, ...context];
    for await (const chunk of provider.chatStream({ model, messages })) {
      if (stopped()) break; // @atlas/ai has no AbortSignal; gate on the epoch/abort flag
      if (chunk.type === "text" && chunk.content) {
        content += chunk.content;
        broadcast("message:delta", { id: placeholder.id, channelId: channel.id, delta: chunk.content });
      }
      if (chunk.type === "done") break;
    }

    // Record usage before any discard so directive-only turns still count.
    const promptText = `${system}\n${context.map((m) => m.content).join("\n")}`;
    await recordUsage(agent.id, channel.id, model, estimateTokens(promptText), estimateTokens(content));

    if (stopped()) {
      const clean = parseDirectives(content).clean;
      return { message: clean.trim() === "" ? await discard() : await finish({ content: clean, status: "complete" }), spawnedIds: [] };
    }
    if (content.trim() === "") return { message: await discard(), spawnedIds: [] };

    const { clean, notes, spawnedIds } = await processDirectives(agent, channel, content);
    for (const note of notes) await postSystem(note);
    if (clean.trim() === "") return { message: await discard(), spawnedIds };
    return { message: await finish({ content: clean, status: "complete" }), spawnedIds };
  } catch (err) {
    if (stopped()) {
      const clean = parseDirectives(content).clean;
      return { message: clean.trim() === "" ? await discard() : await finish({ content: clean, status: "complete" }), spawnedIds: [] };
    }
    return { message: await finish({ content: `⚠️ couldn't respond: ${reason(err)}`, status: "error" }), spawnedIds: [] };
  } finally {
    broadcast("agent:typing", { channelId: channel.id, agentId: agent.id, active: false });
    unregister(channel.id, controller);
  }
};
