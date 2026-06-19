#!/usr/bin/env node
/**
 * map-flow — CLI wrapper around the blip_map_flow tool logic.
 * Reads a Blip flow and writes COMPONENTIZED docs under flows/<flowName>/.
 * Repeatable: re-run after editing the flow in Builder.
 *
 *   node scripts/map-flow.mjs [--flow <name>] [--key <bucketKey>] [--full]
 *
 * Credentials come from blip.env or the environment (multi-flow supported).
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// load blip.env into process.env (without printing values)
try {
  for (const raw of readFileSync("blip.env", "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("="); if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "").trim(); // strip inline comment on unquoted values
    if (v && process.env[k] === undefined) process.env[k] = v;
  }
} catch { /* rely on process.env */ }

const dist = (f) => pathToFileURL(resolve(process.cwd(), "dist", f)).href;
const { loadConfig, resolveFlow } = await import(dist("config.js"));
const { BlipClient } = await import(dist("blip-client.js"));
const { buildFlowMap, renderFlowFiles } = await import(dist("flow-map.js"));

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i !== -1 ? argv[i + 1] : undefined; };
const flowName = opt("--flow");
const key = opt("--key") ?? "blip_portal:builder_published_flow";
const full = argv.includes("--full");

const config = loadConfig();
const flow = resolveFlow(config, flowName);
const client = new BlipClient({
  baseUrl: flow.baseUrl, authorization: flow.authorization,
  timeoutMs: config.timeoutMs, maxRetries: config.maxRetries,
});

const res = await client.sendCommand({ method: "get", uri: `/buckets/${encodeURIComponent(key).replace(/%3A/gi, ":")}` });
const map = buildFlowMap(key, res.resource ?? res, { full });
const files = renderFlowFiles(map);

const safeName = flow.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "flow";
const baseDir = resolve(config.flowsDir, safeName);
for (const [rel, content] of Object.entries(files)) {
  const target = join(baseDir, rel);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}
console.log(`flow "${flow.name}" mapeado -> ${baseDir}`);
console.log(`  ${map.blockCount} blocos, ${Object.keys(map.subflows).length} subfluxos, ${Object.keys(files).length} arquivos`);
console.log(`  indice: ${join(baseDir, "index.md")}`);
