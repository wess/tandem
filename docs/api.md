# API reference

Tandem's API has three surfaces: a couple of **auth** routes, one **RPC** route
that dispatches by method name, and a **WebSocket** event stream. The RPC method
map and the event map are declared once in `src/shared/rpc.ts` and shared by both
server and client, so the types below are the contract.

## Auth routes

| Method | Route | Body | Result |
|---|---|---|---|
| POST | `/api/login` | `{ email, password }` | sets `tandem_session` cookie; returns `{ id, name, email }` or `401` |
| POST | `/api/logout` | — | clears the cookie |
| GET | `/api/me` | — | `{ id, name, email }` or `401` |
| GET | `/api/health` | — | `{ ok: true, service: "tandemd" }` |

The session is a JWT in an HttpOnly, SameSite=Lax cookie (`tandem_session`),
valid 30 days. See [security](security.md).

## RPC

All application calls go through one route:

```
POST /api/rpc/:method      (requires a valid session cookie)
```

The body is the method's `input`; the response is its `output` as JSON. Unknown
methods return `404`; unauthenticated calls return `401`. On the client this is
`invoke("method", input)` (`src/frontend/transport.ts`).

### Methods (`RpcMap`)

| Method | Input | Output |
|---|---|---|
| `bootstrap` | — | `{ channels, agents, providers, templates }` |
| `messages:list` | `{ channelId }` | `Message[]` |
| `members:list` | `{ channelId }` | `Agent[]` |
| `messages:send` | `{ channelId, content }` | `Message` |
| `agents:stop` | `{ channelId }` | `{ channelId }` |
| `agents:create` | `{ handle, name, blurb?, avatar?, color?, providerKind, model, systemPrompt?, kind? }` | `Agent` |
| `agents:delete` | `{ id }` | `{ id }` |
| `projects:create` | `{ name, topic? }` | `Channel` |
| `dm:open` | `{ agentId }` | `Channel` |
| `members:add` | `{ channelId, agentId }` | `Agent[]` |
| `members:remove` | `{ channelId, agentId }` | `Agent[]` |
| `channels:sethead` | `{ channelId, agentId \| null }` | `Channel` |
| `channels:compress` | `{ channelId }` | `{ channelId, ok }` |
| `providers:setkey` | `{ kind, apiKey }` | `ProviderConfig` |
| `providers:setconfig` | `{ kind, baseURL?, defaultModel? }` | `ProviderConfig` |
| `memories:list` | `{ channelId }` | `Memory[]` |
| `memories:delete` | `{ id }` | `{ id }` |
| `memories:pin` | `{ id, pinned }` | `Memory` |
| `search` | `{ query }` | `SearchHit[]` |
| `skills:list` | — | `Skill[]` |
| `skills:save` | `{ name, description?, steps }` | `Skill` |
| `skills:delete` | `{ id }` | `{ id }` |
| `schedules:list` | `{ channelId }` | `Schedule[]` |
| `schedules:create` | `{ channelId, agentId, prompt, intervalMinutes }` | `Schedule` |
| `schedules:update` | `{ id, enabled?, prompt?, intervalMinutes? }` | `Schedule` |
| `schedules:delete` | `{ id }` | `{ id }` |
| `usage:stats` | — | `UsageStats` |

`bootstrap` is the single call that hydrates the app on load: channels, agents,
provider configs, and the agent templates.

## WebSocket events

Connect to `/ws` (the upgrade is gated on the session cookie). The server
broadcasts `{ event, data }` frames to every connected client; the client
subscribes by name with `on("event", handler)` and filters by `channelId` where
relevant. Because there's one human, every tab receives every event.

### Events (`EventMap`)

| Event | Payload |
|---|---|
| `message:created` | `Message` |
| `message:delta` | `{ id, channelId, delta }` |
| `message:updated` | `Message` |
| `message:removed` | `{ id, channelId }` |
| `channel:created` | `Channel` |
| `channel:updated` | `Channel` |
| `channel:deleted` | `{ id }` |
| `agent:created` | `Agent` |
| `agent:updated` | `Agent` |
| `agent:deleted` | `{ id }` |
| `members:changed` | `{ channelId, members }` |
| `providers:changed` | `{ providers }` |
| `agent:typing` | `{ channelId, agentId, active }` |
| `memory:added` | `Memory` |
| `memory:updated` | `Memory` |
| `memory:removed` | `{ id }` |
| `skills:changed` | `{ skills }` |
| `schedules:changed` | `{ channelId }` |

### Streaming a reply, event by event

A typical agent turn produces:

```
message:created   (placeholder, status "streaming")
agent:typing      (active: true)
message:delta     (× many — appended to the placeholder)
…directive side effects: agent:updated / memory:added / skills:changed / members:changed …
message:updated   (status "complete", final content)
agent:typing      (active: false)
```

If the reply is empty after stripping directives, the placeholder is removed
instead (`message:removed`).

## Types

All the payload types (`Message`, `Agent`, `Channel`, `Memory`, `Skill`,
`Schedule`, `SearchHit`, `UsageStats`, `ProviderConfig`, `Bootstrap`, …) are
defined in `src/shared/types.ts` and documented inline. They're camelCase wire
shapes; the database stores snake_case rows and maps between the two
([database](database.md)).
