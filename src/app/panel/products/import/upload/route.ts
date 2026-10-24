import { getSeller } from "@/server/auth/session";
import { createCatalogImportJob } from "@/server/bizin/client";
import { toFarsiError } from "@/server/bizin/errors-fa";
import { sameOrigin } from "@/server/http/same-origin";

import { loadJobSnapshot } from "../job-data";

/** Bizin's own cap on a catalogue file. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

function fail(status: number, message: string, requestId?: string) {
  return Response.json({ error: { message, requestId } }, { status, headers: NO_STORE });
}

/**
 * Starts a preview job from a CSV or XLSX file. A Route Handler rather than a Server Action: the file may be up to
 * 10 MiB and a Server Action body stops at 1 MB. Nothing is written until the seller commits.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail(403, "درخواست نامعتبر است.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 64 * 1024) return fail(413, "حجم فایل باید کمتر از ۱۰ مگابایت باشد.");
  const seller = await getSeller("products.edit");
  if (!seller) return fail(401, "نشست شما تمام شده است. دوباره وارد شوید.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "فایل درست ارسال نشد. دوباره انتخاب کنید.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(400, "فایلی انتخاب نشده است.");
  if (file.size > MAX_FILE_BYTES) return fail(413, "حجم فایل باید کمتر از ۱۰ مگابایت باشد.");
  if (!/\.(csv|xlsx)$/i.test(file.name)) return fail(415, "فقط فایل CSV یا اکسل (xlsx) قبول می‌شود.");

  const upstream = new FormData();
  upstream.set("file", file, file.name);
  upstream.set("on_errors", "skip");
  upstream.set("auto_commit", "false");

  const key = request.headers.get("x-upload-key");
  try {
    const ext = seller.shop.external_business_id;
    const job = await createCatalogImportJob(ext, upstream, key && /^[A-Za-z0-9-]{8,64}$/.test(key) ? { idempotencyKey: key } : undefined);
    return Response.json(await loadJobSnapshot(ext, job.id, job), { headers: NO_STORE });
  } catch (e) {
    const f = toFarsiError(e);
    return fail(400, f.message, f.requestId);
  }
}
