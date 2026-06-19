import { describe, it, expect, vi } from "vitest";
import { BlipClient } from "../src/blip-client.js";
import { BlipCommandError, BlipHttpError } from "../src/errors.js";

const AUTH = "Key dGVzdC10b2tlbi12YWx1ZQ==";
const BASE = "https://acme.http.msging.net";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function makeClient(fetchImpl: ReturnType<typeof vi.fn>, maxRetries = 3): BlipClient {
  return new BlipClient({
    baseUrl: BASE,
    authorization: AUTH,
    maxRetries,
    fetchImpl: fetchImpl as unknown as (input: string, init: RequestInit) => Promise<Response>,
    sleepImpl: async () => undefined,
  });
}

describe("BlipClient.sendCommand", () => {
  it("posts a well-formed envelope with the Authorization header", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "success", resource: { ok: true } }));
    const client = makeClient(fetchImpl);

    const res = await client.sendCommand({
      method: "get",
      to: "postmaster@crm.msging.net",
      uri: "/contacts?$take=1",
    });

    expect(res.resource).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BASE}/commands`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(AUTH);
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string);
    expect(body.method).toBe("get");
    expect(body.uri).toBe("/contacts?$take=1");
    expect(body.to).toBe("postmaster@crm.msging.net");
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
  });

  it("omits optional envelope fields when not provided", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "success" }));
    const client = makeClient(fetchImpl);
    await client.sendCommand({ method: "get", uri: "/buckets/x" });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body).not.toHaveProperty("to");
    expect(body).not.toHaveProperty("type");
    expect(body).not.toHaveProperty("resource");
  });

  it("throws BlipCommandError with code + description on status: failure", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: "failure", reason: { code: 67, description: "Resource not found" } }),
    );
    const client = makeClient(fetchImpl);
    await expect(
      client.sendCommand({ method: "get", to: "postmaster@crm.msging.net", uri: "/contacts/none" }),
    ).rejects.toBeInstanceOf(BlipCommandError);
    await expect(
      client.sendCommand({ method: "get", to: "postmaster@crm.msging.net", uri: "/contacts/none" }),
    ).rejects.toMatchObject({ code: 67, description: "Resource not found" });
  });
});

describe("BlipClient retry + error handling", () => {
  it("retries on HTTP 500 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500))
      .mockResolvedValueOnce(jsonResponse({ status: "success", resource: { recovered: true } }));
    const client = makeClient(fetchImpl);
    const res = await client.sendCommand({ method: "get", uri: "/x" });
    expect(res.resource).toEqual({ recovered: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on HTTP 400 and throws BlipHttpError", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "bad request" }, 400));
    const client = makeClient(fetchImpl);
    await expect(client.sendCommand({ method: "get", uri: "/x" })).rejects.toBeInstanceOf(BlipHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("redacts the token if it ever appears in an error body", async () => {
    const leak = `server echoed your header: ${AUTH}`;
    const fetchImpl = vi.fn(async () => new Response(leak, { status: 500 }));
    const client = makeClient(fetchImpl, 0);
    let caught: unknown;
    try {
      await client.sendCommand({ method: "get", uri: "/x" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BlipHttpError);
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).not.toContain("dGVzdC10b2tlbi12YWx1ZQ==");
    expect(message).toContain("redacted");
  });
});

describe("BlipClient.sendMessage", () => {
  it("accepts a 2xx response and returns an id", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const client = makeClient(fetchImpl);
    const res = await client.sendMessage({ to: "5511999999999@wa.gw.msging.net", content: "hi" });
    expect(res.status).toBe("accepted");
    expect(typeof res.id).toBe("string");
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BASE}/messages`);
  });
});
