import type { EventMap, EventName, RpcMap, RpcMethod } from "../shared/rpc.ts";

// HTTP RPC: POST /api/rpc/<method>. End-to-end typed via RpcMap.
export const invoke = async <M extends RpcMethod>(
  method: M,
  input: RpcMap[M]["input"],
): Promise<RpcMap[M]["output"]> => {
  const res = await fetch(`/api/rpc/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  if (res.status === 401) {
    window.location.reload(); // session expired → back to login
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `rpc ${method} failed (${res.status})`);
  }
  return res.json();
};

// WebSocket events: server broadcasts { event, data }; subscribers filter by type.
const handlers = new Map<string, Set<(data: unknown) => void>>();

export const on = <E extends EventName>(event: E, handler: (data: EventMap[E]) => void): (() => void) => {
  const set = handlers.get(event) ?? new Set<(d: unknown) => void>();
  set.add(handler as (d: unknown) => void);
  handlers.set(event, set);
  return () => {
    set.delete(handler as (d: unknown) => void);
  };
};

export const connectSocket = (): void => {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  const open = (): void => {
    const ws = new WebSocket(url);
    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data) as { event: string; data: unknown };
        const set = handlers.get(event);
        if (set) for (const h of set) h(data);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => setTimeout(open, 1500); // auto-reconnect
    ws.onerror = () => ws.close();
  };
  open();
};
