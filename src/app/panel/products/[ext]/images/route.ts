import { toImagesView } from "@/components/panel/products/images-model";
import { getProduct } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";
import { MAX_IMAGE_BYTES } from "@/server/product-images/magic";
import { addProductImage, getProductImages } from "@/server/product-images/store";

import { authorize, fail, okJson } from "./respond";

/**
 * Stores one picture for a product of the signed-in seller; nothing reaches Bizin until «ذخیره‌ی عکس‌ها». A Route
 * Handler rather than a Server Action: a picture may be 5 MB and a Server Action body stops at 1 MB.
 */
export async function POST(request: Request, ctx: { params: Promise<{ ext: string }> }) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) return fail(413, "حجم هر عکس باید کمتر از ۵ مگابایت باشد.");
  const auth = await authorize(request, ctx.params, { write: true });
  if (auth instanceof Response) return auth;
  const { seller, productExt } = auth;

  try {
    await getProduct(seller.shop.external_business_id, productExt);
  } catch (e) {
    if (isBizinError(e) && (e.code === "product_not_found" || e.code === "not_found")) return fail(404, "این محصول پیدا نشد.");
    const f = toFarsiError(e);
    return fail(400, f.message, f.requestId);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "عکس درست ارسال نشد. دوباره انتخاب کنید.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(400, "عکسی انتخاب نشده است.");
  if (file.size > MAX_IMAGE_BYTES) return fail(413, "حجم هر عکس باید کمتر از ۵ مگابایت باشد.");

  const added = await addProductImage(seller.shop.id, productExt, new Uint8Array(await file.arrayBuffer()));
  if (!added.ok) return fail(added.status, added.message);
  return okJson(toImagesView(await getProductImages(seller.shop.id, productExt)));
}
