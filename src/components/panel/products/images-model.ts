import type { ProductImages } from "@/server/product-images/store";

import { importRowErrorFa, type ImportRowErrorView } from "./catalog";

export const MAX_IMAGES = 8;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export interface ProductImageView {
  file: string;
  /** Same-origin path; the absolute URL is only built for the import file. */
  url: string;
  /** Fetched by a finished job. The Partner API only adds pictures, so a sent one cannot be moved or removed. */
  sent: boolean;
}

export interface ProductImagesView {
  images: ProductImageView[];
  pendingJobId: string | null;
}

export function toImagesView(p: ProductImages): ProductImagesView {
  return {
    images: p.images.map((i) => ({ file: i.file, url: `/p/img/${i.file}`, sent: i.sent_at !== null })),
    pendingJobId: p.pending?.job_id ?? null,
  };
}

/** How a send ended, from the job and its one product row. */
export type SendOutcome =
  | { status: "running" }
  | { status: "done"; ok: boolean; message: string }
  | { status: "failed"; message: string };

export interface SendRowView {
  action: string;
  warnings: string[];
  errors: ImportRowErrorView[];
}

const JOB_FAILED_FA: Record<string, string> = {
  error: "فرستادن عکس‌ها نیمه‌کاره ماند. دوباره «ذخیره‌ی عکس‌ها» را بزنید.",
  expired: "مهلت فرستادن عکس‌ها تمام شد. دوباره «ذخیره‌ی عکس‌ها» را بزنید.",
  cancelled: "فرستادن عکس‌ها لغو شد.",
  ready: "فرستادن عکس‌ها شروع نشد. دوباره «ذخیره‌ی عکس‌ها» را بزنید.",
};

export function sendOutcome(jobStatus: string, row: SendRowView | null): SendOutcome {
  if (jobStatus === "committing") return { status: "running" };
  if (jobStatus !== "done") return { status: "failed", message: JOB_FAILED_FA[jobStatus] ?? JOB_FAILED_FA.error };
  if (!row || row.action === "not_attempted") return { status: "failed", message: JOB_FAILED_FA.error };
  if (row.action === "fail") {
    const first = row.errors[0];
    return { status: "failed", message: first ? `محصول ثبت نشد: ${importRowErrorFa(first)}` : "محصول ثبت نشد." };
  }
  if (row.warnings.includes("image_skipped")) {
    return { status: "done", ok: false, message: "این محصول به سقف هشت عکس رسیده است و عکس‌های تازه ثبت نشد." };
  }
  if (row.warnings.includes("image_failed")) {
    return { status: "done", ok: false, message: "بعضی عکس‌ها دریافت نشد. چند دقیقه بعد دوباره «ذخیره‌ی عکس‌ها» را بزنید؛ عکس‌هایی که رسیده‌اند تکراری نمی‌شوند." };
  }
  return { status: "done", ok: true, message: "عکس‌ها روی محصول ثبت شدند." };
}
