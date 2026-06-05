# Development

How to work on Tandem: the layout, the workflow, the conventions, and how the
runtime is tested.

## Stack

Bun · TypeScript · React 19 · Postgres · [Atlas](https://github.com/wess/atlas).
Atlas is vendored under `atlas/` and reached through `@atlas/*` path aliases in
`tsconfig.json` (Bun reads tsconfig paths at runtime). Packages used:
`@atlas/server` (+ `/ws`), `@atlas/db`, `@atlas/auth`, `@atlas/ai`,
`@atlas/config`, `@atlas/migrate`.

## Layout

```
server.ts              one Bun.serve: SPA + /api + /ws + boot tasks
index.html             SPA entry → src/frontend/main.tsx
src/
  config.ts            typed env + load-bearing constants
  shared/              wire types, RPC + event map, directives, mentions
  db/                  schema, migrate runner, seed, connection + mappers
  domain/              agents, channels, messages, memory, skills, schedules,
                       usage, search, settings, providers/, events bus
    runtime/           trigger, run, directives, index (dispatch/cascade),
                       compress, scheduler, inflight (epoch/abort)
  api/                 auth, rpc dispatch, ws broadcast, handlers
  frontend/            transport, state/, components/, login, main, styles
migrations/            0001_init/{up,down}.sql
test/runtime.ts        end-to-end runtime proof
docs/                  these documents
site/                  static info site
```

Dependencies flow API → domain → db; the frontend depends only on the shared
contract and its transport. See [architecture](architecture.md).

## Workflow

```bash
bun install
bun run dev            # hot-reloading server
bun run check          # tsc --noEmit — keep this green
```

A typical change touches three places in lockstep:

1. **The contract** — add/adjust a method or event in `src/shared/rpc.ts` (and a
   type in `src/shared/types.ts`).
2. **The server** — implement the handler in `src/api/handlers.ts`, calling
   domain functions; emit any events via `broadcast`.
3. **The client** — call it via `invoke("method", input)` in
   `src/frontend/state/actions.ts`, and handle any new event in
   `src/frontend/ipc/index.ts`.

Because the contract is shared, if any side drifts, `bun run check` fails.

## Conventions

These are enforced repo-wide (and by Biome):

- **Functional, not class-based.** Prefer pure functions and immutable data;
  return new objects rather than mutating.
- **Bun, not Node.** Use Bun APIs (`Bun.serve`, `Bun.password`, etc.).
- **File names** are all lowercase with no spaces, dashes, or underscores. Build
  hierarchy with directories — `src/providers/{index.ts, catalog.ts}`, never
  `src/provider-catalog.ts`.
- **Small, focused files**, one concern each.
- **Snake_case DB columns, camelCase wire types**, bridged by mappers. This is
  non-negotiable because of how `@atlas/db` emits identifiers
  ([database](database.md)).
- **Biome** is the only linter/formatter. `bunx biome check` to lint,
  `bunx biome check --write` to fix and organize imports.

## Testing the runtime

`test/runtime.ts` is an end-to-end proof of the agent engine. It:

- stands up a **fake Ollama server** that speaks the real wire protocol, so even
  `@atlas/ai`'s provider client runs for real;
- points the `ollama` provider at it via `OLLAMA_URL`;
- drives the **actual** domain runtime (`dispatch` → `runAgentTurn` →
  `processDirectives` → cascade, `compressChannel`, scheduler `tick`, `search`,
  `usageStats`) against **real Postgres**;
- subscribes to the in-process event bus and asserts on both the broadcasts and
  the resulting database state.

It covers: streaming, directive processing (rename/avatar/memory/shared/skill),
head orchestration + spawn + cascade + synthesis, compression, the scheduler,
search highlighting, and usage tracking.

Run it against a fresh database:

```bash
dropdb --if-exists tandem && createdb tandem
DATABASE_URL=postgres://localhost/tandem bun run migrate
DATABASE_URL=postgres://localhost/tandem OLLAMA_URL=http://localhost:11500 \
  bun run verify:runtime
```

The only thing it can't exercise is token-exact output from a hosted model —
that's a provider key, not a code path. Everything that is Tandem's own logic is
covered.

## Adding a provider

1. Add it to `ProviderKind` in `src/shared/types.ts`.
2. Add a catalog entry (label, models, default, pricing, tiers) in
   `src/domain/providers/catalog.ts`.
3. Make sure `@atlas/ai`'s `createProvider` supports it, and wire it in
   `buildProvider` (`src/domain/providers/index.ts`).

## Adding a migration

Create `migrations/<NNNN_name>/up.sql` and `down.sql`, keep columns snake_case,
and run `bun run migrate`. Add the matching column to `src/db/schema.ts` and teach
the relevant mapper about it.
