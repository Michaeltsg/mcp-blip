/**
 * Environment-driven configuration for blip-mcp (multi-flow aware).
 *
 * Credentials come ONLY from environment variables. You can configure several
 * "flows" (Blip bots): a default flow from the classic vars, plus numbered
 * extra flows via BLIP_FLOW_<n>_NAME / _AUTHORIZATION / _CONTRACT_ID, etc.
 */
import { z } from "zod";
import { BlipConfigError } from "./errors.js";
import type { LogLevel } from "./logger.js";

export type CredentialMode = "authorization" | "identifier+key";

/** A single named flow (Blip bot) with its own host + credentials. */
export interface FlowCredential {
  name: string;
  baseUrl: string;
  authorization: string;
  credentialMode: CredentialMode;
  contractId: string | undefined;
}

export interface BlipConfig {
  /** Default flow host (mirror of flows[0]). */
  baseUrl: string;
  /** Default flow authorization (mirror of flows[0]). */
  authorization: string;
  credentialMode: CredentialMode;
  contractId: string | undefined;
  /** All configured flows; flows[0] is the default. */
  flows: FlowCredential[];
  defaultFlowName: string;
  /** Base dir for everything blip-mcp discovers/writes (default .mcp-blip). */
  dataDir: string;
  /** Where blip_map_flow writes componentized docs (default <dataDir>/flows). */
  flowsDir: string;
  allowWrites: boolean;
  timeoutMs: number;
  maxRetries: number;
  logLevel: LogLevel;
}

const TRUTHY = new Set(["1", "true", "yes", "y", "on"]);
const FALSY = new Set(["0", "false", "no", "n", "off", ""]);

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const value = raw.trim().toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  throw new BlipConfigError(`Invalid boolean for BLIP_ALLOW_WRITES: "${raw}". Use true/false.`);
}

/** Keep only env keys that have a non-empty, trimmed value. */
function compact(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.trim() !== "") out[key] = value.trim();
  }
  return out;
}

const TuningSchema = z.object({
  BLIP_BASE_URL: z.string().url().optional(),
  BLIP_ALLOW_WRITES: z.string().optional(),
  BLIP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(600_000).optional(),
  BLIP_MAX_RETRIES: z.coerce.number().int().min(0).max(10).optional(),
  BLIP_LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).optional(),
  BLIP_FLOWS_DIR: z.string().optional(),
});

function normalizeAuthorization(raw: string): string {
  const trimmed = raw.trim();
  if (/^key\s+/i.test(trimmed)) return `Key ${trimmed.replace(/^key\s+/i, "")}`;
  return `Key ${trimmed}`;
}

function computeAuthorization(identifier: string, accessKey: string): string {
  const token = Buffer.from(`${identifier}:${accessKey}`, "utf8").toString("base64");
  return `Key ${token}`;
}

export function authToken(authorization: string): string {
  return authorization.replace(/^key\s+/i, "").trim();
}

export function maskAuthorization(authorization: string): string {
  return authorization.replace(/^key\s+/i, "") ? "Key ****" : "(empty)";
}

export function configSecrets(config: BlipConfig): string[] {
  const out = new Set<string>();
  for (const flow of config.flows) {
    out.add(flow.authorization);
    out.add(authToken(flow.authorization));
  }
  return [...out].filter((value) => value.length >= 4);
}

/** Resolve a flow by name (case-insensitive); falls back to the default flow. */
export function resolveFlow(config: BlipConfig, name?: string): FlowCredential {
  if (!name) return config.flows[0]!;
  const match = config.flows.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (!match) {
    const names = config.flows.map((f) => f.name).join(", ");
    throw new BlipConfigError(`Unknown flow "${name}". Configured flows: ${names}.`);
  }
  return match;
}

interface FlowInputs {
  name: string;
  authorization?: string | undefined;
  botIdentifier?: string | undefined;
  accessKey?: string | undefined;
  contractId?: string | undefined;
  baseUrl?: string | undefined;
}

function buildFlow(inputs: FlowInputs, fallbackBaseUrl?: string): FlowCredential {
  let authorization: string;
  let credentialMode: CredentialMode;
  if (inputs.authorization) {
    authorization = normalizeAuthorization(inputs.authorization);
    credentialMode = "authorization";
  } else if (inputs.botIdentifier && inputs.accessKey) {
    authorization = computeAuthorization(inputs.botIdentifier, inputs.accessKey);
    credentialMode = "identifier+key";
  } else {
    throw new BlipConfigError(
      `Flow "${inputs.name}": missing credentials. Provide an Authorization header or identifier+access key.`,
    );
  }
  let baseUrl: string;
  if (inputs.baseUrl) baseUrl = inputs.baseUrl;
  else if (inputs.contractId) baseUrl = `https://${inputs.contractId}.http.msging.net`;
  else if (fallbackBaseUrl) baseUrl = fallbackBaseUrl;
  else baseUrl = "https://http.msging.net";
  baseUrl = baseUrl.replace(/\/+$/, "");
  return { name: inputs.name, baseUrl, authorization, credentialMode, contractId: inputs.contractId };
}

/** Discover extra flows declared as BLIP_FLOW_<n>_*. */
function parseExtraFlows(raw: Record<string, string>, fallbackBaseUrl: string): FlowCredential[] {
  const indices = new Set<number>();
  for (const key of Object.keys(raw)) {
    const m = /^BLIP_FLOW_(\d+)_[A-Z_]+$/.exec(key);
    if (m) indices.add(Number(m[1]));
  }
  const flows: FlowCredential[] = [];
  for (const n of [...indices].sort((a, b) => a - b)) {
    const p = `BLIP_FLOW_${n}_`;
    const name = raw[`${p}NAME`] ?? `flow${n}`;
    flows.push(
      buildFlow(
        {
          name,
          authorization: raw[`${p}AUTHORIZATION`],
          botIdentifier: raw[`${p}BOT_IDENTIFIER`],
          accessKey: raw[`${p}ACCESS_KEY`],
          contractId: raw[`${p}CONTRACT_ID`] ?? raw[`${p}SHORTNAME`],
          baseUrl: raw[`${p}BASE_URL`],
        },
        fallbackBaseUrl,
      ),
    );
  }
  return flows;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BlipConfig {
  const raw = compact(env);
  let tuning: z.infer<typeof TuningSchema>;
  try {
    tuning = TuningSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new BlipConfigError(`Invalid environment configuration: ${issues}`);
    }
    throw err;
  }

  const hasDefaultCreds =
    Boolean(raw["BLIP_AUTHORIZATION"]) ||
    Boolean(raw["BLIP_BOT_IDENTIFIER"] && raw["BLIP_ACCESS_KEY"]);
  if (!hasDefaultCreds) {
    throw new BlipConfigError(
      [
        "Missing Blip credentials. Provide ONE of:",
        '  • BLIP_AUTHORIZATION="Key <token>"  (copy from the Blip portal), or',
        "  • BLIP_BOT_IDENTIFIER + BLIP_ACCESS_KEY.",
        "See the README for where to find these in the portal.",
      ].join("\n"),
    );
  }

  const defaultFlow = buildFlow({
    name: raw["BLIP_FLOW_NAME"] ?? "default",
    authorization: raw["BLIP_AUTHORIZATION"],
    botIdentifier: raw["BLIP_BOT_IDENTIFIER"],
    accessKey: raw["BLIP_ACCESS_KEY"],
    contractId: raw["BLIP_CONTRACT_ID"] ?? raw["BLIP_SHORTNAME"],
    baseUrl: tuning.BLIP_BASE_URL,
  });

  const extraFlows = parseExtraFlows(raw, defaultFlow.baseUrl);
  const flows = [defaultFlow, ...extraFlows];

  const seen = new Set<string>();
  for (const f of flows) {
    const key = f.name.toLowerCase();
    if (seen.has(key)) throw new BlipConfigError(`Duplicate flow name "${f.name}".`);
    seen.add(key);
  }

  const dataDir = raw["BLIP_DATA_DIR"] ?? ".mcp-blip";

  return {
    baseUrl: defaultFlow.baseUrl,
    authorization: defaultFlow.authorization,
    credentialMode: defaultFlow.credentialMode,
    contractId: defaultFlow.contractId,
    flows,
    defaultFlowName: defaultFlow.name,
    dataDir,
    flowsDir: raw["BLIP_FLOWS_DIR"] ?? `${dataDir}/flows`,
    allowWrites: parseBool(raw["BLIP_ALLOW_WRITES"], false),
    timeoutMs: tuning.BLIP_REQUEST_TIMEOUT_MS ?? 30_000,
    maxRetries: tuning.BLIP_MAX_RETRIES ?? 3,
    logLevel: tuning.BLIP_LOG_LEVEL ?? "info",
  };
}

export function describeConfig(config: BlipConfig): string {
  const flowList = config.flows
    .map((f, i) => `      ${i === 0 ? "*" : "-"} ${f.name}  (${maskAuthorization(f.authorization)}, ${f.baseUrl})`)
    .join("\n");
  return [
    `  default flow    : ${config.defaultFlowName}`,
    `  base URL        : ${config.baseUrl}`,
    `  authorization   : ${maskAuthorization(config.authorization)}  (mode: ${config.credentialMode})`,
    `  flows (${config.flows.length}):`,
    flowList,
    `  data dir        : ${config.dataDir}`,
    `  flows dir       : ${config.flowsDir}`,
    `  writes          : ${config.allowWrites ? "ENABLED — side effects allowed" : "read-only (default)"}`,
    `  request timeout : ${config.timeoutMs} ms`,
    `  max retries     : ${config.maxRetries}`,
    `  log level       : ${config.logLevel}`,
  ].join("\n");
}
