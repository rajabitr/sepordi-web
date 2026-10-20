import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type VerifyFailure = "malformed" | "expired" | "mismatch" | "no_secret";
export type VerifyResult = { ok: true; timestamp: number } | { ok: false; reason: VerifyFailure };

/**
 * Checks a `Bizin-Signature: t=<unix>,v1=<hex>[,v1=<hex>]` header (partner-api.md §9.4).
 * `rawBody` must be the bytes exactly as received: re-encoded JSON fails. During a secret rotation pass both
 * secrets; the request is accepted when any v1 matches any secret within ±300 s of `t`.
 */
export function verifyBizinSignature(
  header: string | null | undefined,
  rawBody: Buffer | Uint8Array | string,
  secrets: readonly string[],
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifyResult {
  const keys = secrets.filter(Boolean);
  if (keys.length === 0) return { ok: false, reason: "no_secret" };

  let t: number | null = null;
  const sigs: string[] = [];
  for (const part of String(header ?? "").split(",")) {
    const i = part.indexOf("=");
    if (i < 0) return { ok: false, reason: "malformed" };
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === "t") {
      if (t !== null || !/^-?\d+$/.test(value)) return { ok: false, reason: "malformed" };
      t = Number(value);
    } else if (key === "v1") {
      sigs.push(value);
    }
  }
  if (t === null || sigs.length === 0) return { ok: false, reason: "malformed" };
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "expired" };

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  for (const secret of keys) {
    const want = Buffer.from(createHmac("sha256", secret).update(`${t}.`).update(body).digest("hex"));
    for (const s of sigs) {
      const got = Buffer.from(s);
      if (got.length === want.length && timingSafeEqual(got, want)) return { ok: true, timestamp: t };
    }
  }
  return { ok: false, reason: "mismatch" };
}

/** BIZIN_WEBHOOK_SECRETS: comma-separated `whsec_…` values, the newest first while a rotation overlaps. */
export function webhookSecretsFromEnv(): string[] {
  return (process.env.BIZIN_WEBHOOK_SECRETS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
