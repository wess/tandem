// Non-blocking human-approval gate for destructive MCP tool calls.
//
// When an agent asks to run a tool whose name matches the destructive matcher
// (configurable; default deploy|delete|destroy|exec|remove), the runtime does
// NOT execute it. Instead it parks the *exact* call here — including a closure
// that re-runs it against the right remote server with the right bearer — posts
// a chat approval request, and tells the model the action is pending. A human
// later resolves it via the approvals:resolve RPC, which calls resolve() below.
//
// STORE CHOICE — module-level in-memory Map (not a DB table). Tandem is one Bun
// process, and a parked action carries a live closure over the per-call broker
// token (short-lived) and the resolved remote server. That closure is not
// meaningfully serializable, and the broker token would expire before a restart
// finished anyway. The Map is the simpler, robust option for one process.
// TRADEOFF: pending approvals do not survive a server restart — a restart drops
// the queue and the model is told (on its next attempt) the action is unknown.
// If tandem ever runs multi-process, promote this to a channel_pending_actions
// table (snake_case) keyed by approval_id and re-issue the broker token on
// approve instead of capturing it in a closure.

import { config } from "../../config.ts";

// One parked destructive call awaiting a human decision. `execute` re-runs the
// original call (bound to its server + already-issued bearer) and returns the
// downstream result text.
export type PendingAction = {
  approvalId: string;
  ownerId: number;
  channelId: number;
  tool: string;
  args: Record<string, unknown>;
  execute: () => Promise<string>;
};

const pending = new Map<string, PendingAction>();

let counter = 0;
const newApprovalId = (): string => {
  counter += 1;
  return `apv-${Date.now().toString(36)}-${counter.toString(36)}`;
};

// Compile the destructive matcher once from config. Invalid regex falls back to
// the documented default so a typo in env can't disable the gate silently.
const matcher: RegExp = (() => {
  try {
    return new RegExp(config.destructiveTools, "i");
  } catch {
    return /deploy|delete|destroy|exec|remove/i;
  }
})();

// Whether a (namespaced) tool name is destructive enough to require approval.
// Matches against the whole `server__tool` id so either half can trip the gate.
export const isDestructive = (toolName: string): boolean => matcher.test(toolName);

// Park a destructive call and return its new approval id. The caller posts the
// chat request + broadcasts the approval:requested event with this id.
export const park = (entry: Omit<PendingAction, "approvalId">): string => {
  const approvalId = newApprovalId();
  pending.set(approvalId, { ...entry, approvalId });
  return approvalId;
};

export const getPending = (approvalId: string): PendingAction | undefined => pending.get(approvalId);

// Resolve a parked action. On approve, run the stored call and return its result
// text; on deny (or already-resolved/unknown), return null after clearing it.
// The entry is removed either way so an approval can't fire twice.
export type Resolution =
  | { found: false }
  | { found: true; approved: false; action: PendingAction }
  | { found: true; approved: true; action: PendingAction; result: string };

export const resolve = async (approvalId: string, approve: boolean): Promise<Resolution> => {
  const action = pending.get(approvalId);
  if (!action) return { found: false };
  pending.delete(approvalId);
  if (!approve) return { found: true, approved: false, action };
  const result = await action.execute();
  return { found: true, approved: true, action, result };
};
