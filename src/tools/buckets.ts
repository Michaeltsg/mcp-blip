/**
 * Bucket (key/value storage) tools.
 *
 * Buckets live on your bot's OWN node, so these commands send NO `to` /
 * postmaster (that is the correct Blip behavior). This differs from the
 * initial spec note of `postmaster@msging.net`; use `blip_command` with an
 * explicit `to` if your account is configured differently.
 */
import { z } from "zod";
import { attempt, encodeBucketId, jsonResult, readOnlyNotice, type ToolContext } from "./shared.js";

export function registerBucketTools(ctx: ToolContext): void {
  const { server, client, config } = ctx;

  server.registerTool(
    "blip_get_bucket",
    {
      title: "Get a bucket value",
      description: "Read a value from the bot's key/value storage by id. Read-only.",
      inputSchema: {
        id: z.string().min(1).describe("Bucket key/id, e.g. my_config or namespace:key."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const res = await client.sendCommand({ method: "get", uri: `/buckets/${encodeBucketId(args.id)}` });
        return jsonResult(res.resource ?? res);
      }),
  );

  server.registerTool(
    "blip_set_bucket",
    {
      title: "Set a bucket value",
      description:
        "WRITE / SIDE EFFECT: store a value in the bot's key/value storage (method=set). " +
        "Requires BLIP_ALLOW_WRITES=true.",
      inputSchema: {
        id: z.string().min(1).describe("Bucket key/id to write."),
        value: z.unknown().describe("Value to store (any JSON)."),
        type: z
          .string()
          .default("application/json")
          .describe("Resource MIME type. Defaults to application/json."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        if (!config.allowWrites) return readOnlyNotice(`set bucket ${args.id}`);
        const res = await client.sendCommand({
          method: "set",
          uri: `/buckets/${encodeBucketId(args.id)}`,
          type: args.type,
          resource: args.value,
        });
        return jsonResult(res);
      }),
  );
}
