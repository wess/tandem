import { connect, from } from "@atlas/db";
import { config } from "../config.ts";

export const db = connect({ driver: "postgres", url: config.databaseUrl, pool: config.dbPoolSize });

export { from, raw } from "@atlas/db";
export {
  agents,
  channelprojects,
  channels,
  members,
  memories,
  messages,
  schedules,
  settings,
  skills,
  usagelog,
  users,
} from "./schema.ts";

// timestamptz comes back as Date; wire types use ISO strings. bigint → number.
export const iso = (v: Date | string | null | undefined): string => (v instanceof Date ? v.toISOString() : (v ?? ""));
export const isoN = (v: Date | string | null | undefined): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : v;
export const num = (v: number | bigint | null | undefined): number => (v == null ? 0 : Number(v));
export const numN = (v: number | bigint | null | undefined): number | null => (v == null ? null : Number(v));

// Insert and return the full row (returning the serial id, then re-selecting).
// biome-ignore lint/suspicious/noExplicitAny: generic over any schema table
export const insertRow = async <T>(table: any, data: Record<string, unknown>): Promise<T> => {
  const created = await db.all<{ id: number }>(from(table).insert(data).returning("id"));
  const id = created[0].id;
  // biome-ignore lint/suspicious/noExplicitAny: predicate builder
  return (await db.one<T>(from(table).where((q: any) => q("id").equals(id)) as never)) as T;
};
