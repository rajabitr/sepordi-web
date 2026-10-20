import { getSeller } from "@/server/auth/session";
import { notificationsForExt } from "@/server/notifications/events";

/** The bell's poll. Scoped to the signed-in seller's own shop. */
export async function GET(): Promise<Response> {
  const seller = await getSeller();
  if (!seller) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json(notificationsForExt(seller.shop.external_business_id), { headers: { "Cache-Control": "no-store" } });
}
