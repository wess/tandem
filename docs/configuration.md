# Configuration

All configuration is environment variables, read once into a typed config object
via `@atlas/config` (`src/config.ts`). Bun loads `.env` automatically — there's no
dotenv dependency. Copy `.env.example` to `.env` and edit.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |
| `DATABASE_URL` | `postgres://tandem:tandem@localhost:5432/tandem` | Postgres connection string |
| `DB_POOL_SIZE` | `5` | Connection pool size |
| `AUTH_SECRET` | `dev-secret-change-me` | Secret used to sign session JWTs — **change this** |
| `ANTHROPIC_API_KEY` | — | Anthropic key (fallback if not set in the Settings UI) |
| `OPENAI_API_KEY` | — | OpenAI key (fallback if not set in the Settings UI) |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Base URL for a local Ollama |
| `ADMIN_EMAIL` | — | Email for the seeded human login |
| `ADMIN_PASSWORD` | — | Password for the seeded human login |

## Compile-time constants

A couple of runtime tunables are constants in `src/config.ts` (not env vars),
because they're load-bearing for cost and loop-safety and shouldn't drift per
environment:

| Constant | Value | Meaning |
|---|---|---|
| `CONTEXT_LIMIT` | `40` | Max recent messages fed to an agent as context |
| `MAX_CASCADE_TURNS` | `8` | Total agent turns allowed per human message ([runtime](runtime.md)) |

Related guards defined near their use:

- `MAX_SPAWNS_PER_TURN` = 4 (`src/domain/runtime/directives.ts`)
- `KEEP_RECENT` = 12 (compression tail, `src/domain/runtime/compress.ts`)
- the scheduler tick interval = 30s (`src/domain/runtime/scheduler.ts`)

## Provider keys: env vs. settings

Keys can come from either the environment or the `settings` table (set in the
Settings UI). Resolution is **settings table → environment variable**. This means:

- For a quick local run, put keys in `.env`.
- For a deployed instance, prefer setting them in the UI so they live in the
  database with the rest of your workspace — and so you can rotate them without a
  redeploy.

Either way, keys stay server-side and never reach the browser
([security](security.md)).

## Notes

- `AUTH_SECRET` must be stable across restarts, or existing sessions are
  invalidated. Use a long random value in production.
- `DATABASE_URL` is the one variable you almost always override. On Castle, point
  it at the provisioned Postgres; with the bundled `compose.yaml`, it points at
  the `db` service.
- Ollama needs no key — set `OLLAMA_URL` and you have a fully offline workspace.
