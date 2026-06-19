/**
 * Broadcast / distribution-list tools (EXPERIMENTAL).
 *
 * Based on the Blip DistributionList extension. Postmaster and URIs are the
 * commonly documented ones (postmaster@broadcast.msging.net, /lists,
 * /lists/{id}/recipients) but were not fully verified against your account.
 * If these fail, fall back to `blip_command`. Read-only here.
 */
import { z } from "zod";
import { attempt, buildListQuery, jsonResult, type ToolContext } from "./shared.js";

const BROADCAST = "postmaster@broadcast.msging.net";

export function registerBroadcastTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.registerTool(
    "blip_list_broadcast_lists",
    {
      title: "List broadcast lists (experimental)",
      description:
        "EXPERIMENTAL. List broadcast/distribution lists. Read-only. " +
        "If it fails for your account, use blip_command against the broadcast postmaster.",
      inputSchema: {
        skip: z.number().int().min(0).default(0).describe("Pagination offset."),
        take: z.number().int().min(1).max(100).default(20).describe("Items to return (1-100)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const uri = `/lists?${buildListQuery(args.skip, args.take)}`;
        const res = await client.sendCommand({ method: "get", to: BROADCAST, uri });
        return jsonResult(res.resource ?? res);
      }),
  );

  server.registerTool(
    "blip_list_recipients",
    {
      title: "List broadcast list recipients (experimental)",
      description:
        "EXPERIMENTAL. List the recipients of a broadcast/distribution list. Read-only.",
      inputSchema: {
        list: z
          .string()
          .min(1)
          .describe("List identifier or name (e.g. my-list or my-list@broadcast.msging.net)."),
        skip: z.number().int().min(0).default(0).describe("Pagination offset."),
        take: z.number().int().min(1).max(100).default(20).describe("Items to return (1-100)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const uri = `/lists/${encodeURIComponent(args.list)}/recipients?${buildListQuery(
          args.skip,
          args.take,
        )}`;
        const res = await client.sendCommand({ method: "get", to: BROADCAST, uri });
        return jsonResult(res.resource ?? res);
      }),
  );
}
