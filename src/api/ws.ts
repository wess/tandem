import type { ServerWebSocket } from "bun";
import { onEvent } from "../domain/events.ts";

// Single workspace: every connected client receives every event and filters by
// channelId. Good enough for the one-human homelab model.
const sockets = new Set<ServerWebSocket<undefined>>();

onEvent((msg) => {
  const data = JSON.stringify(msg);
  for (const s of sockets) {
    try {
      s.send(data);
    } catch {
      // dead socket; close() will clean it up
    }
  }
});

export const wsHandlers = {
  open(ws: ServerWebSocket<undefined>) {
    sockets.add(ws);
  },
  close(ws: ServerWebSocket<undefined>) {
    sockets.delete(ws);
  },
  message(_ws: ServerWebSocket<undefined>, _message: string | Buffer) {
    // client → server messages (none yet)
  },
};
