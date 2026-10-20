"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/admin/model/result";
import { failed } from "@/server/admin/errors";
import { requireAdmin } from "@/server/auth/session";
import * as bizin from "@/server/bizin/client";

const NARROWABLE_LIMITS = new Set(["channels.max", "products.max"]);

function validExt(ext: unknown): ext is string {
  return typeof ext === "string" && ext.length > 0 && ext.length <= 128;
}

/** The URL is returned to the one browser that asked and nowhere else: not logged, not stored. */
export async function sendActivationLinkAction(ext: string): Promise<ActionResult<{ url: string | null; expiresAt: string }>> {
  await requireAdmin();
  if (!validExt(ext)) return { ok: false, message: "شناسه‌ی فروشگاه درست نیست." };
  try {
    const link = await bizin.createActivationLink(ext);
    return { ok: true, data: { url: link.activation_url, expiresAt: link.expires_at } };
  } catch (e) {
    return failed(e);
  }
}

export interface EntitlementsChange {
  features: Record<string, boolean | null>;
  limits: Record<string, number | null>;
}

/** Narrowing only: `false` or a limit below the contract's; `null` hands the decision back to the contract. */
export async function saveEntitlementsAction(ext: string, change: EntitlementsChange): Promise<ActionResult> {
  await requireAdmin();
  if (!validExt(ext)) return { ok: false, message: "شناسه‌ی فروشگاه درست نیست." };
  const features: Record<string, boolean | null> = {};
  for (const [k, v] of Object.entries(change?.features ?? {})) {
    if (typeof k === "string" && k.length <= 64 && (v === false || v === null)) features[k] = v;
  }
  const limits: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(change?.limits ?? {})) {
    if (!NARROWABLE_LIMITS.has(k)) continue;
    if (v === null) limits[k] = null;
    else if (Number.isInteger(v) && v >= 0 && v <= 1_000_000) limits[k] = v;
    else return { ok: false, message: "سقف باید یک عدد صحیح و نامنفی باشد.", fields: { [k]: "عدد صحیح وارد کنید." } };
  }
  if (Object.keys(features).length === 0 && Object.keys(limits).length === 0) return { ok: false, message: "تغییری برای ذخیره نیست." };
  try {
    await bizin.putShopEntitlements(ext, { features, limits });
  } catch (e) {
    return failed(e);
  }
  revalidatePath("/admin/sellers/[ext]", "page");
  return { ok: true, data: undefined };
}
