import "server-only";

/** Codes the client produces itself, when no answer from Bizin arrived. */
export type LocalErrorCode = "network_error" | "timeout" | "not_configured" | "unexpected_response";

/**
 * A failed Partner API call. `code` is Bizin's stable error code (branch on it, never on `message`);
 * `status` is 0 when the request never got an answer.
 */
export class BizinError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;
  readonly params?: Record<string, unknown>;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(init: {
    status: number;
    code: string;
    message?: string;
    field?: string;
    params?: Record<string, unknown>;
    requestId?: string;
    retryAfterSeconds?: number;
  }) {
    super(init.message ?? init.code);
    this.name = "BizinError";
    this.status = init.status;
    this.code = init.code;
    this.field = init.field;
    this.params = init.params;
    this.requestId = init.requestId;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  static async fromResponse(res: Response, sentRequestId: string): Promise<BizinError> {
    const requestId = res.headers.get("x-request-id") ?? sentRequestId;
    const retryAfterSeconds = parseRetryAfter(res.headers.get("retry-after"));
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      const code = typeof b.code === "string" ? b.code : typeof b.error === "string" ? b.error : undefined;
      if (code) {
        return new BizinError({
          status: res.status,
          code,
          message: typeof b.message === "string" ? b.message : undefined,
          field: typeof b.field === "string" ? b.field : undefined,
          params: b.params && typeof b.params === "object" ? (b.params as Record<string, unknown>) : undefined,
          requestId: typeof b.request_id === "string" ? b.request_id : requestId,
          retryAfterSeconds,
        });
      }
    }
    return new BizinError({
      status: res.status,
      code: res.status >= 500 ? "internal_error" : "unexpected_response",
      message: `HTTP ${res.status} without an error body`,
      requestId,
      retryAfterSeconds,
    });
  }
}

export function isBizinError(e: unknown): e is BizinError {
  return e instanceof BizinError;
}

/** Seconds from a Retry-After header (delta-seconds or an HTTP date); undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return n;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - now) / 1000));
}
