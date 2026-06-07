import { type FormEvent, useEffect, useState } from "react";

export const Login = ({ onSuccess }: { onSuccess: () => void }) => {
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sso, setSso] = useState(false);
  const [signup, setSignup] = useState(false);

  useEffect(() => {
    fetch("/api/auth/methods")
      .then((r) => r.json())
      .then((m: { sso?: boolean; signup?: boolean }) => {
        setSso(Boolean(m.sso));
        setSignup(Boolean(m.signup));
      })
      .catch(() => setSso(false));
  }, []);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const path = signup ? "/api/signup" : "/api/login";
      const body = signup
        ? { username: identifier, email: email || undefined, password }
        : { identifier, password };
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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
        <p className="loginsub">{signup ? "Create the owner account" : "Sign in to your workspace"}</p>
        <input
          type="text"
          placeholder={signup ? "Username" : "Username or email"}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: dedicated login screen
          autoFocus
        />
        {signup && (
          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <div className="loginerr">{err}</div>}
        <button className="primary" type="submit" disabled={busy || !identifier || !password}>
          {busy ? (signup ? "Creating…" : "Signing in…") : signup ? "Create account" : "Sign in"}
        </button>
        {sso && !signup && (
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
