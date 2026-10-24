import { getSeller } from "@/server/auth/session";
import { getInboxMedia } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";
import { UUID_RE } from "@/components/panel/inbox/model";

/*
 * The bytes of a file a message of the seller's own shop carries (photos, voice notes, documents, bank receipts).
 * The business is the session's shop, never the URL's; nothing here is ever cached.
 */

const INLINE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ATTACHMENT_TYPES = new Set(["application/pdf", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr", "video/mp4"]);

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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const seller = await getSeller("inbox.view");
  if (!seller) return plain(401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return plain(404);

  let upstream: Response;
  try {
    upstream = await getInboxMedia(seller.shop.external_business_id, id);
  } catch (e) {
    if (isBizinError(e) && (e.status === 404 || e.code === "feature_not_entitled")) return plain(e.status);
    return plain(502);
  }

  const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const inline = INLINE_TYPES.has(type);
  const headers = new Headers(BASE_HEADERS);
  headers.set("Content-Type", inline || ATTACHMENT_TYPES.has(type) ? type : "application/octet-stream");
  headers.set("Content-Disposition", inline ? "inline" : `attachment; filename="${attachmentName(id, type)}"`);
  const length = upstream.headers.get("content-length");
  if (length && /^\d+$/.test(length)) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "video/mp4": "mp4",
};

function attachmentName(id: string, type: string): string {
  return `sepordi-${id.slice(0, 8)}.${EXT[type] ?? "bin"}`;
}
