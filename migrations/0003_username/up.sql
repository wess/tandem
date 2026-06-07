-- Username as an alternate login identifier alongside email. Email is optional
-- on a private network (it may be a placeholder), so the unique index is partial.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username) WHERE username IS NOT NULL;
