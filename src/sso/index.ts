// SSO relying-party wiring. Mounts @atlas/sso when the SSO_* env vars are set.
// JIT-creates the local users row on first Castle login; later logins upsert
// by email. Unlike Stohr/Tangle (server-side sessions + #token hand-off),
// Tandem issues a stateless JWT in the `tandem_session` cookie, so the SSO
// callback just sets that cookie and lets @atlas/sso redirect home.

import { hash } from "@atlas/auth";
import type { Connection } from "@atlas/db";
import { from } from "@atlas/db";
import { ensureSsoStateTable, type IdTokenClaims, mountSso, type SsoConfig } from "@atlas/sso";
import { issueSessionCookie } from "../api/auth.ts";
import { users } from "../db/index.ts";

const claimEmail = (claims: IdTokenClaims): string => {
  if (!claims.email) throw new Error("ID token lacks email claim");
  return String(claims.email).toLowerCase();
};

const claimName = (claims: IdTokenClaims, email: string): string => {
  const raw = (claims.name as string | undefined)?.trim();
  if (raw) return raw;
  const uname = (claims.preferred_username as string | undefined)?.trim();
  return uname || (email.split("@")[0] ?? email);
};

// SSO-only users get a fixed un-verifiable password hash so local login is
// rejected (verify() fails on it) — the only path in is via /auth/sso/login.
const placeholderHash = (): Promise<string> => hash(`disabled-local-password-${Math.random().toString(36)}`);

const upsertUser = async (db: Connection, claims: IdTokenClaims): Promise<{ id: number; name: string }> => {
  const email = claimEmail(claims);
  const name = claimName(claims, email);

  const existing = (await db.one(
    from(users)
      .where((q) => q("email").equals(email))
      .select("id"),
  )) as { id: number } | null;

  if (existing) {
    await db.execute(
      from(users)
        .where((q) => q("id").equals(existing.id))
        .update({ name }),
    );
    return { id: existing.id, name };
  }

  const password = await placeholderHash();
  const inserted = (await db.execute(from(users).insert({ email, name, password }).returning("id"))) as Array<{
    id: number;
  }>;
  const row = inserted[0];
  if (!row) throw new Error("user insert failed");
  return { id: row.id, name };
};

export const setupTandemSso = async (
  db: Connection,
  env: { issuerUrl: string; clientId: string; clientSecret: string },
) => {
  await ensureSsoStateTable(db);
  const cfg: SsoConfig = {
    db,
    issuerUrl: env.issuerUrl,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
    onAuthenticated: async (conn, claims) => {
      // `conn` here is the Connection the library passes back (cfg.db).
      const user = await upsertUser(conn, claims);
      return { localUserId: user.id, displayName: user.name };
    },
    // Tandem sessions are stateless JWTs in a cookie. Set it and return a
    // non-halted Conn; @atlas/sso then 302s to the post-login path ("/").
    issueSession: (conn, user) => issueSessionCookie(conn, Number(user.localUserId)),
  };
  return mountSso(cfg);
};
