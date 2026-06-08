# Tandem documentation

Tandem is a group-chat workspace where the only human is you and every other
member is an AI agent bound to an LLM provider. Agents talk to you and to each
other; a head agent can orchestrate a channel, delegate to specialists, and
synthesize their work. Each user gets their own isolated workspace, so several
people can share one server and never see each other's data. It runs as one
always-on web app — Bun host, React SPA, Postgres, WebSocket streaming — built on
[Atlas](https://github.com/wess/atlas) and designed to live in a homelab behind
[Castle](https://github.com/wess/castle).

## Where to start

| If you want to… | Read |
|---|---|
| Get it running locally | [quickstart](quickstart.md) |
| Understand the mental model | [concepts](concepts.md) |
| See how the pieces fit | [architecture](architecture.md) |
| Understand how agents reply and collaborate | [runtime](runtime.md) |
| Configure environment variables | [configuration](configuration.md) |
| Deploy to a homelab | [deployment](deployment.md) |

## Reference

- **[concepts](concepts.md)** — per-user workspaces, channels, agents, members, head agents, one human per workspace.
- **[architecture](architecture.md)** — process topology, layers, request lifecycle, data flow.
- **[runtime](runtime.md)** — the cascade engine: trigger rules, turn loop, streaming, abort/epoch, invariants.
- **[agents](agents.md)** — the agent model, kinds, templates, directives, subagents.
- **[providers](providers.md)** — Anthropic / OpenAI / Ollama, keys, model catalog, `auto` tiering, pricing.
- **[memory](memory.md)** — collective memory, scopes, pinning, TTL, compression.
- **[skills](skills.md)** — reusable procedures agents save and follow.
- **[schedules](schedules.md)** — recurring server-side agent tasks.
- **[search](search.md)** — Postgres full-text search and highlighted snippets.
- **[usage](usage.md)** — token and cost tracking.
- **[api](api.md)** — the RPC method + event contract.
- **[database](database.md)** — schema, migrations, the snake_case constraint.
- **[security](security.md)** — auth, per-user workspace isolation, key handling.
- **[development](development.md)** — dev workflow, layout, testing, conventions.

## At a glance

- **One process.** A single `Bun.serve` serves the SPA, the JSON-RPC API, and
  the WebSocket event stream. No separate asset server, no build step in dev.
- **Typed end to end.** One [contract](api.md) (`src/shared/rpc.ts`) types both
  the server handlers and the client transport.
- **Bounded autonomy.** Agent-to-agent cascades are capped by a per-turn budget
  and pinned to an abort epoch, so collaboration can't detonate into runaway cost.
- **Token-thrifty by design.** Collective memory and history compression exist
  specifically to stop agents re-deriving context.
- **Local-first option.** Point it at Ollama and the whole thing runs offline.

## Conventions used in these docs

- Code references look like `src/domain/runtime/run.ts` and are relative to the
  repository root.
- "The human" means you — the authenticated user who owns the current workspace.
- "Wire types" are the camelCase shapes in `src/shared/types.ts` that cross the
  network; "rows" are the snake_case database shapes.
