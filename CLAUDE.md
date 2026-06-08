# Tandem — session bootstrap

A group-chat workspace where you're the only human; every other member is an AI
agent bound to an LLM provider. Agents talk to you *and to each other*; a **head
agent** can orchestrate a channel — delegate to specialists, spawn new ones, and
synthesize. One always-on web app: Bun host, React 19 SPA, Postgres, WebSocket
streaming. Per-user isolated workspaces. Built on vendored **Atlas** (`@atlas/*`).

This file is the map. Read the one doc you need for depth — don't re-explore.

## Orient fast

- **One process** (`server.ts`): a single `Bun.serve` wires the SPA (`/`), the
  JSON-RPC API (`POST /api/rpc/:method`), and the WS event stream (`/ws`). No
  build step in dev, no separate asset host.
- **Typed end-to-end** via one contract, `src/shared/rpc.ts`: `RpcMap` (methods)
  and `EventMap` (WS events). Both server and client import it — drift is a
  compile error.
- **Layers, deps flow inward:** `src/api` → `src/domain` → `src/db`. The frontend
  depends only on `src/shared` + its transport.
- **The runtime is the hard part:** `src/domain/runtime/` — the *cascade* engine.

## Where to look (don't read more than you need)

| Need | File / doc |
|---|---|
| Mental model | `docs/concepts.md` |
| How pieces fit, request lifecycle | `docs/architecture.md` |
| **How agents reply & collaborate** | `docs/runtime.md` + `src/domain/runtime/*` |
| The RPC + event contract | `src/shared/rpc.ts`, `docs/api.md` |
| Schema, migrations, snake_case rule | `docs/database.md`, `src/db/schema.ts` |
| Providers, `auto` tiering, pricing | `docs/providers.md`, `src/domain/providers/catalog.ts` |
| Memory / compression | `docs/memory.md` |
| Dev workflow, testing | `docs/development.md` |
| Atlas framework API | `atlas/CLAUDE.md` → `atlas/packages/<pkg>/AGENTS.md` |

`docs/index.md` is the full doc index.

## Commands

```bash
bun run dev            # hot-reloading server on :3000
bun run check          # tsc --noEmit — KEEP GREEN (this is tsc, not biome)
bunx biome check --write   # lint + format + organize imports
bun run migrate        # apply migrations/<NNNN_name>/up.sql
bun run seed           # first account from ADMIN_EMAIL / ADMIN_PASSWORD
bun run verify:runtime # end-to-end runtime proof (needs Postgres + fake Ollama; see docs/development.md)
```

## Non-negotiable rules (easy to get wrong)

1. **snake_case DB columns, camelCase wire types.** `@atlas/db` emits *unquoted*
   identifiers, which Postgres folds to lowercase — a camelCase column silently
   breaks. Every column is snake_case; domain **mappers** (`toAgent`,
   `toChannel`, `toMessage`, …) bridge to camelCase wire types and convert
   `timestamptz → ISO string`, `bigint → number`. Add a column → make it
   snake_case **and** teach the mapper. This is the single most important rule.
2. **`owner_id` is the tenancy spine.** Every workspace row carries it; every
   read filters by it, every insert stamps it. The `owner_id` comes **only** from
   the session cookie (`ctx.userId`), never from the request body. Handlers guard
   ownership before touching any id (`ownChannel`, `ownAgent`).
3. **A feature change touches three places in lockstep:** the contract
   (`src/shared/rpc.ts` + `src/shared/types.ts`) → the handler
   (`src/api/handlers.ts`, emit events via `broadcast(event, data, ownerId)`) →
   the client (`invoke()` in `src/frontend/state/actions.ts`, handle events in
   `src/frontend/ipc/index.ts`). `bun run check` fails if any side drifts.
4. **The domain never touches sockets.** It calls `broadcast(...)` on the
   decoupled bus (`src/domain/events.ts`); the WS layer subscribes and fans each
   event out only to that `ownerId`'s sockets. This keeps the runtime testable
   in-process.
5. **Provider parity is deliberate.** No `temperature` (some models reject
   sampling params); the system prompt is the first `{role:"system"}` message;
   agent self-actions are **text directives** parsed host-side
   (`src/shared/directives.ts`), not native tool calls — so Anthropic / OpenAI /
   Ollama all run the same code path.

## The cascade (read `docs/runtime.md` before editing `src/domain/runtime/`)

A **cascade** = one human/scheduled message + every agent turn it transitively
causes. State threaded through the reply tree:
`{ epoch, remaining, headSynthesized }`.

- `remaining` — total turn budget, `MAX_CASCADE_TURNS` (8) in `config.ts`. Counts
  *everything*: depth, fan-out, spawns, synthesis. Hits 0 → no new turns.
- `epoch` — pins the cascade to the channel's abort generation. **Stop**
  (`agents:stop` → `abortChannel`) bumps the epoch; `@atlas/ai`'s `chatStream`
  has no `AbortSignal`, so turns gate on `stopped()` = aborted-or-epoch-changed.
- `headSynthesized` — head gets at most one closing synthesis turn.

Guards that keep it finite: system messages never trigger (anti-loop), no
self-reply, `MAX_SPAWNS_PER_TURN` (4, deduped), the channel rolling spend budget
downshifts `auto` to the cheap model. `candidatesFor` (`trigger.ts`) is pure of
cascade state; `dispatch`/`runOne` (`index.ts`) own fan-out and synthesis.

## Conventions (also in `~/.claude/CLAUDE.md`)

- Functional, no classes; immutable data, return new objects.
- Bun, not Node (`Bun.serve`, `Bun.password`, …).
- Filenames all-lowercase, **no spaces / dashes / underscores**; build hierarchy
  with directories: `src/providers/{index.ts, catalog.ts}`, never
  `src/provider-catalog.ts`. Small, single-concern files.
- Biome is the only linter/formatter.

## Gotchas

- **`atlas/` is vendored and huge** (~13 packages, hundreds of files). Don't grep
  or explore it speculatively — start at `atlas/CLAUDE.md`, then the one relevant
  `atlas/packages/<pkg>/AGENTS.md`. Bump with `bun update atlas`; don't edit it to
  fix app bugs.
- **`#general` is created lazily per user** on first `bootstrap` (`ensureGeneral`
  in the handler), not at boot. Boot only runs `pruneExpired()` + `startScheduler()`.
- **`@atlas/*` resolve via `tsconfig.json` paths** (Bun reads them at runtime) —
  pointing at `atlas/packages/*/index.ts` source, not `node_modules`.
- The human's own message gets **no** `message:created` echo — the client adds it
  optimistically; broadcasts carry only agent activity.
