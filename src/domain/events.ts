import type { EventMap, EventName } from "../shared/rpc.ts";

// Decoupled event bus: the domain/runtime calls broadcast(); the WS layer
// subscribes via onEvent() and forwards to connected clients.
export type Outgoing = { event: EventName; data: unknown };
type Sink = (msg: Outgoing) => void;

const sinks = new Set<Sink>();

export const onEvent = (sink: Sink): (() => void) => {
  sinks.add(sink);
  return () => sinks.delete(sink);
};

export const broadcast = <E extends EventName>(event: E, data: EventMap[E]): void => {
  for (const sink of sinks) sink({ event, data });
};
