import { revalidatePath } from "next/cache";

import { ONBOARDING_DEFAULTS } from "@/components/admin/model/onboarding";
import type { ActionResult } from "@/components/admin/model/result";
import { faError } from "@/server/admin/errors";
import { getAdmin, getSession } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";
import { sameOrigin } from "@/server/http/same-origin";

/** Bizin's own cap on an onboarding file. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Room for the multipart envelope around the file and the two small fields. */
const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;
const FILE_TYPES = /\.(csv|xlsx)$/i;
const NO_STORE = { "Cache-Control": "no-store" };

function answer(body: ActionResult<{ jobId: string }>, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * Starts a preview onboarding job from a CSV or XLSX file. A Route Handler rather than a Server Action: the file
 * may be up to 10 MiB and a Server Action body stops at 1 MB. Bizin checks every row first; nothing is provisioned
 * until the job is committed.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return answer({ ok: false, message: "درخواست نامعتبر است." }, 403);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return answer({ ok: false, message: "حجم فایل باید کمتر از ۱۰ مگابایت باشد." }, 413);
  if (!(await getAdmin())) {
    const signedIn = (await getSession()) !== null;
    return signedIn
      ? answer({ ok: false, message: "این کار فقط از حساب پشتیبانی سپردی ممکن است." }, 403)
      : answer({ ok: false, message: "نشست شما تمام شده است. دوباره وارد شوید." }, 401);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return answer({ ok: false, message: "فایل درست ارسال نشد. دوباره انتخاب کنید." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return answer({ ok: false, message: "فایلی انتخاب نشده است." }, 400);
  if (file.size > MAX_FILE_BYTES) return answer({ ok: false, message: "حجم فایل باید کمتر از ۱۰ مگابایت باشد." }, 413);
  if (!FILE_TYPES.test(file.name)) return answer({ ok: false, message: "فایل باید CSV یا XLSX باشد." }, 415);

  const upstream = new FormData();
  upstream.set("file", file, file.name);
  upstream.set("on_errors", form.get("on_errors") === "abort" ? "abort" : "skip");
  upstream.set("defaults", JSON.stringify(ONBOARDING_DEFAULTS));
  upstream.set("auto_commit", "false");
  try {
    const job = await bizin.createOnboardingJob(upstream);
    revalidatePath("/admin/onboarding");
    return answer({ ok: true, data: { jobId: job.id } });
  } catch (e) {
    return answer({ ok: false, ...faError(e) }, 400);
  }
}
