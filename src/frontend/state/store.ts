import { useSyncExternalStore } from "react";
import type { Agent, AgentTemplate, Channel, Message, ProviderConfig } from "../../shared/types.ts";

export type Modal =
  | { kind: "addAgent" }
  | { kind: "createProject" }
  | { kind: "settings" }
  | { kind: "invite"; channelId: number }
  | { kind: "memory"; channelId: number }
  | { kind: "search" }
  | { kind: "skills" }
  | { kind: "schedules"; channelId: number }
  | { kind: "insights" };

export type State = {
  ready: boolean;
  channels: Channel[];
  agents: Agent[];
  providers: ProviderConfig[];
  templates: AgentTemplate[];
  activeChannelId: number | null;
  messagesByChannel: Record<number, Message[]>;
  membersByChannel: Record<number, Agent[]>;
  typingByChannel: Record<number, number[]>;
  modal: Modal | null;
  sidebarOpen: boolean;
  membersOpen: boolean;
};

const initial: State = {
  ready: false,
  channels: [],
  agents: [],
  providers: [],
  templates: [],
  activeChannelId: null,
  messagesByChannel: {},
  membersByChannel: {},
  typingByChannel: {},
  modal: null,
  sidebarOpen: false,
  membersOpen: false,
};

let state = initial;
const listeners = new Set<() => void>();

export const getState = (): State => state;

export const setState = (patch: Partial<State> | ((s: State) => State)): void => {
  state = typeof patch === "function" ? patch(state) : { ...state, ...patch };
  for (const l of listeners) l();
};

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useStore = <T>(selector: (s: State) => T): T =>
  useSyncExternalStore(subscribe, () => selector(state));

// Helpers for immutable per-channel updates.
export const patchChannelMessages = (
  channelId: number,
  fn: (msgs: Message[]) => Message[],
): void => {
  setState((s) => ({
    ...s,
    messagesByChannel: { ...s.messagesByChannel, [channelId]: fn(s.messagesByChannel[channelId] ?? []) },
  }));
};
