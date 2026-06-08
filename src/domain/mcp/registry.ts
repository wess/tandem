// Which outbound MCP servers an agent turn may consume tools from.
//
// STOPGAP: a static list parsed from the MCP_SERVERS env var (see config.ts),
// keyed by display name. The `ownerId` parameter is already threaded through so
// the seam below can become per-tenant without touching callers.
//
// FUTURE SEAM: lift stohr's DB-backed registry — a `mcp_servers` table
// (id, name, url, auth_token, enabled, created_by, …) plus
// `loadEnabledServers(db)` that returns the enabled rows for an owner. When that
// lands, swap the body of `enabledServers` to read from the table (filtered by
// `ownerId`); the return type (`EnabledServer[]`) stays the same so tools.ts is
// unaffected. See stohr/src/mcp/servers.ts (loadEnabledServers + mcpServerRoutes).

import { config } from "../../config.ts";
import type { RemoteServer } from "./client.ts";

export type EnabledServer = {
  // Stable namespace prefix for this server's tools. Must be unique across the
  // enabled set — tools.ts prefixes every tool name with `${name}__` so two
  // servers exposing a same-named tool don't collide.
  name: string;
} & RemoteServer;

// Parse one `name|url|token` triple. Returns null for blank/malformed entries
// (missing name or url) so a typo in env can't crash the whole turn.
const parseEntry = (raw: string): EnabledServer | null => {
  const [name, url, token] = raw.split("|").map((s) => s.trim());
  if (!name || !url) return null;
  return { name, url, authToken: token || null };
};

// Drop later duplicates of a name so the namespace prefix stays unique.
const dedupeByName = (servers: EnabledServer[]): EnabledServer[] => {
  const seen = new Set<string>();
  const out: EnabledServer[] = [];
  for (const s of servers) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
};

// The enabled outbound servers for an owner. `ownerId` is accepted (and will
// scope the query once the table exists) but ignored by the static source.
export const enabledServers = async (_ownerId: number): Promise<EnabledServer[]> => {
  const entries = config.mcpServers
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseEntry)
    .filter((s): s is EnabledServer => s !== null);
  return dedupeByName(entries);
};
