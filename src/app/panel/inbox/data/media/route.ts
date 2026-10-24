import { getSeller } from "@/server/auth/session";
import { uploadInboxMedia } from "@/server/bizin/client";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/components/panel/inbox/model";

import { errorJson, json, SIGNED_OUT, sameOrigin } from "../../_lib/respond";

/*
 * Image upload for a reply. A route handler rather than a Server Action: an action's body is capped at 1 MB and
 * actions run one at a time, which would stall the thread's polling behind an 8 MB upload.
 */
export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return json({ ok: false, error: { message: "درخواست نامعتبر است.", code: "forbidden" } }, 403);
  const seller = await getSeller("inbox.reply");
  if (!seller) return json({ ok: false, error: SIGNED_OUT }, 401);

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES + 64 * 1024) return tooLarge();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: { message: "فایل درست ارسال نشد. دوباره انتخاب کنید.", code: "bad_multipart" } }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return json({ ok: false, error: { message: "فایلی انتخاب نشده است.", code: "file_field_missing" } }, 400);
  }
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return json({ ok: false, error: { message: "عکس باید JPEG یا PNG باشد.", code: "image_type_unsupported" } }, 415);
  }
  if (file.size > MAX_IMAGE_BYTES) return tooLarge();

  const out = new FormData();
  out.set("file", file, file.name || "image");
  try {
    const media = await uploadInboxMedia(seller.shop.external_business_id, out);
    return json({ ok: true, data: { id: media.id } }, 201);
  } catch (e) {
    return errorJson(e);
  }
}

function tooLarge(): Response {
  return json({ ok: false, error: { message: "حجم عکس باید حداکثر ۸ مگابایت باشد.", code: "file_too_large" } }, 413);
}
