/**
 * Shared helpers and types for tool modules.
 *
 * Conventions:
 *   - Every tool handler runs inside {@link attempt}, which converts thrown
 *     errors into a redacted `isError` result (no secret ever escapes).
 *   - Read tools set `annotations.readOnlyHint`.
 *   - Write tools check {@link ToolContext.config}.allowWrites and, when off,
 *     return {@link readOnlyNotice} WITHOUT touching the network.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BlipClient } from "../blip-client.js";
import type { BlipConfig, FlowCredential } from "../config.js";
import type { Logger } from "../logger.js";
import { redactSecrets } from "../errors.js";

export interface ToolContext {
  server: McpServer;
  /** Client for the default flow. */
  client: BlipClient;
  /** Get (cached) a client for a named flow; default flow when omitted. */
  getClient: (flowName?: string) => BlipClient;
  config: BlipConfig;
  flows: FlowCredential[];
  flowsDir: string;
  logger: Logger;
  /** Secrets to scrub from any text returned to the model. */
  secrets: string[];
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function jsonResult(data: unknown): ToolResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return textResult(text);
}

/** Friendly, non-error notice returned when a write is blocked by the guardrail. */
export function readOnlyNotice(attemptedAction: string): ToolResult {
  return textResult(
    [
      "READ-ONLY MODE is ON, so this action was NOT executed.",
      "",
      `Attempted: ${attemptedAction}`,
      "",
      "This tool has real side effects (it can message actual users or change",
      "stored data). To enable it, set BLIP_ALLOW_WRITES=true and restart the",
      "MCP server.",
    ].join("\n"),
  );
}

export function errorResult(err: unknown, secrets: string[]): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text", text: `ERROR: ${redactSecrets(message, secrets)}` }],
    isError: true,
  };
}

/**
 * Run a tool body, catching any error and returning a safe, redacted result.
 * Keeping `args` out of this wrapper preserves the SDK's type inference.
 */
export async function attempt(ctx: ToolContext, body: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await body();
  } catch (err) {
    ctx.logger.error(`tool error: ${err instanceof Error ? err.message : String(err)}`);
    return errorResult(err, ctx.secrets);
  }
}

/** Build a Blip OData-style query string with literal $skip/$take/$filter keys. */
export function buildListQuery(skip: number, take: number, filter?: string): string {
  const parts = [`$skip=${skip}`, `$take=${take}`];
  if (filter) parts.push(`$filter=${encodeURIComponent(filter)}`);
  return parts.join("&");
}

/** Encode a bucket id for a URL path while keeping ':' literal (namespace:key). */
export function encodeBucketId(id: string): string {
  return encodeURIComponent(id).replace(/%3A/gi, ":");
}

/**
 * Generate likely phoneNumber formats to search a Blip CRM, which stores them
 * inconsistently (+55…, 55…, or local DDD+number). Ordered most-likely-first.
 */
export function phoneCandidates(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const list: string[] = [];
  if (digits.startsWith("55")) {
    list.push(`+${digits}`, digits, digits.slice(2), `+${digits.slice(2)}`);
  } else {
    list.push(digits, `+55${digits}`, `55${digits}`, `+${digits}`);
  }
  return [...new Set(list)].filter((v) => v.replace(/\D/g, "").length >= 8);
}
