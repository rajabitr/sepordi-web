import { sendOutcome, toImagesView } from "@/components/panel/products/images-model";
import { getCatalogImportJob, listCatalogImportJobRows } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";
import { getProductImages, settleSend } from "@/server/product-images/store";

import { authorize, fail, okJson } from "../../respond";

/** The progress of this product's pending picture send; only the job the shop's own record names is read. */
export async function GET(request: Request, ctx: { params: Promise<{ ext: string; id: string }> }) {
  const auth = await authorize(request, ctx.params, { write: false });
  if (auth instanceof Response) return auth;
  const { seller, productExt } = auth;
  const { id } = await ctx.params;
  const ext = seller.shop.external_business_id;

  const before = await getProductImages(seller.shop.id, productExt);
  if (before.pending?.job_id !== id) return okJson({ outcome: null, state: toImagesView(before) });

  try {
    const job = await getCatalogImportJob(ext, id);
    let row = null;
    if (job.status === "done") {
      const page = await listCatalogImportJobRows(ext, id, { limit: 10 });
      row = page.rows.find((r) => r.external_id === productExt) ?? null;
    }
    const outcome = sendOutcome(job.status, row);
    if (outcome.status !== "running") await settleSend(seller.shop.id, productExt, id, outcome.status === "done" && outcome.ok);
    return okJson({ outcome, state: toImagesView(await getProductImages(seller.shop.id, productExt)) });
  } catch (e) {
    if (isBizinError(e) && e.code === "import_job_not_found") {
      await settleSend(seller.shop.id, productExt, id, false);
      return okJson({ outcome: sendOutcome("expired", null), state: toImagesView(await getProductImages(seller.shop.id, productExt)) });
    }
    const f = toFarsiError(e);
    return fail(400, f.message, f.requestId);
  }
}
