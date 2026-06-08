// Minimal outbound MCP client. Talks JSON-RPC 2.0 over HTTP POST. Tandem uses
// this to consume third-party MCP servers — initialize them, list their tool
// catalogs, and call tools on behalf of an agent turn. This module is just the
// transport piece; assembling the catalog into an AgentTools lives in tools.ts.
//
// Lifted from stohr/src/mcp/client.ts and adapted to tandem (clientInfo name).

import type { JsonRpcRequest, JsonRpcResponse } from "./jsonrpc.ts";

export type RemoteToolDescriptor = {
  name: string;
  description: string;
  inputSchema: unknown;
};

export type RemoteServer = {
  url: string;
  authToken?: string | null;
  // Bounded by Bun's default fetch timeout. We add our own AbortSignal so a
  // dead remote can't pin a request indefinitely.
  timeoutMs?: number;
};

const rpc = async (server: RemoteServer, req: JsonRpcRequest): Promise<JsonRpcResponse> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), server.timeoutMs ?? 15_000);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (server.authToken) headers.authorization = `Bearer ${server.authToken}`;
    const res = await fetch(server.url, {
      method: "POST",
      headers,
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Remote MCP returned ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as JsonRpcResponse;
  } finally {
    clearTimeout(timer);
  }
};

let nextId = 1;
const newId = () => `tandem-${nextId++}`;

export const remoteInitialize = async (server: RemoteServer) => {
  const res = await rpc(server, {
    jsonrpc: "2.0",
    id: newId(),
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      clientInfo: { name: "tandem", version: "0.1.0" },
      capabilities: { tools: {} },
    },
  });
  if ("error" in res) throw new Error(`initialize failed: ${res.error.message}`);
  return res.result;
};

export const remoteListTools = async (server: RemoteServer): Promise<RemoteToolDescriptor[]> => {
  const res = await rpc(server, { jsonrpc: "2.0", id: newId(), method: "tools/list" });
  if ("error" in res) throw new Error(`tools/list failed: ${res.error.message}`);
  const tools = (res.result as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return [];
  return tools as RemoteToolDescriptor[];
};

export const remoteCallTool = async (
  server: RemoteServer,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> => {
  const res = await rpc(server, {
    jsonrpc: "2.0",
    id: newId(),
    method: "tools/call",
    params: { name, arguments: args },
  });
  if ("error" in res) throw new Error(`tools/call ${name} failed: ${res.error.message}`);
  return res.result;
};
