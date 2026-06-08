import { db, from, insertRow, iso, isoN, memories } from "../db/index.ts";
import type { MemoryRow } from "../db/schema.ts";
import type { Memory, MemoryScope } from "../shared/types.ts";

const TTL_DAYS = 30;
const DAY_MS = 86_400_000;

export const toMemory = (r: MemoryRow): Memory => ({
  id: r.id,
  scope: r.scope as MemoryScope,
  channelId: r.channel_id,
  authorId: r.author_id,
  title: r.title,
  body: r.body,
  confidence: r.confidence,
  pinned: Boolean(r.pinned),
  expiresAt: isoN(r.expires_at),
  createdAt: iso(r.created_at),
});

export type NewMemory = {
  ownerId: number;
  scope: MemoryScope;
  channelId: number | null;
  authorId: number | null;
  title: string;
  body: string;
  confidence?: number;
};

const expiryFor = (scope: MemoryScope): string | null =>
  scope === "global" ? null : new Date(Date.now() + TTL_DAYS * DAY_MS).toISOString();

export const addMemory = (m: NewMemory): Promise<MemoryRow> =>
  insertRow(memories, {
    owner_id: m.ownerId,
    scope: m.scope,
    channel_id: m.scope === "channel" ? m.channelId : null,
    author_id: m.authorId,
    title: m.title,
    body: m.body,
    confidence: m.confidence ?? 0.6,
    expires_at: expiryFor(m.scope),
  });

export const removeMemory = (ownerId: number, id: number): Promise<unknown> =>
  db.execute(from(memories).where((q) => q("owner_id").equals(ownerId)).where((q) => q("id").equals(id)).del());

export const setPinned = async (ownerId: number, id: number, pinned: boolean): Promise<MemoryRow | null> => {
  const row = await db.one<MemoryRow>(
    from(memories).where((q) => q("owner_id").equals(ownerId)).where((q) => q("id").equals(id)),
  );
  if (!row) return null;
  // global memories must stay non-expiring — derive TTL from the row's scope.
  const expires_at = pinned ? null : expiryFor(row.scope as MemoryScope);
  await db.execute(
    from(memories).where((q) => q("owner_id").equals(ownerId)).where((q) => q("id").equals(id)).update({ pinned, expires_at }),
  );
  return db.one(from(memories).where((q) => q("owner_id").equals(ownerId)).where((q) => q("id").equals(id)));
};

// Global prune across all users — expiry is independent of tenancy.
export const pruneExpired = async (): Promise<number> => {
  const now = new Date().toISOString();
  const n =
    (await db.all<{ n: number }>({
      text: "SELECT count(*)::int AS n FROM memories WHERE pinned = false AND expires_at IS NOT NULL AND expires_at < $1",
      values: [now],
    }))[0]?.n ?? 0;
  if (n > 0)
    await db.execute({
      text: "DELETE FROM memories WHERE pinned = false AND expires_at IS NOT NULL AND expires_at < $1",
      values: [now],
    });
  return n;
};

// This user's global + this channel's live (non-expired) memories, oldest first.
const liveRows = async (ownerId: number, channelId: number, limit?: number): Promise<MemoryRow[]> => {
  const now = new Date().toISOString();
  const where =
    "owner_id = $1 AND (scope = 'global' OR channel_id = $2) AND (pinned = true OR expires_at IS NULL OR expires_at >= $3)";
  if (limit) {
    const rows = await db.all<MemoryRow>({
      text: `SELECT * FROM memories WHERE ${where} ORDER BY id DESC LIMIT $4`,
      values: [ownerId, channelId, now, limit],
    });
    return rows.reverse();
  }
  return db.all<MemoryRow>({
    text: `SELECT * FROM memories WHERE ${where} ORDER BY id ASC`,
    values: [ownerId, channelId, now],
  });
};

export const listMemories = async (ownerId: number, channelId: number): Promise<Memory[]> =>
  (await liveRows(ownerId, channelId)).map(toMemory);

const cap = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s);

export const memoryDigest = async (ownerId: number, channelId: number, limit = 40): Promise<string> => {
  const rows = await liveRows(ownerId, channelId, limit);
  if (rows.length === 0) return "";
  return rows
    .map((r) => {
      const tag = r.scope === "global" ? "global" : "here";
      const body = cap(r.body, r.pinned ? 1200 : 240);
      return `- [${tag}] ${cap(r.title, 120)}${body ? `: ${body}` : ""}`;
    })
    .join("\n");
};

export const memoryCount = async (ownerId: number, channelId: number): Promise<number> =>
  (await liveRows(ownerId, channelId)).length;
