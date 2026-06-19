/**
 * Context-variable tools (EXPERIMENTAL) — the heart of "why did this contact
 * match this rule?".
 *
 * Flow conditions evaluate against a contact's CONTEXT variables. Reading them
 * shows the actual values a rule saw. The special variable `stateid@{flowId}`
 * holds where the contact currently is in a given flow.
 *
 * Sent to the bot's own node (no `to`). If your account keeps context behind a
 * postmaster, use `blip_command` with the appropriate `to`.
 */
import { z } from "zod";
import { attempt, jsonResult, type ToolContext } from "./shared.js";

export function registerContextTools(ctx: ToolContext): void {
  const { server, client } = ctx;

  server.registerTool(
    "blip_get_context",
    {
      title: "Get a contact's context variables (experimental)",
      description:
        "EXPERIMENTAL. List the Builder context variables stored for a contact — the actual " +
        "values that flow conditions/rules evaluate against. Read-only. Use this to debug why " +
        "a contact took one path instead of another.",
      inputSchema: {
        identity: z.string().min(1).describe("Contact identity, e.g. 5511999999999@wa.gw.msging.net."),
        skip: z.number().int().min(0).default(0).describe("Pagination offset."),
        take: z.number().int().min(1).max(100).default(50).describe("Variables to return (1-100)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const uri = `/contexts/${encodeURIComponent(args.identity)}?skip=${args.skip}&take=${args.take}`;
        const res = await client.sendCommand({ method: "get", uri });
        return jsonResult(res.resource ?? res);
      }),
  );

  server.registerTool(
    "blip_get_context_variable",
    {
      title: "Get one context variable of a contact (experimental)",
      description:
        "EXPERIMENTAL. Read a single context variable for a contact. Read-only. " +
        "Tip: variable `stateid@{flowId}` returns where the contact currently is in that flow.",
      inputSchema: {
        identity: z.string().min(1).describe("Contact identity."),
        variable: z
          .string()
          .min(1)
          .describe("Variable name, e.g. cpf, plano, or stateid@1234 for flow state."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const uri = `/contexts/${encodeURIComponent(args.identity)}/${encodeURIComponent(args.variable)}`;
        const res = await client.sendCommand({ method: "get", uri });
        return jsonResult(res.resource ?? res);
      }),
  );
}
