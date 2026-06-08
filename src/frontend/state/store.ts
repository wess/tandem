import { useSyncExternalStore } from "react";
import type {
  Agent,
  AgentTemplate,
  ApprovalRequested,
  Channel,
  ChannelProject,
  Message,
  ProviderConfig,
  TeamSuggested,
} from "../../shared/types.ts";

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
  // Server-proposed teams, keyed by the channel the goal was typed in. Set when a
  // "team:suggested" event arrives; cleared on accept/dismiss. A channel view can
  // render an accept prompt off this. (M1.5)
  teamSuggestionByChannel: Record<number, TeamSuggested>;
  // The channel↔artifact project-state link, keyed by channel. Hydrated by
  // project:get and kept current by "project:updated" events. (M5.1)
  projectByChannel: Record<number, ChannelProject>;
  // Destructive MCP tool calls parked pending human approval, keyed by channel
  // then by approvalId. Set when an "approval:requested" event arrives; cleared
  // on approve/deny. A channel view can render an approve/deny prompt off this.
  // (Task #15)
  approvalsByChannel: Record<number, Record<string, ApprovalRequested>>;
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
  teamSuggestionByChannel: {},
  projectByChannel: {},
  approvalsByChannel: {},
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

export const useStore = <T>(selector: (s: State) => T): T => useSyncExternalStore(subscribe, () => selector(state));

// Helpers for immutable per-channel updates.
export const patchChannelMessages = (channelId: number, fn: (msgs: Message[]) => Message[]): void => {
  setState((s) => ({
    ...s,
    messagesByChannel: { ...s.messagesByChannel, [channelId]: fn(s.messagesByChannel[channelId] ?? []) },
  }));
};
