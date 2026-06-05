# Search

Tandem uses Postgres full-text search (tsvector) to search across both messages
and memory, returning ranked, highlighted snippets. The same machinery powers the
**recall** that surfaces relevant older context into agent prompts.

## What's searchable

- **Messages** — every message's content.
- **Memory** — every memory's body.

Both `messages` and `memories` tables carry a generated `tsv` column
(`to_tsvector('english', …)`) with a GIN index, so search is index-backed.

## The search UI

Open the search palette (⌘K) and type a query. Results come back as `SearchHit`s:

```ts
type SearchHit = {
  kind: "message" | "memory"
  id: number
  channelId: number | null
  channelName: string
  authorName: string
  snippet: string        // highlighted (see below)
  createdAt: string
}
```

Hits are ranked by `ts_rank` and span both messages and memory. Each carries the
channel and author name (pre-resolved server-side) so the palette can render them
without extra lookups.

## Highlighted snippets

Snippets come from Postgres `ts_headline`, which wraps matched terms in delimiter
markers. Tandem configures those markers as the control characters **U+0002**
(start) and **U+0003** (stop) — chosen because they never appear in normal text —
and the frontend replaces them with `<mark>…</mark>` when rendering. So a match for
"cache" comes back as `…the ␂cache␃ layer…` and renders as **cache** highlighted.

## Recall (agent-side)

When an agent takes a turn, the runtime also runs a bounded full-text **recall**:
it finds a few snippets from earlier in the same channel that are textually
relevant to the latest message, and includes them in the system prompt under
"Relevant earlier in this channel." Recall is bounded below by the channel's
[compression](memory.md#history-compression) watermark, so it doesn't resurface
content that's already been summarized away.

This is how an agent can reference something said far earlier without the whole
history being in its context window.

## Implementation

The query side uses `plainto_tsquery` for ranking and `ts_headline` for snippets
in `search`, and an OR-style `to_tsquery` for `recall`. See `src/domain/search.ts`.
Because everything is index-backed tsvector, search stays fast as history grows —
one of the reasons Tandem is on Postgres rather than a file database.
