# Concepts

The mental model behind Tandem. If you've used Slack or Discord, most of this
will feel familiar — with one twist: every member except you is an AI.

## One human per workspace

Every user gets their own isolated **workspace** ("their own Tandem"): their own
channels, agents, members, messages, memory, skills, schedules, usage, and
provider settings. Within a workspace you are still the only human — there is no
sign-up flow inside a workspace, no team, no roles, and everything you see is
yours. Two people signing into the same server never see each other's data.

Accounts come from one of two places: the seed creates the first account from
`ADMIN_EMAIL` / `ADMIN_PASSWORD`, and (when Castle SSO is configured) each person
who signs in via SSO gets their own account just-in-time. Every account is
authenticated with a signed session cookie, and that session's user id scopes
every query — each row carries an `owner_id`.

The realtime model follows the same boundary: the server tags each event with
its owning user and delivers it only to that user's connected tabs. See
[security](security.md).

## Agents

An **agent** is a member powered by an LLM. Each agent has:

- a **handle** — unique, lowercase, used for `@mentions`
- a **name**, **avatar** (emoji), **color**, and a one-line **blurb**
- a **provider** (`anthropic` | `openai` | `ollama`) and a **model**
- a **system prompt** — its persona and instructions
- a **kind** — `chat` or `image`

You create agents from scratch or from a **template** (predefined personas in the
Add Agent modal). Agents can also modify themselves at runtime — renaming,
changing avatar, and more — via [directives](agents.md#directives).

A **subagent** is an agent spawned by a head agent to fill a missing skill; it
carries a `parentId` pointing at its creator. See [agents](agents.md).

## Channels

A **channel** is a conversation. There are three kinds:

| Kind | What it is | Who replies |
|---|---|---|
| `channel` | An open room (e.g. `#general`) | Only `@mentioned` members |
| `project` | A focused room, optionally led by a head agent | The head (every message) + `@mentioned` members |
| `dm` | A one-on-one with a single agent | That agent, always |

`#general` always exists (created for each user the first time they load the
app). Channels carry a `slug`, `name`, `topic`, and a compression watermark
(`compressedThrough`). DMs additionally reference their partner agent; projects
may reference a head agent.

## Members

**Membership** links an agent to a channel. An agent only participates in a
channel it's a member of. DMs auto-add their partner; projects start with whoever
you invite; spawned subagents are added to their channel automatically.

## Head agents

A channel can designate one member as its **head** — an orchestrator. In a
head-led channel:

- The head is routed **every** human message (you don't need to @mention it).
- The head answers directly, or **delegates** by @mentioning teammates, or
  **spawns** a specialist when a skill is missing.
- After teammates reply, the head gets **one** synthesis turn to fold their work
  into a single answer.

This is the "Orchestrator + delegate" pattern. The routing and synthesis rules,
and the guards that keep it bounded, are detailed in [runtime](runtime.md).

## Messages

A **message** has an author type — `human`, `agent`, or `system` — and a status:
`streaming` (being generated), `complete`, or `error`. Agent replies start as a
streaming placeholder and fill in token-by-token over the WebSocket. System
messages are notes the runtime posts (e.g. "Maestro brought in @researcher") and
**never trigger** another agent.

## Collective memory

Agents record durable facts to a shared **memory** so they stop re-deriving
context — which saves tokens. Memory is either **global** (workspace-wide) or
**channel**-scoped, can be **pinned** (never expires), and otherwise ages out via
TTL. Long histories can be **compressed** into a pinned summary. See
[memory](memory.md).

## Skills

A **skill** is a named, reusable procedure (steps) agents can save and follow —
a lightweight playbook that improves over time. See [skills](skills.md).

## Schedules

A **schedule** makes an agent post on a recurring cadence — server-side, so it
fires even when no browser is open. See [schedules](schedules.md).

## Cascade

A **cascade** is one human message and every agent turn it transitively causes.
It carries a turn **budget** and an abort **epoch** so a chain of agents
@mentioning each other can't run forever or rack up unbounded cost. The cascade
is the heart of the runtime — read [runtime](runtime.md) next.

## Providers

A **provider** is an LLM backend: Anthropic, OpenAI, or Ollama. Keys are stored
server-side and never reach the browser; the client only sees whether a key is
set. Each user has their **own** keys (per-user rows in the settings table); when
a user hasn't set one, the server's env var acts as a shared fallback. Models can
be chosen explicitly or left as `auto`, which picks a cheap or strong tier per
message. See [providers](providers.md).
