/**
 * Conversation history (threads) tools. Read-only.
 * Sent to the bot's own node (no `to`).
 */
import { z } from "zod";
import { attempt, buildListQuery, jsonResult, type ToolContext } from "./shared.js";

export function registerThreadTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.registerTool(
    "blip_list_threads",
    {
      title: "List recent conversations",
      description: "List recent conversation threads (one per contact). Read-only.",
      inputSchema: {
        skip: z.number().int().min(0).default(0).describe("Pagination offset."),
        take: z.number().int().min(1).max(100).default(20).describe("Threads to return (1-100)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const res = await client.sendCommand({
          method: "get",
          uri: `/threads?${buildListQuery(args.skip, args.take)}`,
        });
        return jsonResult(res.resource ?? res);
      }),
  );

  server.registerTool(
    "blip_get_thread",
    {
      title: "Get a contact's conversation",
      description:
        "Get the message history exchanged with a contact (what the user said and what the bot " +
        "replied), most recent first. Read-only.",
      inputSchema: {
        identity: z.string().min(1).describe("Contact identity, e.g. 5511999999999@wa.gw.msging.net."),
        take: z.number().int().min(1).max(100).default(20).describe("Messages to return (1-100)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const uri = `/threads/${encodeURIComponent(args.identity)}?$take=${args.take}`;
        const res = await client.sendCommand({ method: "get", uri });
        return jsonResult(res.resource ?? res);
      }),
  );
}
