// Team suggestion: turn a plain-language goal into a proposed project + team.
// The LLM is given the user's EXISTING agents so it reuses them instead of
// always minting new ones, and only proposes new agents for missing roles.
import type { Message as AiMessage } from "@atlas/ai";
import type { ChannelRow, MessageRow } from "../db/schema.ts";
import { MENTION_RE } from "../shared/mentions.ts";
import type { Agent, Channel, ProviderKind, SuggestedMember, TeamSuggested, TeamSuggestion } from "../shared/types.ts";
import { getAgentById, insertAgent, listAgents, uniqueHandle } from "./agents.ts";
import { addMemberRow, createProjectRow, listMembers, setHeadAgent, toChannel } from "./channels.ts";
import { listMessageRows } from "./messages.ts";
import { ensureChannelProject } from "./projects.ts";
import { PROVIDER_CATALOG, TIERS } from "./providers/catalog.ts";
import { buildProvider, modelFor, providerConfigs } from "./providers/index.ts";

// One non-streaming completion, accumulated from the provider's stream (the
// same path agent turns use — keeps us on one provider abstraction).
const complete = async (ownerId: number, kind: ProviderKind, model: string, messages: AiMessage[]): Promise<string> => {
  const provider = await buildProvider(ownerId, kind);
  let out = "";
  for await (const chunk of provider.chatStream({ model, messages })) {
    if (chunk.type === "text" && chunk.content) out += chunk.content;
    if (chunk.type === "done") break;
  }
  return out;
};

// Pick a capable provider to generate the suggestion: a hosted model with a key
// (better at strict JSON) if available, else the always-local ollama.
const pickSuggester = async (ownerId: number): Promise<{ kind: ProviderKind; model: string }> => {
  const cfgs = await providerConfigs(ownerId);
  for (const kind of ["anthropic", "openai"] as ProviderKind[]) {
    if (cfgs.find((c) => c.kind === kind)?.hasKey) return { kind, model: TIERS[kind].strong };
  }
  return { kind: "ollama", model: await modelFor(ownerId, "ollama") };
};

const extractJson = (text: string): unknown => {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("the model did not return a team — try rephrasing the goal");
  return JSON.parse(cleaned.slice(start, end + 1));
};

const SYSTEM = [
  "You are a team architect for Tandem, a workspace where one human collaborates with several AI agents in a channel.",
  "Given a GOAL, assemble a SMALL, focused team (usually 2-4 agents) with exactly one lead who orchestrates the others.",
  "REUSE the human's existing agents whenever one fits a role — never duplicate a capability they already have. Only propose NEW agents for genuinely missing roles. Favor a small team.",
  "",
  "Respond with ONLY a JSON object (no markdown, no commentary) of exactly this shape:",
  '{"name":"<short kebab-case project name>","topic":"<one line>","rationale":"<one sentence on why this team>",',
  ' "members":[{"reuse":true,"lead":false,"handle":"<handle>","name":"<display name>","role":"<what they do here>",',
  '   "blurb":"<short tagline>","avatar":"<one emoji>","providerKind":"<anthropic|openai|ollama>","model":"<model id>","systemPrompt":"<persona>"}]}',
  "",
  "Exactly one member has lead:true. For a reused agent set reuse:true and use its EXACT handle (the new-agent fields may be omitted). For a new agent set reuse:false and fill blurb/avatar/providerKind/model/systemPrompt. Choose providerKind only from the AVAILABLE PROVIDERS listed.",
].join("\n");

export const suggestTeam = async (ownerId: number, goal: string): Promise<TeamSuggestion> => {
  const trimmed = goal.trim();
  if (!trimmed) throw new Error("describe what you want to do first");

  const existing = await listAgents(ownerId);
  const cfgs = await providerConfigs(ownerId);
  const usable = new Set<ProviderKind>(cfgs.filter((c) => c.hasKey).map((c) => c.kind));
  usable.add("ollama"); // always available (local / env fallback)

  const roster = existing.length
    ? existing
        .map((a) => `- @${a.handle} (${a.name}) — ${a.blurb || "no description"} [${a.providerKind}/${a.model}]`)
        .join("\n")
    : "(none yet)";
  const providerLines = cfgs
    .filter((c) => usable.has(c.kind))
    .map((c) => `- ${c.kind}: default model ${c.defaultModel}`)
    .join("\n");

  const user = `GOAL:\n${trimmed}\n\nEXISTING AGENTS (reuse by handle when they fit):\n${roster}\n\nAVAILABLE PROVIDERS (pick providerKind/model for new agents from these):\n${providerLines}`;

  const { kind, model } = await pickSuggester(ownerId);
  const raw = await complete(ownerId, kind, model, [
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ]);

  const parsed = extractJson(raw) as Partial<TeamSuggestion> & { members?: Partial<SuggestedMember>[] };
  return normalize(ownerId, parsed, existing, usable);
};

const fallbackKind = (usable: Set<ProviderKind>): ProviderKind =>
  usable.has("ollama") ? "ollama" : ([...usable][0] ?? "ollama");

const normalize = async (
  ownerId: number,
  parsed: Partial<TeamSuggestion> & { members?: Partial<SuggestedMember>[] },
  existing: Agent[],
  usable: Set<ProviderKind>,
): Promise<TeamSuggestion> => {
  const byHandle = new Map(existing.map((a) => [a.handle, a]));
  const raw = Array.isArray(parsed.members) ? parsed.members : [];

  const members: SuggestedMember[] = [];
  for (const m of raw) {
    const reuseExisting = Boolean(m.reuse) && typeof m.handle === "string" && byHandle.has(m.handle);
    if (reuseExisting) {
      const a = byHandle.get(m.handle as string)!;
      members.push({
        reuse: true,
        lead: Boolean(m.lead),
        handle: a.handle,
        name: a.name,
        role: m.role?.trim() || a.blurb || a.name,
      });
      continue;
    }
    // New agent — fill safe defaults and coerce provider to one that's usable.
    const providerKind = m.providerKind && usable.has(m.providerKind) ? m.providerKind : fallbackKind(usable);
    const model =
      m.model?.trim() || (await modelFor(ownerId, providerKind)) || PROVIDER_CATALOG[providerKind].defaultModel;
    const name = m.name?.trim() || m.handle?.trim() || "Agent";
    members.push({
      reuse: false,
      lead: Boolean(m.lead),
      handle: (m.handle?.trim() || name).toLowerCase(),
      name,
      role: m.role?.trim() || "",
      blurb: m.blurb?.trim() || m.role?.trim() || "",
      avatar: m.avatar?.trim() || "🤖",
      color: m.color?.trim() || "#6366f1",
      providerKind,
      model,
      systemPrompt:
        m.systemPrompt?.trim() || `You are ${name}. ${m.role?.trim() || "Help the team accomplish its goal."}`,
    });
  }

  if (members.length === 0) throw new Error("the model proposed no team — try a more specific goal");
  // Exactly one lead.
  const leadIdx = members.findIndex((m) => m.lead);
  members.forEach((m, i) => {
    m.lead = i === (leadIdx === -1 ? 0 : leadIdx);
  });

  return {
    name:
      (parsed.name?.trim() || "team")
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "team",
    topic: parsed.topic?.trim() || "",
    rationale: parsed.rationale?.trim() || "",
    members,
  };
};

export type CreatedTeam = { channel: Channel; newAgents: Agent[]; members: Agent[] };

export const createTeam = async (ownerId: number, suggestion: TeamSuggestion): Promise<CreatedTeam> => {
  const ch = await createProjectRow(ownerId, suggestion.name || "team", suggestion.topic || "");
  const byHandle = new Map((await listAgents(ownerId)).map((a) => [a.handle, a]));

  const newAgents: Agent[] = [];
  const members: Agent[] = [];
  let leadId: number | null = null;

  for (const m of suggestion.members) {
    let agent: Agent | undefined;
    if (m.reuse && byHandle.has(m.handle)) {
      agent = byHandle.get(m.handle);
    } else {
      const providerKind: ProviderKind = m.providerKind ?? "ollama";
      const row = await insertAgent(ownerId, {
        handle: await uniqueHandle(ownerId, m.handle || m.name),
        name: m.name || m.handle,
        blurb: m.blurb ?? m.role ?? "",
        avatar: m.avatar || "🤖",
        color: m.color || "#6366f1",
        providerKind,
        model: m.model || (await modelFor(ownerId, providerKind)),
        systemPrompt: m.systemPrompt ?? "",
        kind: "chat",
      });
      agent = await getAgentById(ownerId, row.id);
      if (agent) newAgents.push(agent);
    }
    if (!agent) continue;
    await addMemberRow(ownerId, ch.id, agent.id);
    members.push(agent);
    if (m.lead) leadId = agent.id;
  }

  if (leadId == null && members[0]) leadId = members[0].id;
  let channelRow = ch;
  if (leadId != null) channelRow = (await setHeadAgent(ownerId, ch.id, leadId)) ?? ch;

  // M5.1 — seed the empty channel↔artifact project-state link so the new project
  // channel starts with an "unlinked" row ready for project:set.
  await ensureChannelProject(ownerId, ch.id);

  return { channel: toChannel(channelRow), newAgents, members };
};

// A goal is "substantive" enough to auto-propose a team only if, once @mentions
// are stripped, there's real intent left. A bare ping or one-word fragment isn't
// worth a (paid) suggestion call.
const MIN_GOAL_LEN = 12;
const isSubstantiveGoal = (content: string): boolean => {
  const text = content.replace(MENTION_RE, "").trim();
  return text.length >= MIN_GOAL_LEN && /\s/.test(text);
};

// M1.5 — agent-triggered team suggest. When the FIRST substantive human message
// lands in an agentless, non-dm channel, propose a team for it so the user can
// accept without opening the create-project flow. Returns the broadcast payload,
// or null when the channel isn't a fresh canvas (has members, is a dm, already
// has prior messages, or the goal is too thin). Pure of sockets — the caller
// (handler) broadcasts the result on the bus.
export const maybeSuggestTeamForGoal = async (
  ownerId: number,
  channel: ChannelRow,
  message: MessageRow,
): Promise<TeamSuggested | null> => {
  if (message.author_type !== "human" || channel.kind === "dm") return null;
  if (!isSubstantiveGoal(message.content)) return null;

  // Only fire on a genuinely empty channel: no agent members and no message
  // other than the one we just inserted (so a later message in an emptied
  // channel doesn't re-trigger).
  const members = await listMembers(ownerId, channel.id);
  if (members.length > 0) return null;
  const rows = await listMessageRows(ownerId, channel.id);
  const priorReal = rows.filter((m) => m.id !== message.id && m.author_type !== "system" && m.content.trim() !== "");
  if (priorReal.length > 0) return null;

  const goal = message.content.replace(MENTION_RE, "").trim();
  try {
    const suggestion = await suggestTeam(ownerId, goal);
    return { channelId: channel.id, goal, suggestion };
  } catch {
    // A failed suggestion (provider down, bad JSON) must not break sending the
    // message; the user simply sees no auto-prompt.
    return null;
  }
};
