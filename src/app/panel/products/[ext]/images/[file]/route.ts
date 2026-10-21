import { toImagesView } from "@/components/panel/products/images-model";
import { getProductImages, removeProductImage } from "@/server/product-images/store";

import { authorize, fail, okJson } from "../respond";

/** Removes a picture that was never sent; the record of the signed-in seller's shop decides what is theirs. */
export async function DELETE(request: Request, ctx: { params: Promise<{ ext: string; file: string }> }) {
  const auth = await authorize(request, ctx.params, { write: true });
  if (auth instanceof Response) return auth;
  const { seller, productExt } = auth;
  const removed = await removeProductImage(seller.shop.id, productExt, (await ctx.params).file);
  if (!removed.ok) return fail(removed.status, removed.message);
  return okJson(toImagesView(await getProductImages(seller.shop.id, productExt)));
}
