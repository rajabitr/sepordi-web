"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/panel/overview/action-result";
import { requireSeller } from "@/server/auth/session";
import { hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from "@/server/auth/password";
import { hit } from "@/server/auth/rate-limit";
import { isBizinError } from "@/server/bizin/error";
import { toFarsiError } from "@/server/bizin/errors-fa";
import * as bizin from "@/server/bizin/client";
import { users } from "@/server/db/repo";
import { fa } from "@/lib/utils";

import { endOtherSessions, passwordHashOf, updateProfile } from "./account";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveProfileAction(input: { display_name: string; email: string }): Promise<ActionResult<{ display_name: string; email: string }>> {
  const { user } = await requireSeller();
  const name = String(input?.display_name ?? "").trim();
  const email = String(input?.email ?? "").trim().toLowerCase();
  if (!name) return { ok: false, field: "display_name", message: "نامتان را بنویسید." };
  if (name.length > 80) return { ok: false, field: "display_name", message: "نام حداکثر ۸۰ نویسه است." };
  if (email && (email.length > 254 || !EMAIL.test(email))) return { ok: false, field: "email", message: "ایمیل درست نیست؛ مثل name@example.com بنویسید." };
  if (updateProfile(user.id, name, email || null) === "email_taken") {
    return { ok: false, field: "email", message: "این ایمیل برای حساب دیگری ثبت شده است." };
  }
  revalidatePath("/panel", "layout");
  return { ok: true, data: { display_name: name, email } };
}

export async function changePasswordAction(input: { current: string; next: string }): Promise<ActionResult<{ endedSessions: number }>> {
  const { user } = await requireSeller();
  const limit = hit(`pw-change:${user.id}`, { max: 5, windowMs: 15 * 60_000 });
  if (!limit.ok) return { ok: false, message: `چند بار پشت سر هم امتحان کردید. ${fa(Math.ceil(limit.retryAfterSeconds / 60))} دقیقه بعد دوباره امتحان کنید.` };

  const current = String(input?.current ?? "");
  const next = String(input?.next ?? "");
  const stored = passwordHashOf(user.id);
  if (stored && !(await verifyPassword(current, stored))) return { ok: false, field: "current", message: "گذرواژه‌ی فعلی درست نیست." };
  if (next.length < PASSWORD_MIN_LENGTH) return { ok: false, field: "next", message: `گذرواژه‌ی تازه دست‌کم ${fa(PASSWORD_MIN_LENGTH)} نویسه باشد.` };
  if (next.length > 200) return { ok: false, field: "next", message: "گذرواژه خیلی بلند است." };
  if (stored && current === next) return { ok: false, field: "next", message: "گذرواژه‌ی تازه با گذرواژه‌ی فعلی یکی است." };

  users.setPassword(user.id, await hashPassword(next));
  // A changed password ends every other device, in case the old one leaked.
  return { ok: true, data: { endedSessions: await endOtherSessions(user.id) } };
}

export async function endOtherSessionsAction(): Promise<ActionResult<{ ended: number }>> {
  const { user } = await requireSeller();
  return { ok: true, data: { ended: await endOtherSessions(user.id) } };
}

/** «پنل پیشرفته»: a one-time bizin.app activation link for the shop's owner account (owner decision D2). */
export async function advancedPanelLinkAction(): Promise<ActionResult<{ url: string | null; alreadyActive: boolean; expiresAt?: string }>> {
  const { shop } = await requireSeller();
  try {
    const link = await bizin.createActivationLink(shop.external_business_id);
    return { ok: true, data: { url: link.activation_url, alreadyActive: false, expiresAt: link.expires_at } };
  } catch (e) {
    if (isBizinError(e) && e.code === "owner_already_active") return { ok: true, data: { url: null, alreadyActive: true } };
    const f = toFarsiError(e);
    return { ok: false, message: f.message, requestId: f.requestId };
  }
}
