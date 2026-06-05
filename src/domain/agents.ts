import { agents, db, from, insertRow, iso } from "../db/index.ts";
import type { AgentRow } from "../db/schema.ts";
import { slugifyHandle } from "../shared/mentions.ts";
import type { Agent, AgentKind, ProviderKind } from "../shared/types.ts";

export const toAgent = (r: AgentRow): Agent => ({
  id: r.id,
  handle: r.handle,
  name: r.name,
  blurb: r.blurb,
  avatar: r.avatar,
  color: r.color,
  providerKind: r.provider_kind as ProviderKind,
  model: r.model,
  systemPrompt: r.system_prompt,
  kind: r.kind as AgentKind,
  parentId: r.parent_id,
  createdAt: iso(r.created_at),
});

export const listAgents = async (): Promise<Agent[]> => (await db.all(from(agents).orderBy("id", "ASC"))).map(toAgent);

export const getAgentRow = (id: number): Promise<AgentRow | null> =>
  db.one(from(agents).where((q) => q("id").equals(id)));

export const getAgentById = async (id: number): Promise<Agent | undefined> => {
  const row = await getAgentRow(id);
  return row ? toAgent(row) : undefined;
};

const getAgentRowByHandle = (handle: string): Promise<AgentRow | null> =>
  db.one(from(agents).where((q) => q("handle").equals(handle)));

export const uniqueHandle = async (base: string): Promise<string> => {
  const slug = slugifyHandle(base) || "agent";
  if (!(await getAgentRowByHandle(slug))) return slug;
  let i = 2;
  while (await getAgentRowByHandle(`${slug}${i}`)) i += 1;
  return `${slug}${i}`;
};

export type NewAgent = {
  handle: string;
  name: string;
  blurb: string;
  avatar: string;
  color: string;
  providerKind: ProviderKind;
  model: string;
  systemPrompt: string;
  kind: AgentKind;
  parentId?: number | null;
};

export const insertAgent = (input: NewAgent): Promise<AgentRow> =>
  insertRow(agents, {
    handle: input.handle,
    name: input.name,
    blurb: input.blurb,
    avatar: input.avatar,
    color: input.color,
    provider_kind: input.providerKind,
    model: input.model,
    system_prompt: input.systemPrompt,
    kind: input.kind,
    parent_id: input.parentId ?? null,
  });

// patch keys are DB column names (e.g. { name }, { avatar }).
export const updateAgent = (id: number, patch: Record<string, unknown>): Promise<unknown> =>
  db.execute(from(agents).where((q) => q("id").equals(id)).update(patch));

export const deleteAgentRow = (id: number): Promise<unknown> =>
  db.execute(from(agents).where((q) => q("id").equals(id)).del());
