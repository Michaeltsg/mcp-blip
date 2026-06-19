/**
 * Optional `.env`-style file loader.
 *
 * blip-mcp is configured from environment variables. For convenience — and
 * especially for multi-flow setups with many variables — it can also load a
 * `blip.env` file from the working directory (or BLIP_ENV_FILE). Real
 * environment variables always win (the file never overrides them).
 *
 * This keeps all your credentials in ONE gitignored file inside your project,
 * instead of a long `env` block in `.mcp.json`.
 */
import { existsSync, readFileSync } from "node:fs";

/** Parse `KEY=value` lines, honoring quotes and stripping inline comments. */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * Apply an env file into `target` (default process.env). Existing keys are kept
 * unless `override` is true. Returns the list of keys that were applied.
 */
export function loadEnvFile(
  filePath: string,
  target: NodeJS.ProcessEnv = process.env,
  options: { override?: boolean } = {},
): string[] {
  if (!existsSync(filePath)) return [];
  const parsed = parseEnvFile(readFileSync(filePath, "utf8"));
  const applied: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (value === "") continue;
    if (!options.override && target[key] !== undefined) continue;
    target[key] = value;
    applied.push(key);
  }
  return applied;
}

/**
 * Decide which env file to auto-load:
 *   - BLIP_ENV_FILE if set (even to a path that doesn't exist → no load), else
 *   - ./blip.env if it exists.
 */
export function resolveEnvFile(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (typeof env["BLIP_ENV_FILE"] === "string" && env["BLIP_ENV_FILE"] !== "") {
    return env["BLIP_ENV_FILE"];
  }
  if (existsSync("blip.env")) return "blip.env";
  return undefined;
}
