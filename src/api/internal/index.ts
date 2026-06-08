// The inbound status hook — a service-to-service route that lets external systems
// (a kettle deploy reporting progress, a tangle push hook) report into a project
// channel. Unlike every other route this is NOT a user session: it carries no
// cookie and is authenticated by a single shared secret (config.internalHookSecret,
// presented as `Authorization: Bearer <secret>`). The owner_id is therefore never
// taken from the wire — it is resolved from the channel_projects row (by repo) or
// from the channel itself (by channelId), keeping tenancy correct without a login.
//
// On a valid event the route: (1) posts a system message into the channel so the
// transcript reflects the deploy/push, (2) patches the channel_projects row
// (status, last_sha, and any repo_url/deploy_host/kettle_project_id supplied), and
// (3) broadcasts "project:updated" so the UI live-updates.
//
// Disabled by default: when internalHookSecret is empty the route 404s, so an
// unconfigured install behaves exactly as before (parity).
import { type Conn, halt, json, pipe, post } from "@atlas/server";
import { config } from "../../config.ts";
import { channelOwnerId } from "../../domain/channels.ts";
import { broadcast } from "../../domain/events.ts";
import { insertMessage, toMessage } from "../../domain/messages.ts";
import { findProjectByRepo, setChannelProject } from "../../domain/projects.ts";
import type { ChannelProjectPatch, ChannelProjectStatus } from "../../shared/types.ts";

// The shape an external service POSTs. `channelId` OR `repo` selects the target;
// everything else is optional progress/metadata. Strings are coerced defensively
// because the caller is an arbitrary service, not the typed frontend.
type ProjectEvent = {
  channelId?: number;
  repo?: string;
  status?: string;
  sha?: string;
  url?: string;
  message?: string;
  deployHost?: string;
  kettleProjectId?: string;
};

const STATUSES: ReadonlySet<ChannelProjectStatus> = new Set(["unlinked", "linked", "deploying", "live", "error"]);

const asStatus = (v: string | undefined): ChannelProjectStatus | undefined =>
  v && STATUSES.has(v as ChannelProjectStatus) ? (v as ChannelProjectStatus) : undefined;

// Constant-time-ish equality is overkill for a homelab shared secret, but at
// least require an exact non-empty match against the configured value.
const authorized = (headers: Headers): boolean => {
  const secret = config.internalHookSecret;
  if (!secret) return false;
  const auth = headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return bearer === secret;
};

// Resolve the target { ownerId, channelId } from either an explicit channelId or
// a repo identifier (via the channel_projects row). owner_id comes from the row /
// channel, never the wire.
const resolveTarget = async (body: ProjectEvent): Promise<{ ownerId: number; channelId: number } | null> => {
  if (typeof body.channelId === "number" && Number.isFinite(body.channelId)) {
    const ownerId = await channelOwnerId(body.channelId);
    return ownerId == null ? null : { ownerId, channelId: body.channelId };
  }
  if (typeof body.repo === "string" && body.repo.trim()) {
    const row = await findProjectByRepo(body.repo);
    return row ? { ownerId: row.owner_id, channelId: row.channel_id } : null;
  }
  return null;
};

// Build the channel_projects patch from the supplied fields. Only provided keys
// are written (setChannelProject ignores undefined), so a status-only ping never
// clobbers the repo binding.
const patchFrom = (body: ProjectEvent): ChannelProjectPatch => {
  const patch: ChannelProjectPatch = {};
  const status = asStatus(body.status);
  if (status) patch.status = status;
  if (typeof body.sha === "string" && body.sha.trim()) patch.lastSha = body.sha.trim();
  if (typeof body.url === "string" && body.url.trim()) patch.repoUrl = body.url.trim();
  if (typeof body.deployHost === "string" && body.deployHost.trim()) patch.deployHost = body.deployHost.trim();
  if (typeof body.kettleProjectId === "string" && body.kettleProjectId.trim()) {
    patch.kettleProjectId = body.kettleProjectId.trim();
  }
  return patch;
};

// The human-readable line dropped into the channel transcript. Prefers the
// caller's message; otherwise synthesizes one from status/sha so the channel
// still shows something meaningful.
const summarize = (body: ProjectEvent): string => {
  if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  const status = asStatus(body.status) ?? body.status;
  const bits = [status ? `Status: ${status}` : "Project event"];
  if (body.sha?.trim()) bits.push(`sha ${body.sha.trim().slice(0, 12)}`);
  if (body.url?.trim()) bits.push(body.url.trim());
  return bits.join(" — ");
};

export const internalRoutes = [
  post(
    "/internal/project-event",
    pipe(async (c: Conn) => {
      // Off by default: no secret configured → the route does not exist.
      if (!config.internalHookSecret) return halt(c, 404, { error: "not found" });
      if (!authorized(c.request.headers)) return halt(c, 401, { error: "unauthorized" });

      const body = (await c.request.json().catch(() => ({}))) as ProjectEvent;
      const target = await resolveTarget(body);
      if (!target) return halt(c, 404, { error: "no project channel for that channelId/repo" });
      const { ownerId, channelId } = target;

      // 1. Post a system message so the transcript reflects the deploy/push. The
      // model sees this on its next turn, which is what lets a human iterate.
      const sys = await insertMessage({
        ownerId,
        channelId,
        authorType: "system",
        content: summarize(body),
      });
      broadcast("message:created", toMessage(sys), ownerId);

      // 2. Patch the project-state row and 3. broadcast the update for the UI.
      const project = await setChannelProject(ownerId, channelId, patchFrom(body));
      broadcast("project:updated", project, ownerId);

      return json(c, 200, { ok: true, channelId });
    }),
  ),
];
