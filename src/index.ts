#!/usr/bin/env node
/**
 * blip-mcp — MCP server for the Take Blip platform (stdio transport).
 *
 * Usage:
 *   blip-mcp                 start the MCP server on stdio (default)
 *   blip-mcp --self-test     validate credentials with a tiny read and exit
 *   blip-mcp --health        alias for --self-test
 *   blip-mcp --version       print version
 *   blip-mcp --help          print this help
 */
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BlipClient } from "./blip-client.js";
import {
  configSecrets,
  describeConfig,
  loadConfig,
  resolveFlow,
  type BlipConfig,
} from "./config.js";
import { BlipConfigError } from "./errors.js";
import { createLogger, type Logger } from "./logger.js";
import { loadEnvFile, resolveEnvFile } from "./env-file.js";
import { registerAllTools, type ToolContext } from "./tools/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { name: string; version: string };

function printHelp(): void {
  process.stdout.write(
    [
      `blip-mcp v${pkg.version} — MCP server for Take Blip (stdio)`,
      "",
      "Usage:",
      "  blip-mcp                start the MCP server on stdio (default)",
      "  blip-mcp --self-test    validate credentials with a tiny read and exit",
      "  blip-mcp --health       alias for --self-test",
      "  blip-mcp --version      print version and exit",
      "  blip-mcp --help         print this help and exit",
      "",
      "Configuration is read from environment variables (see README / .env.example).",
      "",
    ].join("\n"),
  );
}

function makeClient(flowBaseUrl: string, authorization: string, config: BlipConfig, logger: Logger): BlipClient {
  return new BlipClient({
    baseUrl: flowBaseUrl,
    authorization,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    logger,
  });
}

function buildServer(config: BlipConfig, logger: Logger): McpServer {
  const server = new McpServer({ name: "blip-mcp", version: pkg.version });
  const cache = new Map<string, BlipClient>();
  const getClient = (flowName?: string): BlipClient => {
    const flow = resolveFlow(config, flowName);
    let client = cache.get(flow.name);
    if (!client) {
      client = makeClient(flow.baseUrl, flow.authorization, config, logger);
      cache.set(flow.name, client);
    }
    return client;
  };
  const ctx: ToolContext = {
    server,
    client: getClient(),
    getClient,
    config,
    flows: config.flows,
    flowsDir: config.flowsDir,
    logger,
    secrets: configSecrets(config),
  };
  registerAllTools(ctx);
  return server;
}

/** Validate credentials with a 1-item contact read. Returns a process exit code. */
async function runSelfTest(config: BlipConfig, logger: Logger): Promise<number> {
  process.stdout.write(`blip-mcp v${pkg.version} — self-test\n\n${describeConfig(config)}\n\n`);
  const client = makeClient(config.baseUrl, config.authorization, config, logger);
  try {
    const res = await client.sendCommand({
      method: "get",
      to: "postmaster@crm.msging.net",
      uri: "/contacts?$take=1",
    });
    const resource = res.resource as { total?: number; items?: unknown[] } | undefined;
    const total = resource?.total ?? resource?.items?.length ?? 0;
    process.stdout.write(`OK — credentials valid. Sample read returned total=${total}.\n`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(`FAILED — ${message}\n`);
    process.stdout.write(
      "\nCheck BLIP_AUTHORIZATION (or BLIP_BOT_IDENTIFIER/BLIP_ACCESS_KEY) and BLIP_CONTRACT_ID.\n",
    );
    return 1;
  }
}

async function startServer(config: BlipConfig, logger: Logger): Promise<void> {
  const server = buildServer(config, logger);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(
    `ready — base=${config.baseUrl} flows=${config.flows.length} ` +
      `writes=${config.allowWrites ? "ENABLED" : "read-only"} (v${pkg.version})`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  // Optionally load a blip.env file (real env always wins).
  const envFile = resolveEnvFile();
  if (envFile) {
    const applied = loadEnvFile(envFile);
    if (applied.length > 0) process.stderr.write(`[blip-mcp] loaded ${applied.length} variable(s) from ${envFile}
`);
  }

  let config: BlipConfig;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof BlipConfigError) {
      process.stderr.write(`\n[blip-mcp] configuration error:\n${err.message}\n\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const logger = createLogger({ level: config.logLevel, secrets: configSecrets(config) });

  if (argv.includes("--self-test") || argv.includes("--health")) {
    process.exitCode = await runSelfTest(config, logger);
    return;
  }

  await startServer(config, logger);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[blip-mcp] fatal: ${message}\n`);
  process.exit(1);
});
