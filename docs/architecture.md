# Architecture

Tandem is one Bun process that serves a React SPA, a JSON-RPC API, and a
WebSocket event stream, backed by Postgres. This document walks the topology, the
layers, and the lifecycle of a request.

## Topology

```
                    browser (React SPA)
                          │
        ┌─────────────────┼──────────────────┐
        │  GET /          │  POST /api/rpc/*  │  WS /ws
        ▼                 ▼                   ▼
   bundled SPA      RPC dispatch         event stream
   (Bun routes)     (auth pipe)          (cookie-gated upgrade)
        └─────────────────┴──────────────────┘
                          │
                  one Bun.serve (server.ts)
                          │
              domain + runtime (src/domain)
                          │
                 @atlas/db → Postgres
                          │
              @atlas/ai → provider (Anthropic / OpenAI / Ollama)
```

Everything is a single deployable. In production it's one container; Castle's
nginx terminates TLS in front of it and Postgres is provisioned alongside. See
[deployment](deployment.md).

## The server (`server.ts`)

A single `Bun.serve` wires three entry points:

- **`routes: { "/": index }`** — Bun bundles and serves the SPA directly from
  `index.html` → `src/frontend/main.tsx`. No separate bundler or static host.
- **`fetch` fallback** — for non-`/` requests. If the request is a WebSocket
  upgrade, the server verifies the session cookie's JWT and upgrades; otherwise
  it dispatches to the Atlas `router` over the API routes.
- **`websocket: wsHandlers`** — manages the set of connected sockets.

On boot it runs `ensureGeneral()` (guarantee `#general` exists), `pruneExpired()`
(drop stale memories), and `startScheduler()` (begin the 30s schedule tick).

## Layers

The codebase is layered so each piece has one concern.

| Layer | Path | Responsibility |
|---|---|---|
| **Shared contract** | `src/shared` | Wire types, the RPC + event map, directive + mention parsing. Imported by both server and client. |
| **Config** | `src/config.ts` | Typed environment via `@atlas/config`. |
| **Database** | `src/db` | Schema, migration runner, seed, connection, and row↔wire mappers/helpers. |
| **Domain** | `src/domain` | Pure-ish business logic: agents, channels, messages, memory, skills, schedules, usage, search, providers, settings, and the event bus. |
| **Runtime** | `src/domain/runtime` | The agent engine: trigger rules, the turn loop, directive processing, compression, the scheduler, and abort/epoch tracking. |
| **API** | `src/api` | Cookie-JWT auth, RPC dispatch, WebSocket broadcast, and the handler map that binds RPC methods to domain calls. |
| **Frontend** | `src/frontend` | React SPA: the transport (HTTP RPC + WS events), a small state store, components, and styles. |

Dependencies flow inward: API → domain → db. The frontend depends only on the
shared contract and the transport.

## The contract (`src/shared/rpc.ts`)

A single file declares two maps:

- **`RpcMap`** — every method name to its `{ input, output }` types. There's one
  HTTP route, `POST /api/rpc/:method`, that dispatches by name.
- **`EventMap`** — every WebSocket event name to its payload type. The server
  broadcasts `{ event, data }`; the client subscribes by name.

Because both sides import this map, a change to the contract is a compile error
on whichever side falls out of sync. See [api](api.md) for the full list.

## The event bus

The domain never talks to sockets directly. It calls `broadcast(event, data)` on
a decoupled bus (`src/domain/events.ts`); the WebSocket layer subscribes via
`onEvent(...)` and forwards each message to every connected client as JSON. This
keeps the runtime testable without a network — the runtime test subscribes to the
same bus in-process (see [development](development.md)).

## Data shapes: rows vs. wire

`@atlas/db` emits **unquoted** identifiers, which Postgres folds to lowercase, so
database columns are **snake_case** (`provider_kind`, `head_agent_id`,
`created_at`). The wire types the frontend consumes are **camelCase**. Domain
**mappers** (`toAgent`, `toChannel`, `toMessage`, …) bridge the two, and also
convert `timestamptz → ISO string` and `bigint → number`. This is a hard
constraint — see [database](database.md).

## Request lifecycle

### An RPC call

1. Client `invoke("messages:send", { channelId, content })` →
   `POST /api/rpc/messages:send`.
2. The `requireAuth` pipe verifies the session cookie; unauthenticated calls get
   `401` and the client reloads to the login screen.
3. The dispatcher looks up the handler in the handler map and runs it with the
   parsed body.
4. The handler performs domain work (e.g. insert the message), kicks off any
   side effects (e.g. `dispatch` a cascade), and returns the result, which is
   serialized back as JSON.

### A live update

1. Domain code calls `broadcast("message:delta", { id, channelId, delta })`.
2. The WS layer forwards it to every socket.
3. The client's event handler appends the delta to the matching streaming
   message in its store, and React re-renders.

The sender of a human message does **not** receive a `message:created` echo for
its own message — it adds the returned row optimistically. Broadcasts carry the
agent activity (placeholders, deltas, completions, and runtime notes).

## Why this shape

- **One process** is the smallest thing that satisfies "always on so work
  continues without a window open," which was the founding requirement.
- **Postgres** gives durable history, real full-text search (tsvector), and fits
  Castle's provisioning model.
- **The decoupled bus + typed contract** keep the agent runtime — the part with
  real complexity — independent of transport, so it can be exercised directly.

Continue to [runtime](runtime.md) for how agents actually reply.
