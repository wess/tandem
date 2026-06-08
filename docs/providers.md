# Providers

A provider is an LLM backend. Tandem ships with three, all reached through
`@atlas/ai`: **Anthropic**, **OpenAI**, and **Ollama**. You can mix them freely —
different agents in the same channel can run on different providers.

## The three providers

| Kind | Needs key | Default endpoint | Notes |
|---|---|---|---|
| `anthropic` | yes | provider default | Claude models |
| `openai` | yes | provider default | GPT + image models |
| `ollama` | no | `http://127.0.0.1:11434` | Local, private, offline |

## Model catalog

From `src/domain/providers/catalog.ts`:

**Anthropic** — default `claude-opus-4-8`
`auto`, `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`

**OpenAI** — default `gpt-4o`
`auto`, `gpt-4o`, `gpt-4o-mini`, `o4-mini`

**Ollama** — default `llama3.2`
`auto`, `llama3.2`, `qwen2.5`, `mistral`, `phi3`

Image agents use a separate image model (e.g. `gpt-image-1`) via the provider's
images API.

## Keys and configuration

Provider keys live **on the server** and are **per user** — each user's keys are
rows in the `settings` table scoped by `owner_id` (set via that user's Settings
UI), with the server's environment variables (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`) acting as a shared fallback when a user hasn't set their own.
Keys are never sent to the browser. The client only receives a non-secret
`ProviderConfig` per provider:

```ts
type ProviderConfig = {
  kind, label, baseURL, defaultModel, models,
  needsKey: boolean,   // ollama is false
  hasKey: boolean      // whether a key is set — never the key itself
}
```

Resolution order for a key is: the user's settings row → environment variable.
For a base URL: the user's settings row → (`OLLAMA_URL` for Ollama) → catalog
default. Override the base URL or default model per provider via
`providers:setconfig` (Settings UI) — these overrides are per user too.

Ollama needs no key; point `OLLAMA_URL` (or the per-provider base URL override) at
your instance and add a `llama`-style agent for a fully local, offline workspace.

## `auto` model selection

When an agent's model is `auto`, the runtime picks a tier per message
(`resolveModel` in `src/domain/runtime/run.ts`):

- **Strong** tier for complex prompts — long (> 280 chars) or matching reasoning
  keywords (why, explain, design, debug, refactor, plan, analyze, compare, …).
- **Cheap** tier otherwise.
- If the channel is over its rolling spend budget, `auto` stays on the cheap tier
  regardless.

Tiers (`TIERS` in the catalog):

| Provider | cheap | strong |
|---|---|---|
| anthropic | claude-haiku-4-5 | claude-opus-4-8 |
| openai | gpt-4o-mini | gpt-4o |
| ollama | llama3.2 | llama3.2 |

This keeps routine chatter cheap and reserves the expensive model for work that
benefits from it — without you having to micro-manage model choice per message.

## Pricing & cost estimates

Approximate USD per 1M tokens (`PRICING` in the catalog) powers the cost
estimates shown in [usage](usage.md). These are relative estimates for budgeting,
not billing — streaming responses don't always report exact token counts, so the
runtime estimates from text length when needed.

| Model | in ($/1M) | out ($/1M) |
|---|---|---|
| claude-opus-4-8 | 15 | 75 |
| claude-sonnet-4-6 | 3 | 15 |
| claude-haiku-4-5 | 0.8 | 4 |
| gpt-4o | 2.5 | 10 |
| gpt-4o-mini | 0.15 | 0.6 |
| o4-mini | 1.1 | 4.4 |

Ollama models are local and priced at zero.

## A note on sampling params

Tandem deliberately does **not** send a `temperature` (or other sampling params)
on chat calls. Some models reject sampling parameters; omitting them keeps every
model in the catalog working through the same code path. The system prompt is
passed as the first `{ role: "system" }` message rather than a separate field, for
the same parity reason.
