import "server-only";

import { BizinError } from "./error";

export const DEFAULT_BIZIN_API_BASE = "https://api.bizin.app/partner/v1";

export interface TransportRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path below the base, already percent-escaped, with its query string. */
  path: string;
  headers: Record<string, string>;
  body?: string | FormData;
  signal: AbortSignal;
}

/** Sends one request and returns Bizin's raw answer. The live one is fetch; the mock answers in memory. */
export type Transport = (req: TransportRequest) => Promise<Response>;

export type BizinMode = "live" | "mock";

/** Read at call time, never at import: the build has no secrets. */
export function bizinMode(): BizinMode {
  return process.env.BIZIN_MODE === "mock" ? "mock" : "live";
}

export function liveTransport(): Transport {
  const key = process.env.BIZIN_PARTNER_KEY;
  if (!key) {
    throw new BizinError({
      status: 0,
      code: "not_configured",
      message: "BIZIN_PARTNER_KEY is not set (set BIZIN_MODE=mock for local development)",
    });
  }
  const base = (process.env.BIZIN_API_BASE || DEFAULT_BIZIN_API_BASE).replace(/\/+$/, "");
  return (req) =>
    fetch(`${base}${req.path}`, {
      method: req.method,
      headers: { ...req.headers, Authorization: `Bearer ${key}` },
      body: req.body,
      signal: req.signal,
      cache: "no-store",
      redirect: "error",
    });
}
