import { getSeller } from "@/server/auth/session";
import { toFarsiError } from "@/server/bizin/errors-fa";

import { loadJobSnapshot } from "../../job-data";

const NO_STORE = { "Cache-Control": "no-store" };

/** The progress poll of one import job; the job must belong to the signed-in seller's business (Bizin checks). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const seller = await getSeller("products.view");
  if (!seller) return Response.json({ error: { message: "نشست شما تمام شده است. دوباره وارد شوید." } }, { status: 401, headers: NO_STORE });
  const { id } = await ctx.params;
  try {
    return Response.json(await loadJobSnapshot(seller.shop.external_business_id, id), { headers: NO_STORE });
  } catch (e) {
    const f = toFarsiError(e);
    return Response.json({ error: { message: f.message, requestId: f.requestId } }, { status: 400, headers: NO_STORE });
  }
}
