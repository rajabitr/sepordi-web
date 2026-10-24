import { getSeller } from "@/server/auth/session";
import { listConversations } from "@/server/bizin/client";
import { filtersFromSearch, filtersToApiQuery } from "@/components/panel/inbox/model";

import { errorJson, json, SIGNED_OUT } from "../../_lib/respond";
import { loadSeen, seenFor } from "../../_lib/seen";

/**
 * One page of the seller's conversations with the seller's own seen marks for them; the list polls this (no faster
 * than every 10 s).
 */
export async function GET(req: Request): Promise<Response> {
  const seller = await getSeller("inbox.view");
  if (!seller) return json({ ok: false, error: SIGNED_OUT }, 401);
  const sp = new URL(req.url).searchParams;
  const cursor = sp.get("cursor")?.slice(0, 512) || undefined;
  try {
    const page = await listConversations(seller.shop.external_business_id, filtersToApiQuery(filtersFromSearch(sp), cursor));
    const seen = seenFor(loadSeen(seller.user.id, seller.shop.id), page.conversations.map((c) => c.id));
    return json({ ok: true, data: { ...page, seen } });
  } catch (e) {
    return errorJson(e);
  }
}
