import { describe, it, expect, vi } from "vitest";
import { BlipClient } from "../src/blip-client.js";
import { registerAllTools, type ToolContext } from "../src/tools/index.js";
import { configSecrets, type BlipConfig } from "../src/config.js";
import { silentLogger } from "../src/logger.js";
import type { ToolResult } from "../src/tools/shared.js";

type Handler = (args: Record<string, unknown>, extra: unknown) => Promise<ToolResult>;

function baseConfig(allowWrites: boolean): BlipConfig {
  return {
    baseUrl: "https://acme.http.msging.net",
    authorization: "Key test-token-abcdef",
    credentialMode: "authorization",
    contractId: "acme",
    allowWrites,
    timeoutMs: 30_000,
    maxRetries: 0,
    logLevel: "error",
    flows: [{ name: "default", baseUrl: "https://acme.http.msging.net", authorization: "Key test-token-abcdef", credentialMode: "authorization", contractId: "acme" }],
    defaultFlowName: "default",
    flowsDir: "flows",
  };
}

/** Register all tools against a capturing fake server and return the handler map. */
function setup(allowWrites: boolean, fetchImpl: ReturnType<typeof vi.fn>) {
  const handlers = new Map<string, Handler>();
  const fakeServer = {
    registerTool: (name: string, _config: unknown, handler: Handler) => {
      handlers.set(name, handler);
    },
  };
  const config = baseConfig(allowWrites);
  const client = new BlipClient({
    baseUrl: config.baseUrl,
    authorization: config.authorization,
    maxRetries: 0,
    fetchImpl: fetchImpl as unknown as (input: string, init: RequestInit) => Promise<Response>,
    sleepImpl: async () => undefined,
  });
  const ctx: ToolContext = {
    server: fakeServer as unknown as ToolContext["server"],
    client,
    getClient: () => client,
    config,
    flows: config.flows,
    flowsDir: config.flowsDir,
    logger: silentLogger,
    secrets: configSecrets(config),
  };
  registerAllTools(ctx);
  return { handlers, fetchImpl };
}

function call(handlers: Map<string, Handler>, name: string, args: Record<string, unknown>) {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`tool not registered: ${name}`);
  return handler(args, {});
}

describe("write guardrail (BLIP_ALLOW_WRITES=false)", () => {
  it("blip_send_message refuses and never hits the network", async () => {
    const fetchImpl = vi.fn();
    const { handlers } = setup(false, fetchImpl);
    const res = await call(handlers, "blip_send_message", {
      to: "5511999999999@wa.gw.msging.net",
      content: "hello",
      type: "text/plain",
    });
    expect(res.content[0]!.text).toContain("READ-ONLY");
    expect(res.isError).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blip_set_bucket refuses without writing", async () => {
    const fetchImpl = vi.fn();
    const { handlers } = setup(false, fetchImpl);
    const res = await call(handlers, "blip_set_bucket", { id: "k", value: { a: 1 }, type: "application/json" });
    expect(res.content[0]!.text).toContain("READ-ONLY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blip_command refuses non-GET methods but allows GET", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "success" }), { status: 200 }));
    const { handlers } = setup(false, fetchImpl);

    const blocked = await call(handlers, "blip_command", { method: "set", uri: "/buckets/x", resource: { a: 1 } });
    expect(blocked.content[0]!.text).toContain("READ-ONLY");
    expect(fetchImpl).not.toHaveBeenCalled();

    const allowed = await call(handlers, "blip_command", { method: "get", uri: "/contacts?$take=1" });
    expect(allowed.isError).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("write guardrail (BLIP_ALLOW_WRITES=true)", () => {
  it("blip_send_message executes when writes are enabled", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const { handlers } = setup(true, fetchImpl);
    const res = await call(handlers, "blip_send_message", {
      to: "5511999999999@wa.gw.msging.net",
      content: "hello",
      type: "text/plain",
    });
    expect(res.isError).toBeUndefined();
    expect(res.content[0]!.text).toContain("accepted");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://acme.http.msging.net/messages");
  });
});
