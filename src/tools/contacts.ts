/** Contact (CRM) tools. Target postmaster: postmaster@crm.msging.net */
import { z } from "zod";
import {
  attempt,
  buildListQuery,
  jsonResult,
  readOnlyNotice,
  type ToolContext,
} from "./shared.js";

const CRM = "postmaster@crm.msging.net";
const CONTACT_MIME = "application/vnd.lime.contact+json";

export function registerContactTools(ctx: ToolContext): void {
  const { server, client, config } = ctx;

  server.registerTool(
    "blip_list_contacts",
    {
      title: "List Blip contacts",
      description:
        "List contacts stored in your bot's CRM, with pagination and an optional " +
        "OData $filter. Read-only. Example filter: substringof('WhatsApp',source)",
      inputSchema: {
        skip: z.number().int().min(0).default(0).describe("Items to skip (pagination offset)."),
        take: z.number().int().min(1).max(100).default(20).describe("Items to return (1-100)."),
        filter: z
          .string()
          .optional()
          .describe("Optional OData $filter expression. Value is URL-encoded for you."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const uri = `/contacts?${buildListQuery(args.skip, args.take, args.filter)}`;
        const res = await client.sendCommand({ method: "get", to: CRM, uri });
        return jsonResult(res.resource ?? res);
      }),
  );

  server.registerTool(
    "blip_get_contact",
    {
      title: "Get a Blip contact",
      description: "Fetch a single contact by its identity (e.g. 5511999999999@wa.gw.msging.net). Read-only.",
      inputSchema: {
        identity: z.string().min(1).describe("The contact identity to fetch."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const uri = `/contacts/${encodeURIComponent(args.identity)}`;
        const res = await client.sendCommand({ method: "get", to: CRM, uri });
        return jsonResult(res.resource ?? res);
      }),
  );

  server.registerTool(
    "blip_set_contact",
    {
      title: "Create or update a Blip contact",
      description:
        "WRITE / SIDE EFFECT: create or update a contact in the CRM (method=merge). " +
        "The `contact` object must include an `identity`. Requires BLIP_ALLOW_WRITES=true.",
      inputSchema: {
        contact: z
          .record(z.string(), z.unknown())
          .describe("Contact resource. Must contain `identity`; other fields are optional."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const identity = args.contact["identity"];
        if (typeof identity !== "string" || identity.length === 0) {
          return jsonResult({ error: "contact.identity is required and must be a non-empty string." });
        }
        if (!config.allowWrites) return readOnlyNotice(`upsert contact ${identity}`);
        const res = await client.sendCommand({
          method: "merge",
          to: CRM,
          uri: "/contacts",
          type: CONTACT_MIME,
          resource: args.contact,
        });
        return jsonResult(res);
      }),
  );

  server.registerTool(
    "blip_delete_contact",
    {
      title: "Delete a Blip contact",
      description:
        "WRITE / DESTRUCTIVE: permanently remove a contact by identity. Requires BLIP_ALLOW_WRITES=true.",
      inputSchema: {
        identity: z.string().min(1).describe("The contact identity to delete."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        if (!config.allowWrites) return readOnlyNotice(`delete contact ${args.identity}`);
        const uri = `/contacts/${encodeURIComponent(args.identity)}`;
        const res = await client.sendCommand({ method: "delete", to: CRM, uri });
        return jsonResult(res);
      }),
  );
}
