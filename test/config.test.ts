import { describe, it, expect } from "vitest";
import { loadConfig, maskAuthorization, authToken } from "../src/config.js";
import { BlipConfigError } from "../src/errors.js";

describe("loadConfig — credentials", () => {
  it("computes the Authorization header from identifier + access key (base64)", () => {
    const cfg = loadConfig({
      BLIP_BOT_IDENTIFIER: "mybot",
      BLIP_ACCESS_KEY: "s3cret",
      BLIP_CONTRACT_ID: "acme",
    });
    const expected = `Key ${Buffer.from("mybot:s3cret", "utf8").toString("base64")}`;
    expect(cfg.authorization).toBe(expected);
    expect(cfg.credentialMode).toBe("identifier+key");
  });

  it("uses BLIP_AUTHORIZATION verbatim and normalizes the scheme", () => {
    expect(loadConfig({ BLIP_AUTHORIZATION: "Key abc123", BLIP_CONTRACT_ID: "acme" }).authorization).toBe(
      "Key abc123",
    );
    expect(loadConfig({ BLIP_AUTHORIZATION: "key abc123", BLIP_CONTRACT_ID: "acme" }).authorization).toBe(
      "Key abc123",
    );
    // Bare token (no scheme) gets the Key prefix added.
    expect(loadConfig({ BLIP_AUTHORIZATION: "abc123", BLIP_CONTRACT_ID: "acme" }).authorization).toBe(
      "Key abc123",
    );
  });

  it("prefers BLIP_AUTHORIZATION over identifier/key", () => {
    const cfg = loadConfig({
      BLIP_AUTHORIZATION: "Key ready",
      BLIP_BOT_IDENTIFIER: "x",
      BLIP_ACCESS_KEY: "y",
    });
    expect(cfg.authorization).toBe("Key ready");
    expect(cfg.credentialMode).toBe("authorization");
  });

  it("throws a BlipConfigError when no credentials are present", () => {
    expect(() => loadConfig({ BLIP_CONTRACT_ID: "acme" })).toThrow(BlipConfigError);
  });
});

describe("loadConfig — host resolution", () => {
  it("builds the host from the contract id", () => {
    expect(loadConfig({ BLIP_AUTHORIZATION: "Key x", BLIP_CONTRACT_ID: "acme" }).baseUrl).toBe(
      "https://acme.http.msging.net",
    );
  });

  it("accepts BLIP_SHORTNAME as an alias", () => {
    expect(loadConfig({ BLIP_AUTHORIZATION: "Key x", BLIP_SHORTNAME: "acme" }).baseUrl).toBe(
      "https://acme.http.msging.net",
    );
  });

  it("falls back to the shared host when no contract is given", () => {
    expect(loadConfig({ BLIP_AUTHORIZATION: "Key x" }).baseUrl).toBe("https://http.msging.net");
  });

  it("honors an explicit BLIP_BASE_URL and trims trailing slashes", () => {
    expect(
      loadConfig({ BLIP_AUTHORIZATION: "Key x", BLIP_BASE_URL: "https://custom.example.com/" }).baseUrl,
    ).toBe("https://custom.example.com");
  });
});

describe("loadConfig — flags and masking", () => {
  it("defaults allowWrites to false and parses truthy values", () => {
    expect(loadConfig({ BLIP_AUTHORIZATION: "Key x" }).allowWrites).toBe(false);
    expect(loadConfig({ BLIP_AUTHORIZATION: "Key x", BLIP_ALLOW_WRITES: "true" }).allowWrites).toBe(true);
    expect(loadConfig({ BLIP_AUTHORIZATION: "Key x", BLIP_ALLOW_WRITES: "1" }).allowWrites).toBe(true);
    expect(loadConfig({ BLIP_AUTHORIZATION: "Key x", BLIP_ALLOW_WRITES: "no" }).allowWrites).toBe(false);
  });

  it("rejects an invalid boolean for BLIP_ALLOW_WRITES", () => {
    expect(() => loadConfig({ BLIP_AUTHORIZATION: "Key x", BLIP_ALLOW_WRITES: "maybe" })).toThrow(
      BlipConfigError,
    );
  });

  it("never reveals token characters when masking", () => {
    const masked = maskAuthorization("Key super-secret-token-value");
    expect(masked).toBe("Key ****");
    expect(masked).not.toContain("secret");
    expect(authToken("Key super-secret-token-value")).toBe("super-secret-token-value");
  });
});
