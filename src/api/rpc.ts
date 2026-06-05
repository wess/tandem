import { type Conn, json, notFound, pipeline, post } from "@atlas/server";
import type { RpcMethod } from "../shared/rpc.ts";
import { requireAuth } from "./auth.ts";
import { handlers } from "./handlers.ts";

export const rpcRoute = post(
  "/api/rpc/:method",
  pipeline(requireAuth)(async (c: Conn) => {
    const method = c.params.method as RpcMethod;
    const handler = handlers[method] as undefined | ((input: unknown) => Promise<unknown>);
    if (!handler) throw notFound(`unknown rpc method: ${method}`);
    const input = await c.request.json().catch(() => undefined);
    const output = await handler(input);
    return json(c, 200, output ?? null);
  }),
);
