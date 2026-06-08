import { get, json, pipe, router } from "@atlas/server";
import index from "./index.html";
import { authRoutes, sessionUserId } from "./src/api/auth.ts";
import { rpcRoute } from "./src/api/rpc.ts";
import { wsHandlers } from "./src/api/ws.ts";
import { config } from "./src/config.ts";
import { db } from "./src/db/index.ts";
import { pruneExpired } from "./src/domain/memory.ts";
import { startScheduler } from "./src/domain/runtime/scheduler.ts";
import { setupTandemSso } from "./src/sso/index.ts";

// Each user's #general is created lazily on their first bootstrap (no global
// workspace anymore). Memory pruning + the scheduler run across all tenants.
await pruneExpired();
startScheduler();

// Mount @atlas/sso only when all three OIDC env vars are present (Castle
// injects them at install). Empty = SSO off, app behaves as before.
const ssoRoutes =
  config.ssoIssuer && config.ssoClientId && config.ssoClientSecret
    ? await setupTandemSso(db, {
        issuerUrl: config.ssoIssuer,
        clientId: config.ssoClientId,
        clientSecret: config.ssoClientSecret,
      })
    : [];

const apiRoutes = [
  get(
    "/api/health",
    pipe((c) => json(c, 200, { ok: true, service: "tandemd" })),
  ),
  ...authRoutes,
  ...ssoRoutes,
  rpcRoute,
];
const handleApi = router(...apiRoutes);

Bun.serve({
  port: config.port,
  hostname: "0.0.0.0",
  development: process.env.NODE_ENV !== "production",
  routes: { "/": index }, // Bun bundles + serves src/frontend/app.tsx
  async fetch(req, server) {
    if (req.headers.get("upgrade") === "websocket") {
      // Tag the socket with its authenticated user so the WS layer can fan
      // events out per tenant. No valid session → no upgrade.
      const userId = await sessionUserId(req.headers);
      if (userId != null && server.upgrade(req, { data: { userId } })) return undefined;
      return new Response("unauthorized", { status: 401 });
    }
    return handleApi(req);
  },
  websocket: wsHandlers,
});

console.log(`tandemd listening on http://localhost:${config.port}`);
