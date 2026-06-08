import type { ServerWebSocket } from "bun";
import { onEvent } from "../domain/events.ts";

// Per-tenant fan-out: each socket is tagged with the authenticated user id at
// upgrade time, and an event is delivered only to sockets whose user owns it.
// A user can have several tabs open, so we key a Set of sockets per user.
export type WsData = { userId: number };
const byUser = new Map<number, Set<ServerWebSocket<WsData>>>();

onEvent((msg) => {
  const targets = byUser.get(msg.ownerId);
  if (!targets) return;
  const data = JSON.stringify({ event: msg.event, data: msg.data });
  for (const s of targets) {
    try {
      s.send(data);
    } catch {
      // dead socket; close() will clean it up
    }
  }
});

export const wsHandlers = {
  open(ws: ServerWebSocket<WsData>) {
    const set = byUser.get(ws.data.userId) ?? new Set<ServerWebSocket<WsData>>();
    set.add(ws);
    byUser.set(ws.data.userId, set);
  },
  close(ws: ServerWebSocket<WsData>) {
    const set = byUser.get(ws.data.userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) byUser.delete(ws.data.userId);
  },
  message(_ws: ServerWebSocket<WsData>, _message: string | Buffer) {
    // client → server messages (none yet)
  },
};
