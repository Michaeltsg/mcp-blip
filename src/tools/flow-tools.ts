/**
 * Flow mapping tools.
 *
 *  - blip_list_flows: list configured flows (names/hosts only, never secrets).
 *  - blip_map_flow: read a flow definition and write a COMPONENTIZED set of docs
 *    (index + one file per block) under <flowsDir>/<flowName>/. Reads from Blip,
 *    writes local files only (no Blip-side mutation).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { resolveFlow } from "../config.js";
import { buildFlowMap, renderFlowFiles } from "../flow-map.js";
import { attempt, encodeBucketId, jsonResult, type ToolContext } from "./shared.js";

const DEFAULT_FLOW_KEY = "blip_portal:builder_published_flow";

export function registerFlowMapTools(ctx: ToolContext): void {
  const { server } = ctx;

  server.registerTool(
    "blip_list_flows",
    {
      title: "List configured flows",
      description:
        "List the flows (Blip bots) configured via blip.env / environment. Names and hosts only — " +
        "never shows credentials. Read-only.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      attempt(ctx, async () =>
        jsonResult({
          defaultFlow: ctx.config.defaultFlowName,
          flowsDir: ctx.flowsDir,
          flows: ctx.flows.map((f) => ({
            name: f.name,
            host: f.baseUrl,
            credentialMode: f.credentialMode,
            isDefault: f.name === ctx.config.defaultFlowName,
          })),
        }),
      ),
  );

  server.registerTool(
    "blip_map_flow",
    {
      title: "Map a flow into componentized docs",
      description:
        "Read a Blip Builder flow definition and write a COMPONENTIZED set of docs under " +
        "<flowsDir>/<flow>/ : an index.md (block graph + who-connects-to-whom), index.json, and one " +
        "blocks/<block>.md per block (what it does + its routing rules). Reads from Blip, writes local " +
        "files only. Use `flow` to pick which configured flow to map (see blip_list_flows).",
      inputSchema: {
        flow: z.string().optional().describe("Configured flow name to map. Defaults to the default flow."),
        key: z
          .string()
          .default(DEFAULT_FLOW_KEY)
          .describe(`Flow storage key. Defaults to ${DEFAULT_FLOW_KEY} (try blip_portal:builder_working_flow for the draft).`),
        full: z.boolean().default(false).describe("Include full message texts instead of short snippets."),
        outDir: z.string().optional().describe("Override the output base dir (defaults to BLIP_FLOWS_DIR / 'flows')."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) =>
      attempt(ctx, async () => {
        const flow = resolveFlow(ctx.config, args.flow);
        const client = ctx.getClient(flow.name);
        const res = await client.sendCommand({ method: "get", uri: `/buckets/${encodeBucketId(args.key)}` });
        const resource = res.resource ?? res;
        const map = buildFlowMap(args.key, resource, { full: args.full });
        const files = renderFlowFiles(map);

        const safeName = flow.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "flow";
        const baseDir = resolve(args.outDir ?? ctx.flowsDir, safeName);
        for (const [rel, content] of Object.entries(files)) {
          const target = join(baseDir, rel);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, content, "utf8");
        }

        ctx.logger.info(`mapped flow "${flow.name}" -> ${baseDir} (${map.blockCount} blocks)`);
        return jsonResult({
          flow: flow.name,
          host: flow.baseUrl,
          key: args.key,
          outputDir: baseDir,
          blocks: map.blockCount,
          subflows: Object.keys(map.subflows).length,
          filesWritten: Object.keys(files).length,
          index: join(baseDir, "index.md"),
        });
      }),
  );
}
