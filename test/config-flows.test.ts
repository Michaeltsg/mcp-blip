import { describe, it, expect } from "vitest";
import { loadConfig, resolveFlow, configSecrets } from "../src/config.js";
import { BlipConfigError } from "../src/errors.js";

describe("multi-flow config", () => {
  it("names the default flow from BLIP_FLOW_NAME", () => {
    const c = loadConfig({ BLIP_AUTHORIZATION: "Key aaaa", BLIP_CONTRACT_ID: "nomos", BLIP_FLOW_NAME: "roteadornomos" });
    expect(c.defaultFlowName).toBe("roteadornomos");
    expect(c.flows[0]!.name).toBe("roteadornomos");
    expect(c.flows[0]!.baseUrl).toBe("https://nomos.http.msging.net");
  });

  it("adds numbered extra flows and falls back to the default host when none given", () => {
    const c = loadConfig({
      BLIP_AUTHORIZATION: "Key aaaa",
      BLIP_CONTRACT_ID: "nomos",
      BLIP_FLOW_NAME: "mae",
      BLIP_FLOW_1_NAME: "fila",
      BLIP_FLOW_1_AUTHORIZATION: "Key bbbb",
      BLIP_FLOW_1_CONTRACT_ID: "fila-bot",
      BLIP_FLOW_2_NAME: "ia",
      BLIP_FLOW_2_BOT_IDENTIFIER: "iabot",
      BLIP_FLOW_2_ACCESS_KEY: "kkkk",
    });
    expect(c.flows.map((f) => f.name)).toEqual(["mae", "fila", "ia"]);
    expect(resolveFlow(c, "fila").baseUrl).toBe("https://fila-bot.http.msging.net");
    expect(resolveFlow(c, "ia").baseUrl).toBe("https://nomos.http.msging.net");
    expect(resolveFlow(c, "ia").credentialMode).toBe("identifier+key");
  });

  it("resolveFlow defaults to the first flow and is case-insensitive", () => {
    const c = loadConfig({ BLIP_AUTHORIZATION: "Key aaaa", BLIP_FLOW_NAME: "Mae" });
    expect(resolveFlow(c).name).toBe("Mae");
    expect(resolveFlow(c, "mae").name).toBe("Mae");
  });

  it("throws on unknown flow", () => {
    const c = loadConfig({ BLIP_AUTHORIZATION: "Key aaaa" });
    expect(() => resolveFlow(c, "nope")).toThrow(BlipConfigError);
  });

  it("collects secrets from all flows", () => {
    const c = loadConfig({
      BLIP_AUTHORIZATION: "Key aaaabbbb",
      BLIP_FLOW_1_NAME: "x",
      BLIP_FLOW_1_AUTHORIZATION: "Key ccccdddd",
    });
    const s = configSecrets(c);
    expect(s).toContain("Key aaaabbbb");
    expect(s).toContain("Key ccccdddd");
  });

  it("rejects duplicate flow names", () => {
    expect(() =>
      loadConfig({
        BLIP_AUTHORIZATION: "Key aaaa",
        BLIP_FLOW_NAME: "dup",
        BLIP_FLOW_1_NAME: "dup",
        BLIP_FLOW_1_AUTHORIZATION: "Key bbbb",
      }),
    ).toThrow(BlipConfigError);
  });
});
