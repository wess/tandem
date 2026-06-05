# Collective memory

Agents record durable facts to a shared memory so they stop re-deriving context
on every turn — which is the single biggest token saving in Tandem. Memory is
read back into each agent's system prompt as a digest, and surfaced to you in the
Memory panel.

## The memory model

```ts
type Memory = {
  id: number
  scope: "global" | "channel"
  channelId: number | null   // set for channel-scoped memories
  authorId: number | null    // the agent that recorded it
  title: string
  body: string
  confidence: number
  pinned: boolean            // pinned memories never expire
  expiresAt: string | null
  createdAt: string
}
```

## Scopes

- **Global** — workspace-wide facts every agent sees, in every channel. Written
  with the `SHARED:` directive.
- **Channel** — facts scoped to one channel. Written with the `MEMORY:` directive.

When building an agent's context, the runtime assembles a **digest** of the live
memories relevant to the current channel (global + that channel's) and includes
it in the system prompt. Pinned memories get a larger budget in the digest than
unpinned ones.

## How agents write memory

Agents emit [directives](agents.md#directives) in their replies:

```
MEMORY: Cache choice :: We use a read-through cache with a 5-minute TTL.
SHARED: Deploy target :: Production runs in the homelab behind Castle.
```

`<title> :: <body>`. The directive line is stripped from the visible reply; a
short system note records that the agent saved it. The system prompt nudges agents
to record durable facts and to trust the memory instead of re-deriving context.

## Pinning & expiry

- **Pinned** memories never expire and are weighted more heavily in the digest.
  Pin/unpin from the Memory panel (`memories:pin`).
- **Unpinned** memories carry a TTL via `expiresAt`. Global memories are kept
  non-expiring by default; channel memories age out. `pruneExpired()` runs on
  boot and removes anything past its expiry that isn't pinned.

You can also delete a memory outright from the panel (`memories:delete`).

## History compression

Long channels carry a lot of history that agents don't need verbatim.
**Compression** folds the older portion of a channel into a single pinned
summary memory and advances the channel's **compression watermark** so those
messages drop out of agent context — while the full history stays visible to you
in the UI.

Triggered from the Memory panel (`channels:compress`), the flow is:

1. Take the channel's messages after the current watermark, keep the most recent
   `KEEP_RECENT` (12), and summarize the rest.
2. Ask a model (the head agent's provider, or Anthropic by default) for a tight,
   factual brief — decisions, facts, names, numbers, open threads.
3. Save that brief as a **pinned** channel memory and advance
   `compressedThrough` to the last compressed message id.

From then on, agents read the compact summary plus the recent tail instead of the
full transcript. Compression only fires when there's enough old history to be
worth it (more than `KEEP_RECENT + 4` eligible messages).

## Recall

Beyond the always-included digest, each turn also **recalls** a few snippets from
earlier in the channel that are textually relevant to the latest message (a
full-text lookup bounded below by the compression watermark). This surfaces
specific older context on demand without bloating every prompt. Recall shares the
machinery described in [search](search.md).

## Why this saves tokens

Re-sending an entire history on every turn is the default failure mode of
multi-agent chat. Tandem instead sends: a bounded recent window, a curated memory
digest, and a handful of recalled snippets. Agents are explicitly told to prefer
the memory over re-deriving — so the context stays small even as the channel
grows.
