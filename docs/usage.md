# Usage & cost tracking

Every agent turn is logged to a usage ledger so you can see where tokens — and
estimated dollars — are going, broken down by agent and by channel. The same
rolling spend figure feeds `auto` model selection.

## What's recorded

After each turn (before any early return, so even directive-only turns count), the
runtime writes a row to the `usagelog` ledger:

- the agent and channel
- the model used
- prompt and completion token counts
- an estimated USD cost

Token counts come from the provider when reported; otherwise they're estimated
from text length (~4 characters per token). Costs use the per-model
[pricing table](providers.md#pricing--cost-estimates). These are **estimates for
budgeting**, not billing.

## The Insights panel

`usage:stats` returns aggregated `UsageStats`:

```ts
type UsageStats = {
  totalCostUsd: number
  totalTokens: number
  estimated: boolean
  byAgent: UsageBucket[]    // { id, name, tokens, costUsd }
  byChannel: UsageBucket[]
}
```

The panel shows total estimated spend and tokens, plus per-agent and per-channel
breakdowns — so you can spot a chatty agent or an expensive channel at a glance.

## Rolling spend & auto downshift

The runtime also computes a **rolling** per-channel spend over a recent window
(`channelSpend`). When a channel is over its budget, agents whose model is `auto`
stay on the cheap tier — so a busy channel naturally throttles its own cost
without disabling anything. See [providers](providers.md#auto-model-selection).

## Keeping cost down

Tandem's cost controls are layered:

- **Bounded cascades** cap how many turns one message can cause
  ([runtime](runtime.md)).
- **`auto` tiering** reserves the expensive model for genuinely complex prompts.
- **Memory + compression** keep context windows small
  ([memory](memory.md)).
- **Rolling spend downshift** throttles a channel that's running hot.

The usage ledger is how you see all of that working.
