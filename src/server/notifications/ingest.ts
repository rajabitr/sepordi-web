import "server-only";

import { webhookEvents } from "@/server/db/repo";
import { verifyBizinSignature } from "@/server/webhooks/verify";

/** Bizin's envelopes are ids and states only; anything near this size is not one of them. */
export const MAX_WEBHOOK_BYTES = 256 * 1024;

export type IngestResult =
  | { status: 200; stored: boolean }
  | { status: 400; reason: "signature" | "body" }
  | { status: 413; reason: "too_large" };

/**
 * One delivery: verify against the raw bytes, then store once per event id. Never calls Bizin, so it answers
 * within milliseconds; the panel re-reads what it needs when the seller opens it.
 */
export function ingestWebhook(
  input: { signature: string | null; eventIdHeader: string | null; rawBody: Uint8Array; secrets: readonly string[] },
  nowSeconds?: number,
): IngestResult {
  if (input.rawBody.byteLength > MAX_WEBHOOK_BYTES) return { status: 413, reason: "too_large" };
  const verdict = verifyBizinSignature(input.signature, input.rawBody, input.secrets, nowSeconds);
  if (!verdict.ok) return { status: 400, reason: "signature" };

  let body: { id?: unknown; type?: unknown; tenant?: { external_business_id?: unknown } | null };
  try {
    body = JSON.parse(Buffer.from(input.rawBody).toString("utf8"));
  } catch {
    return { status: 400, reason: "body" };
  }
  if (!body || typeof body !== "object") return { status: 400, reason: "body" };

  const eventId = (input.eventIdHeader ?? "").trim() || (typeof body.id === "string" ? body.id : "");
  const type = typeof body.type === "string" ? body.type : "";
  if (!eventId || eventId.length > 128 || !type || type.length > 64) return { status: 400, reason: "body" };
  const ext = body.tenant && typeof body.tenant.external_business_id === "string" ? body.tenant.external_business_id : null;

  const stored = webhookEvents.insertIfNew({
    eventId,
    type,
    ext,
    payload: Buffer.from(input.rawBody).toString("utf8"),
  });
  return { status: 200, stored };
}
