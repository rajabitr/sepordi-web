import { randomUUID } from "node:crypto";

import { importRowErrorFa } from "@/components/panel/products/catalog";
import { MAX_IMAGES, toImagesView } from "@/components/panel/products/images-model";
import {
  cancelCatalogImportJob,
  commitCatalogImportJob,
  createCatalogImportJob,
  getProduct,
  listCatalogImportJobRows,
} from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";
import { buildImageImportCsv } from "@/server/product-images/csv";
import { beginSend, getProductImages, publicImagePath } from "@/server/product-images/store";

import { authorize, fail, okJson } from "../respond";

class Refused extends Error {}

/**
 * Sends the product's unsent pictures to Bizin: a catalogue import file of this one product as it stands, plus
 * `image_urls`, previewed and then committed. The browser polls the job afterwards.
 */
export async function POST(request: Request, ctx: { params: Promise<{ ext: string }> }) {
  const auth = await authorize(request, ctx.params, { write: true });
  if (auth instanceof Response) return auth;
  const { seller, productExt } = auth;
  const ext = seller.shop.external_business_id;

  const body = (await request.json().catch(() => null)) as { order?: unknown } | null;
  const order = body?.order;
  if (!Array.isArray(order) || order.length > MAX_IMAGES || !order.every((f) => typeof f === "string")) {
    return fail(400, "درخواست نامعتبر است.");
  }

  let product;
  try {
    product = await getProduct(ext, productExt);
  } catch (e) {
    if (isBizinError(e) && (e.code === "product_not_found" || e.code === "not_found")) return fail(404, "این محصول پیدا نشد.");
    const f = toFarsiError(e);
    return fail(400, f.message, f.requestId);
  }

  const base = (process.env.PUBLIC_BASE_URL || "https://sepordi.ir").replace(/\/+$/, "");
  try {
    const sent = await beginSend(seller.shop.id, productExt, order as string[], async (files) => {
      const built = buildImageImportCsv(product, files.map((f) => base + publicImagePath(f.file)));
      if (!built.ok) throw new Refused(built.message);
      const form = new FormData();
      form.set("file", new File([built.csv], `images-${productExt}.csv`, { type: "text/csv" }));
      form.set("on_errors", "abort");
      form.set("auto_commit", "false");
      const job = await createCatalogImportJob(ext, form, { idempotencyKey: randomUUID() });
      if (job.counts.failed > 0) {
        const page = await listCatalogImportJobRows(ext, job.id, { action: "fail", limit: 1 }).catch(() => null);
        await cancelCatalogImportJob(ext, job.id).catch(() => undefined);
        const first = page?.rows[0]?.errors[0];
        throw new Refused(first ? `محصول ثبت نشد: ${importRowErrorFa(first)}` : "محصول ثبت نشد. صفحه را تازه کنید و دوباره امتحان کنید.");
      }
      await commitCatalogImportJob(ext, job.id);
      return job.id;
    });
    if (!sent.ok) return fail(sent.status, sent.message);
  } catch (e) {
    if (e instanceof Refused) return fail(422, e.message);
    const f = toFarsiError(e);
    return fail(400, f.message, f.requestId);
  }
  return okJson(toImagesView(await getProductImages(seller.shop.id, productExt)));
}
