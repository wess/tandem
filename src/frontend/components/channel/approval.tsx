import { useState } from "react";
import type { ApprovalRequested } from "../../../shared/types.ts";
import { resolveApproval } from "../../state/actions.ts";
import { useStore } from "../../state/store.ts";
import { Icon } from "../icon.tsx";

// Task #15 — render the args an agent wants to run as a compact preview so the
// human sees exactly what's pending. Objects are JSON-stringified; primitives
// shown inline. Kept short — this is a confirm prompt, not a log viewer.
const argsPreview = (args: Record<string, unknown>): string => {
  const entries = Object.entries(args);
  if (entries.length === 0) return "(no arguments)";
  return entries.map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n");
};

const ApprovalRow = ({ req }: { req: ApprovalRequested }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (approve: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await resolveApproval(req.channelId, req.approvalId, approve);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resolve the request");
      setBusy(false);
    }
  };

  return (
    <div className="approvalcard">
      <div className="approvalhead">
        <span className="approvalkicker">
          <Icon name="lock" size={13} /> Approval needed
        </span>
        <span className="approvaltool">{req.tool}</span>
      </div>
      <pre className="approvalargs">{argsPreview(req.args)}</pre>
      {error && <div className="formerror">{error}</div>}
      <div className="approvalfoot">
        <button type="button" className="ghost danger" disabled={busy} onClick={() => void resolve(false)}>
          Deny
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => void resolve(true)}>
          {busy ? "Working…" : "Approve & run"}
        </button>
      </div>
    </div>
  );
};

// Renders every parked destructive tool call for the active channel off
// store.approvalsByChannel[channelId]. Each resolves independently via
// resolveApproval, which optimistically drops the prompt and calls the RPC.
export const ApprovalPrompts = ({ channelId }: { channelId: number }) => {
  const forChannel = useStore((s) => s.approvalsByChannel[channelId]);
  if (!forChannel) return null;
  const reqs = Object.values(forChannel);
  if (reqs.length === 0) return null;

  return (
    <div className="approvals">
      {reqs.map((req) => (
        <ApprovalRow key={req.approvalId} req={req} />
      ))}
    </div>
  );
};
