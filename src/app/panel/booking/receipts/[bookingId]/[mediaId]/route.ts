import { BOOKING_PAYMENTS, UUID_RE } from "@/components/panel/booking/model";
import { getSeller } from "@/server/auth/session";
import { getBookingReceiptContent } from "@/server/bizin/booking/client";
import { isBizinError } from "@/server/bizin/error";

/*
 * A deposit receipt of the seller's own shop (route 35, scope payments:verify). A bank receipt carries card numbers
 * and names: nothing here is cached, and each fetch is one audited view at Bizin, made only when the seller opens it.
 */

const INLINE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
} as const;

const plain = (status: number) => new Response(null, { status, headers: BASE_HEADERS });

export async function GET(_req: Request, ctx: { params: Promise<{ bookingId: string; mediaId: string }> }): Promise<Response> {
  const seller = await getSeller(BOOKING_PAYMENTS);
  if (!seller) return plain(401);
  const { bookingId, mediaId } = await ctx.params;
  if (!UUID_RE.test(bookingId) || !UUID_RE.test(mediaId)) return plain(404);

  let upstream: Response;
  try {
    upstream = await getBookingReceiptContent(seller.shop.external_business_id, bookingId, mediaId);
  } catch (e) {
    if (!isBizinError(e)) return plain(502);
    if (e.status === 404 || e.status === 403) return plain(e.status);
    return plain(e.status === 503 ? 503 : 502);
  }
  const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const inline = INLINE_TYPES.has(type);
  const headers = new Headers(BASE_HEADERS);
  headers.set("Content-Type", inline ? type : type === "application/pdf" ? "application/pdf" : "application/octet-stream");
  headers.set("Content-Disposition", inline ? "inline" : `attachment; filename="booking-receipt-${mediaId.slice(0, 8)}${type === "application/pdf" ? ".pdf" : ".bin"}"`);
  const length = upstream.headers.get("content-length");
  if (length && /^\d+$/.test(length)) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
