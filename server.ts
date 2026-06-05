import { token } from "@atlas/auth";
import { get, json, pipe, router } from "@atlas/server";
import index from "./index.html";
import { authRoutes } from "./src/api/auth.ts";
import { rpcRoute } from "./src/api/rpc.ts";
import { wsHandlers } from "./src/api/ws.ts";
import { config } from "./src/config.ts";
import { db } from "./src/db/index.ts";
import { ensureGeneral } from "./src/domain/channels.ts";
import { pruneExpired } from "./src/domain/memory.ts";
import { startScheduler } from "./src/domain/runtime/scheduler.ts";
import { setupTandemSso } from "./src/sso/index.ts";

await ensureGeneral();
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

const COOKIE = "tandem_session";
const cookieToken = (req: Request): string | undefined => {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === COOKIE) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
};

Bun.serve({
  port: config.port,
  hostname: "0.0.0.0",
  development: process.env.NODE_ENV !== "production",
  routes: { "/": index }, // Bun bundles + serves src/frontend/app.tsx
  async fetch(req, server) {
    if (req.headers.get("upgrade") === "websocket") {
      const tok = cookieToken(req);
      if (tok) {
        try {
          await token.verify(tok, config.authSecret);
          if (server.upgrade(req)) return undefined;
        } catch {
          // invalid token — reject below
        }
      }
      return new Response("unauthorized", { status: 401 });
    }
    return handleApi(req);
  },
  websocket: wsHandlers,
});

console.log(`tandemd listening on http://localhost:${config.port}`);
