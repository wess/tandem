-- Revert the channel↔artifact project-state link.

DROP INDEX IF EXISTS channel_projects_owner_idx;
DROP INDEX IF EXISTS channel_projects_owner_channel_key;
DROP TABLE IF EXISTS channel_projects;
