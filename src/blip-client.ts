/**
 * Thin client over the Blip HTTP/Command API.
 *
 * Responsibilities:
 *   - Build the command/message envelopes and the `Authorization: Key ...` header.
 *   - Enforce a per-request timeout (AbortController).
 *   - Retry with exponential backoff + jitter on 429 / 5xx / network errors.
 *   - Turn `status: "failure"` command responses into a clear thrown error.
 *
 * It never logs the authorization header, and any text it surfaces from the
 * wire is run through redactSecrets first.
 */
import { randomUUID } from "node:crypto";
import {
  BlipCommandError,
  BlipHttpError,
  BlipTimeoutError,
  redactSecrets,
} from "./errors.js";
import type { Logger } from "./logger.js";
import { silentLogger } from "./logger.js";

export type CommandMethod = "get" | "set" | "merge" | "delete";

export interface SendCommandParams {
  method: CommandMethod;
  uri: string;
  to?: string | undefined;
  type?: string | undefined;
  resource?: unknown;
}

export interface SendMessageParams {
  to: string;
  content: unknown;
  type?: string | undefined;
}

/** Shape of a Blip command response envelope (only the fields we rely on). */
export interface BlipCommandResponse {
  id?: string;
  from?: string;
  to?: string;
  method?: string;
  status?: "success" | "failure" | "pending";
  uri?: string;
  type?: string;
  resource?: unknown;
  reason?: { code?: number; description?: string };
  [key: string]: unknown;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface BlipClientOptions {
  baseUrl: string;
  authorization: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
  logger?: Logger;
}

const MAX_BACKOFF_MS = 8_000;
const MAX_RETRY_AFTER_MS = 30_000;

export class BlipClient {
  private readonly baseUrl: string;
  private readonly authorization: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: Logger;
  private readonly secrets: string[];

  constructor(options: BlipClientOptions) {
    const resolvedFetch = options.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
    if (typeof resolvedFetch !== "function") {
      throw new Error(
        "global fetch is not available. blip-mcp requires Node.js 18+ (or pass fetchImpl).",
      );
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.authorization = options.authorization;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.fetchImpl = resolvedFetch;
    this.sleep = options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.logger = options.logger ?? silentLogger;
    this.secrets = [this.authorization, this.authorization.replace(/^key\s+/i, "")].filter(
      (value) => value.length >= 4,
    );
  }

  /** Send a command to `/commands` and return the response envelope. */
  async sendCommand(params: SendCommandParams): Promise<BlipCommandResponse> {
    const envelope: Record<string, unknown> = {
      id: randomUUID(),
      method: params.method,
      uri: params.uri,
    };
    if (params.to !== undefined) envelope["to"] = params.to;
    if (params.type !== undefined) envelope["type"] = params.type;
    if (params.resource !== undefined) envelope["resource"] = params.resource;

    const response = await this.post("/commands", envelope);
    const body = (await this.readJson(response)) as BlipCommandResponse | undefined;
    const result = body ?? {};

    if (result.status === "failure") {
      throw new BlipCommandError({
        code: result.reason?.code,
        description: result.reason?.description,
        method: params.method,
        uri: params.uri,
      });
    }
    return result;
  }

  /** Send a message to `/messages`. Blip replies 2xx with no useful body. */
  async sendMessage(params: SendMessageParams): Promise<{ status: "accepted"; id: string }> {
    const id = randomUUID();
    const envelope = {
      id,
      to: params.to,
      type: params.type ?? "text/plain",
      content: params.content,
    };
    const response = await this.post("/messages", envelope);
    await this.drain(response);
    return { status: "accepted", id };
  }

  // --- internals -------------------------------------------------------------

  private async post(path: string, payload: unknown): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: this.authorization,
      },
      body: JSON.stringify(payload),
    };

    let attempt = 0;
    for (;;) {
      try {
        const response = await this.fetchWithTimeout(url, init);
        if (response.ok) return response;

        if (this.isRetryableStatus(response.status) && attempt < this.maxRetries) {
          const delay = this.backoffDelay(attempt, response);
          await this.drain(response);
          this.logger.warn(
            `HTTP ${response.status} on ${path}; retry ${attempt + 1}/${this.maxRetries} in ${delay}ms`,
          );
          attempt += 1;
          await this.sleep(delay);
          continue;
        }
        throw new BlipHttpError(response.status, await this.errorExcerpt(response));
      } catch (err) {
        if (err instanceof BlipHttpError) throw err;
        const retryable = err instanceof BlipTimeoutError || this.isNetworkError(err);
        if (retryable && attempt < this.maxRetries) {
          const delay = this.backoffDelay(attempt);
          const label = err instanceof Error ? err.name : "network error";
          this.logger.warn(`${label} on ${path}; retry ${attempt + 1}/${this.maxRetries} in ${delay}ms`);
          attempt += 1;
          await this.sleep(delay);
          continue;
        }
        throw err;
      }
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) throw new BlipTimeoutError(this.timeoutMs);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private isRetryableStatus(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
  }

  private isNetworkError(err: unknown): boolean {
    // The fetch standard throws a TypeError for network-level failures.
    return err instanceof TypeError;
  }

  private backoffDelay(attempt: number, response?: Response): number {
    if (response) {
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter !== null) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) {
          return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
        }
      }
    }
    const base = 500 * 2 ** attempt;
    const jitter = Math.random() * base * 0.25;
    return Math.min(Math.round(base + jitter), MAX_BACKOFF_MS);
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await this.safeText(response);
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return { raw: redactSecrets(text, this.secrets) };
    }
  }

  private async errorExcerpt(response: Response): Promise<string> {
    const text = await this.safeText(response);
    return redactSecrets(text.slice(0, 500), this.secrets);
  }

  private async safeText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }

  private async drain(response: Response): Promise<void> {
    await this.safeText(response);
  }
}
