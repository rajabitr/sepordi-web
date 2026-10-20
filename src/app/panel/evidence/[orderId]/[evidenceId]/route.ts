import { UUID_RE } from "@/components/panel/orders/model";
import { getSeller } from "@/server/auth/session";
import { getPaymentEvidenceContent } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";

/*
 * One payment receipt of the seller's own shop: a picture's bytes, or `{kind:"text",text}` for a typed one. A bank
 * receipt carries card numbers and names, so nothing here is ever cached, and each fetch is one audited view at Bizin:
 * the page asks only when the seller opens the receipt.
 */

const INLINE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
} as const;

function plain(status: number): Response {
  return new Response(null, { status, headers: BASE_HEADERS });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orderId: string; evidenceId: string }> },
): Promise<Response> {
  const seller = await getSeller();
  if (!seller) return plain(401);
  const { orderId, evidenceId } = await ctx.params;
  if (!UUID_RE.test(orderId) || !UUID_RE.test(evidenceId)) return plain(404);

  let upstream: Response;
  try {
    upstream = await getPaymentEvidenceContent(seller.shop.external_business_id, orderId, evidenceId);
  } catch (e) {
    if (!isBizinError(e)) return plain(502);
    if (e.status === 404) return plain(404);
    if (e.status === 403) return plain(403);
    return plain(e.status === 503 ? 503 : 502);
  }

  const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const headers = new Headers(BASE_HEADERS);
  if (type === "application/json") {
    const body: unknown = await upstream.json().catch(() => null);
    const text = body && typeof body === "object" && typeof (body as { text?: unknown }).text === "string" ? (body as { text: string }).text : null;
    if (text === null) return plain(502);
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ kind: "text", text }), { status: 200, headers });
  }
  const inline = INLINE_TYPES.has(type);
  headers.set("Content-Type", inline ? type : "application/octet-stream");
  headers.set("Content-Disposition", inline ? "inline" : `attachment; filename="receipt-${evidenceId.slice(0, 8)}.bin"`);
  const length = upstream.headers.get("content-length");
  if (length && /^\d+$/.test(length)) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
