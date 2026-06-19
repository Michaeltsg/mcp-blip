/**
 * Event-tracking (analytics) tools (EXPERIMENTAL). Read-only.
 *
 * If a flow logs custom events at key points, these surface the marks/counters,
 * helping reconstruct the journey. Sent to the bot's own node (no `to`).
 */
import { z } from "zod";
import { attempt, buildListQuery, jsonResult, type ToolContext } from "./shared.js";

export function registerEventTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.registerTool(
    "blip_list_event_categories",
    {
      title: "List tracked event categories (experimental)",
      description: "EXPERIMENTAL. List the event categories tracked by your flows. Read-only.",
      inputSchema: {
        skip: z.number().int().min(0).default(0).describe("Pagination offset."),
        take: z.number().int().min(1).max(100).default(20).describe("Categories to return (1-100)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const res = await client.sendCommand({
          method: "get",
          uri: `/event-track?${buildListQuery(args.skip, args.take)}`,
        });
        return jsonResult(res.resource ?? res);
      }),
  );

  server.registerTool(
    "blip_get_event_track",
    {
      title: "Get tracked events for a category (experimental)",
      description:
        "EXPERIMENTAL. Get tracked events/actions for a category, optionally within a date range " +
        "(ISO dates, e.g. 2026-06-01). Read-only.",
      inputSchema: {
        category: z.string().min(1).describe("Event category name."),
        startDate: z.string().optional().describe("Optional ISO start date, e.g. 2026-06-01."),
        endDate: z.string().optional().describe("Optional ISO end date, e.g. 2026-06-19."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const params: string[] = [];
        if (args.startDate) params.push(`startDate=${encodeURIComponent(args.startDate)}`);
        if (args.endDate) params.push(`endDate=${encodeURIComponent(args.endDate)}`);
        const query = params.length > 0 ? `?${params.join("&")}` : "";
        const uri = `/event-track/${encodeURIComponent(args.category)}${query}`;
        const res = await client.sendCommand({ method: "get", uri });
        return jsonResult(res.resource ?? res);
      }),
  );
}
