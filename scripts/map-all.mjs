#!/usr/bin/env node
/**
 * map-all — verify and map EVERY configured flow.
 *
 * For each flow: if it has a Builder flow, write a componentized block map
 * (index + blocks/<block>.md). Otherwise (e.g. a protocol router) discover its
 * resources/buckets and write a config map (index.md + config.json). All
 * secret-looking values are redacted. Orphan folders are removed.
 *
 *   node scripts/map-all.mjs
 *
 * Credentials from blip.env or environment (multi-flow).
 */
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

for (const raw of readFileSync("blip.env", "utf8").split(/\r?\n/)) {
  const line = raw.trim(); if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("="); if (eq === -1) continue;
  const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  else v = v.replace(/\s+#.*$/, "").trim();
  if (v) process.env[k] = v;
}
const dist = (f) => pathToFileURL(resolve(process.cwd(), "dist", f)).href;
const { loadConfig } = await import(dist("config.js"));
const { BlipClient } = await import(dist("blip-client.js"));
const { buildFlowMap, renderFlowFiles } = await import(dist("flow-map.js"));

const config = loadConfig();
const safe = (n) => n.replace(/[^a-zA-Z0-9._-]/g, "_") || "flow";

function identifierOf(auth) {
  try { const d = Buffer.from(auth.replace(/^key\s+/i, "").trim(), "base64").toString("utf8"); const i = d.indexOf(":"); return i === -1 ? "?" : d.slice(0, i); }
  catch { return "?"; }
}
function redact(obj, keyName = "") {
  if (typeof obj === "string") {
    if (/^key\s+\S+/i.test(obj)) return "«Key-redacted»";
    if (/(token|secret|password|senha|apikey|api_key|authorization|chave)/i.test(keyName) && obj.length > 6) return "«redacted»";
    if (/^[A-Za-z0-9+/_=.\-]{24,}$/.test(obj)) return "«token-redacted»";
    return obj;
  }
  if (Array.isArray(obj)) return obj.map((x) => redact(x));
  if (obj && typeof obj === "object") { const o = {}; for (const [k, v] of Object.entries(obj)) o[k] = redact(v, k); return o; }
  return obj;
}
const keysOf = (res) => !res ? [] : Array.isArray(res?.items) ? res.items.map((i) => typeof i === "string" ? i : i.id ?? i.name) : (res && typeof res === "object" ? Object.keys(res) : []);

const BUILDER_KEYS = ["blip_portal:builder_published_flow", "blip_portal:builder_working_flow"];

async function mapBuilder(client, flowName) {
  for (const key of BUILDER_KEYS) {
    try {
      const res = await client.sendCommand({ method: "get", uri: `/buckets/${encodeURIComponent(key).replace(/%3A/gi, ":")}` });
      const map = buildFlowMap(key, res.resource ?? res);
      if (!map.blockCount) continue;
      const files = renderFlowFiles(map);
      const baseDir = resolve(config.flowsDir, safe(flowName));
      for (const [rel, content] of Object.entries(files)) { const t = join(baseDir, rel); await mkdir(dirname(t), { recursive: true }); await writeFile(t, content, "utf8"); }
      return { kind: "builder", blocks: map.blockCount, subflows: Object.keys(map.subflows).length };
    } catch { /* try next */ }
  }
  return null;
}

async function mapConfig(client, flowName) {
  const get = async (uri) => { try { const r = await client.sendCommand({ method: "get", uri }); return r.resource ?? r; } catch { return null; } };
  const resources = keysOf(await get("/resources?$skip=0&$take=200"));
  const buckets = keysOf(await get("/buckets?$skip=0&$take=200"));
  const resObj = {};
  for (const name of resources) resObj[name] = redact(await get(`/resources/${encodeURIComponent(name)}`), name);
  const gc = resObj.globalConfig || {};
  const gf = resObj.globalFunctions || {};
  const services = Object.entries(gc).filter(([k]) => /^service/i.test(k)).map(([k, v]) => ({ papel: k.replace(/^service/, ""), servico: v }));

  const idx = [];
  idx.push(`# ${flowName} (config — sem fluxo de Builder)`, "");
  idx.push("> Mapeado por resources/buckets do nó. Tokens mascarados.", "");
  if (services.length) { idx.push("## Redireciona para (serviços)", "", "| Papel | Serviço |", "|---|---|"); for (const s of services) idx.push(`| ${s.papel} | ${s.servico} |`); idx.push(""); }
  if (Object.keys(gf).length) { idx.push("## Comportamento (globalFunctions)", ""); for (const [k, v] of Object.entries(gf)) idx.push(`- **${k}**: ${v}`); idx.push(""); }
  idx.push("## Resources", "", resources.length ? resources.join(", ") : "—", "");
  idx.push("## Buckets", "", buckets.length ? buckets.join(", ") : "—", "");
  const baseDir = resolve(config.flowsDir, safe(flowName));
  await mkdir(baseDir, { recursive: true });
  await writeFile(join(baseDir, "index.md"), idx.join("\n"), "utf8");
  await writeFile(join(baseDir, "config.json"), JSON.stringify({ flow: flowName, services, globalFunctions: gf, resources, buckets, resourceValues: resObj }, null, 2), "utf8");
  return { kind: "config", resources: resources.length, buckets: buckets.length, services: services.length };
}

console.log("Verificação de identidade + mapeamento:\n");
console.log("nome                         | identidade real         | bate | resultado");
console.log("-".repeat(92));
for (const flow of config.flows) {
  const id = identifierOf(flow.authorization);
  const match = id.toLowerCase() === flow.name.toLowerCase() ? "✅" : "⚠️ ";
  const client = new BlipClient({ baseUrl: flow.baseUrl, authorization: flow.authorization, timeoutMs: config.timeoutMs, maxRetries: 2 });
  let r = await mapBuilder(client, flow.name);
  if (!r) r = await mapConfig(client, flow.name);
  const desc = r.kind === "builder" ? `Builder: ${r.blocks} blocos, ${r.subflows} subfluxos` : `Config: ${r.resources} resources, ${r.buckets} buckets, ${r.services} destinos`;
  console.log(`${flow.name.padEnd(28)} | ${id.padEnd(23)} | ${match}  | ${desc}`);
}

const valid = new Set(config.flows.map((f) => safe(f.name)));
for (const d of readdirSync(config.flowsDir, { withFileTypes: true })) {
  if (d.isDirectory() && !valid.has(d.name)) { rmSync(resolve(config.flowsDir, d.name), { recursive: true, force: true }); console.log(`\nremovida órfã: flows/${d.name}`); }
}
console.log("\nPastas finais:", readdirSync(config.flowsDir).join(", "));
