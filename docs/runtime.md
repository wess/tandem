# Runtime — the cascade engine

This is the heart of Tandem: how a human message turns into one or more streamed
agent replies, how agents delegate to each other, and how that's all kept from
running away. The code lives in `src/domain/runtime/`.

## Cascade

A **cascade** is one human (or scheduled) message and every agent turn it
transitively causes. It's a small piece of state threaded through the whole
reply tree:

```ts
type Cascade = { epoch: number; remaining: number; headSynthesized: boolean }
```

- **`epoch`** pins the cascade to the channel's current abort generation. If the
  human hits **Stop**, the epoch bumps and every in-flight turn for that cascade
  bails. See [Stop & epochs](#stop--epochs).
- **`remaining`** is the total turn budget — `MAX_CASCADE_TURNS` (8). It counts
  **everything**: depth, fan-out, spawned subagents, and the head's synthesis.
  When it hits zero, no further turns start.
- **`headSynthesized`** ensures the head gets at most one closing synthesis turn.

`startCascade(channelId)` seeds a fresh cascade with the full budget.

## Trigger rules (`trigger.ts`)

`candidatesFor(message)` decides which agents a single message directly triggers.
It is pure of cascade state — head synthesis and running spawned agents happen in
dispatch, so a teammate's reply can never re-summon the head from here.

The invariants, in order:

1. **System messages never trigger.** This is the primary anti-loop guard —
   runtime notes can't start new turns.
2. **An agent never replies to itself.**
3. **Plain channel** → only `@mentioned` members. **DM** → the partner agent,
   always (no mention needed).
4. **Head-led channel** → the head is routed every *human* message (plus any
   @mentioned members). A non-human message in a head-led channel routes to
   @mentioned members *except* the head.

## The turn (`run.ts`)

`runAgentTurn(channel, agent)` runs a single agent's turn:

1. **Placeholder.** Insert a `streaming` message and `broadcast("message:created")`
   plus `agent:typing` (active). The UI shows the agent typing immediately.
2. **Build context.** Gather recent messages (capped at `CONTEXT_LIMIT`, and only
   those after the channel's compression watermark), map them to provider
   messages (the agent's own past messages become `assistant`; everything else
   becomes a speaker-prefixed `user` line).
3. **Build the system prompt** (`buildSystem`): the agent's persona, the roster of
   other members, the directive instructions, any skills digest, the collective
   memory digest, and a few recalled snippets relevant to the latest message.
   Head agents get the orchestration addendum.
4. **Resolve the model.** If the agent's model is `auto`, pick a cheap or strong
   tier based on prompt complexity and whether the channel is over its rolling
   spend budget. See [providers](providers.md#auto-model-selection).
5. **Stream.** Call the provider's `chatStream`. For each chunk, if not stopped,
   append text and `broadcast("message:delta")`. The system prompt is sent as the
   first `{ role: "system" }` message; **no temperature** is passed (so models
   that reject sampling params are safe).
6. **Record usage** before any early return, so even directive-only turns are
   counted. See [usage](usage.md).
7. **Process directives** (`directives.ts`): apply any self-modifications, memory
   writes, skill saves, or spawns the reply contained, and strip those lines from
   the visible content. Post any resulting system notes.
8. **Finish or discard.** If the cleaned reply is empty, discard the placeholder
   (`message:removed`); otherwise mark it `complete` and `broadcast("message:updated")`.
   Always clear `agent:typing` in a `finally`.

Image agents short-circuit: they generate an image from the latest human prompt
and finish with the image attached.

## Dispatch & the reply tree (`index.ts`)

`dispatch(message, cascade)` is the fan-out:

1. Resolve trigger candidates via `candidatesFor`.
2. Bail if the cascade's epoch is stale or the budget is exhausted.
3. Take up to `remaining` candidates, decrement the budget, and run them
   concurrently with `runOne`.

`runOne(channel, agent, cascade)` runs one agent and follows the consequences:

- Run the turn. If it produced a real reply, **`dispatch` that reply** — this is
  how an agent's @mention of a teammate triggers the teammate.
- For each **spawned** subagent, run it (unless the reply already @mentioned it,
  to avoid double-running).
- If this agent is the **head** and it delegated (by spawn or by mentioning a
  teammate) and hasn't synthesized yet, spend one more turn to run the head again
  for its **synthesis**.

Every recursive step is guarded by `live(channel, cascade)` — same epoch, budget
remaining — so the tree is strictly finite.

### Worked example: a head-led project

```
You: "How should we cache this?"
 └─ dispatch → head (Maestro) routed                         [budget 8→7]
     ├─ Maestro: "SPAWN: cachepro :: caching specialist
     │            @cachepro take this"                         (spawn + delegate)
     │   └─ dispatch(Maestro's reply) → @cachepro             [budget 7→6]
     │        └─ cachepro: "Use a read-through cache with…"
     └─ head synthesis (delegated → one closing turn)         [budget 6→5]
          └─ Maestro: "Here's the plan: …"
```

The spawn loop skips directly running `@cachepro` because Maestro mentioned it
(so dispatch already ran it), and the head synthesizes exactly once.

## Stop & epochs (`inflight.ts`)

`@atlas/ai`'s `chatStream` has no `AbortSignal`, so Stop is implemented with a
per-channel **epoch**:

- Each channel has a current epoch (a counter) and a set of in-flight
  `AbortController`s.
- A turn captures `myEpoch` at start. Its `stopped()` check is
  `controller.signal.aborted || currentEpoch(channel) !== myEpoch`.
- The **Stop** action (`agents:stop`) calls `abortChannel`, which aborts the
  controllers *and* bumps the epoch. Every streaming loop sees `stopped()` go
  true on its next chunk and breaks; any cascade pinned to the old epoch stops
  spawning new turns.

A stopped turn still keeps whatever text it had streamed (cleaned of directives)
rather than throwing it away. The `AbortController` is still used directly for
image generation, which *is* a fetch the runtime owns.

## Budgets & guards, summarized

| Guard | Where | Purpose |
|---|---|---|
| System messages don't trigger | `trigger.ts` | Notes can't start turns (anti-loop) |
| No self-reply | `trigger.ts` | An agent can't answer itself |
| `MAX_CASCADE_TURNS` (8) | `Cascade.remaining` | Bounds the whole reply tree |
| `MAX_SPAWNS_PER_TURN` (4) | `directives.ts` | Caps subagents per turn, deduped by handle |
| Abort epoch | `inflight.ts` | Stop halts generation and further fan-out |
| Channel spend budget | `run.ts` | `auto` downshifts to a cheap model when over budget |

These together make agent-to-agent collaboration safe to leave running: it always
terminates, and it can't silently spend without bound.

## The scheduler (`scheduler.ts`)

A 30-second tick (`startScheduler`) looks for due schedules. For each, it posts
the scheduled prompt as a human-authored message targeting the agent, then runs
it through the **normal** `dispatch` pipeline — so head orchestration and every
guard above still apply. Orphaned schedules (channel/agent gone, or the agent is
no longer a member) are disabled instead of silently no-op-ing. See
[schedules](schedules.md).
