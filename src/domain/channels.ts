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

export const getChannel = (ownerId: number, id: number): Promise<ChannelRow | null> =>
  db.one(
    from(channels)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("id").equals(id)),
  );

// Resolve a channel by id ALONE → its owner_id. Used only by the service-to-
// service inbound hook (POST /internal/project-event), which has no session and
// must derive the tenant from the channel itself. Returns null for an unknown id.
export const channelOwnerId = async (id: number): Promise<number | null> => {
  const row = await db.one<{ owner_id: number }>(
    from(channels)
      .where((q) => q("id").equals(id))
      .select("owner_id"),
  );
  return row ? row.owner_id : null;
};

export const listChannels = async (ownerId: number): Promise<Channel[]> =>
  (
    await db.all<ChannelRow>(
      from(channels)
        .where((q) => q("owner_id").equals(ownerId))
        .orderBy("id", "ASC"),
    )
  ).map(toChannel);

export const setHeadAgent = async (
  ownerId: number,
  channelId: number,
  agentId: number | null,
): Promise<ChannelRow | null> => {
  await db.execute(
    from(channels)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("id").equals(channelId))
      .update({ head_agent_id: agentId }),
  );
  return getChannel(ownerId, channelId);
};

export const channelsHeadedBy = (ownerId: number, agentId: number): Promise<ChannelRow[]> =>
  db.all(
    from(channels)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("head_agent_id").equals(agentId)),
  );

export const dmChannelsForAgent = (ownerId: number, agentId: number): Promise<ChannelRow[]> =>
  db.all(
    from(channels)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("kind").equals("dm"))
      .where((q) => q("agent_id").equals(agentId)),
  );

export const removeChannel = async (ownerId: number, id: number): Promise<void> => {
  await db.execute(
    from(members)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("channel_id").equals(id))
      .del(),
  );
  await db.execute(
    from(schedules)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("channel_id").equals(id))
      .del(),
  );
  await db.execute(
    from(channels)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("id").equals(id))
      .del(),
  );
};

export const removeMembershipsForAgent = (ownerId: number, agentId: number): Promise<unknown> =>
  db.execute(
    from(members)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("agent_id").equals(agentId))
      .del(),
  );

const slugTaken = async (ownerId: number, slug: string): Promise<boolean> =>
  Boolean(
    await db.one(
      from(channels)
        .where((q) => q("owner_id").equals(ownerId))
        .where((q) => q("slug").equals(slug)),
    ),
  );

const uniqueSlug = async (ownerId: number, base: string): Promise<string> => {
  const slug = base || "channel";
  if (!(await slugTaken(ownerId, slug))) return slug;
  let i = 2;
  while (await slugTaken(ownerId, `${slug}${i}`)) i += 1;
  return `${slug}${i}`;
};

// Every user gets their own #general the first time they bootstrap.
export const ensureGeneral = async (ownerId: number): Promise<ChannelRow> => {
  const existing = await db.one<ChannelRow>(
    from(channels)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("slug").equals("general")),
  );
  if (existing) return existing;
  return insertRow(channels, {
    owner_id: ownerId,
    slug: "general",
    name: "general",
    kind: "channel",
    topic: "Everyone starts here.",
  });
};

export const createProjectRow = async (ownerId: number, name: string, topic: string): Promise<ChannelRow> => {
  const slug = await uniqueSlug(ownerId, slugifyHandle(name));
  return insertRow(channels, { owner_id: ownerId, slug, name, kind: "project", topic });
};

export const openDmRow = async (ownerId: number, agentId: number): Promise<ChannelRow> => {
  const existing = await db.one<ChannelRow>(
    from(channels)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("kind").equals("dm"))
      .where((q) => q("agent_id").equals(agentId)),
  );
  if (existing) return existing;
  const agent = await getAgentById(ownerId, agentId);
  const slug = await uniqueSlug(ownerId, `dm${slugifyHandle(agent?.handle ?? String(agentId))}`);
  return insertRow(channels, {
    owner_id: ownerId,
    slug,
    name: agent?.name ?? "Direct message",
    kind: "dm",
    topic: "",
    agent_id: agentId,
  });
};

export const listMembers = async (ownerId: number, channelId: number): Promise<Agent[]> => {
  const rows = await db.all<{ agent_id: number }>(
    from(members)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("channel_id").equals(channelId))
      .select("agent_id"),
  );
  const ids = new Set(rows.map((r) => r.agent_id));
  return (await listAgents(ownerId)).filter((a) => ids.has(a.id));
};

export const addMemberRow = async (ownerId: number, channelId: number, agentId: number): Promise<void> => {
  const exists = await db.one(
    from(members)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("channel_id").equals(channelId))
      .where((q) => q("agent_id").equals(agentId)),
  );
  if (!exists) await db.execute(from(members).insert({ owner_id: ownerId, channel_id: channelId, agent_id: agentId }));
};

export const removeMemberRow = (ownerId: number, channelId: number, agentId: number): Promise<unknown> =>
  db.execute(
    from(members)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("channel_id").equals(channelId))
      .where((q) => q("agent_id").equals(agentId))
      .del(),
  );
