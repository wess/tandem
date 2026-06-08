// M5.1 — the channel↔artifact project-state link. Binds a project channel to
// its git repo + kettle deploy project + host so the workspace can track what a
// team is building. One row per channel, scoped by owner_id like every other
// workspace table; get/set never trust an owner from the wire.
import { channelprojects, db, from, insertRow, iso } from "../db/index.ts";
import type { ChannelProjectRow } from "../db/schema.ts";
import type { ChannelProject, ChannelProjectPatch } from "../shared/types.ts";

// snake_case row → camelCase wire type, per the mapper rule (timestamptz → ISO).
export const toChannelProject = (r: ChannelProjectRow): ChannelProject => ({
  channelId: r.channel_id,
  repoOwner: r.repo_owner,
  repoName: r.repo_name,
  repoUrl: r.repo_url,
  kettleProjectId: r.kettle_project_id,
  deployHost: r.deploy_host,
  lastSha: r.last_sha,
  status: r.status as ChannelProject["status"],
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

const getRow = (ownerId: number, channelId: number): Promise<ChannelProjectRow | null> =>
  db.one(
    from(channelprojects)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("channel_id").equals(channelId)),
  );

// Service-to-service lookup (the inbound status hook): resolve a project row from
// a repo identifier ALONE — there is no session cookie, so the owner_id is read
// FROM the matched row, never the wire. Matches either the full repo_url or an
// "owner/name" pair. Cross-owner by design (the hook is global), so a match is
// what binds the event to a tenant; null when no channel is linked to that repo.
export const findProjectByRepo = async (repo: string): Promise<ChannelProjectRow | null> => {
  const value = repo.trim();
  if (!value) return null;
  const byUrl = await db.one<ChannelProjectRow>(from(channelprojects).where((q) => q("repo_url").equals(value)));
  if (byUrl) return byUrl;
  const slash = value.indexOf("/");
  if (slash <= 0) return null;
  const owner = value.slice(0, slash);
  const name = value.slice(slash + 1);
  return db.one<ChannelProjectRow>(
    from(channelprojects)
      .where((q) => q("repo_owner").equals(owner))
      .where((q) => q("repo_name").equals(name)),
  );
};

// The project-state link for a channel, or null when none exists yet.
export const getChannelProject = async (ownerId: number, channelId: number): Promise<ChannelProject | null> => {
  const row = await getRow(ownerId, channelId);
  return row ? toChannelProject(row) : null;
};

// Create the empty link for a channel if it has none. Seeded from the team
// accept flow so every new project channel starts with an "unlinked" row.
export const ensureChannelProject = async (ownerId: number, channelId: number): Promise<ChannelProjectRow> => {
  const existing = await getRow(ownerId, channelId);
  if (existing) return existing;
  return insertRow(channelprojects, { owner_id: ownerId, channel_id: channelId });
};

// Wire-patch → snake_case column set. Only the keys the caller provided are
// written; server-managed columns (owner_id, timestamps) are never taken here.
const toColumns = (patch: ChannelProjectPatch): Record<string, unknown> => {
  const clean: Record<string, unknown> = {};
  if (patch.repoOwner !== undefined) clean.repo_owner = patch.repoOwner;
  if (patch.repoName !== undefined) clean.repo_name = patch.repoName;
  if (patch.repoUrl !== undefined) clean.repo_url = patch.repoUrl;
  if (patch.kettleProjectId !== undefined) clean.kettle_project_id = patch.kettleProjectId;
  if (patch.deployHost !== undefined) clean.deploy_host = patch.deployHost;
  if (patch.lastSha !== undefined) clean.last_sha = patch.lastSha;
  if (patch.status !== undefined) clean.status = patch.status;
  return clean;
};

// Upsert the link for a channel: ensure the row exists, then apply the patch and
// bump updated_at. Returns the resulting wire type.
export const setChannelProject = async (
  ownerId: number,
  channelId: number,
  patch: ChannelProjectPatch,
): Promise<ChannelProject> => {
  await ensureChannelProject(ownerId, channelId);
  const clean = toColumns(patch);
  clean.updated_at = new Date();
  await db.execute(
    from(channelprojects)
      .where((q) => q("owner_id").equals(ownerId))
      .where((q) => q("channel_id").equals(channelId))
      .update(clean),
  );
  const row = await getRow(ownerId, channelId);
  if (!row) throw new Error("project link not found");
  return toChannelProject(row);
};
