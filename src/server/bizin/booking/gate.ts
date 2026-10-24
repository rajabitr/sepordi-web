import "server-only";

import { cache } from "react";

import { fa } from "@/lib/utils";

import { isBizinError } from "../error";
import { toFarsiError } from "../errors-fa";
import { getBookingSettings } from "./client";
import type { BookingSettings } from "./types";

/*
 * Until Bizin ships the booking surface, a live shop gets 404 (flag `v3.partner.booking` off) or 501 (routes frozen,
 * no handler) on every booking path. The panel asks once per request and turns that into a calm page.
 */

export type BookingGate =
  | { state: "ready"; settings: BookingSettings }
  | { state: "coming_soon" }
  | { state: "not_entitled" }
  | { state: "no_scope" }
  | { state: "error"; message: string; requestId?: string };

/** A 404 that names a row or the tenant is a real answer; only the gateway's bare 404 means the surface is off. */
const ROW_404 = /_not_found$/;

export function classifyBookingGate(e: unknown): Exclude<BookingGate, { state: "ready" }> {
  if (isBizinError(e) || (e && typeof e === "object" && "status" in e && "code" in e)) {
    const { status, code } = e as { status: number; code: string };
    if (status === 501) return { state: "coming_soon" };
    if (status === 404 && !ROW_404.test(code)) return { state: "coming_soon" };
    if (status === 403 && code === "feature_not_entitled") return { state: "not_entitled" };
    if (status === 403 && code === "insufficient_scope") return { state: "no_scope" };
  }
  const f = toFarsiError(e);
  return { state: "error", message: f.message, requestId: f.requestId };
}

/** One probe per request: the layout, the page and the cards below it share the answer. */
export const bookingGate = cache(async (ext: string): Promise<BookingGate> => {
  try {
    return { state: "ready", settings: await getBookingSettings(ext) };
  } catch (e) {
    return classifyBookingGate(e);
  }
});

const BOOKING_MESSAGES: Record<string, (p?: Record<string, unknown>) => string> = {
  category_not_found: () => "این دسته پیدا نشد. صفحه را تازه کنید.",
  resource_not_found: () => "این پرسنل یا اتاق پیدا نشد. صفحه را تازه کنید.",
  schedule_not_found: () => "این برنامه‌ی کاری پیدا نشد. صفحه را تازه کنید.",
  service_not_found: () => "این خدمت پیدا نشد. صفحه را تازه کنید.",
  exception_not_found: () => "این استثنا قبلاً حذف شده است.",
  booking_not_found: () => "این نوبت پیدا نشد.",
  receipt_not_found: () => "این رسید پیدا نشد.",
  booking_row_in_use: () => "این مورد هنوز در خدمت‌های فعال به کار می‌رود و حذف نمی‌شود.",
  slot_taken: () => "این زمان همین حالا گرفته شد. زمان دیگری انتخاب کنید.",
  slot_not_available: () => "این زمان برای نوبت آزاد نیست. زمان دیگری انتخاب کنید.",
  booking_wrong_state: () => "وضعیت این نوبت عوض شده است. صفحه را تازه کنید.",
  cancel_reason_required: () => "برای لغو نوبت تأییدشده، دلیل را بنویسید.",
  no_show_too_early: (p) => {
    const at = typeof p?.not_before === "string" ? Date.parse(p.not_before) : NaN;
    if (Number.isNaN(at)) return "هنوز برای ثبت «نیامد» زود است.";
    const t = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(at);
    return `«نیامد» را از ساعت ${fa(t)} می‌توانید ثبت کنید.`;
  },
  no_deposit_for_service: () => "این خدمت بیعانه ندارد؛ نوبت را بدون پرداخت ثبت کنید.",
  media_store_unavailable: () => "رسید الان در دسترس نیست. چند لحظه بعد دوباره امتحان کنید.",
};

/** Booking codes first (they are new in this surface), then every shared code through errors-fa. */
export function toBookingFarsiError(e: unknown): { message: string; code: string; field?: string; requestId?: string } {
  if (isBizinError(e)) {
    const m = BOOKING_MESSAGES[e.code];
    if (m) return { message: m(e.params), code: e.code, field: e.field, requestId: e.requestId };
    if (e.status === 501 || (e.status === 404 && e.code === "not_found")) {
      return { message: "نوبت‌دهی هنوز برای فروشگاه شما فعال نشده است.", code: e.code, requestId: e.requestId };
    }
  }
  return toFarsiError(e);
}
