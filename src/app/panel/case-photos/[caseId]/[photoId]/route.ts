import { UUID_RE } from "@/components/panel/orders/model";
import { getSeller } from "@/server/auth/session";
import { getCasePhoto } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";

/* A photo a customer sent with a return or complaint of the seller's own shop. Never cached, never public. */

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
  ctx: { params: Promise<{ caseId: string; photoId: string }> },
): Promise<Response> {
  const seller = await getSeller();
  if (!seller) return plain(401);
  const { caseId, photoId } = await ctx.params;
  if (!UUID_RE.test(caseId) || !UUID_RE.test(photoId)) return plain(404);

  let upstream: Response;
  try {
    upstream = await getCasePhoto(seller.shop.external_business_id, caseId, photoId);
  } catch (e) {
    if (!isBizinError(e)) return plain(502);
    if (e.status === 404) return plain(404);
    return plain(e.status === 503 ? 503 : 502);
  }

  const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const inline = INLINE_TYPES.has(type);
  const headers = new Headers(BASE_HEADERS);
  headers.set("Content-Type", inline ? type : "application/octet-stream");
  headers.set("Content-Disposition", inline ? "inline" : `attachment; filename="photo-${photoId.slice(0, 8)}.bin"`);
  const length = upstream.headers.get("content-length");
  if (length && /^\d+$/.test(length)) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}
