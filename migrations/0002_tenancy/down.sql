-- Revert multi-tenancy. (Workspace data was wiped on the way up; down only
-- restores the single-tenant schema shape.)

DROP INDEX IF EXISTS agents_owner_idx;
DROP INDEX IF EXISTS channels_owner_idx;
DROP INDEX IF EXISTS members_owner_idx;
DROP INDEX IF EXISTS messages_owner_idx;
DROP INDEX IF EXISTS memories_owner_idx;
DROP INDEX IF EXISTS skills_owner_idx;
DROP INDEX IF EXISTS schedules_owner_idx;
DROP INDEX IF EXISTS usagelog_owner_idx;

ALTER TABLE agents   DROP CONSTRAINT IF EXISTS agents_owner_handle_key;
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_owner_slug_key;
ALTER TABLE skills   DROP CONSTRAINT IF EXISTS skills_owner_name_key;

ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE settings DROP COLUMN IF EXISTS owner_id;
ALTER TABLE settings ADD CONSTRAINT settings_pkey PRIMARY KEY (key);

ALTER TABLE agents    DROP COLUMN IF EXISTS owner_id;
ALTER TABLE channels  DROP COLUMN IF EXISTS owner_id;
ALTER TABLE members   DROP COLUMN IF EXISTS owner_id;
ALTER TABLE messages  DROP COLUMN IF EXISTS owner_id;
ALTER TABLE memories  DROP COLUMN IF EXISTS owner_id;
ALTER TABLE skills    DROP COLUMN IF EXISTS owner_id;
ALTER TABLE schedules DROP COLUMN IF EXISTS owner_id;
ALTER TABLE usagelog  DROP COLUMN IF EXISTS owner_id;

ALTER TABLE agents   ADD CONSTRAINT agents_handle_key UNIQUE (handle);
ALTER TABLE channels ADD CONSTRAINT channels_slug_key UNIQUE (slug);
ALTER TABLE skills   ADD CONSTRAINT skills_name_key   UNIQUE (name);
