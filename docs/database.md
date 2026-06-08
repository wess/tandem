# Database

Tandem stores everything in Postgres via `@atlas/db`. This document covers the
schema, the snake_case constraint that shapes it, migrations, and full-text
search columns.

## Why Postgres

Durable history, real full-text search (tsvector + GIN), and a natural fit for
Castle's provisioning — Castle stands up Postgres at install, so Tandem just
points `DATABASE_URL` at it. There's no embedded/file database here; the server is
always on and shared, so a server-grade store is the right call.

## The snake_case constraint

`@atlas/db`'s query builder emits **unquoted** identifiers. Postgres folds
unquoted identifiers to lowercase, so a camelCase column like `providerKind`
becomes `providerkind` and breaks. Therefore **all database columns are
snake_case** (`provider_kind`, `head_agent_id`, `created_at`).

The frontend, however, uses camelCase wire types. The bridge is a set of domain
**mappers** — `toAgent`, `toChannel`, `toMessage`, `toMemory`, `toSkill`,
`toSchedule` — that translate a snake_case row into its camelCase wire shape and
also convert `timestamptz → ISO string` and `bigint → number`. Helpers `iso`,
`isoN`, `num`, `numN`, and `insertRow` live in `src/db/index.ts`.

> If you add a column, it must be snake_case, and the relevant mapper must learn
> about it. This is the single most important rule when touching the data layer.

## Tables

Defined in `src/db/schema.ts`.

| Table | Purpose |
|---|---|
| `users` | User accounts — one per person (email, name, password hash). Each owns an isolated workspace |
| `agents` | Agents: handle, name, persona, provider/model, `parent_id` |
| `channels` | Channels/projects/DMs: slug, kind, topic, `agent_id`, `head_agent_id`, `compressed_through` |
| `members` | Agent↔channel membership |
| `messages` | All messages: `author_type`, `author_id`, content, image, status |
| `memories` | Collective memory: scope, title, body, confidence, pinned, expiry |
| `skills` | Reusable procedures: name, steps, use count |
| `schedules` | Recurring agent tasks: cadence, `next_run_at`, `enabled` |
| `usagelog` | Per-turn token + cost ledger |
| `settings` | Per-user key/value store (provider keys, base URLs, default models) |

### Tenancy: `owner_id`

Every workspace table — `agents`, `channels`, `members`, `messages`, `memories`,
`skills`, `schedules`, `usagelog`, and `settings` — carries an `owner_id` that
references `users(id)` with `ON DELETE CASCADE`. It is the spine of multi-tenancy:

- Every read filters by `owner_id` and every insert stamps it, so one user can
  never see or touch another user's rows. The session user id (from the cookie)
  is the only source of `owner_id` — it's never taken from the request body.
- Uniqueness is **per workspace**: `agents (owner_id, handle)`,
  `channels (owner_id, slug)`, and `skills (owner_id, name)` are composite
  uniques, and `settings` is keyed by the composite primary key `(owner_id, key)`.
- `memories.scope = 'global'` means workspace-wide *for that user*, not across
  the whole server.

### Notable columns

- `channels.compressed_through` — the compression watermark; messages with a
  lower id are summarized away from agent context ([memory](memory.md)).
- `schedules.next_run_at` / `last_run_at` and `usagelog.created_at` are **bigint
  epoch milliseconds** (mappers convert to `number`).
- Other `created_at` / `updated_at` / `expires_at` columns are `timestamptz`
  (mappers convert to ISO strings).

## Full-text search columns

The `messages` and `memories` tables each carry a generated tsvector column with a
GIN index, created in the migration:

```sql
tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX … USING GIN (tsv);
```

These power [search](search.md) and recall. Because they're generated and indexed,
search stays fast as history grows and nothing has to maintain them by hand.

## Migrations

SQL migrations live in `migrations/<name>/{up,down}.sql` and are run by
`@atlas/migrate` through `src/db/migrate.ts`:

```bash
bun run migrate          # apply pending migrations (up)
bun run migrate:down     # roll back the last migration
```

Applied migrations are tracked in a `schema_migrations` table, so `up` is
idempotent. The initial migration `0001_init` creates every table above plus the
tsvector columns and indexes, with `DEFAULT now()` on timestamps (the DDL handles
defaults the schema builder can't express in TypeScript). `0002_tenancy` adds the
`owner_id` columns, the composite uniques, the per-user `settings` primary key,
and the owner indexes — and (because it converts the app from a single shared
workspace to per-user workspaces) **wipes existing workspace content** while
keeping user accounts.

## Connection

`src/db/index.ts` opens the pool:

```ts
export const db = connect({ driver: "postgres", url, pool })
```

and exposes `db.all / db.one / db.execute` over the query builder (`from(table)…`)
plus `raw` for hand-written SQL (used by the tsvector queries). `insertRow`
inserts and re-selects the full row, since the builder returns the serial id.

## Seeding

`bun run seed` (`src/db/seed.ts`) creates the first account from `ADMIN_EMAIL` /
`ADMIN_PASSWORD`, hashing the password with `@atlas/auth`. It's safe to re-run —
it won't duplicate an existing admin. Additional accounts are created
just-in-time on first SSO login; each one owns its own workspace. A user's
`#general` channel is created lazily the first time they load the app, so the
seed doesn't create any workspace content.
