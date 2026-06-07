import { column, defineSchema, type RowOf } from "@atlas/db";

// @atlas/db emits UNQUOTED identifiers and Postgres folds to lowercase, so DB
// columns are snake_case. The domain mappers (toAgent/toChannel/…) translate
// these rows into the camelCase wire types the frontend consumes. Epoch-ms
// fields are bigint.

export const users = defineSchema("users", {
  id: column.serial().primaryKey(),
  email: column.text().unique(),
  username: column.text().nullable(),
  name: column.text().default(""),
  password: column.text(),
  created_at: column.timestamp(),
});

export const agents = defineSchema("agents", {
  id: column.serial().primaryKey(),
  owner_id: column.integer(),
  handle: column.text(),
  name: column.text(),
  blurb: column.text().default(""),
  avatar: column.text().default(""),
  color: column.text().default(""),
  provider_kind: column.text(),
  model: column.text(),
  system_prompt: column.text().default(""),
  kind: column.text().default("chat"),
  parent_id: column.integer().nullable(),
  created_at: column.timestamp(),
});

export const channels = defineSchema("channels", {
  id: column.serial().primaryKey(),
  owner_id: column.integer(),
  slug: column.text(),
  name: column.text(),
  kind: column.text().default("channel"),
  topic: column.text().default(""),
  agent_id: column.integer().nullable(),
  head_agent_id: column.integer().nullable(),
  compressed_through: column.integer().default(0),
  archived_at: column.timestamp().nullable(),
  created_at: column.timestamp(),
});

export const members = defineSchema("members", {
  id: column.serial().primaryKey(),
  owner_id: column.integer(),
  channel_id: column.integer(),
  agent_id: column.integer(),
  created_at: column.timestamp(),
});

export const messages = defineSchema("messages", {
  id: column.serial().primaryKey(),
  owner_id: column.integer(),
  channel_id: column.integer(),
  author_type: column.text().default("human"),
  author_id: column.integer().nullable(),
  content: column.text().default(""),
  image: column.text().default(""),
  status: column.text().default("complete"),
  created_at: column.timestamp(),
});

export const memories = defineSchema("memories", {
  id: column.serial().primaryKey(),
  owner_id: column.integer(),
  scope: column.text().default("channel"),
  channel_id: column.integer().nullable(),
  author_id: column.integer().nullable(),
  title: column.text(),
  body: column.text().default(""),
  confidence: column.real().default(0.6),
  pinned: column.boolean().default(false),
  expires_at: column.timestamp().nullable(),
  created_at: column.timestamp(),
});

export const skills = defineSchema("skills", {
  id: column.serial().primaryKey(),
  owner_id: column.integer(),
  name: column.text(),
  description: column.text().default(""),
  steps: column.text().default(""),
  author_id: column.integer().nullable(),
  use_count: column.integer().default(0),
  created_at: column.timestamp(),
  updated_at: column.timestamp(),
});

export const schedules = defineSchema("schedules", {
  id: column.serial().primaryKey(),
  owner_id: column.integer(),
  channel_id: column.integer(),
  agent_id: column.integer(),
  prompt: column.text(),
  interval_minutes: column.integer().default(1440),
  next_run_at: column.bigint(),
  last_run_at: column.bigint().nullable(),
  enabled: column.boolean().default(true),
  created_at: column.timestamp(),
});

export const usagelog = defineSchema("usagelog", {
  id: column.serial().primaryKey(),
  owner_id: column.integer(),
  agent_id: column.integer().nullable(),
  channel_id: column.integer(),
  model: column.text(),
  prompt_tokens: column.integer().default(0),
  completion_tokens: column.integer().default(0),
  cost_usd: column.real().default(0),
  created_at: column.bigint(),
});

// Per-user settings (provider keys + overrides). The real DB primary key is the
// composite (owner_id, key) — enforced in the migration; `key` keeps the
// builder's primaryKey marker for query typing.
export const settings = defineSchema("settings", {
  owner_id: column.integer(),
  key: column.text().primaryKey(),
  value: column.text().default(""),
});

export type UserRow = RowOf<typeof users>;
export type SettingRow = RowOf<typeof settings>;
export type AgentRow = RowOf<typeof agents>;
export type ChannelRow = RowOf<typeof channels>;
export type MemberRow = RowOf<typeof members>;
export type MessageRow = RowOf<typeof messages>;
export type MemoryRow = RowOf<typeof memories>;
export type SkillRow = RowOf<typeof skills>;
export type ScheduleRow = RowOf<typeof schedules>;
export type UsageRow = RowOf<typeof usagelog>;
