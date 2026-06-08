import { db } from "../db/index.ts";
import type { SearchHit } from "../shared/types.ts";
import { listAgents } from "./agents.ts";
import { listChannels } from "./channels.ts";

// ts_headline wraps matches in U+0002…U+0003 — the frontend renders these as <mark>.
const HEADLINE = `StartSel=${String.fromCharCode(2)}, StopSel=${String.fromCharCode(3)}, MaxFragments=2, MaxWords=14, MinWords=4, FragmentDelimiter= ... `;

const isoT = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

// Build an OR tsquery from significant words for broad relevance recall.
const orTsquery = (raw: string): string =>
  [...new Set(raw.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].slice(0, 6).join(" | ");

export const search = async (ownerId: number, query: string): Promise<SearchHit[]> => {
  const q = query.trim();
  if (!q) return [];

  const agents = new Map((await listAgents(ownerId)).map((a) => [a.id, a.name]));
  const channels = await listChannels(ownerId);
  const label = (id: number | null): string => {
    if (id == null) return "workspace";
    const ch = channels.find((c) => c.id === id);
    return ch ? (ch.kind === "dm" ? ch.name : `#${ch.slug}`) : "—";
  };

  const hits: SearchHit[] = [];

  const msgs = await db.all<{
    id: number;
    channel_id: number;
    author_type: string;
    author_id: number | null;
    created_at: Date;
    snip: string;
  }>({
    text:
      "SELECT m.id, m.channel_id, m.author_type, m.author_id, m.created_at, " +
      "ts_headline('english', m.content, plainto_tsquery('english', $1), $2) AS snip " +
      "FROM messages m WHERE m.owner_id = $3 AND m.tsv @@ plainto_tsquery('english', $1) AND m.status = 'complete' AND m.author_type <> 'system' " +
      "ORDER BY ts_rank(m.tsv, plainto_tsquery('english', $1)) DESC LIMIT 30",
    values: [q, HEADLINE, ownerId],
  });
  for (const m of msgs) {
    hits.push({
      kind: "message",
      id: m.id,
      channelId: m.channel_id,
      channelName: label(m.channel_id),
      authorName: m.author_type === "human" ? "You" : (agents.get(m.author_id ?? -1) ?? "Agent"),
      snippet: m.snip,
      createdAt: isoT(m.created_at),
    });
  }

  const mems = await db.all<{
    id: number;
    channel_id: number | null;
    author_id: number | null;
    created_at: Date;
    snip: string;
  }>({
    text:
      "SELECT x.id, x.channel_id, x.author_id, x.created_at, " +
      "ts_headline('english', x.title || ' ' || x.body, plainto_tsquery('english', $1), $2) AS snip " +
      "FROM memories x WHERE x.owner_id = $3 AND x.tsv @@ plainto_tsquery('english', $1) " +
      "ORDER BY ts_rank(x.tsv, plainto_tsquery('english', $1)) DESC LIMIT 15",
    values: [q, HEADLINE, ownerId],
  });
  for (const x of mems) {
    hits.push({
      kind: "memory",
      id: x.id,
      channelId: x.channel_id,
      channelName: label(x.channel_id),
      authorName: agents.get(x.author_id ?? -1) ?? "—",
      snippet: x.snip,
      createdAt: isoT(x.created_at),
    });
  }

  return hits;
};

// Relevant messages between the compression watermark (afterId) and the recent
// window (beforeId) for context injection — never resurrects compressed history.
export const recall = async (
  ownerId: number,
  channelId: number,
  query: string,
  beforeId: number,
  limit = 4,
  afterId = 0,
): Promise<string[]> => {
  const tq = orTsquery(query);
  if (!tq) return [];
  const agents = new Map((await listAgents(ownerId)).map((a) => [a.id, a.name]));
  const rows = await db.all<{ content: string; author_type: string; author_id: number | null }>({
    text:
      "SELECT m.content, m.author_type, m.author_id FROM messages m " +
      "WHERE m.owner_id = $6 AND m.tsv @@ to_tsquery('english', $1) AND m.channel_id = $2 AND m.id < $3 AND m.id > $4 " +
      "AND m.status = 'complete' AND m.content <> '' ORDER BY ts_rank(m.tsv, to_tsquery('english', $1)) DESC LIMIT $5",
    values: [tq, channelId, beforeId, afterId, limit, ownerId],
  });
  return rows.map((r) => {
    const who = r.author_type === "human" ? "Human" : (agents.get(r.author_id ?? -1) ?? "Agent");
    const text = r.content.length > 300 ? `${r.content.slice(0, 300)}…` : r.content;
    return `${who}: ${text}`;
  });
};
