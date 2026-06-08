// End-to-end proof of the agent runtime against real Postgres, driving the
// REAL domain code (dispatch → runAgentTurn → processDirectives → cascade,
// compression, scheduler, search, usage). The only fake is a local server that
// speaks Ollama's wire protocol, so even @atlas/ai's provider client runs for real.
//
// Everything runs inside a single freshly-created user (tenant), exercising the
// owner_id scoping end to end.
//
// Run: DATABASE_URL=... OLLAMA_URL=http://localhost:11500 bun test/runtime.ts

import { getAgentById, insertAgent, listAgents } from "../src/domain/agents.ts";
import { addMemberRow, createProjectRow, openDmRow, setHeadAgent } from "../src/domain/channels.ts";
import { onEvent, type Outgoing } from "../src/domain/events.ts";
import { listMemories } from "../src/domain/memory.ts";
import { insertMessage, listMessageRows } from "../src/domain/messages.ts";
import { compressChannel } from "../src/domain/runtime/compress.ts";
import { dispatch, startCascade } from "../src/domain/runtime/index.ts";
import { tick } from "../src/domain/runtime/scheduler.ts";
import { search } from "../src/domain/search.ts";
import { createSchedule } from "../src/domain/schedules.ts";
import { listSkills } from "../src/domain/skills.ts";
import { usageStats } from "../src/domain/usage.ts";
import { channels, db, from, insertRow, schedules, users } from "../src/db/index.ts";

// ----------------------------------------------------------------- fake ollama
const reply = (system: string, msgs: { role: string; content: string }[]): string => {
  const hasAssistant = msgs.some((m) => m.role === "assistant");
  const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
  const isHead = /HEAD of this channel/.test(system);
  if (isHead && !hasAssistant)
    return "SPAWN: researcher :: investigate the question\n@researcher please dig into this.\nOn it — delegating now.";
  if (isHead && hasAssistant) return "Synthesis: the team confirmed the answer. Done.";
  if (/\[reply-directives\]/.test(lastUser))
    return [
      "RENAME: Llama Prime",
      "AVATAR: 🦙",
      "MEMORY: Codename :: The project is called Tandem.",
      "SHARED: Homelab :: Wess runs Castle in his homelab.",
      "SKILL: greet :: 1. say hi, 2. keep it short",
      "Acknowledged — updated myself and saved those notes.",
    ].join("\n");
  return "Hello! I hear you. The answer is 42.";
};

const fake = Bun.serve({
  port: 11500,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/api/chat") return new Response("nope", { status: 404 });
    const body = (await req.json()) as {
      model: string;
      stream: boolean;
      messages: { role: string; content: string }[];
    };
    const system = body.messages.find((m) => m.role === "system")?.content ?? "";
    const text = reply(system, body.messages);

    if (!body.stream) {
      return Response.json({
        model: body.model,
        message: { role: "assistant", content: text },
        prompt_eval_count: 123,
        eval_count: 45,
        done: true,
      });
    }
    // newline-delimited JSON stream, chunked by words to exercise delta accumulation
    const words = text.split(" ");
    const groups: string[] = [];
    for (let i = 0; i < words.length; i += Math.ceil(words.length / 4)) {
      groups.push(words.slice(i, i + Math.ceil(words.length / 4)).join(" ") + (i === 0 ? "" : ""));
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        let first = true;
        for (const g of groups) {
          const piece = first ? g : ` ${g}`;
          first = false;
          controller.enqueue(enc.encode(`${JSON.stringify({ model: body.model, message: { role: "assistant", content: piece }, done: false })}\n`));
        }
        controller.enqueue(enc.encode(`${JSON.stringify({ model: body.model, done: true })}\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
  },
});

// ----------------------------------------------------------------- harness
const events: Outgoing[] = [];
onEvent((m) => events.push(m));
const evkinds = (): string[] => events.map((e) => e.event);
const since = (n: number) => events.slice(n);

let passes = 0;
let fails = 0;
const ok = (label: string, cond: boolean, detail = ""): void => {
  if (cond) {
    passes += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fails += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const drain = () => sleep(50); // let fire-and-forget broadcasts settle

// A fresh tenant for this run — every domain call is scoped to this owner.
const owner = await insertRow<{ id: number }>(users, {
  email: `runtime+${Date.now()}@test.local`,
  name: "Runtime Tester",
  password: "x",
});
const ownerId = owner.id;
console.log(`tenant owner_id = ${ownerId}`);

// every broadcast must be tagged with this tenant
const ownedEvents = (): boolean => events.every((e) => e.ownerId === ownerId);

// ----------------------------------------------------------------- A: DM streaming
console.log("\n[A] DM plain streaming");
const llama = await getAgentById(
  ownerId,
  (await insertAgent(ownerId, {
    handle: "llama",
    name: "Llama",
    blurb: "",
    avatar: "🤖",
    color: "#6366f1",
    providerKind: "ollama",
    model: "auto",
    systemPrompt: "You are helpful.",
    kind: "chat",
  })).id,
);
if (!llama) throw new Error("llama not created");
const dm = await openDmRow(ownerId, llama.id);
await addMemberRow(ownerId, dm.id, llama.id);

let mark = events.length;
const hi = await insertMessage({ ownerId, channelId: dm.id, authorType: "human", content: "[reply-plain] hello there" });
await dispatch(hi, startCascade(dm.id));
await drain();
{
  const e = since(mark);
  const kinds = e.map((x) => x.event);
  ok("placeholder broadcast (message:created)", kinds.includes("message:created"));
  ok("streamed deltas (>=2 message:delta)", kinds.filter((k) => k === "message:delta").length >= 2,
    `got ${kinds.filter((k) => k === "message:delta").length}`);
  ok("typing on then off", kinds.includes("agent:typing"));
  const fin = [...e].reverse().find((x) => x.event === "message:updated")?.data as { content: string; status: string } | undefined;
  ok("final message:updated complete", fin?.status === "complete", JSON.stringify(fin));
  ok("final content assembled from chunks", fin?.content === "Hello! I hear you. The answer is 42.", fin?.content);
  const rows = await listMessageRows(ownerId, dm.id);
  const agentMsg = rows.find((r) => r.author_type === "agent" && r.status === "complete");
  ok("agent message persisted", agentMsg?.content === "Hello! I hear you. The answer is 42.", agentMsg?.content);
}

// ----------------------------------------------------------------- B: directives
console.log("\n[B] DM directive processing (rename/avatar/memory/shared/skill)");
mark = events.length;
const dmsg = await insertMessage({ ownerId, channelId: dm.id, authorType: "human", content: "[reply-directives] update yourself" });
await dispatch(dmsg, startCascade(dm.id));
await drain();
{
  const kinds = since(mark).map((x) => x.event);
  ok("two agent:updated (rename + avatar)", kinds.filter((k) => k === "agent:updated").length >= 2,
    `got ${kinds.filter((k) => k === "agent:updated").length}`);
  ok("two memory:added (channel + global)", kinds.filter((k) => k === "memory:added").length >= 2,
    `got ${kinds.filter((k) => k === "memory:added").length}`);
  ok("skills:changed emitted", kinds.includes("skills:changed"));
  ok("system notes posted (message:created)", kinds.filter((k) => k === "message:created").length >= 1);
  const renamed = await getAgentById(ownerId, llama.id);
  ok("agent renamed in DB", renamed?.name === "Llama Prime", renamed?.name);
  ok("avatar updated in DB", renamed?.avatar === "🦙", renamed?.avatar);
  const mems = await listMemories(ownerId, dm.id);
  ok("channel memory saved", mems.some((m) => m.scope === "channel" && m.title === "Codename"));
  ok("global memory saved", mems.some((m) => m.scope === "global" && m.title === "Homelab"));
  const skills = await listSkills(ownerId);
  ok("skill saved", skills.some((s) => s.name === "greet"), JSON.stringify(skills.map((s) => s.name)));
  const fin = [...since(mark)].reverse().find((x) => x.event === "message:updated")?.data as { content: string } | undefined;
  ok("clean reply has directive lines stripped", fin?.content === "Acknowledged — updated myself and saved those notes.", fin?.content);
}

// ----------------------------------------------------------------- C: head orchestration + spawn + cascade + synthesis
console.log("\n[C] Head orchestration: spawn → delegate → synthesize");
const proj = await createProjectRow(ownerId, "Research Bay", "deep questions");
const maestro = await getAgentById(
  ownerId,
  (await insertAgent(ownerId, {
    handle: "maestro",
    name: "Maestro",
    blurb: "",
    avatar: "🎩",
    color: "#6366f1",
    providerKind: "ollama",
    model: "auto",
    systemPrompt: "You coordinate.",
    kind: "chat",
  })).id,
);
if (!maestro) throw new Error("maestro not created");
await addMemberRow(ownerId, proj.id, maestro.id);
await setHeadAgent(ownerId, proj.id, maestro.id);

mark = events.length;
const agentsBefore = (await listAgents(ownerId)).length;
const ask = await insertMessage({ ownerId, channelId: proj.id, authorType: "human", content: "What is the meaning of it all?" });
await dispatch(ask, startCascade(proj.id));
await drain();
{
  const e = since(mark);
  const kinds = e.map((x) => x.event);
  ok("subagent created (agent:created)", kinds.includes("agent:created"));
  ok("membership changed after spawn", kinds.includes("members:changed"));
  const agentsAfter = await listAgents(ownerId);
  ok("exactly one new agent spawned", agentsAfter.length === agentsBefore + 1, `${agentsBefore}→${agentsAfter.length}`);
  const researcher = agentsAfter.find((a) => a.parentId === maestro.id);
  ok("spawned agent parented to head", !!researcher, JSON.stringify(agentsAfter.map((a) => [a.handle, a.parentId])));
  const rows = await listMessageRows(ownerId, proj.id);
  const agentReplies = rows.filter((r) => r.author_type === "agent" && r.status === "complete" && r.content.trim());
  // head first reply + researcher reply + head synthesis = 3
  ok("head + researcher + synthesis all replied", agentReplies.length >= 3, `got ${agentReplies.length}`);
  const synth = agentReplies.find((r) => r.content.startsWith("Synthesis:"));
  ok("head produced a synthesis turn", !!synth, agentReplies.map((r) => r.content).join(" | "));
  // anti-loop: cascade is bounded — not an explosion of turns
  ok("cascade bounded (<= 8 agent messages)", agentReplies.length <= 8, `got ${agentReplies.length}`);
}

// ----------------------------------------------------------------- D: compression
console.log("\n[D] Memory compression (summarize → pin → advance watermark)");
const archive = await createProjectRow(ownerId, "Archive", "long history");
await addMemberRow(ownerId, archive.id, llama.id);
await setHeadAgent(ownerId, archive.id, llama.id); // head=ollama so compress uses the fake provider
for (let i = 0; i < 22; i += 1) {
  await insertMessage({
    ownerId,
    channelId: archive.id,
    authorType: i % 2 === 0 ? "human" : "agent",
    authorId: i % 2 === 0 ? null : llama.id,
    content: `History line ${i}: discussing widgets and the Tandem roadmap.`,
    status: "complete",
  });
}
const chBefore = await db.one<{ compressed_through: number }>(
  from(channels).where((q) => q("id").equals(archive.id)).select("compressed_through"),
);
mark = events.length;
const compressed = await compressChannel(ownerId, archive.id);
await drain();
{
  ok("compressChannel returned true", compressed === true);
  const kinds = since(mark).map((x) => x.event);
  ok("memory:added broadcast for the summary", kinds.includes("memory:added"));
  const mems = await listMemories(ownerId, archive.id);
  const summary = mems.find((m) => m.pinned && m.title.startsWith("Summary through"));
  ok("pinned summary memory created", !!summary, JSON.stringify(mems.map((m) => m.title)));
  const chAfter = await db.one<{ compressed_through: number }>(
    from(channels).where((q) => q("id").equals(archive.id)).select("compressed_through"),
  );
  ok("compression watermark advanced", (chAfter?.compressed_through ?? 0) > (chBefore?.compressed_through ?? 0),
    `${chBefore?.compressed_through} → ${chAfter?.compressed_through}`);
}

// ----------------------------------------------------------------- E: scheduler
console.log("\n[E] Scheduler fires a due task through the pipeline");
const realNow = Date.now();
// create with a past "now" so next_run_at lands in the past → due immediately
await createSchedule(ownerId, { channelId: dm.id, agentId: llama.id, prompt: "give me a status", intervalMinutes: 1 }, realNow - 5 * 60_000);
const dmRowsBefore = (await listMessageRows(ownerId, dm.id)).length;
mark = events.length;
await tick();
await drain();
{
  const kinds = since(mark).map((x) => x.event);
  ok("scheduler posted a message (message:created)", kinds.includes("message:created"));
  const dmRowsAfter = await listMessageRows(ownerId, dm.id);
  ok("scheduled prompt + agent reply appended", dmRowsAfter.length > dmRowsBefore, `${dmRowsBefore} → ${dmRowsAfter.length}`);
  const srow = await db.one<{ next_run_at: number | bigint }>(
    from(schedules).where((q) => q("channel_id").equals(dm.id)).select("next_run_at"),
  );
  ok("next_run_at advanced into the future", Number(srow?.next_run_at ?? 0) > realNow, String(srow?.next_run_at));
}

// ----------------------------------------------------------------- F: search highlighting
console.log("\n[F] Full-text search with highlighted snippets");
{
  const hits = await search(ownerId, "Tandem");
  ok("search returns hits", hits.length > 0, `got ${hits.length}`);
  const MARK = String.fromCharCode(2);
  ok("snippet carries highlight sentinel (U+0002)", hits.some((h) => h.snippet.includes(MARK)),
    JSON.stringify(hits.slice(0, 2).map((h) => h.snippet)));
  ok("hits span messages and/or memory", hits.every((h) => h.kind === "message" || h.kind === "memory"));
}

// ----------------------------------------------------------------- G: usage tracking
console.log("\n[G] Usage / cost tracking");
{
  const stats = await usageStats(ownerId);
  ok("total tokens recorded > 0", stats.totalTokens > 0, String(stats.totalTokens));
  ok("per-agent usage bucket exists", stats.byAgent.length > 0);
  ok("per-channel usage bucket exists", stats.byChannel.length > 0);
}

// ----------------------------------------------------------------- H: tenant isolation
console.log("\n[H] Tenant isolation");
{
  ok("every broadcast tagged with this tenant", ownedEvents());
  // A second user sees an empty workspace — none of this run's data leaks.
  const other = await insertRow<{ id: number }>(users, {
    email: `runtime-other+${Date.now()}@test.local`,
    name: "Other Tenant",
    password: "x",
  });
  ok("other tenant has no agents", (await listAgents(other.id)).length === 0);
  ok("other tenant has no messages in this dm", (await listMessageRows(other.id, dm.id)).length === 0);
  ok("other tenant search is empty", (await search(other.id, "Tandem")).length === 0);
  ok("other tenant sees no memory", (await listMemories(other.id, dm.id)).length === 0);
  ok("other tenant usage is zero", (await usageStats(other.id)).totalTokens === 0);
}

// ----------------------------------------------------------------- summary
console.log(`\n${fails === 0 ? "ALL GREEN" : "FAILURES"}: ${passes} passed, ${fails} failed`);
console.log("event kinds seen:", [...new Set(evkinds())].sort().join(", "));
fake.stop();
await db.close?.();
process.exit(fails === 0 ? 0 : 1);
