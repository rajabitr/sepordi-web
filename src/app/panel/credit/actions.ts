"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/panel/overview/action-result";
import { requireSeller } from "@/server/auth/session";
import { createCardToCardOrder, startZarinpalOrder } from "@/server/credit/orders";

const START_ERRORS = {
  plan_unavailable: "این بسته الان فروشی نیست. صفحه را تازه کنید.",
  gateway_off: "پرداخت آنلاین فعلاً در دسترس نیست؛ از کارت‌به‌کارت استفاده کنید.",
  gateway_error: "درگاه پرداخت جواب نداد. چند دقیقه بعد دوباره امتحان کنید.",
  too_many_attempts: "چند بار پشت سر هم پرداخت را شروع کرده‌اید. ده دقیقه بعد دوباره امتحان کنید.",
} as const;

const CARD_ERRORS = {
  plan_unavailable: START_ERRORS.plan_unavailable,
  card_to_card_unavailable: "کارت‌به‌کارت فعلاً در دسترس نیست. با پشتیبانی تماس بگیرید.",
  reference_invalid: "شماره‌ی پیگیری را همان‌طور که در رسید بانک آمده بنویسید (۴ تا ۴۰ رقم یا حرف لاتین).",
  too_many_open: "سه درخواست بررسی‌نشده دارید. تا پشتیبانی آن‌ها را بررسی کند، درخواست تازه ثبت نمی‌شود.",
} as const;

/** The Zarinpal payment page for the plan; the browser goes there and comes back to /api/payments/zarinpal/callback. */
export async function startZarinpalAction(planCode: string): Promise<ActionResult<{ url: string }>> {
  const { user, shop } = await requireSeller();
  const r = await startZarinpalOrder(shop, String(planCode ?? ""), { mobile: user.phone });
  if (!r.ok) return { ok: false, message: START_ERRORS[r.error] };
  return { ok: true, data: { url: r.url } };
}

export async function cardToCardAction(planCode: string, reference: string): Promise<ActionResult> {
  const { shop } = await requireSeller();
  const r = createCardToCardOrder(shop, String(planCode ?? ""), String(reference ?? ""));
  if (!r.ok) return { ok: false, field: r.error === "reference_invalid" ? "reference" : undefined, message: CARD_ERRORS[r.error] };
  revalidatePath("/panel/credit");
  return { ok: true, data: null };
}
