/**
 * Tiny leveled logger that writes to **stderr only**.
 *
 * This is critical: in a stdio MCP server, stdout is the JSON-RPC channel.
 * Anything written to stdout that is not a protocol message corrupts the
 * connection, so every diagnostic goes to stderr and is redacted first.
 */
import { redactSecrets } from "./errors.js";

export type LogLevel = "error" | "warn" | "info" | "debug";

const LEVEL_RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface Logger {
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Known secret strings to scrub from every line. */
  secrets?: ReadonlyArray<string>;
  /** Sink override (defaults to process.stderr). Used by tests. */
  write?: (line: string) => void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = LEVEL_RANK[options.level ?? "info"];
  const secrets = options.secrets ?? [];
  const sink = options.write ?? ((line: string) => void process.stderr.write(line));

  const emit = (level: LogLevel, message: string, meta?: unknown): void => {
    if (LEVEL_RANK[level] > threshold) return;
    let line = `[blip-mcp] ${level.toUpperCase().padEnd(5)} ${message}`;
    if (meta !== undefined) {
      try {
        line += ` ${JSON.stringify(meta)}`;
      } catch {
        line += " [meta not serializable]";
      }
    }
    sink(`${redactSecrets(line, secrets)}\n`);
  };

  return {
    error: (message, meta) => emit("error", message, meta),
    warn: (message, meta) => emit("warn", message, meta),
    info: (message, meta) => emit("info", message, meta),
    debug: (message, meta) => emit("debug", message, meta),
  };
}

/** A logger that drops everything. Handy for tests. */
export const silentLogger: Logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
};
