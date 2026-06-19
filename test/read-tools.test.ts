import { describe, it, expect, vi } from "vitest";
import { BlipClient } from "../src/blip-client.js";
import { registerAllTools, type ToolContext } from "../src/tools/index.js";
import { configSecrets, type BlipConfig } from "../src/config.js";
import { silentLogger } from "../src/logger.js";
import { phoneCandidates, type ToolResult } from "../src/tools/shared.js";

type Handler = (args: Record<string, unknown>, extra: unknown) => Promise<ToolResult>;

function setup() {
  const handlers = new Map<string, Handler>();
  const fakeServer = {
    registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
  };
  const config: BlipConfig = {
    baseUrl: "https://acme.http.msging.net",
    authorization: "Key tok-abcdef",
    credentialMode: "authorization",
    contractId: "acme",
    allowWrites: false,
    timeoutMs: 30_000,
    maxRetries: 0,
    logLevel: "error",
    flows: [{ name: "default", baseUrl: "https://acme.http.msging.net", authorization: "Key test-token-abcdef", credentialMode: "authorization", contractId: "acme" }],
    defaultFlowName: "default",
    flowsDir: "flows",
  };
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "success", resource: { ok: true } }), { status: 200 }));
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
  const lastUri = () => {
    const body = JSON.parse(fetchImpl.mock.calls.at(-1)![1].body as string);
    return body.uri as string;
  };
  return { handlers, fetchImpl, lastUri };
}

const call = (handlers: Map<string, Handler>, name: string, args: Record<string, unknown>) =>
  handlers.get(name)!(args, {});

describe("journey-debugging read tools", () => {
  it("registers the new context/threads/flow/event tools", () => {
    const { handlers } = setup();
    for (const name of [
      "blip_get_context",
      "blip_get_context_variable",
      "blip_get_thread",
      "blip_list_threads",
      "blip_get_flow",
      "blip_get_event_track",
      "blip_list_event_categories",
    ]) {
      expect(handlers.has(name)).toBe(true);
    }
  });

  it("blip_get_context builds /contexts/{identity}?skip&take (no $ prefix)", async () => {
    const { handlers, lastUri } = setup();
    await call(handlers, "blip_get_context", { identity: "5511999@wa.gw.msging.net", skip: 0, take: 50 });
    expect(lastUri()).toBe("/contexts/5511999%40wa.gw.msging.net?skip=0&take=50");
  });

  it("blip_get_context_variable encodes a stateid@flow variable", async () => {
    const { handlers, lastUri } = setup();
    await call(handlers, "blip_get_context_variable", { identity: "u@x", variable: "stateid@123" });
    expect(lastUri()).toBe("/contexts/u%40x/stateid%40123");
  });

  it("blip_get_thread uses /threads/{identity}?$take", async () => {
    const { handlers, lastUri } = setup();
    await call(handlers, "blip_get_thread", { identity: "u@x", take: 20 });
    expect(lastUri()).toBe("/threads/u%40x?$take=20");
  });

  it("blip_get_bucket keeps the ':' in namespaced keys", async () => {
    const { handlers, lastUri } = setup();
    await call(handlers, "blip_get_bucket", { id: "blip_portal:builder_published_flow" });
    expect(lastUri()).toBe("/buckets/blip_portal:builder_published_flow");
  });

  it("blip_get_flow defaults to the published flow bucket", async () => {
    const { handlers, lastUri } = setup();
    await call(handlers, "blip_get_flow", { key: "blip_portal:builder_published_flow" });
    expect(lastUri()).toBe("/buckets/blip_portal:builder_published_flow");
  });
});

describe("phone search", () => {
  it("phoneCandidates generates formats with/without country code", () => {
    expect(phoneCandidates("11997053906")).toEqual([
      "11997053906",
      "+5511997053906",
      "5511997053906",
      "+11997053906",
    ]);
    expect(phoneCandidates("+55 11 99705-3906")[0]).toBe("+5511997053906");
  });

  it("blip_find_contact_by_phone tries formats until one matches", async () => {
    const { handlers, fetchImpl } = setup();
    fetchImpl.mockReset();
    const body = (resource: unknown) =>
      new Response(JSON.stringify({ status: "success", resource }), { status: 200 });
    fetchImpl
      .mockResolvedValueOnce(body({ total: 0, items: [] }))
      .mockResolvedValueOnce(body({ total: 1, items: [{ identity: "x", phoneNumber: "5511997053906" }] }));
    const res = await call(handlers, "blip_find_contact_by_phone", { phone: "11997053906" });
    const out = JSON.parse(res.content[0]!.text);
    expect(out.found).toBe(true);
    expect(out.matchedFormat).toBe("+5511997053906");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
