"use server";

import { revalidatePath } from "next/cache";

import { checkDisclosure, checkLogoFile, DISCLOSURE_MAX, DISCLOSURE_MIN } from "@/components/admin/model/branding";
import type { ActionResult } from "@/components/admin/model/result";
import { fa } from "@/lib/utils";
import { failed } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

const LOCALES = ["fa", "en", "ar"] as const;

function byLocale(input: unknown, max: number): Record<string, string> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const l of LOCALES) {
    const v = typeof raw[l] === "string" ? (raw[l] as string).trim().slice(0, max) : "";
    if (v) out[l] = v;
  }
  return out;
}

export async function saveBrandingAction(input: {
  names: Record<string, string>;
  supportLabel: Record<string, string>;
  supportUrl: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const supportUrl = String(input?.supportUrl ?? "").trim();
  if (supportUrl && !/^https:\/\/[^\s]+$/i.test(supportUrl)) {
    return { ok: false, message: "آدرس پشتیبانی باید با https:// شروع شود.", fields: { supportUrl: "آدرس باید با https:// شروع شود." } };
  }
  try {
    await bizin.putBranding({
      names: byLocale(input?.names, 80),
      support_label: byLocale(input?.supportLabel, 80),
      support_url: supportUrl || null,
    });
  } catch (e) {
    return failed(e);
  }
  revalidatePath("/admin/branding");
  return { ok: true, data: undefined };
}

/** `null` returns the Farsi disclosure to Bizin's default text. */
export async function saveDisclosureAction(text: string | null): Promise<ActionResult> {
  await requireAdmin();
  if (text !== null) {
    const c = checkDisclosure(String(text));
    if (c.tooShort || c.tooLong) {
      return { ok: false, message: `متن باید بین ${fa(DISCLOSURE_MIN)} تا ${fa(DISCLOSURE_MAX)} نویسه باشد.` };
    }
  }
  try {
    await bizin.putBrandDisclosure("fa", { text: text === null ? null : String(text).trim() });
  } catch (e) {
    return failed(e);
  }
  revalidatePath("/admin/branding");
  return { ok: true, data: undefined };
}

export async function uploadLogoAction(form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, message: "فایلی انتخاب نشده است." };
  const bad = checkLogoFile(file);
  if (bad) return { ok: false, message: bad };
  const out = new FormData();
  out.set("file", file, file.name || (file.type === "image/webp" ? "logo.webp" : "logo.png"));
  try {
    await bizin.uploadBrandLogo(out);
  } catch (e) {
    return failed(e);
  }
  revalidatePath("/admin/branding");
  return { ok: true, data: undefined };
}
