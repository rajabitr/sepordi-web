import "server-only";

import { isValidExt } from "@/components/panel/products/catalog";
import { getSeller, type SellerContext } from "@/server/auth/session";
import { sameOrigin } from "@/server/http/same-origin";

const NO_STORE = { "Cache-Control": "no-store" };

export function fail(status: number, message: string, requestId?: string) {
  return Response.json({ error: { message, requestId } }, { status, headers: NO_STORE });
}

export function okJson(body: unknown) {
  return Response.json(body, { headers: NO_STORE });
}

/** The seller and the product ext of an images request, or the answer that refuses it. */
export async function authorize(
  request: Request,
  params: Promise<{ ext: string }>,
  { write }: { write: boolean },
): Promise<{ seller: SellerContext; productExt: string } | Response> {
  if (write && !sameOrigin(request)) return fail(403, "درخواست نامعتبر است.");
  const seller = await getSeller();
  if (!seller) return fail(401, "نشست شما تمام شده است. دوباره وارد شوید.");
  const productExt = (await params).ext;
  if (!isValidExt(productExt)) return fail(404, "این محصول پیدا نشد.");
  return { seller, productExt };
}
