import { getSeller } from "@/server/auth/session";
import { getWhatsAppPairing } from "@/server/bizin/client";
import { toFarsiError } from "@/server/bizin/errors-fa";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * One poll of a WhatsApp pairing. The answer's `qr` is a credential (whoever scans it links their phone to the
 * shop), so it goes only to a signed-in owner of this business and is never cached.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const seller = await getSeller("channels.manage");
  if (!seller) return Response.json({ error: { message: "نشست شما تمام شده است. دوباره وارد شوید." } }, { status: 401, headers: NO_STORE });
  if (seller.role !== "owner") return Response.json({ error: { message: "اتصال کانال فقط با مالک فروشگاه است." } }, { status: 403, headers: NO_STORE });
  const { id } = await ctx.params;
  try {
    const p = await getWhatsAppPairing(seller.shop.external_business_id, id);
    return Response.json({ status: p.status, qr: p.status === "qr" ? (p.qr ?? null) : null, expires_at: p.expires_at }, { headers: NO_STORE });
  } catch (e) {
    const f = toFarsiError(e);
    return Response.json({ error: { message: f.message, requestId: f.requestId } }, { status: 400, headers: NO_STORE });
  }
}
