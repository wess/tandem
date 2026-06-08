-- M5.1 — channel↔artifact project-state link. Binds a project channel to its
-- real-world artifacts (a git repo, a kettle deploy project, a deploy host) so
-- the workspace can track the live state of what a team is building. snake_case
-- columns (the @atlas/db builder emits unquoted identifiers; the domain mapper
-- toChannelProject bridges to the camelCase wire type).
--
-- One row per channel, scoped by owner_id like every workspace table. The
-- (owner_id, channel_id) unique makes get/set an upsert target and keeps the
-- link per-tenant.

CREATE TABLE IF NOT EXISTS channel_projects (
  id                serial PRIMARY KEY,
  owner_id          integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id        integer NOT NULL,
  repo_owner        text NOT NULL DEFAULT '',
  repo_name         text NOT NULL DEFAULT '',
  repo_url          text NOT NULL DEFAULT '',
  kettle_project_id text NOT NULL DEFAULT '',
  deploy_host       text NOT NULL DEFAULT '',
  last_sha          text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'unlinked',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One project-state row per channel, per owner; also the upsert conflict target.
CREATE UNIQUE INDEX IF NOT EXISTS channel_projects_owner_channel_key
  ON channel_projects (owner_id, channel_id);

-- owner_id is on the hot path of every read; index it like the other tables.
CREATE INDEX IF NOT EXISTS channel_projects_owner_idx ON channel_projects (owner_id);
