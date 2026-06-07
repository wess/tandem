import { hash, token, verify } from "@atlas/auth";
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

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;

// True while no user exists — the first visitor self-registers as the owner.
const noUsers = async (): Promise<boolean> => !(await db.one(from(users).select("id")));

type LoginUser = { id: number; password: string; name: string; email: string };

// Find a user by email OR username so login accepts either.
const findByIdentifier = async (identifier: string): Promise<LoginUser | null> => {
  const value = identifier.toLowerCase().trim();
  if (!value) return null;
  const byEmail = await db.one<LoginUser>(
    from(users)
      .where((q) => q("email").equals(value))
      .select("id", "password", "name", "email"),
  );
  if (byEmail) return byEmail;
  return db.one<LoginUser>(
    from(users)
      .where((q) => q("username").equals(value))
      .select("id", "password", "name", "email"),
  );
};

export const authRoutes = [
  // Public: which sign-in methods the login screen should offer. `signup` is
  // open only on a fresh install (no users yet).
  get(
    "/api/auth/methods",
    pipe(async (c: Conn) => json(c, 200, { password: true, sso: ssoEnabled(), signup: await noUsers() })),
  ),
  post(
    "/api/login",
    pipe(async (c: Conn) => {
      const body = (await c.request.json().catch(() => ({}))) as {
        identifier?: string;
        email?: string;
        username?: string;
        password?: string;
      };
      const identifier = String(body.identifier ?? body.email ?? body.username ?? "");
      const user = await findByIdentifier(identifier);
      if (!user || !(await verify(String(body.password ?? ""), user.password))) {
        return halt(c, 401, { error: "invalid credentials" });
      }
      return json(await issueSessionCookie(c, user.id), 200, { id: user.id, name: user.name, email: user.email });
    }),
  ),
  // First-run self-signup. Open only while no user exists.
  post(
    "/api/signup",
    pipe(async (c: Conn) => {
      if (!(await noUsers())) return halt(c, 403, { error: "signup is closed" });
      const body = (await c.request.json().catch(() => ({}))) as {
        username?: string;
        email?: string;
        password?: string;
        name?: string;
      };
      const username = String(body.username ?? "")
        .toLowerCase()
        .trim();
      if (!USERNAME_RE.test(username)) {
        return halt(c, 422, { error: "username must be 3-32 characters: lowercase letters, digits, underscore" });
      }
      const password = String(body.password ?? "");
      if (password.length < 8) return halt(c, 422, { error: "password must be at least 8 characters" });
      // Email is optional on a private network — store a unique placeholder.
      const email = String(body.email ?? "").toLowerCase().trim() || `${username}@tandem.local`;
      const name = String(body.name ?? "").trim() || username;
      try {
        const inserted = (await db.execute(
          from(users).insert({ email, username, name, password: await hash(password) }).returning("id", "name", "email"),
        )) as Array<{ id: number; name: string; email: string }>;
        const user = inserted[0]!;
        return json(await issueSessionCookie(c, user.id), 201, { id: user.id, name: user.name, email: user.email });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/unique|duplicate/i.test(msg)) return halt(c, 409, { error: "username or email already taken" });
        return halt(c, 500, { error: msg });
      }
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
