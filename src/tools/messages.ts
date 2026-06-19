/** Message-sending tool (WRITE / SIDE EFFECT). */
import { z } from "zod";
import { attempt, jsonResult, readOnlyNotice, type ToolContext } from "./shared.js";

export function registerMessageTools(ctx: ToolContext): void {
  const { server, client, config } = ctx;

  server.registerTool(
    "blip_send_message",
    {
      title: "Send a message to a real recipient",
      description:
        "WRITE / SIDE EFFECT: sends a message that REACHES A REAL USER on a real channel " +
        "(e.g. 5511999999999@wa.gw.msging.net). Use with care. Requires BLIP_ALLOW_WRITES=true.",
      inputSchema: {
        to: z
          .string()
          .min(1)
          .describe("Recipient identity, e.g. 5511999999999@wa.gw.msging.net."),
        content: z
          .union([z.string(), z.record(z.string(), z.unknown())])
          .describe("Message content: a string for text/plain, or an object for rich types."),
        type: z
          .string()
          .default("text/plain")
          .describe("Content MIME type. Defaults to text/plain."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        if (!config.allowWrites) return readOnlyNotice(`send a ${args.type} message to ${args.to}`);
        const res = await client.sendMessage({ to: args.to, content: args.content, type: args.type });
        return jsonResult(res);
      }),
  );
}
