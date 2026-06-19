import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseEnvFile, loadEnvFile, resolveEnvFile } from "../src/env-file.js";

describe("parseEnvFile", () => {
  it("parses keys, honors quotes, strips inline comments, skips junk", () => {
    const out = parseEnvFile(
      [
        "# a comment",
        "",
        "BLIP_CONTRACT_ID=nomos   # inline comment",
        'BLIP_AUTHORIZATION="Key abc def"',
        "BLIP_FLOW_NAME=roteadornomos",
        "not a valid line",
        "123BAD=x",
      ].join("\n"),
    );
    expect(out["BLIP_CONTRACT_ID"]).toBe("nomos");
    expect(out["BLIP_AUTHORIZATION"]).toBe("Key abc def");
    expect(out["BLIP_FLOW_NAME"]).toBe("roteadornomos");
    expect(out["123BAD"]).toBeUndefined();
  });
});

describe("loadEnvFile", () => {
  it("applies new keys but never overrides existing env", () => {
    const dir = mkdtempSync(join(tmpdir(), "blipenv-"));
    const file = join(dir, "blip.env");
    writeFileSync(file, "FOO=fromfile\nBAR=barval\n");
    const target: NodeJS.ProcessEnv = { FOO: "fromenv" };
    const applied = loadEnvFile(file, target);
    expect(target["FOO"]).toBe("fromenv");
    expect(target["BAR"]).toBe("barval");
    expect(applied).toContain("BAR");
    expect(applied).not.toContain("FOO");
  });

  it("returns [] for a missing file", () => {
    expect(loadEnvFile("/no/such/file.env", {})).toEqual([]);
  });
});

describe("resolveEnvFile", () => {
  it("honors an explicit BLIP_ENV_FILE", () => {
    expect(resolveEnvFile({ BLIP_ENV_FILE: "custom.env" })).toBe("custom.env");
  });
});
