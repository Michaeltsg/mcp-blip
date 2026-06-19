/**
 * Generic escape hatch: run ANY Blip command. This is what lets you reach
 * resources that don't have a dedicated tool yet.
 *
 * Guardrail: when method != "get" and BLIP_ALLOW_WRITES is false, it refuses
 * and returns a read-only notice instead of executing.
 */
import { z } from "zod";
import { attempt, jsonResult, readOnlyNotice, type ToolContext } from "./shared.js";

export function registerCommandTool(ctx: ToolContext): void {
  const { server, client, config } = ctx;

  server.registerTool(
    "blip_command",
    {
      title: "Run a raw Blip command",
      description:
        "Low-level access to the Blip Command API. Provide method, uri, optional to " +
        "(postmaster) and resource. GET is always allowed; set/merge/delete require " +
        "BLIP_ALLOW_WRITES=true. Examples of `to`: postmaster@crm.msging.net (contacts), " +
        "postmaster@ai.msging.net (AI), postmaster@scheduler.msging.net (schedules). " +
        "Omit `to` for resources on your own node (e.g. /buckets).",
      inputSchema: {
        method: z.enum(["get", "set", "merge", "delete"]).describe("Command method."),
        uri: z.string().min(1).describe("Resource URI, e.g. /contacts?$take=1 or /buckets/my_key."),
        to: z.string().optional().describe("Optional postmaster/recipient. Omit for your own node."),
        type: z.string().optional().describe("Optional resource MIME type (for set/merge)."),
        resource: z.unknown().describe("Optional resource body (for set/merge).").optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        if (args.method !== "get" && !config.allowWrites) {
          return readOnlyNotice(`${args.method.toUpperCase()} ${args.uri}`);
        }
        const res = await client.sendCommand({
          method: args.method,
          uri: args.uri,
          to: args.to,
          type: args.type,
          resource: args.resource,
        });
        return jsonResult(res);
      }),
  );
}
