import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/app.tsx";
import { initEvents } from "./ipc/index.ts";
import { Login } from "./login.tsx";
import { boot } from "./state/actions.ts";
import "./styles.css";
import { connectSocket } from "./transport.ts";

type Auth = "loading" | "in" | "out";

const Root = () => {
  const [auth, setAuth] = useState<Auth>("loading");

  useEffect(() => {
    fetch("/api/me")
      .then(async (r) => setAuth(r.ok && (await r.json()) ? "in" : "out"))
      .catch(() => setAuth("out"));
  }, []);

  useEffect(() => {
    if (auth !== "in") return;
    connectSocket();
    initEvents();
    void boot();
  }, [auth]);

  if (auth === "loading") return <div className="bootscreen">◐</div>;
  if (auth === "out") return <Login onSuccess={() => setAuth("in")} />;
  return <App />;
};

const root = document.getElementById("root");
if (root) createRoot(root).render(<Root />);
