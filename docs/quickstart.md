# Quick start

Get Tandem running locally in a few minutes.

## Prerequisites

- [Bun](https://bun.sh) 1.x
- A Postgres database (16+ recommended). Use the bundled `compose.yaml`, an
  existing server, or Castle's provisioned instance.
- At least one LLM provider: an Anthropic or OpenAI API key, **or** a local
  [Ollama](https://ollama.com) for a fully offline setup.

## 1. Configure

```bash
cp .env.example .env
```

Edit `.env`:

- `AUTH_SECRET` — a long random string used to sign session cookies. Change it.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the first account's login, created by the
  seed. Additional users get their own isolated workspace on first SSO login.
- `DATABASE_URL` — your Postgres connection string.
- One or more of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_URL`.

See [configuration](configuration.md) for every variable.

## 2. Install

```bash
bun install
```

## 3. Database

```bash
bun run migrate      # apply the schema (creates tables + FTS indexes)
bun run seed         # create your human login from ADMIN_EMAIL / ADMIN_PASSWORD
```

`migrate` is idempotent — it records applied migrations in `schema_migrations`.
`seed` is safe to re-run; it won't duplicate an existing admin.

## 4. Run

```bash
bun run dev          # hot-reloading server on http://localhost:3000
```

Open the URL, sign in with your admin credentials, and you'll land in the
`#general` channel.

## 5. First steps in the app

1. **Add an agent.** Click **＋** to open the Add Agent modal. Pick a template
   (Claude, GPT, Pixel, Llama, Scribe, Atlas, Maestro) or define your own with a
   handle, name, avatar, provider, model, and system prompt.
2. **Set a provider key** (if you didn't put it in `.env`). Open **Settings** and
   paste your Anthropic/OpenAI key, or point Ollama at your local instance. Keys
   live on the server and are never sent to the browser.
3. **Talk to an agent.** Opening an agent creates a DM — the agent always
   replies there. In a channel or project, `@mention` an agent to bring it in.
4. **Make a project with a lead.** Create a project, invite a few agents, and set
   one as the **head**. Now every message you send is routed to the head, which
   delegates to teammates and synthesizes a final answer.

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | Hot-reloading server |
| `bun run start` | Production server (no reload) |
| `bun run migrate` | Apply migrations |
| `bun run migrate:down` | Roll back the last migration |
| `bun run seed` | Seed the admin user |
| `bun run check` | Type-check the project (`tsc --noEmit`) |
| `bun run verify:runtime` | End-to-end runtime proof (needs Postgres; see [development](development.md)) |

## Troubleshooting

- **Can't sign in** — make sure you ran `bun run seed` after setting `ADMIN_*`.
- **Agent replies "No API key set for …"** — add the provider key in Settings or
  `.env`, or use an Ollama agent.
- **WebSocket won't connect** — the `/ws` upgrade requires a valid session
  cookie; sign in first. Behind a reverse proxy, ensure it forwards Upgrade
  headers (see [deployment](deployment.md)).
