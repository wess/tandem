import { token, verify } from "@atlas/auth";
import { assign, type Conn, get, halt, json, pipe, pipeline, post, putHeader } from "@atlas/server";
import { config } from "../config.ts";
import { db, from, users } from "../db/index.ts";

const COOKIE = "tandem_session";
const MAX_AGE = 60 * 60 * 24 * 30;

const readCookie = (headers: Headers, name: string): string | undefined => {
  for (const part of (headers.get("cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
};

// Verify the session cookie JWT → user id (used by routes and the WS upgrade).
export const sessionUserId = async (headers: Headers): Promise<number | null> => {
  const tok = readCookie(headers, COOKIE);
  if (!tok) return null;
  try {
    const payload = await token.verify(tok, config.authSecret);
    const sub = typeof payload.sub === "number" ? payload.sub : Number(payload.sub);
    return Number.isFinite(sub) ? sub : null;
  } catch {
    return null;
  }
};

export const requireAuth = pipe(async (c: Conn) => {
  const userId = await sessionUserId(c.headers);
  if (userId == null) return halt(c, 401, { error: "unauthorized" });
  return assign(c, { userId });
});

const cookieHeader = (jwt: string, secure: boolean): string => {
  return `${COOKIE}=${jwt}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? "; Secure" : ""}`;
};

// Mark the cookie `Secure` only when the request actually arrived over HTTPS.
// Castle fronts apps on plain http://<app>.local, and a `Secure` cookie is
// silently dropped over HTTP — which would break the session (login loop).
// Trust the proxy's X-Forwarded-Proto; fall back to the request URL scheme.
const isHttps = (req: Request): boolean => {
  const xfp = req.headers.get("x-forwarded-proto");
  if (xfp) return xfp.split(",")[0]?.trim().toLowerCase() === "https";
  return new URL(req.url).protocol === "https:";
};

// Sign a session JWT and attach the set-cookie header. Shared by /api/login
// and the SSO callback so both mint the exact same `tandem_session` cookie
// the WS upgrade and `requireAuth` expect.
export const issueSessionCookie = async (c: Conn, userId: number): Promise<Conn> => {
  const jwt = await token.sign({ sub: userId }, config.authSecret, { expiresIn: MAX_AGE });
  return putHeader(c, "set-cookie", cookieHeader(jwt, isHttps(c.request)));
};

const ssoEnabled = (): boolean => Boolean(config.ssoIssuer && config.ssoClientId && config.ssoClientSecret);

export const authRoutes = [
  // Public: which sign-in methods the login screen should offer.
  get(
    "/api/auth/methods",
    pipe((c: Conn) => json(c, 200, { password: true, sso: ssoEnabled() })),
  ),
  post(
    "/api/login",
    pipe(async (c: Conn) => {
      const body = (await c.request.json().catch(() => ({}))) as { email?: string; password?: string };
      const email = String(body.email ?? "")
        .toLowerCase()
        .trim();
      const user = await db.one<{ id: number; password: string; name: string; email: string }>(
        from(users).where((q) => q("email").equals(email)),
      );
      if (!user || !(await verify(String(body.password ?? ""), user.password))) {
        return halt(c, 401, { error: "invalid email or password" });
      }
      return json(await issueSessionCookie(c, user.id), 200, { id: user.id, name: user.name, email: user.email });
    }),
  ),
  post(
    "/api/logout",
    pipe((c: Conn) => json(putHeader(c, "set-cookie", `${COOKIE}=; HttpOnly; Path=/; Max-Age=0`), 200, { ok: true })),
  ),
  get(
    "/api/me",
    pipeline(requireAuth)(async (c: Conn) => {
      const user = await db.one<{ id: number; name: string; email: string }>(
        from(users)
          .where((q) => q("id").equals(c.assigns.userId as number))
          .select("id", "name", "email"),
      );
      return json(c, 200, user);
    }),
  ),
];
