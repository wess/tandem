-- Tandem initial schema (Postgres). snake_case columns (the @atlas/db builder
-- emits unquoted identifiers). Full-text search via generated tsvector + GIN.

CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id         serial PRIMARY KEY,
  email      text UNIQUE NOT NULL,
  name       text NOT NULL DEFAULT '',
  password   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agents (
  id            serial PRIMARY KEY,
  handle        text UNIQUE NOT NULL,
  name          text NOT NULL,
  blurb         text NOT NULL DEFAULT '',
  avatar        text NOT NULL DEFAULT '',
  color         text NOT NULL DEFAULT '',
  provider_kind text NOT NULL,
  model         text NOT NULL,
  system_prompt text NOT NULL DEFAULT '',
  kind          text NOT NULL DEFAULT 'chat',
  parent_id     integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
  id                 serial PRIMARY KEY,
  slug               text UNIQUE NOT NULL,
  name               text NOT NULL,
  kind               text NOT NULL DEFAULT 'channel',
  topic              text NOT NULL DEFAULT '',
  agent_id           integer,
  head_agent_id      integer,
  compressed_through integer NOT NULL DEFAULT 0,
  archived_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id         serial PRIMARY KEY,
  channel_id integer NOT NULL,
  agent_id   integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id          serial PRIMARY KEY,
  channel_id  integer NOT NULL,
  author_type text NOT NULL DEFAULT 'human',
  author_id   integer,
  content     text NOT NULL DEFAULT '',
  image       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'complete',
  created_at  timestamptz NOT NULL DEFAULT now(),
  tsv         tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);
CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages (channel_id, id);
CREATE INDEX IF NOT EXISTS messages_tsv_idx ON messages USING GIN (tsv);

CREATE TABLE IF NOT EXISTS memories (
  id         serial PRIMARY KEY,
  scope      text NOT NULL DEFAULT 'channel',
  channel_id integer,
  author_id  integer,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  confidence real NOT NULL DEFAULT 0.6,
  pinned     boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  tsv        tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || body)) STORED
);
CREATE INDEX IF NOT EXISTS memories_tsv_idx ON memories USING GIN (tsv);

CREATE TABLE IF NOT EXISTS skills (
  id          serial PRIMARY KEY,
  name        text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '',
  steps       text NOT NULL DEFAULT '',
  author_id   integer,
  use_count   integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedules (
  id               serial PRIMARY KEY,
  channel_id       integer NOT NULL,
  agent_id         integer NOT NULL,
  prompt           text NOT NULL,
  interval_minutes integer NOT NULL DEFAULT 1440,
  next_run_at      bigint NOT NULL,
  last_run_at      bigint,
  enabled          boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usagelog (
  id                serial PRIMARY KEY,
  agent_id          integer,
  channel_id        integer NOT NULL,
  model             text NOT NULL,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  cost_usd          real NOT NULL DEFAULT 0,
  created_at        bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS usagelog_channel_idx ON usagelog (channel_id, created_at);
