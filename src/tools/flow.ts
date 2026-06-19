/**
 * Flow-definition tool (EXPERIMENTAL). Read-only.
 *
 * The Builder flow (blocks + their conditions/rules) is stored in a bucket.
 * Reading it lets you see the exact rule that routes a contact to a flow, so
 * you can cross-check it against the contact's context variables.
 *
 * Sent to the bot's own node (no `to`).
 */
import { z } from "zod";
import { attempt, encodeBucketId, jsonResult, type ToolContext } from "./shared.js";

const DEFAULT_FLOW_KEY = "blip_portal:builder_published_flow";

export function registerFlowTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.registerTool(
    "blip_get_flow",
    {
      title: "Get the bot flow definition (experimental)",
      description:
        "EXPERIMENTAL. Read the published Builder flow definition (blocks, outputs and their " +
        "conditions/rules) from storage. Read-only. Use it to see the exact rule that routes a " +
        "contact, then compare with blip_get_context. Default key: " +
        `${DEFAULT_FLOW_KEY}. Try blip_portal:builder_working_flow for the draft.`,
      inputSchema: {
        key: z
          .string()
          .default(DEFAULT_FLOW_KEY)
          .describe("Storage key of the flow. Defaults to the published flow."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const res = await client.sendCommand({ method: "get", uri: `/buckets/${encodeBucketId(args.key)}` });
        return jsonResult(res.resource ?? res);
      }),
  );
}
