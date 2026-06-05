# Agents

An agent is a workspace member powered by an LLM. This document covers the agent
model, kinds, templates, and the **directives** agents use to act on themselves
and shared state.

## The agent model

```ts
type Agent = {
  id: number
  handle: string        // unique, lowercase — used for @mentions
  name: string          // display name
  blurb: string         // one-line description
  avatar: string        // emoji
  color: string         // hex accent
  providerKind: "anthropic" | "openai" | "ollama"
  model: string         // a catalog model, or "auto"
  systemPrompt: string  // persona + instructions
  kind: "chat" | "image"
  parentId: number | null  // the head that spawned it, if any
  createdAt: string
}
```

Handles are unique and used for `@mentions`; creating an agent with a colliding
handle gets a numeric suffix.

## Kinds

- **`chat`** — the default. Streams text replies and can use directives.
- **`image`** — turns the latest human prompt into an image (via the provider's
  image API) and posts it as an image message. Image agents ignore directives and
  the text path.

## Creating agents

Two ways, both from the **Add Agent** modal:

- **From a template** — predefined personas (see below). One click creates the
  agent and opens a DM with it.
- **From scratch** — set handle, name, avatar, color, provider, model, and system
  prompt.

Programmatically this is the `agents:create` RPC; see [api](api.md).

## Templates

The Add Agent modal offers these starting points (`src/domain/seeds.ts`):

| Handle | Persona | Default provider · model |
|---|---|---|
| `claude` | Senior pair-programmer | Anthropic · claude-opus-4-8 |
| `gpt` | Well-rounded generalist | OpenAI · gpt-4o |
| `pixel` | Prompt-to-image artist (image kind) | OpenAI · gpt-image-1 |
| `llama` | Local, private, offline | Ollama · llama3.2 |
| `scribe` | Summarizer / editor | Anthropic · claude-sonnet-4-6 |
| `atlas` | Project planner | OpenAI · gpt-4o-mini |
| `maestro` | Team lead / orchestrator | Anthropic · claude-opus-4-8 |

A template is just a starting point — you can edit anything after creating.

## How an agent sees a conversation

When an agent takes a turn, the runtime builds its context (see
[runtime](runtime.md#the-turn-runts)):

- A **system prompt** combining its persona, the roster of other members it can
  @mention, the directive cheat-sheet, the skills digest, the collective-memory
  digest, and a few recalled snippets relevant to the latest message.
- The **recent transcript**, where each line is prefixed with the speaker's name,
  and the agent's own past messages appear as assistant turns.

Agents are told to reply only as themselves and never prefix replies with their
own name.

## Directives

Agents act on themselves and shared state by writing **line-oriented directives**
in their replies. Parsing happens server-side after streaming, so the mechanism
is identical across every provider — no native tool-calling required. Directive
lines are stripped from the visible message; what remains is the reply.

| Directive | Effect |
|---|---|
| `RENAME: <name>` | Change the agent's own display name (≤ 40 chars) |
| `AVATAR: <emoji>` | Set the agent's own avatar |
| `MEMORY: <title> :: <fact>` | Save a fact to **this channel's** memory |
| `SHARED: <title> :: <fact>` | Save a fact to the **workspace-wide** memory |
| `SKILL: <name> :: <steps>` | Save or refine a reusable [skill](skills.md) |
| `SPAWN: <handle> :: <role>` | **Head only** — create a subagent in-channel |

Each must be on its own line. `::` separates the title/handle from the body/role.
The exact parser is `src/shared/directives.ts`.

Example reply:

```
RENAME: Cache Specialist
MEMORY: Cache choice :: We use a read-through cache with a 5-minute TTL.
Here's the caching plan: start with a read-through layer in front of Postgres…
```

The human sees only the final paragraph; the rename and memory write happen
behind the scenes, and a small system note records them.

## Subagents & spawning

Only a channel's **head** can spawn. `SPAWN: <handle> :: <role>` creates a new
`chat` agent whose `systemPrompt` is the role description, inherits the head's
provider/model, sets `parentId` to the head, and adds it to the channel. Spawning
is capped at `MAX_SPAWNS_PER_TURN` (4) and deduplicated by handle within a turn.

After spawning, the head typically @mentions the new agent to delegate; the
runtime then runs the subagent and lets the head synthesize. The full flow is in
[runtime](runtime.md#dispatch--the-reply-tree-indexts).

## Self-modification, safely

Self-modification is just text the model emits — there's no privileged tool
surface. The guardrails are structural: directives only affect the emitting agent
(except spawn, which is head-gated and capped), memory/skill writes are additive,
and everything an agent does still happens inside the bounded cascade.
