/**
 * Error types and secret redaction for blip-mcp.
 *
 * Redaction is defensive: even if a token somehow lands in an error message or
 * a response body, {@link redactSecrets} scrubs it before it can reach a log
 * line or a tool result.
 */

/**
 * Remove known secrets and any `Key <token>` authorization header from a string.
 * Safe to call on arbitrary text (log lines, HTTP bodies, error messages).
 */
export function redactSecrets(text: string, secrets: ReadonlyArray<string> = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) {
      out = out.split(secret).join("«redacted»");
    }
  }
  // Belt-and-suspenders: scrub anything shaped like a Blip authorization header.
  out = out.replace(/\bKey\s+[A-Za-z0-9+/=._-]{6,}/gi, "Key «redacted»");
  return out;
}

/** Base class for every error this package throws on purpose. */
export class BlipError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Configuration / environment problem (missing credentials, bad host, etc.). */
export class BlipConfigError extends BlipError {}

/** A request exceeded the configured timeout. */
export class BlipTimeoutError extends BlipError {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Request to Blip timed out after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
  }
}

/** A non-2xx HTTP response from the Blip API (e.g. 401 auth, 500 server). */
export class BlipHttpError extends BlipError {
  readonly status: number;
  readonly bodyExcerpt: string;
  constructor(status: number, bodyExcerpt = "") {
    super(`Blip API responded with HTTP ${status}${bodyExcerpt ? `: ${bodyExcerpt}` : ""}`);
    this.status = status;
    this.bodyExcerpt = bodyExcerpt;
  }
}

/**
 * A command was delivered but Blip answered with `status: "failure"`.
 * Carries the structured `reason` so callers get a clear message.
 */
export class BlipCommandError extends BlipError {
  readonly code: number | undefined;
  readonly description: string | undefined;
  readonly method: string;
  readonly uri: string;
  constructor(params: {
    code?: number | undefined;
    description?: string | undefined;
    method: string;
    uri: string;
  }) {
    const reason = [
      params.code != null ? `code ${params.code}` : null,
      params.description ?? null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" — ");
    super(
      `Blip command failed (${params.method.toUpperCase()} ${params.uri})${reason ? `: ${reason}` : ""}`,
    );
    this.code = params.code;
    this.description = params.description;
    this.method = params.method;
    this.uri = params.uri;
  }
}
