import { getSeller } from "@/server/auth/session";
import { notificationsForExt } from "@/server/notifications/events";
import { getNotifyPrefs, visibleTypes } from "@/server/notifications/prefs";

/** The bell's poll. Scoped to the signed-in seller's own shop, minus the families this user muted or this role does not see. */
export async function GET(): Promise<Response> {
  const seller = await getSeller();
  if (!seller) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const types = visibleTypes(getNotifyPrefs(seller.user.id, seller.shop.id), seller.role);
  return Response.json(notificationsForExt(seller.shop.external_business_id, { types }), { headers: { "Cache-Control": "no-store" } });
}
