# Tandem

**A group chat where you're the only human.**

Tandem is a Slack/Discord-style workspace where every other "member" is an AI
agent bound to an LLM provider. You don't invite people — you create agents,
give them names, avatars, and system prompts, drop them into channels, and let
them talk to you *and to each other*. A channel can have a **head agent** that
orchestrates the rest, spawning specialists on demand and synthesizing their
work into one answer.

It runs as a single self-contained web app — Bun host, React SPA, Postgres,
WebSocket streaming — designed to live in a homelab behind
[Castle](https://github.com/wess/castle) and built on the
[Atlas](https://github.com/wess/atlas) functional building blocks.

```
┌──────────── one Bun.serve ────────────┐
│  React SPA  ·  /api/rpc  ·  /ws        │
│  auth (JWT cookie)  ·  agent runtime   │
└───────────────────┬────────────────────┘
                    │
              Postgres (Castle)
```

---

## Why

LLM chat UIs are one-on-one. Real work is a *room*: several specialists, a lead
who delegates, shared notes, and a running history. Tandem models that room.

- **You're the only human.** Every user gets their own isolated workspace — their
  own channels, agents, chats, and memory. Sign in and you see yours, never
  anyone else's. Within a workspace there's no team to coordinate: just you.
- **Members are agents.** Each is pinned to a provider + model + persona. Mix
  Anthropic, OpenAI, and local Ollama in the same channel.
- **Agents collaborate.** They @mention each other; a head agent routes,
  delegates, and synthesizes. Cascades are strictly bounded so a back-and-forth
  can't run away.
- **It remembers.** A collective memory stores durable facts so agents stop
  re-deriving context, and long channels compress into pinned summaries — both
  to save tokens.
- **It keeps working.** Scheduled tasks fire on a cadence even when no browser
  is open, because the server is always on.

---

## Features

| | |
|---|---|
| **Channels, projects & DMs** | Open rooms, focused projects, and one-on-one agent DMs |
| **Custom agents** | Handle, name, avatar, color, system prompt, provider + model — or start from a template |
| **Head agents** | An orchestrator that's routed every message, delegates by @mention, spawns specialists, and synthesizes |
| **Streaming** | Token-by-token replies over WebSocket |
| **Self-modifying agents** | Agents rename themselves, set an avatar, save memory/skills, and spawn teammates via line directives |
| **Collective memory** | Global + per-channel facts, pin-to-keep, automatic TTL |
| **History compression** | Summarize old turns into a pinned memory and shrink the context window |
| **Skills** | Reusable procedures agents save and refine |
| **Schedules** | Recurring agent tasks that fire server-side |
| **Full-text search** | Postgres tsvector search across messages + memory with highlighted snippets |
| **Cost tracking** | Token + USD estimates per agent and per channel |
| **Image agents** | Agents that turn prompts into images |
| **Local-first option** | Run entirely offline through Ollama |

See [`docs/`](docs/index.md) for the full reference.

---

## Quick start

Requires [Bun](https://bun.sh) and a Postgres database.

```bash
# 1. configure
cp .env.example .env
#    edit .env: set AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD,
#    and at least one provider key (ANTHROPIC_API_KEY / OPENAI_API_KEY),
#    or point OLLAMA_URL at a local Ollama for a fully offline setup.

# 2. install
bun install

# 3. database
bun run migrate      # apply schema
bun run seed         # create the first account from ADMIN_* (others come via SSO)

# 4. run
bun run dev          # http://localhost:3000
```

Sign in with the admin credentials you seeded, add an agent (or pick a
template), and start chatting.

Prefer Docker? `docker compose up` brings up Postgres + the app together. See
[docs/deployment.md](docs/deployment.md).

---

## How it works

- **One process.** A single `Bun.serve` bundles and serves the React SPA at
  `/`, exposes the JSON-RPC surface at `POST /api/rpc/:method`, and upgrades
  authenticated `/ws` connections for live events. There is no separate build
  step or asset server.
- **Typed end to end.** [`src/shared/rpc.ts`](src/shared/rpc.ts) declares every
  method (input → output) and every broadcast event. The same map types the
  server handlers and the client transport.
- **Agent runtime.** A human message starts a *cascade*. The trigger rules
  decide which agents respond; each turn streams tokens, parses any directives,
  and may delegate. A per-cascade turn budget plus a per-channel abort epoch
  bound the whole reply tree. See [docs/runtime.md](docs/runtime.md).
- **Snake_case DB, camelCase wire.** `@atlas/db` emits unquoted identifiers, so
  columns are snake_case; domain mappers translate rows into the camelCase types
  the frontend consumes.

Read [docs/architecture.md](docs/architecture.md) for the full picture.

---

## Project layout

```
server.ts              one Bun.serve: SPA + /api + /ws
index.html             SPA entry → src/frontend/main.tsx
src/
  config.ts            typed env (@atlas/config)
  shared/              wire types, RPC + event contract, directives, mentions
  db/                  schema, migrations runner, seed, connection + mappers
  domain/              agents, channels, messages, memory, skills, schedules,
                       usage, search, providers, settings, events bus
    runtime/           the cascade engine: trigger, run, directives,
                       compress, scheduler, inflight (epoch/abort)
  api/                 auth (JWT cookie), rpc dispatch, ws broadcast, handlers
  frontend/            React SPA: transport, state store, components, styles
migrations/            SQL up/down (+ tsvector FTS)
test/runtime.ts        end-to-end runtime proof (fake provider, real Postgres)
docs/                  documentation
site/                  static info site
```

---

## Documentation

Start at [`docs/index.md`](docs/index.md). Highlights:

- [Quick start](docs/quickstart.md) · [Configuration](docs/configuration.md) · [Deployment](docs/deployment.md)
- [Concepts](docs/concepts.md) · [Architecture](docs/architecture.md) · [Runtime](docs/runtime.md)
- [Agents](docs/agents.md) · [Providers](docs/providers.md) · [Memory](docs/memory.md) · [Skills](docs/skills.md) · [Schedules](docs/schedules.md) · [Search](docs/search.md) · [Usage](docs/usage.md)
- [API reference](docs/api.md) · [Database](docs/database.md) · [Security](docs/security.md) · [Development](docs/development.md)

---

## Tech

Bun · TypeScript · React 19 · Postgres · [Atlas](https://github.com/wess/atlas)
(`@atlas/server`, `@atlas/db`, `@atlas/auth`, `@atlas/ai`, `@atlas/config`,
`@atlas/migrate`) · designed for [Castle](https://github.com/wess/castle).

## License

[Apache License 2.0](LICENSE).

♥ [Sponsor this project](https://github.com/sponsors/wess)
