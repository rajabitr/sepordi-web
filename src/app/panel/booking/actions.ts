"use server";

import { refresh } from "next/cache";

import {
  BOOKING_MANAGE,
  BOOKING_PAYMENTS,
  BOOKING_VIEW,
  DAY_RE,
  KEY_RE,
  PAYMENT_ACTIONS,
  UUID_RE,
  addDay,
  type ActionResult,
  type DeskAction,
} from "@/components/panel/booking/model";
import { recordActivity, type ActivityAction } from "@/server/audit";
import { can } from "@/server/team/roles";
import { requireCapability } from "@/server/auth/session";
import { actOnBooking, listBookingSlots, rescheduleBooking } from "@/server/bizin/booking/client";
import { toBookingFarsiError } from "@/server/bizin/booking/gate";
import { BOOKING_ACTIONS, type BookingAction, type BookingSlots } from "@/server/bizin/booking/types";

/*
 * The seller's moves on an appointment. Each one is a click after a confirmation; the client keeps one idempotency
 * key per intent, so a retried click is answered by Bizin's stored result instead of moving the booking twice.
 */

const STALE: ActionResult = { ok: false, code: "bad_input", message: "اطلاعات این صفحه قدیمی است. صفحه را تازه کنید." };
const NO_PAYMENTS: ActionResult = { ok: false, code: "forbidden", message: "تأیید یا رد بیعانه با نقش شما ممکن نیست." };

const ACTIVITY: Record<BookingAction, ActivityAction> = {
  approve: "booking.approve",
  reject: "booking.reject",
  cancel: "booking.cancel",
  complete: "booking.complete",
  "no-show": "booking.no_show",
  "confirm-payment": "booking.payment_confirm",
  "reject-payment": "booking.payment_reject",
};

function fail(e: unknown): ActionResult {
  const f = toBookingFarsiError(e);
  return { ok: false, code: f.code, message: f.message, requestId: f.requestId };
}

export async function bookingAction(bookingId: string, action: DeskAction, reason: string, idempotencyKey: string): Promise<ActionResult> {
  if (!UUID_RE.test(bookingId) || !KEY_RE.test(idempotencyKey) || !(BOOKING_ACTIONS as readonly string[]).includes(action)) return STALE;
  // A deposit is a payment: finance confirms it without managing the desk.
  const isPayment = PAYMENT_ACTIONS.includes(action);
  const ctx = await requireCapability(isPayment ? BOOKING_PAYMENTS : BOOKING_MANAGE);
  const { shop, role } = ctx;
  if (isPayment && !can(role, BOOKING_VIEW)) return NO_PAYMENTS;
  const text = reason.trim();
  if (text.length > 500) return { ok: false, code: "invalid_value", message: "دلیل حداکثر ۵۰۰ نویسه است." };
  const body = text && (action === "reject" || action === "cancel" || action === "reject-payment") ? { reason: text } : {};
  try {
    await actOnBooking(shop.external_business_id, bookingId, action as BookingAction, body, { idempotencyKey });
    recordActivity(ctx, ACTIVITY[action as BookingAction], { type: "booking", id: bookingId });
    return { ok: true };
  } catch (e) {
    return fail(e);
  } finally {
    refresh();
  }
}

export async function rescheduleAction(bookingId: string, startsAt: string, resourceId: string, idempotencyKey: string): Promise<ActionResult> {
  if (!UUID_RE.test(bookingId) || !UUID_RE.test(resourceId) || !KEY_RE.test(idempotencyKey) || Number.isNaN(Date.parse(startsAt))) return STALE;
  const ctx = await requireCapability(BOOKING_MANAGE);
  try {
    const starts = new Date(startsAt).toISOString();
    await rescheduleBooking(ctx.shop.external_business_id, bookingId, { starts_at: starts, resource_id: resourceId }, { idempotencyKey });
    recordActivity(ctx, "booking.reschedule", { type: "booking", id: bookingId }, { starts_at: starts });
    return { ok: true };
  } catch (e) {
    return fail(e);
  } finally {
    refresh();
  }
}

/** Free times of a service for the reschedule picker: two weeks from `fromDay`, any resource the service runs on. */
export async function loadSlotsAction(serviceId: string, fromDay: string): Promise<{ ok: true; slots: BookingSlots } | Exclude<ActionResult, { ok: true }>> {
  if (!UUID_RE.test(serviceId) || !DAY_RE.test(fromDay)) return STALE as Exclude<ActionResult, { ok: true }>;
  const { shop } = await requireCapability(BOOKING_MANAGE);
  try {
    const slots = await listBookingSlots(shop.external_business_id, { service_id: serviceId, from: fromDay, to: addDay(fromDay, 13), limit: 500 });
    return { ok: true, slots };
  } catch (e) {
    return fail(e) as Exclude<ActionResult, { ok: true }>;
  }
}
