import { type FormEvent, useEffect, useState } from "react";

export const Login = ({ onSuccess }: { onSuccess: () => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sso, setSso] = useState(false);

  useEffect(() => {
    fetch("/api/auth/methods")
      .then((r) => r.json())
      .then((m: { sso?: boolean }) => setSso(Boolean(m.sso)))
      .catch(() => setSso(false));
  }, []);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (r.ok) onSuccess();
      else setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Invalid credentials");
    } catch {
      setErr("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="loginwrap">
      <form className="loginbox" onSubmit={submit}>
        <div className="loginmark">◐</div>
        <h1>Tandem</h1>
        <p className="loginsub">Sign in to your workspace</p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: single field on a dedicated login screen
          autoFocus
        />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <div className="loginerr">{err}</div>}
        <button className="primary" type="submit" disabled={busy || !email || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {sso && (
          <>
            <div className="logindivider">
              <span>or</span>
            </div>
            <button type="button" className="ssobtn" onClick={() => (window.location.href = "/auth/sso/login")}>
              Sign in with Castle
            </button>
          </>
        )}
      </form>
    </div>
  );
};
