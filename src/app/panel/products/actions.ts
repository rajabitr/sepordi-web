"use server";

import { refresh } from "next/cache";

import { buildProductPut, isProductDraft, isValidExt, type DraftErrors, type ImportJobView, type ProductDraft } from "@/components/panel/products/catalog";
import { requireSeller } from "@/server/auth/session";
import { cancelCatalogImportJob, commitCatalogImportJob, deleteProduct, putProduct } from "@/server/bizin/client";
import { toFarsiError } from "@/server/bizin/errors-fa";

export type ActionFailure = { ok: false; message: string; code?: string; requestId?: string; field?: string; errors?: DraftErrors };

/** Creates or replaces one product. The draft is validated again here: the client's check is only a convenience. */
export async function saveProductAction(
  productExt: string,
  draft: ProductDraft,
): Promise<{ ok: true; created: boolean } | ActionFailure> {
  const { shop } = await requireSeller();
  if (!isProductDraft(draft)) return { ok: false, message: "اطلاعات فرم کامل نرسید. صفحه را تازه کنید." };
  if (typeof productExt !== "string" || !isValidExt(productExt)) return { ok: false, message: "شناسه‌ی محصول درست نیست. صفحه را تازه کنید." };
  if (draft.variants.some((v) => !v.ext || !isValidExt(v.ext))) {
    return { ok: false, message: "شناسه‌ی یکی از تنوع‌ها درست نیست. صفحه را تازه کنید." };
  }
  const built = buildProductPut(draft);
  if (!built.body) return { ok: false, message: "فرم را بررسی کنید.", errors: built.errors };
  try {
    const saved = await putProduct(shop.external_business_id, productExt, built.body);
    refresh();
    return { ok: true, created: saved.created === true };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, message: f.message, code: f.code, requestId: f.requestId, field: f.field };
  }
}

/** Archives: the product stays readable and a later save with «فعال» brings it back. */
export async function archiveProductAction(productExt: string): Promise<{ ok: true } | ActionFailure> {
  const { shop } = await requireSeller();
  try {
    await deleteProduct(shop.external_business_id, productExt);
    refresh();
    return { ok: true };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, message: f.message, requestId: f.requestId };
  }
}

export async function commitImportAction(jobId: string): Promise<{ ok: true; job: ImportJobView } | ActionFailure> {
  const { shop } = await requireSeller();
  try {
    const job = await commitCatalogImportJob(shop.external_business_id, jobId);
    return { ok: true, job };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, message: f.message, requestId: f.requestId };
  }
}

export async function cancelImportAction(jobId: string): Promise<{ ok: true; job: ImportJobView } | ActionFailure> {
  const { shop } = await requireSeller();
  try {
    const job = await cancelCatalogImportJob(shop.external_business_id, jobId);
    refresh();
    return { ok: true, job };
  } catch (e) {
    const f = toFarsiError(e);
    return { ok: false, message: f.message, requestId: f.requestId };
  }
}
