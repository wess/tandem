import { type Conn, json, notFound, pipeline, post } from "@atlas/server";
import type { RpcMethod } from "../shared/rpc.ts";
import { requireAuth } from "./auth.ts";
import { type Ctx, handlers } from "./handlers.ts";

export const rpcRoute = post(
  "/api/rpc/:method",
  pipeline(requireAuth)(async (c: Conn) => {
    const method = c.params.method as RpcMethod;
    const handler = handlers[method] as undefined | ((input: unknown, ctx: Ctx) => Promise<unknown>);
    if (!handler) throw notFound(`unknown rpc method: ${method}`);
    const input = await c.request.json().catch(() => undefined);
    // userId comes from the verified session cookie (requireAuth), scoping the
    // handler to the caller's workspace — never from the request body.
    const output = await handler(input, { userId: c.assigns.userId as number });
    return json(c, 200, output ?? null);
  }),
);
