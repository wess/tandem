// Outbound client for the homelab credential broker's MCP
// (see /Users/wess/Desktop/Dev/broker). The broker is the machine-auth layer:
// it holds long-lived bootstrap credentials and mints scoped, short-lived child
// tokens on demand via its `cred.issue` tool, recording each as an audited
// lease. Tandem asks the broker for a fresh token per downstream tool call so an
// agent never carries a long-lived secret.
//
// Transport mirrors src/domain/mcp/client.ts: JSON-RPC 2.0 over HTTP POST to the
// broker's /mcp endpoint, gated by a single static bearer (BROKER_TOKEN). The
// caller's identity rides X-Broker-Principal purely for the broker's audit trail
// — it is never a privilege there. `cred.issue` returns either an issued token or
// a {status:"pending"} when the broker itself gates the tool behind its own
// approval flow; we surface both to the caller.

import { config } from "../../config.ts";
import type { JsonRpcRequest, JsonRpcResponse } from "../mcp/jsonrpc.ts";

// True when both halves of the broker config are present. When false, callers
// keep using the static MCP_SERVERS token exactly as before (parity).
export const brokerConfigured = (): boolean => config.brokerUrl !== "" && config.brokerToken !== "";

export type IssueRequest = {
  // The broker catalog tool to mint against, e.g. "tangle.repo".
  tool: string;
  scope: string;
  ttlSeconds: number;
  // Recorded by the broker for attribution only (X-Broker-Principal header).
  principal?: string;
};

// The shape `cred.issue` returns. The broker sends back either an issued token
// (the secret, shown once) or a pending marker when its own approval gate fires.
export type IssueResult =
  | { status: "issued"; token: string; leaseId?: string }
  | { status: "pending"; approvalId: string; message?: string };

let nextId = 1;
const newId = (): string => `tandem-broker-${nextId++}`;

const rpc = async (req: JsonRpcRequest, principal?: string): Promise<JsonRpcResponse> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${config.brokerToken}`,
    };
    if (principal) headers["x-broker-principal"] = principal;
    const res = await fetch(config.brokerUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Broker returned ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as JsonRpcResponse;
  } finally {
    clearTimeout(timer);
  }
};

// Pull the single text content block out of an MCP tools/call response. The
// broker's @atlas/mcp wrap returns `{ content: [{ type:"text", text }], isError? }`
// where `text` is the JSON-stringified tool return — so we parse it back.
const parseContent = (result: unknown): { text: string; isError: boolean } => {
  const r = result as { content?: unknown; isError?: boolean };
  const content = r.content;
  let text = "";
  if (Array.isArray(content)) {
    const first = content.find((c) => (c as { type?: string }).type === "text") as { text?: string } | undefined;
    text = first?.text ?? "";
  }
  return { text, isError: r.isError === true };
};

// Mint a scoped, short-lived child credential for a downstream tool. Returns the
// issued token (the secret, surfaced once) or a pending marker when the broker's
// own approval flow holds the issuance. Throws on transport / broker errors so
// the caller can fall back to the static token rather than block the turn.
export const issueCredential = async (req: IssueRequest): Promise<IssueResult> => {
  const res = await rpc(
    {
      jsonrpc: "2.0",
      id: newId(),
      method: "tools/call",
      params: { name: "cred.issue", arguments: { tool: req.tool, scope: req.scope, ttlSeconds: req.ttlSeconds } },
    },
    req.principal,
  );
  if ("error" in res) throw new Error(`cred.issue failed: ${res.error.message}`);

  const { text, isError } = parseContent(res.result);
  if (isError) throw new Error(`cred.issue failed: ${text.slice(0, 200)}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`cred.issue returned unparseable result: ${text.slice(0, 200)}`);
  }
  const p = parsed as { status?: string; token?: string; leaseId?: string; approvalId?: string; message?: string };
  if (p.status === "issued" && typeof p.token === "string") {
    return { status: "issued", token: p.token, leaseId: p.leaseId };
  }
  if (p.status === "pending" && typeof p.approvalId === "string") {
    return { status: "pending", approvalId: p.approvalId, message: p.message };
  }
  throw new Error(`cred.issue returned an unexpected shape: ${text.slice(0, 200)}`);
};
