"use server";

import { refresh } from "next/cache";

import {
  buildProductPut,
  isProductDraft,
  isValidExt,
  reconcileStock,
  type DraftErrors,
  type ImportJobView,
  type ProductDraft,
  type StockConflict,
} from "@/components/panel/products/catalog";
import { requireCapability } from "@/server/auth/session";
import { recordActivity } from "@/server/audit";
import { cancelCatalogImportJob, commitCatalogImportJob, deleteProduct, getProduct, putProduct } from "@/server/bizin/client";
import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";

export type ActionFailure = {
  ok: false;
  message: string;
  code?: string;
  requestId?: string;
  field?: string;
  errors?: DraftErrors;
  conflicts?: StockConflict[];
};

/**
 * Creates or replaces one product. The draft is validated again here: the client's check is only a convenience.
 * `stocks` is the level written per variant, the form's next baseline.
 */
export async function saveProductAction(
  productExt: string,
  draft: ProductDraft,
): Promise<{ ok: true; created: boolean; stocks: Record<string, number | null> } | ActionFailure> {
  const { shop, user } = await requireCapability("products.edit");
  if (!isProductDraft(draft)) return { ok: false, message: "اطلاعات فرم کامل نرسید. صفحه را تازه کنید." };
  if (typeof productExt !== "string" || !isValidExt(productExt)) return { ok: false, message: "شناسه‌ی محصول درست نیست. صفحه را تازه کنید." };
  if (draft.variants.some((v) => !v.ext || !isValidExt(v.ext))) {
    return { ok: false, message: "شناسه‌ی یکی از تنوع‌ها درست نیست. صفحه را تازه کنید." };
  }
  const built = buildProductPut(draft);
  if (!built.body) return { ok: false, message: "فرم را بررسی کنید.", errors: built.errors };
  let body = built.body;
  try {
    if (draft.variants.some((v) => v.base)) {
      const live = await getProduct(shop.external_business_id, productExt).catch((e) => {
        if (isBizinError(e) && (e.code === "product_not_found" || e.code === "not_found")) return null;
        throw e;
      });
      const merged = reconcileStock(draft, body, live?.variants ?? null);
      if (!merged.body) {
        return {
          ok: false,
          code: "stock_conflict",
          message: "از وقتی این فرم را باز کردید موجودی تغییر کرده است؛ احتمالاً فروشی ثبت شده. کدام عدد ثبت شود؟",
          conflicts: merged.conflicts,
        };
      }
      body = merged.body;
    }
    const saved = await putProduct(shop.external_business_id, productExt, body);
    recordActivity({ shop, user }, "product.save", { type: "product", id: productExt }, { created: saved.created === true });
    refresh();
    return { ok: true, created: saved.created === true, stocks: Object.fromEntries(body.variants.map((v) => [v.external_id, v.stock])) };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, message: f.message, code: f.code, requestId: f.requestId, field: f.field };
  }
}

/** Archives: the product stays readable and a later save with «فعال» brings it back. */
export async function archiveProductAction(productExt: string): Promise<{ ok: true } | ActionFailure> {
  const { shop, user } = await requireCapability("products.edit");
  try {
    await deleteProduct(shop.external_business_id, productExt);
    recordActivity({ shop, user }, "product.archive", { type: "product", id: productExt });
    refresh();
    return { ok: true };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, message: f.message, requestId: f.requestId };
  }
}

export async function commitImportAction(jobId: string): Promise<{ ok: true; job: ImportJobView } | ActionFailure> {
  const { shop, user } = await requireCapability("products.edit");
  try {
    const job = await commitCatalogImportJob(shop.external_business_id, jobId);
    recordActivity({ shop, user }, "product.import", { type: "import", id: jobId });
    return { ok: true, job };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, message: f.message, requestId: f.requestId };
  }
}

export async function cancelImportAction(jobId: string): Promise<{ ok: true; job: ImportJobView } | ActionFailure> {
  const { shop } = await requireCapability("products.edit");
  try {
    const job = await cancelCatalogImportJob(shop.external_business_id, jobId);
    refresh();
    return { ok: true, job };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, message: f.message, requestId: f.requestId };
  }
}
