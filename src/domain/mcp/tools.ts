// Assemble the AgentTools for a single turn out of every enabled remote MCP
// server. For each server we initialize + list its catalog, then expose each
// remote tool as a namespaced ToolDef (`${server}__${tool}`) so two servers
// can advertise a same-named tool without colliding. `run(call)` reverses the
// namespacing and routes the call back to the owning server.
//
// Two cross-cutting concerns layer on top of the plain pass-through:
//   1. Brokered credentials — when a broker is configured (config.brokerUrl +
//      brokerToken), a tool call mints a scoped, short-lived child token via the
//      broker's cred.issue and uses THAT as the bearer for the downstream call,
//      instead of the static MCP_SERVERS token. No broker → the static token is
//      used exactly as before (parity).
//   2. Approval gate — a destructive tool (name matches the configurable
//      matcher) is never executed on request. It parks the exact call, posts a
//      chat approval request, and returns a "pending" result. A human resolves
//      it later via the approvals:resolve RPC. No destructive tool → unchanged.

import type { ToolCall, ToolDef } from "@atlas/ai";
import { brokerConfigured, issueCredential } from "../broker/index.ts";
import { broadcast } from "../events.ts";
import { insertMessage, toMessage } from "../messages.ts";
import type { AgentTools } from "../runtime/run.ts";
import { isDestructive, park } from "./approvals.ts";
import {
  type RemoteServer,
  type RemoteToolDescriptor,
  remoteCallTool,
  remoteInitialize,
  remoteListTools,
} from "./client.ts";
import { type EnabledServer, enabledServers } from "./registry.ts";

// Separator between the server namespace and the remote tool name. Double
// underscore is unlikely to appear in a real tool name and keeps the combined
// id readable to the model.
const SEP = "__";

// Default scope + lifetime for a brokered credential. The broker caps the TTL
// per-tool from its own catalog, so a generous request is clamped server-side.
const BROKER_SCOPE = "tool";
const BROKER_TTL_SECONDS = 300;

const namespaced = (server: string, tool: string): string => `${server}${SEP}${tool}`;

const toToolDef = (server: EnabledServer, t: RemoteToolDescriptor): ToolDef => ({
  name: namespaced(server.name, t.name),
  description: t.description ?? "",
  // The remote MCP inputSchema is already a JSON Schema object; pass it through
  // as the tool parameters. Default to an empty object schema when absent.
  parameters: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
});

// Pull the result text out of an MCP tools/call response. The spec returns
// `{ content: [{ type: "text", text }, …] }`; we surface the first text block
// (matching how run.ts feeds a single string back into the conversation).
const resultText = (result: unknown): string => {
  const content = (result as { content?: unknown }).content;
  if (Array.isArray(content)) {
    const first = content.find((c) => (c as { type?: string }).type === "text") as { text?: string } | undefined;
    if (first?.text) return first.text;
  }
  // Fall back to a JSON dump so a non-text result still reaches the model.
  return JSON.stringify(result);
};

// Index a namespaced tool name back to its server + bare remote tool name. We
// look the prefix up against the known server set rather than splitting on SEP
// blindly, since a remote tool name could itself contain the separator.
const resolveCall = (
  name: string,
  servers: Map<string, RemoteServer>,
): { server: RemoteServer; serverName: string; tool: string } | null => {
  const idx = name.indexOf(SEP);
  if (idx <= 0) return null;
  const serverName = name.slice(0, idx);
  const server = servers.get(serverName);
  if (!server) return null;
  return { server, serverName, tool: name.slice(idx + SEP.length) };
};

export const buildAgentTools = async (ownerId: number, channelId: number): Promise<AgentTools> => {
  const servers = await enabledServers(ownerId);
  const byName = new Map<string, RemoteServer>();
  const defs: ToolDef[] = [];

  // Initialize + list each server independently; a single unreachable server
  // must not blank out the catalogs of the healthy ones.
  await Promise.all(
    servers.map(async (server) => {
      try {
        await remoteInitialize(server);
        const tools = await remoteListTools(server);
        byName.set(server.name, server);
        for (const t of tools) defs.push(toToolDef(server, t));
      } catch {
        // Skip a server we can't reach or that fails to enumerate its tools.
      }
    }),
  );

  // Resolve the bearer to use for one downstream call. With a broker configured
  // we mint a fresh, scoped, short-lived child token via cred.issue and use it;
  // otherwise we keep the server's static MCP_SERVERS token EXACTLY as before.
  // If the broker returns a pending status (its own approval flow), or anything
  // throws, we fall back to the static token rather than block the turn.
  const bearerFor = async (
    server: RemoteServer,
    serverName: string,
    tool: string,
  ): Promise<string | null | undefined> => {
    if (!brokerConfigured()) return server.authToken;
    try {
      const issued = await issueCredential({
        tool: namespaced(serverName, tool),
        scope: BROKER_SCOPE,
        ttlSeconds: BROKER_TTL_SECONDS,
        principal: `tandem:owner:${ownerId}`,
      });
      if (issued.status === "issued") return issued.token;
      // Broker is gating this issuance itself; fall back to the static token.
      return server.authToken;
    } catch {
      return server.authToken;
    }
  };

  // Execute a remote call with a (possibly brokered) bearer. The bearer is
  // resolved fresh here so a parked-then-approved call mints a token that is
  // still live at approval time rather than reusing one issued earlier.
  const callRemote = async (
    server: RemoteServer,
    serverName: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<string> => {
    const bearer = await bearerFor(server, serverName, tool);
    const result = await remoteCallTool({ ...server, authToken: bearer }, tool, args);
    return resultText(result);
  };

  // Post a system chat message into this channel (the approval request / result).
  const postSystem = async (text: string): Promise<void> => {
    const sys = await insertMessage({ ownerId, channelId, authorType: "system", content: text });
    broadcast("message:created", toMessage(sys), ownerId);
  };

  const run = async (call: ToolCall): Promise<string> => {
    const target = resolveCall(call.name, byName);
    if (!target) return `Error: unknown tool "${call.name}"`;
    const { server, serverName, tool } = target;

    if (isDestructive(call.name)) {
      const approvalId = park({
        ownerId,
        channelId,
        tool: call.name,
        args: call.arguments,
        execute: () => callRemote(server, serverName, tool, call.arguments),
      });
      await postSystem(
        `Approval needed: \`${call.name}\` is a destructive action and is paused pending your approval (request ${approvalId}).`,
      );
      broadcast("approval:requested", { approvalId, channelId, tool: call.name, args: call.arguments }, ownerId);
      return `This action ("${call.name}") is destructive and requires human approval. It has been posted to the channel as request ${approvalId} and is now PENDING. Do not retry it — a human will approve or deny; you will be told the outcome.`;
    }

    return callRemote(server, serverName, tool, call.arguments);
  };

  return { defs, run };
};
