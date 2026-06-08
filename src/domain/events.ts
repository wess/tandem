import type { EventMap, EventName } from "../shared/rpc.ts";

// Decoupled event bus: the domain/runtime calls broadcast(); the WS layer
// subscribes via onEvent() and forwards to the owning user's clients only.
// Every event belongs to exactly one workspace (ownerId) so a tenant never
// receives another tenant's stream.
export type Outgoing = { event: EventName; data: unknown; ownerId: number };
type Sink = (msg: Outgoing) => void;

const sinks = new Set<Sink>();

export const onEvent = (sink: Sink): (() => void) => {
  sinks.add(sink);
  return () => sinks.delete(sink);
};

export const broadcast = <E extends EventName>(event: E, data: EventMap[E], ownerId: number): void => {
  for (const sink of sinks) sink({ event, data, ownerId });
};
