/**
 * Scheduler tools (EXPERIMENTAL, read-only).
 * Target postmaster: postmaster@scheduler.msging.net
 */
import { z } from "zod";
import { attempt, buildListQuery, jsonResult, type ToolContext } from "./shared.js";

const SCHEDULER = "postmaster@scheduler.msging.net";

export function registerScheduleTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.registerTool(
    "blip_list_schedules",
    {
      title: "List scheduled messages (experimental)",
      description:
        "EXPERIMENTAL. List scheduled messages/commands. Read-only. " +
        "If it fails for your account, use blip_command against the scheduler postmaster.",
      inputSchema: {
        skip: z.number().int().min(0).default(0).describe("Pagination offset."),
        take: z.number().int().min(1).max(100).default(20).describe("Items to return (1-100)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const uri = `/schedules?${buildListQuery(args.skip, args.take)}`;
        const res = await client.sendCommand({ method: "get", to: SCHEDULER, uri });
        return jsonResult(res.resource ?? res);
      }),
  );
}
