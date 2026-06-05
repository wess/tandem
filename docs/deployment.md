# Deployment

Tandem is a single container that serves the SPA, the API, and the WebSocket
stream. It's designed to live in a homelab behind
[Castle](https://github.com/wess/castle), but it runs anywhere you have Bun (or
Docker) and Postgres.

## Docker (standalone)

The bundled `compose.yaml` brings up Postgres and the app together:

```bash
# set at least AUTH_SECRET and a provider key in your environment or an .env
docker compose up --build
```

It starts a `db` service (Postgres 16) with a persistent volume and an `app`
service built from the `Dockerfile`. The app waits for Postgres to be healthy,
applies migrations on start, then serves on port 3000.

### Seed the admin

The container applies migrations automatically but doesn't seed. After it's up,
seed your login once:

```bash
docker compose exec app sh -c \
  "ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret bun run seed"
```

## The image

The `Dockerfile` is a two-stage `oven/bun:1-alpine` build:

- **deps** stage installs from `package.json` + `bun.lock` with a frozen lockfile.
- **runtime** stage copies `node_modules`, the app source, `atlas/`, and
  `migrations/`, runs as the `bun` user, and starts with:

  ```
  bun src/db/migrate.ts up && bun server.ts
  ```

So every container start is "migrate, then serve" — safe because migrations are
idempotent.

## On Castle

Castle is the intended home. The model:

- **Drop the `db` service.** Castle provisions Postgres at install; point
  `DATABASE_URL` at it.
- **Let Castle's nginx front the app.** Castle handles TLS and `*.local` mDNS, so
  Tandem itself serves plain HTTP on its port and needs no in-app TLS.
- **Deploy as a container.** Tandem is a standard Atlas web app (the same shape as
  Stohr, Castle's reference app), so it slots into Castle's container + vhost
  workflow.

A minimal Castle deployment is: build the image, set `DATABASE_URL`,
`AUTH_SECRET`, and your provider keys (or set keys later in the UI), and route a
vhost at the container's port 3000.

## Reverse proxy requirements

Whatever fronts Tandem must:

- **Forward WebSocket upgrades** on `/ws` (the `Upgrade`/`Connection` headers).
  The `/ws` upgrade is also gated on the session cookie, so the proxy must pass
  cookies through.
- **Preserve cookies** on `/api/*` so the session round-trips.

Standard nginx `proxy_set_header Upgrade $http_upgrade; proxy_set_header
Connection "upgrade";` on the location is enough; Castle's nginx is configured for
this.

## Running without Docker

You don't need Docker at all:

```bash
bun install
bun run migrate
bun run seed
bun run start      # production server (no hot reload)
```

Point `DATABASE_URL` at any reachable Postgres. This is the same thing the
container does, minus the packaging.

## Production checklist

- [ ] `AUTH_SECRET` is a long, stable random value.
- [ ] `DATABASE_URL` points at your real Postgres (not the dev default).
- [ ] At least one provider key is set (env or Settings UI), or an Ollama is
      reachable.
- [ ] The admin login has been seeded.
- [ ] The reverse proxy forwards Upgrade headers and cookies.
- [ ] Postgres has a backup strategy — it holds your entire workspace history.
