import { channels, db, from, insertRow, iso, isoN, members, schedules } from "../db/index.ts";
import type { ChannelRow } from "../db/schema.ts";
import { slugifyHandle } from "../shared/mentions.ts";
import type { Agent, Channel } from "../shared/types.ts";
import { getAgentById, listAgents } from "./agents.ts";

export const toChannel = (r: ChannelRow): Channel => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  kind: r.kind as Channel["kind"],
  topic: r.topic,
  agentId: r.agent_id,
  headAgentId: r.head_agent_id,
  archivedAt: isoN(r.archived_at),
  createdAt: iso(r.created_at),
});

export const getChannel = (id: number): Promise<ChannelRow | null> =>
  db.one(from(channels).where((q) => q("id").equals(id)));

export const listChannels = async (): Promise<Channel[]> =>
  (await db.all<ChannelRow>(from(channels).orderBy("id", "ASC"))).map(toChannel);

export const setHeadAgent = async (channelId: number, agentId: number | null): Promise<ChannelRow | null> => {
  await db.execute(from(channels).where((q) => q("id").equals(channelId)).update({ head_agent_id: agentId }));
  return getChannel(channelId);
};

export const channelsHeadedBy = (agentId: number): Promise<ChannelRow[]> =>
  db.all(from(channels).where((q) => q("head_agent_id").equals(agentId)));

export const dmChannelsForAgent = (agentId: number): Promise<ChannelRow[]> =>
  db.all(from(channels).where((q) => q("kind").equals("dm")).where((q) => q("agent_id").equals(agentId)));

export const removeChannel = async (id: number): Promise<void> => {
  await db.execute(from(members).where((q) => q("channel_id").equals(id)).del());
  await db.execute(from(schedules).where((q) => q("channel_id").equals(id)).del());
  await db.execute(from(channels).where((q) => q("id").equals(id)).del());
};

export const removeMembershipsForAgent = (agentId: number): Promise<unknown> =>
  db.execute(from(members).where((q) => q("agent_id").equals(agentId)).del());

const slugTaken = async (slug: string): Promise<boolean> =>
  Boolean(await db.one(from(channels).where((q) => q("slug").equals(slug))));

const uniqueSlug = async (base: string): Promise<string> => {
  const slug = base || "channel";
  if (!(await slugTaken(slug))) return slug;
  let i = 2;
  while (await slugTaken(`${slug}${i}`)) i += 1;
  return `${slug}${i}`;
};

export const ensureGeneral = async (): Promise<ChannelRow> => {
  const existing = await db.one<ChannelRow>(from(channels).where((q) => q("slug").equals("general")));
  if (existing) return existing;
  return insertRow(channels, { slug: "general", name: "general", kind: "channel", topic: "Everyone starts here." });
};

export const createProjectRow = async (name: string, topic: string): Promise<ChannelRow> => {
  const slug = await uniqueSlug(slugifyHandle(name));
  return insertRow(channels, { slug, name, kind: "project", topic });
};

export const openDmRow = async (agentId: number): Promise<ChannelRow> => {
  const existing = await db.one<ChannelRow>(
    from(channels).where((q) => q("kind").equals("dm")).where((q) => q("agent_id").equals(agentId)),
  );
  if (existing) return existing;
  const agent = await getAgentById(agentId);
  const slug = await uniqueSlug(`dm${slugifyHandle(agent?.handle ?? String(agentId))}`);
  return insertRow(channels, { slug, name: agent?.name ?? "Direct message", kind: "dm", topic: "", agent_id: agentId });
};

export const listMembers = async (channelId: number): Promise<Agent[]> => {
  const rows = await db.all<{ agent_id: number }>(
    from(members).where((q) => q("channel_id").equals(channelId)).select("agent_id"),
  );
  const ids = new Set(rows.map((r) => r.agent_id));
  return (await listAgents()).filter((a) => ids.has(a.id));
};

export const addMemberRow = async (channelId: number, agentId: number): Promise<void> => {
  const exists = await db.one(
    from(members).where((q) => q("channel_id").equals(channelId)).where((q) => q("agent_id").equals(agentId)),
  );
  if (!exists) await db.execute(from(members).insert({ channel_id: channelId, agent_id: agentId }));
};

export const removeMemberRow = (channelId: number, agentId: number): Promise<unknown> =>
  db.execute(from(members).where((q) => q("channel_id").equals(channelId)).where((q) => q("agent_id").equals(agentId)).del());
