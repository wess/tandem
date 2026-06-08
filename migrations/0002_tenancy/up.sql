-- Multi-tenancy: every workspace row is owned by a user. Each user gets their
-- own isolated Tandem (channels, agents, chats, memory, skills, schedules,
-- usage, provider settings). The session user id scopes every query.
--
-- Per the rollout decision this starts everyone FRESH: existing workspace
-- content is wiped (user accounts are kept), so owner_id can be added NOT NULL
-- without a backfill. Provider keys move from global settings to per-user, so
-- the old global settings rows are dropped too (env keys remain the fallback).

TRUNCATE TABLE
  members, messages, memories, schedules, usagelog, channels, agents, skills, settings
  RESTART IDENTITY CASCADE;

-- Drop the global single-column uniqueness; it becomes per-owner below.
ALTER TABLE agents   DROP CONSTRAINT IF EXISTS agents_handle_key;
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_slug_key;
ALTER TABLE skills   DROP CONSTRAINT IF EXISTS skills_name_key;

-- owner_id on every workspace table, cascading on user delete.
ALTER TABLE agents    ADD COLUMN owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE channels  ADD COLUMN owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE members   ADD COLUMN owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE messages  ADD COLUMN owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE memories  ADD COLUMN owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE skills    ADD COLUMN owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE schedules ADD COLUMN owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE usagelog  ADD COLUMN owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE;

-- handle/slug/name are now unique only WITHIN a user's workspace.
ALTER TABLE agents   ADD CONSTRAINT agents_owner_handle_key UNIQUE (owner_id, handle);
ALTER TABLE channels ADD CONSTRAINT channels_owner_slug_key UNIQUE (owner_id, slug);
ALTER TABLE skills   ADD CONSTRAINT skills_owner_name_key   UNIQUE (owner_id, name);

-- Provider keys + overrides become per-user: composite primary key (owner_id, key).
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings ADD COLUMN owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE settings ADD CONSTRAINT settings_pkey PRIMARY KEY (owner_id, key);

-- owner_id is on the hot path of every list/read; index it everywhere.
CREATE INDEX IF NOT EXISTS agents_owner_idx    ON agents (owner_id);
CREATE INDEX IF NOT EXISTS channels_owner_idx  ON channels (owner_id);
CREATE INDEX IF NOT EXISTS members_owner_idx   ON members (owner_id, channel_id);
CREATE INDEX IF NOT EXISTS messages_owner_idx  ON messages (owner_id, channel_id, id);
CREATE INDEX IF NOT EXISTS memories_owner_idx  ON memories (owner_id);
CREATE INDEX IF NOT EXISTS skills_owner_idx    ON skills (owner_id);
CREATE INDEX IF NOT EXISTS schedules_owner_idx ON schedules (owner_id);
CREATE INDEX IF NOT EXISTS usagelog_owner_idx  ON usagelog (owner_id, created_at);
